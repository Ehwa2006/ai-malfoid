// 카리나의 대사를 소리 내어 읽는다 (TTS).
// 답변이 흘러나오는 동안 문장이 끝날 때마다 바로 읽고, 재생 중인 소리 크기로 아바타 입을 움직인다.
import { ref, watch, type Ref } from 'vue'
import { SpeechChunker, splitSpeech } from '../tts/chunker'
import { BrowserTtsEngine, browserTtsSupported, browserVoices, HttpTtsEngine, type HttpTtsOptions, type TtsEngine } from '../tts/engines'
import type { Settings } from './useChat'

export const EDGE_TTS_URL = `${import.meta.env.BASE_URL}tts/v1/audio/speech`
export const EDGE_VOICES = [
  { id: 'ko-KR-SunHiNeural', label: '선희 (여성, 밝고 또렷함)' },
  { id: 'ko-KR-InJoonNeural', label: '인준 (남성)' },
  { id: 'ko-KR-HyunsuMultilingualNeural', label: '현수 (남성, 다국어)' },
]
const PREVIEW_LINE = '흥, 포터. 말포이가의 영애 목소리가 그렇게 듣고 싶었던 거야?'

export function useTts(settings: Ref<Settings>) {
  const speaking = ref(false)
  const error = ref<string | null>(null)
  const voices = ref<SpeechSynthesisVoice[]>(browserVoices())
  // 서버 음성이 실패하면 이번 접속 동안은 브라우저 음성으로 대신 읽는다
  const fallback = ref(false)

  let httpSpeaking = false
  let browserSpeaking = false
  const update = () => {
    speaking.value = httpSpeaking || browserSpeaking
  }

  const tts = () => settings.value.tts
  const browser = new BrowserTtsEngine(
    () => ({ voiceName: tts().browserVoice, rate: tts().rate, pitch: tts().pitch }),
    (s) => {
      browserSpeaking = s
      update()
    },
  )
  const http = new HttpTtsEngine(
    (): HttpTtsOptions => {
      const t = tts()
      if (t.provider === 'openai') {
        return {
          url: `${t.openai.url.replace(/\/+$/, '')}/audio/speech`,
          headers: t.openai.apiKey ? { Authorization: `Bearer ${t.openai.apiKey}` } : {} as Record<string, string>,
          body: { model: t.openai.model, voice: t.openai.voice, speed: t.rate, response_format: 'mp3' },
        }
      }
      return { url: EDGE_TTS_URL, headers: {}, body: { voice: t.edgeVoice, speed: t.rate, pitch: t.pitch } }
    },
    (s) => {
      httpSpeaking = s
      update()
    },
    (text, e) => {
      if (!browserTtsSupported()) {
        error.value = `음성을 재생하지 못했어요: ${e.message}`
        return
      }
      if (!fallback.value) {
        fallback.value = true
        error.value = `음성 서버에 연결하지 못해 브라우저 내장 음성으로 읽을게요. (${e.message})`
      }
      browser.enqueue(text)
    },
  )

  const engine = (): TtsEngine =>
    tts().provider === 'browser' || fallback.value ? browser : http

  if (browserTtsSupported())
    speechSynthesis.addEventListener('voiceschanged', () => (voices.value = browserVoices()))

  let chunker = new SpeechChunker()

  function stop() {
    http.stop()
    browser.stop()
  }

  function speakAll(sentences: string[]) {
    for (const s of sentences)
      engine().enqueue(s)
  }

  // 끄거나 방식을 바꾸면 읽던 것을 멈춘다. 방식을 바꾸면 서버 실패 기록도 지운다.
  watch(() => [tts().enabled, tts().provider], () => {
    stop()
    fallback.value = false
    error.value = null
  })

  return {
    speaking,
    error,
    voices,
    /** 사용자 입력 안에서 불러서 소리 재생을 허락받는다 */
    unlock() {
      if (tts().enabled && engine() === http)
        http.unlock()
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
    /** 메시지 다시 듣기 */
    say(text: string) {
      stop()
      if (engine() === http)
        http.unlock()
      speakAll(splitSpeech(text))
    },
    preview() {
      stop()
      if (engine() === http)
        http.unlock()
      speakAll([PREVIEW_LINE])
    },
    stop,
    /** 0~1 입 벌림 (소리 크기를 알 수 없으면 null) */
    level: () => engine().level(),
  }
}

export type Tts = ReturnType<typeof useTts>
