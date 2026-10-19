import { computed, ref, watch } from 'vue'
import { listModels, pickModel, streamChat, type ChatMessage } from '../lib/ollama'
import { MarkerParser, type Emotion } from '../lib/markers'
import { finishReply, formatReply, REPLY_SCHEMA, ReplyStreamParser } from '../lib/reply'
import { clampAffection, clampDelta, stageOf } from '../lib/affection'
import { buildGreeting, buildSystemPrompt } from '../lib/persona'
import { useStoredRef } from './useStoredRef'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  /** 마커가 제거된, 화면에 보여줄 텍스트 */
  text: string
  emotion?: Emotion
  affectionDelta?: number
}

export interface Settings {
  baseUrl: string
  model: string
  userName: string
  temperature: number
  /** LLM에 보낼 최근 메시지 수 (컨텍스트 절약) */
  historyLimit: number
  /** 아바타 표시 방식: 원본 VRM 모델 / 코드로 만든 3D 모델 / 2D SVG */
  avatarMode: 'vrm' | 'procedural' | '2d'
  /** VRM 모드에서 쓸 모델(.vrm/.glb) 주소. 비우면 기본 모델(Malfoy Draconia)을 쓴다. */
  modelUrl: string
  tts: TtsSettings
}

export interface TtsSettings {
  enabled: boolean
  /**
   * gsv: AI 음성 모델(GPT-SoVITS, 로컬, 감정별 목소리) / edge: 앱에 내장된 Edge 신경망 음성(온라인)
   * browser: 브라우저 내장 음성(오프라인) / openai: OpenAI 호환 서버
   */
  provider: 'gsv' | 'edge' | 'browser' | 'openai'
  edgeVoice: string
  browserVoice: string
  /** 0.5 ~ 2 (1 = 보통) */
  rate: number
  /** -50 ~ 50 (%) */
  pitch: number
  openai: { url: string, model: string, voice: string, apiKey: string }
}

export const DEFAULT_MODEL_URL = `${import.meta.env.BASE_URL}models/malfoy-draconia.vrm`

const DEFAULT_SETTINGS: Settings = {
  baseUrl: '/ollama',
  model: 'exaone3.5:7.8b',
  userName: '포터',
  temperature: 0.8,
  historyLimit: 20,
  avatarMode: 'vrm',
  modelUrl: '',
  tts: {
    enabled: true,
    provider: 'gsv',
    edgeVoice: 'ko-KR-SunHiNeural',
    browserVoice: '',
    rate: 1.05,
    pitch: 6,
    openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: 'nova', apiKey: '' },
  },
}

const INITIAL_AFFECTION = 20

