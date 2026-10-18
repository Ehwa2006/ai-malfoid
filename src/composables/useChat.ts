import { computed, ref } from 'vue'
import { streamChat, type ChatMessage } from '../lib/ollama'
import { MarkerParser, type Emotion } from '../lib/markers'
import { clampAffection, clampDelta, stageOf } from '../lib/affection'
import { buildSystemPrompt, GREETING } from '../lib/persona'
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
}

const DEFAULT_SETTINGS: Settings = {
  baseUrl: '/ollama',
  model: 'llama3.1:8b',
  userName: '그레인저',
  temperature: 0.8,
  historyLimit: 20,
}

const INITIAL_AFFECTION = 20

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function greetingMessage(): DisplayMessage {
  const msg: DisplayMessage = { id: uid(), role: 'assistant', text: '', emotion: 'smirk' }
  const parser = new MarkerParser((e) => {
    if (e.type === 'text')
      msg.text += e.text
  })
  parser.push(GREETING)
  parser.flush()
  return msg
}

export function useChat() {
  const settings = useStoredRef<Settings>('malfoid:settings', { ...DEFAULT_SETTINGS })
  const messages = useStoredRef<DisplayMessage[]>('malfoid:messages', [greetingMessage()])
  const affection = useStoredRef<number>('malfoid:affection', INITIAL_AFFECTION)
  const emotion = ref<Emotion>(messages.value.at(-1)?.emotion ?? 'neutral')
  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  const lastDelta = ref<number | null>(null)

  const stage = computed(() => stageOf(affection.value))

  let controller: AbortController | null = null

  function toLlmHistory(): ChatMessage[] {
    // 표정/호감도 마커는 UI 메타데이터로 분리 저장했으므로, 히스토리엔 텍스트만 보낸다.
    // assistant 메시지엔 형식 유지를 위해 표정 토큰을 다시 붙여준다.
    return messages.value.slice(-settings.value.historyLimit).map(m => ({
      role: m.role,
      content: m.role === 'assistant' && m.emotion ? `<|EMOTE:${m.emotion}|>${m.text}` : m.text,
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

    const parser = new MarkerParser((e) => {
      if (e.type === 'text') {
        reply.text += e.text
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
    try {
      await streamChat({
        baseUrl: settings.value.baseUrl.replace(/\/+$/, ''),
        model: settings.value.model,
        temperature: settings.value.temperature,
        messages: llmMessages,
        signal: controller.signal,
        onToken: t => parser.push(t),
      })
      parser.flush()
      reply.text = reply.text.trim()

      const applied = clampDelta(delta)
      reply.affectionDelta = applied
      affection.value = clampAffection(affection.value + applied)
      lastDelta.value = applied
    }
    catch (e) {
      parser.flush()
      if ((e as Error).name !== 'AbortError')
        error.value = (e as Error).message
      if (!reply.text.trim())
        messages.value.splice(messages.value.indexOf(reply), 1)
    }
    finally {
      isStreaming.value = false
      controller = null
    }
  }

  function stop() {
    controller?.abort()
  }

  function reset() {
    stop()
    messages.value = [greetingMessage()]
    affection.value = INITIAL_AFFECTION
    emotion.value = 'smirk'
    lastDelta.value = null
    error.value = null
  }

  return { settings, messages, affection, stage, emotion, isStreaming, error, lastDelta, send, stop, reset }
}
