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
            return
          }
          catch (e) {
            const err = e instanceof TtsError ? e : new TtsError(String(e), 'unavailable')
            if (err.kind === 'content' || gen !== generation)
              return // "ㅋㅋ"처럼 이 문장만 읽을 수 없는 경우는 건너뛴다
            // 서버에 닿지 못했으면 다음 엔진으로 같은 문장을 다시 읽고, 이후 문장도 그 엔진으로 준비한다
            const order = CHAIN[tts().provider]
            const next = order[order.indexOf(engineId) + 1]
            if (!next) {
              error.value = `음성을 재생하지 못했어요: ${err.message}`
              return
            }
            if (active.value === engineId) {
              active.value = next
              error.value = `${ENGINE_LABEL[engineId]}에 연결하지 못해 ${ENGINE_LABEL[next]}으로 읽을게요. (${err.message})`
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

  /** AI 음성 서버 상태를 확인한다. 꺼져 있으면 시작부터 다음 엔진으로 읽는다 */
  async function refreshGsv(): Promise<GsvStatus | null> {
    try {
      const res = await fetch(`${GSV_TTS_URL}/status`, { signal: AbortSignal.timeout(4000) })
      gsvStatus.value = res.ok ? await res.json() as GsvStatus : null
    }
    catch {
      gsvStatus.value = null
    }
    return gsvStatus.value
  }

  /** 답변(또는 다시 듣기)을 시작할 때 쓸 엔진을 정한다 */
  function chooseEngine() {
    const order = CHAIN[tts().provider]
    active.value = order[0]
    if (order[0] === 'gsv') {
      const s = gsvStatus.value
      if (!s || !s.server || !s.pack) {
        active.value = order[1]
        if (!error.value) {
          error.value = !s?.pack
            ? '카리나 보이스 팩(voices/karina)이 없어 Edge 음성으로 읽을게요.'
            : `AI 음성 서버(GPT-SoVITS, ${s.url})가 꺼져 있어 Edge 음성으로 읽을게요. README의 "AI 음성" 안내를 참고해 주세요.`
        }
      }
      // 다음 답변을 위해 상태를 새로 확인해 둔다 (켜지면 다시 AI 음성으로)
      void refreshGsv().then((st) => {
        if (st?.server && st.pack && tts().provider === 'gsv' && error.value?.includes('Edge 음성으로'))
          error.value = null
      })
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
