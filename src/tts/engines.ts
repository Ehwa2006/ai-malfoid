// TTS 재생 엔진. 문장을 하나씩 받아 순서대로 읽는다.
//   HttpTtsEngine    — OpenAI 호환 /audio/speech 엔드포인트(내장 Edge 음성 서버, OpenAI, 로컬 TTS 서버)
//                      소리를 Web Audio로 재생하며 음량으로 입 모양(립싱크)을 계산한다.
//   BrowserTtsEngine — 브라우저 내장 음성(speechSynthesis). 오프라인, 설치 필요 없음. 음량은 알 수 없다.

export interface TtsEngine {
  /** 문장 하나를 재생 대기열에 넣는다 */
  enqueue: (text: string) => void
  /** 재생 중인 소리와 대기열을 모두 멈춘다 */
  stop: () => void
  /** 0~1 입 벌림 정도. 소리 크기를 알 수 없으면 null */
  level: () => number | null
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
  private chain: Promise<void> = Promise.resolve()
  private generation = 0
  private abort = new AbortController()
  private current: AudioBufferSourceNode | null = null
  private pending = 0
  private smoothed = 0

  constructor(
    private readonly options: () => HttpTtsOptions,
    private readonly onSpeaking: (speaking: boolean) => void,
    /** 이 문장을 재생하지 못했을 때 (서버 꺼짐, 인터넷 끊김 등) */
    private readonly onFailure: (text: string, error: Error) => void,
  ) {}

  /** 사용자 입력(클릭·엔터) 안에서 불러야 브라우저가 소리 재생을 허락한다 */
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

  enqueue(text: string): void {
    this.unlock()
    const generation = this.generation
    this.pending++
    this.onSpeaking(true)
    // 앞 문장을 읽는 동안 다음 문장 소리를 미리 받아 둔다
    const audio = this.fetchAudio(text, this.abort.signal)
    audio.catch(() => {}) // 실패는 아래 순서대로 처리한다
    this.chain = this.chain.then(async () => {
      if (generation !== this.generation)
        return
      try {
        const buffer = await audio
        if (generation === this.generation)
          await this.play(buffer)
      }
      catch (e) {
        if (generation === this.generation)
          this.onFailure(text, e as Error)
      }
      finally {
        if (generation === this.generation && --this.pending === 0)
          this.onSpeaking(false)
      }
    })
  }

  stop(): void {
    this.generation++
    this.abort.abort()
    this.abort = new AbortController()
    try {
      this.current?.stop()
    }
    catch {}
    this.current = null
    this.pending = 0
    this.chain = Promise.resolve()
    this.onSpeaking(false)
  }

  level(): number | null {
    if (!this.analyser || !this.samples || !this.current)
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, input: text }),
      signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`음성 서버 응답 ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }
    const data = await res.arrayBuffer()
    return this.ctx!.decodeAudioData(data)
  }

  private play(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = this.ctx!.createBufferSource()
      source.buffer = buffer
      source.connect(this.analyser!)
      source.onended = () => {
        if (this.current === source)
          this.current = null
        resolve()
      }
      this.current = source
      source.start()
    })
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
  private pending = 0

  constructor(
    private readonly options: () => BrowserTtsOptions,
    private readonly onSpeaking: (speaking: boolean) => void,
  ) {}

  enqueue(text: string): void {
    if (!browserTtsSupported())
      return
    const { voiceName, rate, pitch } = this.options()
    const voices = browserVoices()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.voice = voices.find(v => v.name === voiceName) ?? voices.find(v => v.lang.startsWith('ko')) ?? null
    utterance.rate = rate
    utterance.pitch = Math.min(2, Math.max(0, 1 + pitch / 50))
    this.pending++
    this.onSpeaking(true)
    const done = () => {
      this.pending = Math.max(0, this.pending - 1)
      if (this.pending === 0)
        this.onSpeaking(false)
    }
    utterance.onend = done
    utterance.onerror = done
    speechSynthesis.speak(utterance)
  }

  stop(): void {
    this.pending = 0
    if (browserTtsSupported())
      speechSynthesis.cancel()
    this.onSpeaking(false)
  }

  level(): number | null {
    return null
  }
}
