// TTS 재생 엔진. 문장 하나를 "준비(prepare)"하면 소리를 미리 받아 두고, play()로 재생한다.
// 재생 순서는 useTts가 엔진에 상관없이 하나의 줄로 관리하므로 목소리가 겹치지 않는다.
//   HttpTtsEngine    — AI 음성(GPT-SoVITS)·Edge 음성·OpenAI 호환 서버. Web Audio로 재생하며 음량으로 입 모양을 계산한다.
//   BrowserTtsEngine — 브라우저 내장 음성(speechSynthesis). 오프라인, 설치 필요 없음. 음량은 알 수 없다.

export interface PreparedSpeech {
  /** 다 읽으면 끝난다. 읽지 못하면 TtsError로 실패한다 */
  play: () => Promise<void>
  /** 받던 소리와 재생을 멈춘다 (play는 바로 끝난다) */
  cancel: () => void
}

export interface TtsEngine {
  /** 문장 하나를 준비한다. HTTP 엔진은 이때 소리를 미리 받기 시작한다 */
  prepare: (text: string) => PreparedSpeech
  /** 0~1 입 벌림 정도. 소리 크기를 알 수 없으면 null */
  level: () => number | null
  /** 사용자 입력 안에서 불러 소리 재생을 허락받는다 */
  unlock?: () => void
}

/**
 * 읽지 못한 이유.
 * - content: 서버는 응답했지만 이 문장을 소리로 만들 수 없었다("ㅋㅋ"처럼). 이 문장만 건너뛴다.
 * - unavailable: 서버에 닿지 못했거나 서버 쪽 오류. 다음 엔진으로 넘어간다.
 */
export class TtsError extends Error {
  constructor(message: string, readonly kind: 'content' | 'unavailable') {
    super(message)
  }
}

export interface HttpTtsOptions {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export class HttpTtsEngine implements TtsEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private samples: Float32Array<ArrayBuffer> | null = null
  private playing: AudioBufferSourceNode | null = null
  private smoothed = 0

  constructor(private readonly options: () => HttpTtsOptions) {}

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.connect(this.ctx.destination)
      this.samples = new Float32Array(this.analyser.fftSize)
    }
    void this.ctx.resume()
  }

  prepare(text: string): PreparedSpeech {
    this.unlock()
    const abort = new AbortController()
    let source: AudioBufferSourceNode | null = null
    let finish: (() => void) | null = null
    // 앞 문장을 읽는 동안 이 문장의 소리를 미리 받아 둔다
    const audio = this.fetchAudio(text, abort.signal)
    audio.catch(() => {})
    return {
      play: async () => {
        const buffer = await audio
        if (abort.signal.aborted)
          return
        await new Promise<void>((resolve) => {
          finish = resolve
          source = this.ctx!.createBufferSource()
          source.buffer = buffer
          source.connect(this.analyser!)
          source.onended = () => resolve()
          this.playing = source
          source.start()
        })
        if (this.playing === source)
          this.playing = null
      },
      cancel: () => {
        abort.abort()
        try {
          source?.stop()
        }
        catch {}
        finish?.()
      },
    }
  }

  level(): number | null {
    if (!this.analyser || !this.samples || !this.playing)
      return 0
    this.analyser.getFloatTimeDomainData(this.samples)
    let sum = 0
    for (const v of this.samples)
      sum += v * v
    const rms = Math.sqrt(sum / this.samples.length)
    const target = Math.min(1, Math.max(0, (rms - 0.015) * 7))
    // 입이 너무 떨리지 않게 부드럽게 따라간다 (벌릴 땐 빠르게, 다물 땐 천천히)
    this.smoothed += (target - this.smoothed) * (target > this.smoothed ? 0.6 : 0.25)
    return this.smoothed
  }

  private async fetchAudio(text: string, signal: AbortSignal): Promise<AudioBuffer> {
    const { url, headers, body } = this.options()
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ ...body, input: text }),
        signal,
      })
    }
    catch (e) {
      throw new TtsError((e as Error).message, 'unavailable')
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      // 4xx는 이 문장 자체의 문제(빈 문장, 읽을 수 없는 글자). 서버·연결 문제는 5xx로 온다.
      // 우리 Edge 서버는 소리가 비어 있으면 422를 돌려준다.
      throw new TtsError(`음성 서버 응답 ${res.status}${detail ? `: ${detail}` : ''}`, res.status < 500 ? 'content' : 'unavailable')
    }
    try {
      return await this.ctx!.decodeAudioData(await res.arrayBuffer())
    }
    catch (e) {
      throw new TtsError(`소리를 해석하지 못했어요: ${(e as Error).message}`, 'content')
    }
  }
}

export interface BrowserTtsOptions {
  voiceName: string
  rate: number
  /** -50 ~ 50 (%) */
  pitch: number
}

export function browserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** 한국어 음성을 앞에 둔 브라우저 음성 목록 */
export function browserVoices(): SpeechSynthesisVoice[] {
  if (!browserTtsSupported())
    return []
  return [...speechSynthesis.getVoices()].sort((a, b) =>
    Number(b.lang.startsWith('ko')) - Number(a.lang.startsWith('ko')))
}

export class BrowserTtsEngine implements TtsEngine {
  constructor(private readonly options: () => BrowserTtsOptions) {}

  prepare(text: string): PreparedSpeech {
    let utterance: SpeechSynthesisUtterance | null = null
    let finish: (() => void) | null = null
    return {
      play: () => new Promise<void>((resolve, reject) => {
        if (!browserTtsSupported())
          return reject(new TtsError('이 브라우저는 음성 합성을 지원하지 않아요', 'unavailable'))
        const { voiceName, rate, pitch } = this.options()
        const voices = browserVoices()
        utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'ko-KR'
        utterance.voice = voices.find(v => v.name === voiceName) ?? voices.find(v => v.lang.startsWith('ko')) ?? null
        utterance.rate = rate
        utterance.pitch = Math.min(2, Math.max(0, 1 + pitch / 50))
        finish = resolve
        // 이 발화의 이벤트만 이 약속을 끝낸다 (취소된 앞 발화의 늦은 이벤트에 휘둘리지 않는다)
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        speechSynthesis.speak(utterance)
      }),
      cancel: () => {
        if (utterance && browserTtsSupported())
          speechSynthesis.cancel()
        finish?.()
      },
    }
  }

  level(): number | null {
    return null
  }
}
