// 카리나의 대사를 소리 내어 읽는다 (TTS).
// 답변이 흘러나오는 동안 문장이 끝날 때마다 바로 읽고, 재생 중인 소리 크기로 아바타 입을 움직인다.
//
// 음성 엔진은 고른 것부터 차례로 시도하고, 실패하면 다음 엔진으로 넘어간다.
//   AI 음성(GPT-SoVITS) → Edge 신경망 음성 → 브라우저 내장 음성
// AI 음성은 답변의 감정(비웃음·당황·짜증…)에 맞는 참고 음성으로 목소리 톤을 바꾼다.
import { ref, watch, type Ref } from 'vue'
import type { Emotion } from '../lib/markers'
import { SpeechChunker, splitSpeech } from '../tts/chunker'
import { BrowserTtsEngine, browserTtsSupported, browserVoices, HttpTtsEngine, type HttpTtsOptions, type TtsEngine } from '../tts/engines'
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
  const speakingBy = new Map<EngineId, boolean>()
  const onSpeaking = (id: EngineId) => (s: boolean) => {
    speakingBy.set(id, s)
    speaking.value = [...speakingBy.values()].some(Boolean)
  }

  // 각 엔진에서 실패한 문장은 다음 엔진이 다시 읽는다
  const fail = (id: EngineId) => (text: string, e: Error) => {
    const chain = CHAIN[tts().provider]
    const next = chain[chain.indexOf(id) + 1]
    if (!next || (next === 'browser' && !browserTtsSupported())) {
      error.value = `음성을 재생하지 못했어요: ${e.message}`
      return
    }
    if (active.value === id) {
      active.value = next
      error.value = `${ENGINE_LABEL[id]}에 연결하지 못해 ${ENGINE_LABEL[next]}으로 읽을게요. (${e.message})`
    }
    engines[next].enqueue(text)
  }

  const http = (id: EngineId, options: () => HttpTtsOptions) =>
    new HttpTtsEngine(options, onSpeaking(id), fail(id))

  const engines: Record<EngineId, TtsEngine & { unlock?: () => void }> = {
    gsv: http('gsv', () => ({
      url: GSV_TTS_URL,
      headers: {},
      // 감정은 문장을 보낼 때의 값을 쓴다 (답변의 감정은 대사보다 먼저 정해진다)
      body: { emotion: emotionOverride ?? emotion.value, speed: tts().rate },
    })),
    edge: http('edge', () => ({
      url: EDGE_TTS_URL,
      headers: {},
      body: { voice: tts().edgeVoice, speed: tts().rate, pitch: tts().pitch },
    })),
    openai: http('openai', () => {
      const o = tts().openai
      const headers: Record<string, string> = o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}
      return {
        url: `${o.url.replace(/\/+$/, '')}/audio/speech`,
        headers,
        body: { model: o.model, voice: o.voice, speed: tts().rate, response_format: 'mp3' },
      }
    }),
    browser: new BrowserTtsEngine(
      () => ({ voiceName: tts().browserVoice, rate: tts().rate, pitch: tts().pitch }),
      onSpeaking('browser'),
    ),
  }

  /** 지금 읽는 데 쓰는 엔진 */
  const active = ref<EngineId>(CHAIN[tts().provider][0])

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

  /** 답변을 시작할 때 쓸 엔진을 정한다 */
  function chooseEngine() {
    const chain = CHAIN[tts().provider]
    active.value = chain[0]
    if (chain[0] !== 'gsv')
      return
    const s = gsvStatus.value
    if (!s || !s.server || !s.pack) {
      active.value = chain[1]
      if (!error.value) {
        error.value = !s?.pack
          ? '카리나 보이스 팩(voices/karina)이 없어 Edge 음성으로 읽을게요.'
          : `AI 음성 서버(GPT-SoVITS, ${s?.url ?? '127.0.0.1:9880'})가 꺼져 있어 Edge 음성으로 읽을게요. README의 "AI 음성" 안내를 참고해 주세요.`
      }
    }
    // 다음 답변을 위해 상태를 새로 확인해 둔다 (켜지면 다시 AI 음성으로)
    void refreshGsv().then((st) => {
      if (st?.server && st.pack && tts().provider === 'gsv' && error.value?.includes('Edge 음성으로'))
        error.value = null
    })
  }

  if (browserTtsSupported())
    speechSynthesis.addEventListener('voiceschanged', () => (voices.value = browserVoices()))

  let chunker = new SpeechChunker()

  function stop() {
    for (const e of Object.values(engines))
      e.stop()
  }

  function speakAll(sentences: string[]) {
    for (const s of sentences)
      engines[active.value].enqueue(s)
  }

  function unlockActive() {
    engines[active.value].unlock?.()
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
    /** 사용자 입력 안에서 불러서 소리 재생을 허락받는다 */
    unlock() {
      if (tts().enabled) {
        chooseEngine()
        unlockActive()
      }
    },
    /** 새 답변이 시작될 때 */
    begin() {
      stop()
      chunker = new SpeechChunker()
    },
    /** 답변 대사가 흘러나올 때 */
    push(text: string) {
      if (tts().enabled)
        speakAll(chunker.push(text))
    },
    /** 답변이 끝났을 때 */
    end() {
      if (tts().enabled)
        speakAll(chunker.flush())
    },
    /** 메시지 다시 듣기 (그 메시지의 감정 목소리로) */
    say(text: string, messageEmotion?: Emotion) {
      stop()
      chooseEngine()
      unlockActive()
      emotionOverride = messageEmotion ?? null
      speakAll(splitSpeech(text)) // 요청 내용은 넣는 즉시 정해지므로 바로 되돌려도 된다
      emotionOverride = null
    },
    preview() {
      stop()
      chooseEngine()
      unlockActive()
      speakAll([PREVIEW_LINE])
    },
    stop,
    /** 0~1 입 벌림 (소리 크기를 알 수 없으면 null) */
    level: () => engines[active.value].level(),
  }
}

export type Tts = ReturnType<typeof useTts>
