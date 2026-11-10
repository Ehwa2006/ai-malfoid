// 말로 하기 (음성 입력). 마이크로 녹음해서 글로 바꾼다.
//   1. 로컬 음성 인식 (faster-whisper, npm start가 켠다): 녹음 파일을 개발 서버의 /stt로 보낸다. 인터넷이 필요 없다.
//   2. 브라우저 받아쓰기 (Web Speech API, 크롬·엣지): 로컬 음성 인식이 꺼져 있을 때 대신 쓴다. 인터넷이 필요하다.
// 녹음하는 동안 마이크 크기를 보여 주고, 말을 하다가 1.3초 조용하면 스스로 멈춘다.
import { computed, onBeforeUnmount, ref } from 'vue'

export interface SttStatus {
  /** 로컬 음성 인식이 준비됐는지 */
  server: boolean
  /** 서버는 켜졌지만 모델을 올리는 중 (처음에는 모델을 받느라 몇 분 걸린다) */
  starting: boolean
  url: string
  device: string | null
}

export type SttEngine = 'server' | 'browser'
export type MicState = 'idle' | 'listening' | 'transcribing'

/** 브라우저 받아쓰기의 최소 타입 (lib.dom에 없는 것만) */
interface BrowserRecognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { resultIndex: number, results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => BrowserRecognition

/** 소리 크기(RMS) 기준: 이보다 크면 말소리, 작으면 조용함 */
const SPEECH_RMS = 0.02
const QUIET_RMS = 0.012
/** 말을 하다가 이만큼 조용하면 멈춘다 (ms) */
const END_SILENCE_MS = 1300
/** 처음부터 이만큼 아무 말이 없으면 그만둔다 (ms) */
const NO_SPEECH_MS = 8000
const MAX_MS = 30_000

const BROWSER_ERRORS: Record<string, string> = {
  'not-allowed': '마이크 사용을 허락해 주세요 (주소창 왼쪽의 자물쇠 아이콘)',
  'service-not-allowed': '마이크 사용을 허락해 주세요',
  'network': '브라우저 받아쓰기는 인터넷이 필요해요. npm start로 로컬 음성 인식을 켜면 인터넷 없이 돼요',
  'no-speech': '말소리가 들리지 않았어요',
  'audio-capture': '마이크를 찾지 못했어요',
}

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor, webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceInput(opts: {
  /** 알아들은 말 */
  onText: (text: string) => void
  /** 녹음을 시작하기 직전 (카리나 목소리를 멈춰서 마이크에 들어가지 않게) */
  beforeStart?: () => void
}) {
  const status = ref<SttStatus | null>(null)
  const state = ref<MicState>('idle')
  /** 마이크 소리 크기 0~1 (화면 표시용) */
  const level = ref(0)
  /** 브라우저 받아쓰기가 듣는 중에 알아들은 말 */
  const interim = ref('')
  const error = ref<string | null>(null)
  /** 버튼을 누른 채 말하는 중: 말을 멈춰도 스스로 끝내지 않고, 버튼을 뗄 때 끝낸다 */
  const holding = ref(false)

  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const browserCtor = typeof window !== 'undefined' ? recognitionCtor() : null
  const engine = computed<SttEngine | null>(() => (status.value?.server && canRecord ? 'server' : browserCtor ? 'browser' : null))

  let retry: ReturnType<typeof setTimeout> | undefined
  async function refreshStatus(): Promise<void> {
    clearTimeout(retry)
    try {
      const res = await fetch('/stt/status')
      status.value = res.ok ? await res.json() as SttStatus : null
    }
    catch {
      status.value = null
    }
    // 모델을 올리는 중이면 자주, 꺼져 있으면 가끔 다시 본다 (npm start가 나중에 켤 수 있다)
    if (!status.value?.server)
      retry = setTimeout(() => void refreshStatus(), status.value?.starting ? 5000 : 30_000)
  }
  void refreshStatus()

  // ── 로컬 음성 인식: 녹음 → /stt ──
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let audioCtx: AudioContext | null = null
  let meter: ReturnType<typeof setInterval> | undefined
  let discard = false

  function release() {
    clearInterval(meter)
    stream?.getTracks().forEach(t => t.stop())
    void audioCtx?.close().catch(() => {})
    stream = null
    audioCtx = null
    level.value = 0
  }

  async function startRecording() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    discard = false
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      release()
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      recorder = null
      if (discard || !blob.size) {
        state.value = 'idle'
        return
      }
      void transcribe(blob)
    }
    recorder.start(250)
    state.value = 'listening'