/** 답변 대사를 실시간으로 받아 가는 쪽 (TTS) */
export interface ReplyListener {
  begin: () => void
  push: (text: string) => void
  end: () => void
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function greetingMessage(userName: string): DisplayMessage {
  const msg: DisplayMessage = { id: uid(), role: 'assistant', text: '' }
  const parser = new MarkerParser((e) => {
    if (e.type === 'text')
      msg.text += e.text
    else if (e.type === 'emote')
      msg.emotion = e.emotion
  })
  parser.push(buildGreeting(userName))
  parser.flush()
  return msg
}

export function useChat() {
  const settings = useStoredRef<Settings>('malfoid:settings', { ...DEFAULT_SETTINGS })
  // 이전 버전에서 저장된 설정에 새 항목의 기본값을 채운다
  settings.value = { ...DEFAULT_SETTINGS, ...settings.value }
  settings.value.tts = { ...DEFAULT_SETTINGS.tts, ...settings.value.tts }
  settings.value.tts.openai = { ...DEFAULT_SETTINGS.tts.openai, ...settings.value.tts.openai }
  // 이전 버전의 '3d'(코드로 만든 모델)는 원본 VRM 모델로 옮긴다
  if (!['vrm', 'procedural', '2d'].includes(settings.value.avatarMode))
    settings.value.avatarMode = 'vrm'
  const messages = useStoredRef<DisplayMessage[]>('malfoid:karina:messages', [greetingMessage(settings.value.userName)])
  // 이전 버전에서 저장된 답변의 깨진 표시("별표:", 짝 없는 별표 등)를 바로잡는다 (화면·다시 듣기·히스토리가 같은 글을 쓰도록)
  for (const m of messages.value) {
    if (m.role === 'assistant' && m.text)
      m.text = finishReply(m.text)
  }
  const affection = useStoredRef<number>('malfoid:karina:affection', INITIAL_AFFECTION)
  const emotion = ref<Emotion>(messages.value.at(-1)?.emotion ?? 'neutral')
  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  const lastDelta = ref<number | null>(null)

  const stage = computed(() => stageOf(affection.value))

  // 아직 대화를 시작하기 전이라면, 이름을 바꿨을 때 첫 인사도 새 이름에 맞춘다.
  watch(() => settings.value.userName, (name) => {
    if (messages.value.length === 1 && messages.value[0].role === 'assistant')
      messages.value = [greetingMessage(name)]
  })

  let controller: AbortController | null = null
  let listener: ReplyListener | null = null

  // 설정한 모델이 설치돼 있지 않으면 설치된 모델로 바꿔 둔다 (Ollama가 꺼져 있으면 보내기 할 때 오류로 알린다)
  listModels(settings.value.baseUrl.replace(/\/+$/, ''))
    .then((installed) => {
      settings.value.model = pickModel(installed, settings.value.model)
    })
    .catch(() => {})

  function toLlmHistory(): ChatMessage[] {
    // 카리나의 지난 답변은 모델이 내야 하는 것과 같은 JSON 형식으로 되돌려 보내 형식을 유지시킨다
    return messages.value.slice(-settings.value.historyLimit).map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? formatReply({ emotion: m.emotion, affection: m.affectionDelta, reply: m.text })
        : m.text,
    }))
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || isStreaming.value)
      return

    error.value = null
    lastDelta.value = null
    messages.value.push({ id: uid(), role: 'user', text: content })

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(settings.value.userName, affection.value) },
      ...toLlmHistory(),
    ]

    messages.value.push({ id: uid(), role: 'assistant', text: '' })
    // 반응형 프록시를 통해 수정해야 화면이 갱신된다.
    const reply = messages.value[messages.value.length - 1]
    let delta = 0

    const parser = new ReplyStreamParser((e) => {
      if (e.type === 'text') {
        reply.text += e.text
        listener?.push(e.text)
      }
      else if (e.type === 'emote') {
        reply.emotion = e.emotion
        emotion.value = e.emotion
      }
      else {
        delta += e.delta
      }
    })

    isStreaming.value = true
    controller = new AbortController()
    listener?.begin()
    let aborted = false
    try {
      await streamChat({
        baseUrl: settings.value.baseUrl.replace(/\/+$/, ''),
        model: settings.value.model,
        temperature: settings.value.temperature,
        messages: llmMessages,
        format: REPLY_SCHEMA,
        signal: controller.signal,
        onToken: t => parser.push(t),
      })
      parser.flush()
      reply.text = finishReply(reply.text)

      const applied = clampDelta(delta)
      reply.affectionDelta = applied
      affection.value = clampAffection(affection.value + applied)
      lastDelta.value = applied
    }
    catch (e) {
      parser.flush()
      reply.text = finishReply(reply.text) // 중간에 멈춰도 짝 없는 별표가 남지 않게
      aborted = (e as Error).name === 'AbortError'
      if (!aborted)
        error.value = (e as Error).message
      if (!reply.text.trim())
        messages.value.splice(messages.value.indexOf(reply), 1)
    }
    finally {
      isStreaming.value = false
      controller = null
      // 중지 버튼으로 멈췄으면 남은 문장은 읽지 않는다
      if (!aborted)
        listener?.end()
    }
  }

  function stop() {
    controller?.abort()
  }

  function reset() {
    stop()
    messages.value = [greetingMessage(settings.value.userName)]
    affection.value = INITIAL_AFFECTION
    emotion.value = messages.value[0].emotion ?? 'neutral'
    lastDelta.value = null
    error.value = null
  }

  function onReply(l: ReplyListener) {
    listener = l
  }

  return { settings, messages, affection, stage, emotion, isStreaming, error, lastDelta, send, stop, reset, onReply }
}
