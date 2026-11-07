// 카리나의 대사를 소리 내어 읽는다 (TTS).
// 답변이 흘러나오는 동안 문장이 끝날 때마다 바로 읽고, 재생 중인 소리 크기로 아바타 입을 움직인다.
//
// 음성 엔진은 고른 것부터 차례로 시도하고, 실패하면 다음 엔진으로 넘어간다.
//   AI 음성(GPT-SoVITS) → Edge 신경망 음성 → 브라우저 내장 음성
// AI 음성은 답변의 감정(비웃음·당황·짜증…)에 맞는 참고 음성으로 목소리 톤을 바꾼다.
import { ref, watch, type Ref } from 'vue'
import type { Emotion } from '../lib/markers'
import { SpeechChunker, splitSpeech } from '../tts/chunker'
import { BrowserTtsEngine, browserTtsSupported, browserVoices, HttpTtsEngine, type PreparedSpeech, TtsError, type TtsEngine } from '../tts/engines'
import type { Settings, TtsSettings } from './useChat'

const BASE = import.meta.env.BASE_URL
export const EDGE_TTS_URL = `${BASE}tts/v1/audio/speech`
export const GSV_TTS_URL = `${BASE}tts/gsv`
export const EDGE_VOICES = [
  { id: 'ko-KR-SunHiNeural', label: '선희 (여성, 밝고 또렷함)' },
  { id: 'ko-KR-InJoonNeural', label: '인준 (남성)' },
  { id: 'ko-KR-HyunsuMultilingualNeural', label: '현수 (남성, 다국어)' },
]
const PREVIEW_LINE = '흥, 포터. 말포이가의 영애 목소리가 그렇게 듣고 싶었던 거야?'

type EngineId = 'gsv' | 'edge' | 'openai' | 'browser'
const ENGINE_LABEL: Record<EngineId, string> = {
  gsv: 'AI 음성(GPT-SoVITS)',
  edge: 'Edge 음성',
  openai: 'OpenAI 호환 음성',
  browser: '브라우저 내장 음성',
}
/** 고른 엔진이 안 될 때 넘어갈 순서 */
const CHAIN: Record<TtsSettings['provider'], EngineId[]> = {
  gsv: ['gsv', 'edge', 'browser'],
  edge: ['edge', 'browser'],
  openai: ['openai', 'browser'],
  browser: ['browser'],
}

export interface GsvStatus {
  /** GPT-SoVITS 서버가 켜져 있는지 */
  server: boolean
  url: string
  /** 보이스 팩 (없으면 null) */
  pack: { name: string, credit?: string } | null
}