    // 소리 크기를 재서 보여 주고, 말이 끝나면 스스로 멈춘다
    audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const startedAt = performance.now()
    let spoke = false
    let quietSince = 0
    meter = setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      const rms = Math.sqrt(sum / buf.length)
      level.value = Math.min(1, rms * 12)
      const now = performance.now()
      if (rms > SPEECH_RMS) {
        spoke = true
        quietSince = 0
      }
      else if (spoke && rms < QUIET_RMS) {
        quietSince ||= now
      }
      if (now - startedAt > MAX_MS)
        stop()
      else if (holding.value)
        return // 누른 채 말하는 중: 잠깐 생각하느라 조용해도 버튼을 뗄 때까지 듣는다
      else if (spoke && quietSince && now - quietSince > END_SILENCE_MS)
        stop()
      else if (!spoke && now - startedAt > NO_SPEECH_MS)
        cancel('말소리가 들리지 않았어요')
    }, 50)
  }

  async function transcribe(blob: Blob) {
    state.value = 'transcribing'
    try {
      const res = await fetch('/stt', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })
      const data = await res.json().catch(() => ({})) as { text?: string, error?: { message?: string } }
      if (!res.ok) {
        error.value = data.error?.message ?? `음성 인식에 실패했어요 (${res.status})`
        if (res.status === 503)
          void refreshStatus() // 서버가 꺼졌다: 브라우저 받아쓰기로 바꿀 수 있는지 다시 본다
      }
      else if (data.text) {
        opts.onText(data.text)
      }
      else {
        error.value = '잘 못 알아들었어요. 다시 말해 주세요'
      }
    }
    catch (e) {
      error.value = `음성 인식 서버에 연결하지 못했어요: ${(e as Error).message}`
    }
    finally {
      state.value = 'idle'
    }
  }

  // ── 브라우저 받아쓰기 ──
  let recognition: BrowserRecognition | null = null

  function startBrowser() {
    const rec = new browserCtor!()
    recognition = rec
    rec.lang = 'ko-KR'
    rec.interimResults = true
    rec.continuous = false
    let final = ''
    interim.value = ''
    rec.onresult = (e) => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal)
          final += r[0].transcript
        else
          partial += r[0].transcript
      }
      interim.value = (final + partial).trim()
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted')
        error.value = BROWSER_ERRORS[e.error] ?? `받아쓰기 오류: ${e.error}`
    }
    rec.onend = () => {
      recognition = null
      state.value = 'idle'
      const text = final.trim()
      interim.value = ''
      if (text && !discard)
        opts.onText(text)
    }
    discard = false
    rec.start()
    state.value = 'listening'
  }

  // ── 바깥에서 부르는 것 ──

  async function start() {
    if (state.value !== 'idle')
      return
    error.value = null
    if (!engine.value) {
      error.value = '이 브라우저에서는 말로 하기를 쓸 수 없어요. 크롬이나 엣지를 쓰거나, npm start로 로컬 음성 인식을 켜 주세요'
      return
    }
    opts.beforeStart?.()
    try {
      if (engine.value === 'server')
        await startRecording()
      else
        startBrowser()
    }
    catch (e) {
      release()
      state.value = 'idle'
      const name = (e as Error).name
      error.value = name === 'NotAllowedError' ? BROWSER_ERRORS['not-allowed'] : name === 'NotFoundError' ? BROWSER_ERRORS['audio-capture'] : `마이크를 켜지 못했어요: ${(e as Error).message}`
    }
  }

  /** 듣기를 마치고 알아듣기 시작한다 */
  function stop() {
    holding.value = false
    if (state.value !== 'listening')
      return
    if (recorder?.state === 'recording')
      recorder.stop()
    recognition?.stop()
  }

  /** 듣던 것을 버린다 */
  function cancel(message?: string) {
    holding.value = false
    discard = true
    if (message)
      error.value = message
    if (recorder?.state === 'recording')
      recorder.stop()
    else
      release()
    recognition?.abort()
    if (!recorder && !recognition)
      state.value = 'idle'
  }

  onBeforeUnmount(() => {
    clearTimeout(retry)
    cancel()
  })

  return { status, engine, state, level, interim, error, holding, refreshStatus, start, stop, cancel }
}

export type VoiceInput = ReturnType<typeof useVoiceInput>
