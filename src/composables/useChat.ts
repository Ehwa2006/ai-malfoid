import { computed, ref, watch } from 'vue'
import { listModels, pickModel, streamChat, type ChatMessage } from '../lib/ollama'
import { MarkerParser, type Emotion } from '../lib/markers'
import { finishReply, formatReply, REPLY_SCHEMA, ReplyStreamParser } from '../lib/reply'
import { clampAffection, clampDelta, STAGES, stageOf } from '../lib/affection'
import { boundaryNote, buildGreeting, buildStateNote, buildSystemPrompt, callName, returnNote, stageUpNote, suggestive } from '../lib/persona'
import { composeChat, historyStart } from '../lib/context'
import { addMemory, knowsMemory, type Memory } from '../lib/memory'
import { cleanMemory, cleanSuggestions } from '../lib/extras'
import { DIARY_SCHEMA, type DiaryEntry, diaryMessages, MAX_DIARY } from '../lib/diary'
import { isScene, type Scene } from '../lib/scenes'
import { RETURN_GAP_MS } from '../lib/time'
import { useStoredRef } from './useStoredRef'

export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  /** 마커가 제거된, 화면에 보여줄 텍스트 */
  text: string
  emotion?: Emotion
  affectionDelta?: number
  /** 보낸 시각 (ms) */
  at?: number
  /** 이 대사를 할 때의 장소 */
  scene?: Scene
  /** 겉으로 하지 않은 속마음 */
  thought?: string
  /** 상대가 이어서 할 만한 말 (마지막 답변의 것만 화면에 보인다) */
  suggestions?: string[]
  /** 오랜만에 찾아왔을 때 카리나가 먼저 건 말 */
  greeting?: boolean
}

/** 호감도 단계가 바뀐 순간 (화면 알림용) */
export interface StageChange {
  from: string
  to: string
  up: boolean
}

export interface Settings {
  baseUrl: string
  model: string
  userName: string
  temperature: number
  /** LLM에 보낼 최근 메시지 수 (컨텍스트 절약) */
  historyLimit: number
  /** 아바타 표시 방식: 원본 VRM 모델(2D 일러스트처럼 그림) / 코드로 만든 3D 모델 / 2D 손그림 초상화 */
  avatarMode: 'vrm' | 'procedural' | '2d'
  /** VRM 모드에서 쓸 모델(.vrm/.glb) 주소. 비우면 기본 모델(Malfoy Draconia)을 쓴다. */
  modelUrl: string
  /** 답변 아래에 선택지(이어서 할 말)를 보일지 */
  showChoices: boolean
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
  showChoices: true,
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
/** 보낼 대화 기록 수의 상한 (설정 프롬프트와 함께 NUM_CTX 안에 들어가게) */
const MAX_HISTORY = 40

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
  // 컨텍스트(NUM_CTX)에 들어가는 만큼만 (이전 버전은 60까지 고를 수 있었다)
  settings.value.historyLimit = Math.min(MAX_HISTORY, Math.max(4, settings.value.historyLimit))
  // 원래 모델(VRM)을 2D 일러스트처럼 그리는 방식으로 돌아온다 (2D 손그림 초상화로 한 번 바뀌었던 경우 포함). 설정에서 다시 고를 수 있다
  try {
    if (!localStorage.getItem('malfoid:vrm-illust')) {
      settings.value.avatarMode = 'vrm'
      localStorage.setItem('malfoid:vrm-illust', '1')
    }
  }
  catch {}
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
  const memories = useStoredRef<Memory[]>('malfoid:karina:memories', [])
  const diary = useStoredRef<DiaryEntry[]>('malfoid:karina:diary', [])
  const scene = useStoredRef<Scene>('malfoid:karina:scene', 'manor')
  /** 마지막으로 이야기한 시각. 이전 버전에서 넘어왔으면 지금으로 친다 (첫 실행에 "오랜만" 인사를 하지 않게) */
  const lastActiveAt = useStoredRef<number | null>('malfoid:karina:lastActive', Date.now())
  /** 다음 답변에서 보여 줄 단계 상승 이벤트 */
  const pendingEvent = useStoredRef<{ from: string, to: string } | null>('malfoid:karina:pendingEvent', null)
  const emotion = ref<Emotion>(messages.value.at(-1)?.emotion ?? 'neutral')
  const isStreaming = ref(false)
  const isWritingDiary = ref(false)
  const error = ref<string | null>(null)
  const lastDelta = ref<number | null>(null)
  const stageChange = ref<StageChange | null>(null)
  /** 방금 새로 기억한 것 (화면 알림용) */
  const newMemory = ref<Memory | null>(null)
  const diaryError = ref<string | null>(null)