export function useTts(settings: Ref<Settings>, emotion: Ref<Emotion>) {
  const speaking = ref(false)
  const error = ref<string | null>(null)
  const voices = ref<SpeechSynthesisVoice[]>(browserVoices())
  const gsvStatus = ref<GsvStatus | null>(null)

  const tts = () => settings.value.tts
  /** 다시 듣기처럼 지난 메시지를 읽을 때는 그 메시지의 감정을 쓴다 */
  let emotionOverride: Emotion | null = null

  const engines: Record<EngineId, TtsEngine> = {
    gsv: new HttpTtsEngine(() => ({
      url: GSV_TTS_URL,
      headers: {},
      // 감정은 문장을 준비할 때의 값을 쓴다 (답변의 감정은 대사보다 먼저 정해진다)
      body: { emotion: emotionOverride ?? emotion.value, speed: tts().rate },
    })),
    edge: new HttpTtsEngine(() => ({
      url: EDGE_TTS_URL,
      headers: {},
      body: { voice: tts().edgeVoice, speed: tts().rate, pitch: tts().pitch },
    })),
    openai: new HttpTtsEngine(() => {
      const o = tts().openai
      const headers: Record<string, string> = o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}
      return {
        url: `${o.url.replace(/\/+$/, '')}/audio/speech`,
        headers,
        body: { model: o.model, voice: o.voice, speed: tts().rate, response_format: 'mp3' },
      }
    }),
    browser: new BrowserTtsEngine(() => ({ voiceName: tts().browserVoice, rate: tts().rate, pitch: tts().pitch })),
  }

  /** 지금 문장을 준비하는 데 쓰는 엔진 */
  const active = ref<EngineId>(CHAIN[tts().provider][0])
  /** 지금 소리를 내고 있는 엔진 (입 모양 계산용) */
  let playingEngine: EngineId | null = null

  // ── 재생 줄: 엔진이 섞여도 문장은 들어온 순서대로 하나씩 읽는다 ──
  let chain: Promise<void> = Promise.resolve()
  let generation = 0
  let pending = 0
  const live = new Set<PreparedSpeech>()

  function enqueue(text: string) {
    const gen = generation
    let engineId = active.value
    let prepared = engines[engineId].prepare(text) // 소리를 미리 받기 시작한다
    live.add(prepared)
    pending++
    speaking.value = true
    chain = chain.then(async () => {
      try {
        while (gen === generation) {
          try {
            playingEngine = engineId
            await prepared.play()
            if (engineId === 'gsv')
              clearGsvNotice() // AI 음성이 다시 잘 나오면 실패 안내를 지운다
            return
          }
          catch (e) {
            const err = e instanceof TtsError ? e : new TtsError(String(e), 'unavailable')
            if (gen !== generation)
              return
            const order = CHAIN[tts().provider]
            const next = order[order.indexOf(engineId) + 1]
            if (err.kind === 'content') {
              // AI 음성이 이 문장만 못 읽었으면(낯선 영어 등) 이 문장만 다음 음성으로 읽고, 다음 문장은 다시 AI 음성으로.
              // 다른 엔진이 못 읽는 조각("ㅋㅋ" 등)은 건너뛴다
              if (engineId !== 'gsv' || !next)
                return
              live.delete(prepared)
              engineId = next
              prepared = engines[next].prepare(text)
              live.add(prepared)
              continue
            }
            // 서버에 닿지 못했으면 다음 엔진으로 같은 문장을 다시 읽고, 이후 문장도 그 엔진으로 준비한다
            if (!next) {
              error.value = `음성을 재생하지 못했어요: ${err.message}`
              return
            }
            if (active.value === engineId) {
              active.value = next
              const message = `${ENGINE_LABEL[engineId]}에 연결하지 못해 ${ENGINE_LABEL[next]}으로 읽을게요. (${err.message})`
              if (engineId === 'gsv') {
                noticeGsvDown(message)
                void refreshGsv() // 서버가 꺼졌으면 다시 켜질 때까지 지켜본다
              }
              else {
                error.value = message
              }
            }
            live.delete(prepared)
            engineId = next
            prepared = engines[next].prepare(text)
            live.add(prepared)
          }
        }
      }
      finally {
        live.delete(prepared)
        playingEngine = null
        if (gen === generation && --pending === 0)
          speaking.value = false
      }
    })
  }

  /** 재생 중인 소리와 대기 중인 문장을 모두 버린다 */
  function stop() {
    generation++
    for (const p of live)
      p.cancel()
    live.clear()
    chain = Promise.resolve()
    pending = 0
    playingEngine = null
    speaking.value = false
  }

  /** 지금 떠 있는 "AI 음성 대신 다른 음성으로 읽는다"는 안내 (AI 음성이 돌아오면 지운다) */
  let gsvNotice: string | null = null
  /** 서버가 꺼져 있어서 다른 음성으로 읽는 중이다 (켜지면 AI 음성으로 돌아간다) */
  let waitingForGsv = false
  let gsvRetry: ReturnType<typeof setTimeout> | null = null

  function noticeGsvDown(message: string) {
    gsvNotice = message
    error.value = message
  }

  function clearGsvNotice() {
    if (gsvNotice !== null && error.value === gsvNotice)
      error.value = null
    gsvNotice = null
  }

  /**
   * AI 음성 서버 상태를 확인한다.
   * 보이스 팩은 있는데 서버가 아직 꺼져 있으면(처음 켤 때 1~3분 걸린다) 10초마다 다시 확인하고,
   * 켜지면 바로 AI 음성으로 돌아간다 (읽고 있던 답변도 남은 문장부터).
   */
  async function refreshGsv(): Promise<GsvStatus | null> {
    try {
      const res = await fetch(`${GSV_TTS_URL}/status`, { signal: AbortSignal.timeout(4000) })
      gsvStatus.value = res.ok ? await res.json() as GsvStatus : null
    }
    catch {
      gsvStatus.value = null
    }
    const s = gsvStatus.value
    if (gsvRetry)
      clearTimeout(gsvRetry)
    gsvRetry = null
    if (tts().enabled && tts().provider === 'gsv') {
      if (s?.server && s.pack) {
        // 서버가 켜져 있는데 합성만 실패한 경우에는 돌아가지 않는다 (같은 실패를 문장마다 되풀이하지 않게)
        if (waitingForGsv) {
          waitingForGsv = false
          active.value = 'gsv'
          clearGsvNotice()
        }
      }
      else if (s?.pack) {
        waitingForGsv = true
        gsvRetry = setTimeout(() => void refreshGsv(), 10_000)
      }
    }
    return s
  }

  /** 답변(또는 다시 듣기)을 시작할 때 쓸 엔진을 정한다 */
  function chooseEngine() {
    const order = CHAIN[tts().provider]
    active.value = order[0]
    if (order[0] === 'gsv') {
      const s = gsvStatus.value
      if (!s || !s.server || !s.pack) {
        active.value = order[1]
        waitingForGsv = true
        if (!error.value) {
          noticeGsvDown(!s?.pack
            ? '카리나 보이스 팩(voices/karina)이 없어 Edge 음성으로 읽을게요.'
            : `AI 음성 서버(GPT-SoVITS)가 아직 켜지지 않아 Edge 음성으로 읽을게요. 처음 켤 때는 1~3분 걸리고, 켜지면 자동으로 카리나 목소리로 바뀌어요.`)
        }
      }
      // 상태를 새로 확인한다. 그사이 켜졌으면 이번 답변의 첫 문장부터 AI 음성으로 읽는다
      void refreshGsv()
      engines.gsv.unlock?.() // 나중에 AI 음성으로 돌아갈 때도 소리가 나도록 사용자 입력 안에서 허락받아 둔다
    }
    engines[active.value].unlock?.()
  }

  if (browserTtsSupported())
    speechSynthesis.addEventListener('voiceschanged', () => (voices.value = browserVoices()))

  let chunker = new SpeechChunker()
  /** 중지하거나 다른 메시지를 다시 들으면, 지금 답변의 남은 대사는 읽지 않는다 */
  let replyMuted = false

  function speakAll(sentences: string[]) {
    for (const s of sentences)
      enqueue(s)
  }

  // 끄거나 방식을 바꾸면 읽던 것을 멈추고 처음 엔진부터 다시 쓴다
  watch(() => [tts().enabled, tts().provider], () => {
    stop()
    error.value = null
    active.value = CHAIN[tts().provider][0]
    if (tts().provider === 'gsv')
      void refreshGsv()
  })
  if (tts().provider === 'gsv')
    void refreshGsv()

  return {
    speaking,
    error,
    voices,
    gsvStatus,
    refreshGsv,
    /** 보내기(사용자 입력) 순간에 불러서 엔진을 정하고 소리 재생을 허락받는다 */
    unlock() {
      if (tts().enabled)
        chooseEngine()
    },
    /** 새 답변이 시작될 때 */
    begin() {
      stop()
      chunker = new SpeechChunker()
      replyMuted = false
    },
    /** 답변 대사가 흘러나올 때 */
    push(text: string) {
      if (tts().enabled && !replyMuted)
        speakAll(chunker.push(text))
    },
    /** 답변이 끝났을 때 */
    end() {
      if (tts().enabled && !replyMuted)
        speakAll(chunker.flush())
    },
    /** 메시지 다시 듣기 (그 메시지의 감정 목소리로) */
    say(text: string, messageEmotion?: Emotion) {
      stop()
      replyMuted = true
      chooseEngine()
      emotionOverride = messageEmotion ?? null
      speakAll(splitSpeech(text)) // 요청 내용은 준비하는 즉시 정해지므로 바로 되돌려도 된다
      emotionOverride = null
    },
    preview() {
      stop()
      replyMuted = true
      chooseEngine()
      speakAll([PREVIEW_LINE])
    },
    /** 읽기를 멈춘다. 지금 답변의 남은 대사도 읽지 않는다 */
    stop() {
      stop()
      replyMuted = true
    },
    /** 0~1 입 벌림 (소리 크기를 알 수 없으면 null) */
    level: () => (playingEngine ? engines[playingEngine].level() : 0),
  }
}

export type Tts = ReturnType<typeof useTts>