  const stage = computed(() => stageOf(affection.value))
  const stageIndex = (value: number) => STAGES.indexOf(stageOf(value))

  // 아직 대화를 시작하기 전이라면, 이름을 바꿨을 때 첫 인사도 새 이름에 맞춘다.
  watch(() => settings.value.userName, (name) => {
    if (messages.value.length === 1 && messages.value[0].role === 'assistant')
      messages.value = [greetingMessage(name)]
  })

  let controller: AbortController | null = null
  let diaryController: AbortController | null = null
  let listener: ReplyListener | null = null
  /** 처음부터 다시 할 때마다 늘어난다. 그 전에 시작한 답변·일기는 끝나도 결과를 버린다 */
  let epoch = 0

  // 설정한 모델이 설치돼 있지 않으면 설치된 모델로 바꿔 둔다 (Ollama가 꺼져 있으면 보내기 할 때 오류로 알린다).
  // 연결되면, 오랜만에 찾아온 경우 카리나가 먼저 말을 건다.
  listModels(settings.value.baseUrl.replace(/\/+$/, ''))
    .then((installed) => {
      settings.value.model = pickModel(installed, settings.value.model)
      if (installed.length)
        void greetOnReturn()
    })
    .catch(() => {})

  function toLlmHistory(): ChatMessage[] {
    // 카리나의 지난 답변은 모델이 내야 하는 것과 같은 JSON 형식으로 되돌려 보내 형식을 유지시킨다
    const list = messages.value
    return list.slice(historyStart(list.length, settings.value.historyLimit)).map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? formatReply({ emotion: m.emotion, affection: m.affectionDelta, scene: m.scene, reply: m.text, thought: m.thought })
        : m.text,
    }))
  }

  interface ReplyOptions {
    /** 소리 내어 읽을지 (사용자 입력 없이 시작한 답변은 브라우저가 소리를 막으므로 읽지 않는다) */
    speak: boolean
    /** 오랜만에 찾아왔을 때 먼저 거는 인사 (호감도·기억이 바뀌지 않는다) */
    greeting?: boolean
    /** 이번 말이 성적인 요구라 거절하는 턴 (호감도가 오르지 않고, 기억하지 않는다) */
    guarded?: boolean
    /** 호감도가 오르지 않는 턴 (거절한 바로 뒤라 아직 토라져 있다) */
    noRise?: boolean
    /** 이번 답변에서 단계 상승 이벤트를 보여 준다 */
    showsEvent?: boolean
    /** 이번에 상대가 한 말 (기억은 이 말에서만 나온다) */
    userText?: string
  }

  /**
   * 카리나의 답변 하나를 받는다.
   * @param notes 이번 요청에만 덧붙이는 시스템 메모 (거절 주의, 단계 상승 이벤트, 오랜만의 인사…)
   * @returns 답변을 받아 호감도·기억까지 반영했는지
   */
  async function runReply(notes: string[], opts: ReplyOptions): Promise<boolean> {
    const { speak, greeting = false, guarded = false, noRise = guarded, showsEvent = false, userText = '' } = opts
    error.value = null
    lastDelta.value = null
    const started = epoch
    const now = Date.now()
    const llmMessages = composeChat(
      buildSystemPrompt(settings.value.userName, affection.value),
      toLlmHistory(),
      buildStateNote(affection.value, { now: new Date(now), lastActiveAt: lastActiveAt.value, memories: memories.value }),
      notes,
    )

    messages.value.push({ id: uid(), role: 'assistant', text: '', at: now, ...(greeting ? { greeting: true } : {}) })
    // 반응형 프록시를 통해 수정해야 화면이 갱신된다.
    const reply = messages.value[messages.value.length - 1]
    let delta = 0
    let memory: string | null = null
    const out = speak ? listener : null

    const parser = new ReplyStreamParser((e) => {
      if (started !== epoch)
        return
      if (e.type === 'text') {
        reply.text += e.text
        out?.push(e.text)
      }
      else if (e.type === 'emote') {
        reply.emotion = e.emotion
        emotion.value = e.emotion
      }
      else if (e.type === 'affection') {
        delta += e.delta
      }
      else if (e.type === 'scene') {
        reply.scene = e.scene
        scene.value = e.scene
      }
      else if (e.type === 'thought') {
        if (!suggestive(e.text))
          reply.thought = e.text
      }
      else if (e.type === 'memory') {
        memory = e.text
      }
      else {
        const items = cleanSuggestions(e.items, callName(settings.value.userName))
        if (items.length)
          reply.suggestions = items
      }
    })

    /** 대사를 다 받았으면 호감도·단계·기억을 반영한다 (속마음·선택지를 받다가 멈춰도) */
    const commit = () => {
      reply.text = finishReply(reply.text)
      // 먼저 건 인사로는 호감도가 바뀌지 않고, 거절하는 턴에는 오르지 않는다
      const applied = greeting ? 0 : noRise ? Math.min(0, clampDelta(delta)) : clampDelta(delta)
      reply.affectionDelta = applied
      const before = affection.value
      affection.value = clampAffection(before + applied)
      lastDelta.value = applied
      if (showsEvent)
        pendingEvent.value = null
      const [from, to] = [stageIndex(before), stageIndex(affection.value)]
      if (from !== to) {
        stageChange.value = { from: STAGES[from].name, to: STAGES[to].name, up: to > from }
        pendingEvent.value = to > from ? { from: STAGES[from].name, to: STAGES[to].name } : null
      }
      const fact = memory && !greeting && !guarded ? cleanMemory(memory, callName(settings.value.userName), userText) : null
      if (fact) {
        const isNew = !knowsMemory(memories.value, fact)
        memories.value = addMemory(memories.value, fact, Date.now(), uid())
        if (isNew)
          newMemory.value = memories.value.at(-1) ?? null
      }
      lastActiveAt.value = Date.now()
    }

    isStreaming.value = true
    controller = new AbortController()
    out?.begin()
    let aborted = false
    let committed = false
    let speechFlushed = false
    try {
      await streamChat({
        baseUrl: settings.value.baseUrl.replace(/\/+$/, ''),
        model: settings.value.model,
        temperature: settings.value.temperature,
        messages: llmMessages,
        format: REPLY_SCHEMA,
        signal: controller.signal,
        onToken: (t) => {
          parser.push(t)
          // 대사가 끝나면 남은 문장을 바로 읽는다. 속마음·기억·선택지를 다 만들 때까지(CPU에서 10~20초) 기다리지 않게
          if (!speechFlushed && parser.replyFinished && started === epoch) {
            speechFlushed = true
            out?.end()
          }
        },
      })
      if (started !== epoch)
        return false
      parser.flush()
      commit()
      committed = true
    }
    catch (e) {
      aborted = (e as Error).name === 'AbortError'
      if (started !== epoch)
        return false // 처음부터 다시 했다. 지난 대화의 답변은 버린다
      parser.flush()
      // 대사를 다 받은 뒤에 끊겼으면(중지 버튼이든 연결이 끊긴 것이든) 받은 데까지 반영한다
      if (parser.replyFinished) {
        commit()
        committed = true
      }
      else {
        reply.text = finishReply(reply.text) // 중간에 멈춰도 짝 없는 별표가 남지 않게
        if (!aborted)
          error.value = (e as Error).message
        const i = messages.value.indexOf(reply)
        if (!reply.text.trim() && i >= 0)
          messages.value.splice(i, 1)
      }
    }
    finally {
      if (started === epoch) {
        isStreaming.value = false
        controller = null
      }
      // 중지 버튼으로 멈췄으면 남은 문장은 읽지 않는다
      if (!aborted && started === epoch)
        out?.end()
    }
    return committed
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || isStreaming.value)
      return
    messages.value.push({ id: uid(), role: 'user', text: content, at: Date.now() })

    const notes: string[] = []
    const recentUserTexts = messages.value.filter(m => m.role === 'user').slice(-3).map(m => m.text)
    const guard = boundaryNote(recentUserTexts, affection.value)
    // 거절해야 하는 턴에는 단계 상승 이벤트를 다음으로 미룬다
    const event = guard ? null : pendingEvent.value
    if (guard)
      notes.push(guard)
    else if (event)
      notes.push(stageUpNote(event.from, event.to))
    // 이번 말이 문제면 기억도 하지 않고, 거절한 요구를 다시 조르는 말이면 호감도만 오르지 않는다
    await runReply(notes, { speak: true, guarded: suggestive(content), noRise: !!guard, showsEvent: !!event, userText: content })
  }

  /** 오랜만에(6시간 넘게) 다시 찾아왔으면 카리나가 먼저 말을 건다 */
  async function greetOnReturn() {
    const last = lastActiveAt.value
    const hasTalked = messages.value.some(m => m.role === 'user')
    if (!hasTalked || last === null || isStreaming.value || Date.now() - last < RETURN_GAP_MS)
      return
    if (messages.value.at(-1)?.greeting)
      return // 이미 먼저 인사해 두었다
    await runReply([returnNote(Date.now() - last)], { speak: false, greeting: true })
  }

  /** 오늘 대화를 바탕으로 카리나가 비밀 일기를 쓴다 */
  async function writeDiary() {
    if (isWritingDiary.value || isStreaming.value)
      return
    const started = epoch
    isWritingDiary.value = true
    diaryError.value = null
    diaryController = new AbortController()
    try {
      const since = diary.value.at(-1)?.at ?? 0
      const fresh = messages.value.filter(m => (m.at ?? 0) > since)
      const recent = (fresh.length >= 2 ? fresh : messages.value).slice(-40)
      let raw = ''
      await streamChat({
        baseUrl: settings.value.baseUrl.replace(/\/+$/, ''),
        model: settings.value.model,
        temperature: 0.9,
        messages: diaryMessages(settings.value.userName, affection.value, memories.value, recent, new Date()),
        format: DIARY_SCHEMA,
        signal: diaryController.signal,
        onToken: (t) => { raw += t },
      })
      if (started !== epoch)
        return
      const parsed = JSON.parse(raw) as { title?: string, entry?: string }
      const text = (parsed.entry ?? '').trim()
      if (!text)
        throw new Error('일기가 비어 있어요. 다시 시도해 주세요.')
      diary.value = [...diary.value, { id: uid(), at: Date.now(), title: (parsed.title ?? '').trim() || '오늘', text, stage: stage.value.name }].slice(-MAX_DIARY)
    }
    catch (e) {
      if (started === epoch && (e as Error).name !== 'AbortError')
        diaryError.value = `일기를 쓰지 못했어요: ${(e as Error).message}`
    }
    finally {
      if (started === epoch) {
        isWritingDiary.value = false
        diaryController = null
      }
    }
  }

  function forgetMemory(id: string) {
    memories.value = memories.value.filter(m => m.id !== id)
  }

  function deleteDiary(id: string) {
    diary.value = diary.value.filter(d => d.id !== id)
  }

  function stop() {
    controller?.abort()
  }

  function reset() {
    epoch++
    stop()
    diaryController?.abort()
    controller = null
    diaryController = null
    isStreaming.value = false
    isWritingDiary.value = false
    diaryError.value = null
    newMemory.value = null
    stageChange.value = null
    messages.value = [greetingMessage(settings.value.userName)]
    affection.value = INITIAL_AFFECTION
    memories.value = []
    diary.value = []
    scene.value = 'manor'
    pendingEvent.value = null
    lastActiveAt.value = Date.now()
    emotion.value = messages.value[0].emotion ?? 'neutral'
    lastDelta.value = null
    error.value = null
  }

  function onReply(l: ReplyListener) {
    listener = l
  }

  if (!isScene(scene.value))
    scene.value = 'manor'

  return {
    settings,
    messages,
    affection,
    stage,
    emotion,
    scene,
    memories,
    diary,
    isStreaming,
    isWritingDiary,
    error,
    lastDelta,
    stageChange,
    newMemory,
    diaryError,
    send,
    stop,
    reset,
    onReply,
    writeDiary,
    forgetMemory,
    deleteDiary,
  }
}
