// 화면 없이 돌아가는 대화 세션. 웹 앱의 useChat과 같은 흐름(설정 프롬프트 → 지난 대화 → 상태 → 마지막 말 → 이번 턴의 메모,
// 거절 메모, 호감도, 기억, 장소, 단계 상승 이벤트)을 src/lib의 같은 코드로 돌린다.
// - VR 앱(유니티)이 쓰는 서버 API가 이 세션으로 대답한다
// - 실제 모델 평가(npm run eval)가 이 세션으로 정해 둔 대화를 돌린다
// 그래서 카리나의 성격과 안전 규칙은 src/lib에서 한 번만 고치면 웹·VR·평가에 함께 적용된다.
// 대답은 사건(표정, 몸짓, 자막, 읽을 문장, 속마음, 선택지, 호감도…)으로 흘려보낸다.
import { clampAffection, clampDelta, STAGES, stageOf } from '../src/lib/affection'
import { composeChat, historyStart } from '../src/lib/context'
import { cleanMemory, cleanSuggestions } from '../src/lib/extras'
import { GIFTS, TOUCHES, actionMessage, type Interaction } from '../src/lib/interactions'
import type { Emotion } from '../src/lib/markers'
import { addMemory, knowsMemory, type Memory } from '../src/lib/memory'
import type { ChatMessage } from '../src/lib/ollama'
import { boundaryNote, buildGreeting, buildStateNote, buildSystemPrompt, callName, returnNote, stageUpNote, suggestive } from '../src/lib/persona'
import { finishReply, formatReply, ReplyStreamParser } from '../src/lib/reply'
import { isScene, type Scene } from '../src/lib/scenes'
import { RETURN_GAP_MS } from '../src/lib/time'
import { SpeechChunker } from '../src/tts/chunker'
import { type GestureId, pickGesture, reactionFor } from '../src/avatar2d/gestures'

export interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  at: number
  emotion?: Emotion
  affectionDelta?: number
  scene?: Scene
  thought?: string
  suggestions?: string[]
  greeting?: boolean
}

export interface SessionState {
  version: 1
  userName: string
  affection: number
  messages: SessionMessage[]
  memories: Memory[]
  scene: Scene
  lastActiveAt: number | null
  /** 다음 답변에서 보여 줄 단계 상승 이벤트 */
  pendingEvent: { from: string, to: string } | null
}

/** 흘려보내는 사건 (VR API는 한 줄에 하나씩 보낸다) */
export type SessionEvent =
  | { type: 'turn', user: string }
  /** 행동(선물·손길)에 곧바로 보이는 반응. 모델의 답이 오기 전에 먼저 움직인다 */
  | { type: 'reaction', id: string, gesture: GestureId, emotion: Emotion, prop: string | null }
  | { type: 'emotion', emotion: Emotion }
  | { type: 'gesture', gesture: GestureId }
  | { type: 'scene', scene: Scene }
  /** 자막용 대사 조각 (행동 묘사는 *…*) */
  | { type: 'text', text: string }
  /** 소리 내어 읽을 문장 (행동 묘사는 빠져 있다). 앱은 /tts/gsv에 이 문장과 지금 감정을 보낸다 */
  | { type: 'sentence', text: string, emotion: Emotion }
  | { type: 'thought', text: string }
  | { type: 'choices', items: string[] }
  | { type: 'done', affection: number, delta: number, stage: string, stageUp: { from: string, to: string, up: boolean } | null, memory: string | null }
  | { type: 'error', message: string }

/** 모델 호출 (테스트에서 바꿔 끼운다) */
export type ChatFn = (messages: ChatMessage[], onToken: (t: string) => void, signal: AbortSignal) => Promise<void>

export interface SessionStore {
  load: () => SessionState | null
  save: (state: SessionState) => void
}

export interface SessionOptions {
  historyLimit?: number
  now?: () => number
  rand?: () => number
}

const INITIAL_AFFECTION = 20
const MAX_MESSAGES = 400

/** 행동 목록 (선물·손길). VR에서는 손이 직접 닿으므로 호감도가 모자라도 행동은 일어나고, 카리나가 피한다 */
export const ACTIONS: (Interaction & { kind: 'gift' | 'touch' })[] = [
  ...GIFTS.map(g => ({ ...g, kind: 'gift' as const })),
  ...TOUCHES.map(t => ({ ...t, kind: 'touch' as const })),
]

/**
 * 아직 허락하지 않은 손길(호감도가 모자란 쓰다듬기·안기 등)에 붙이는 메모.
 * 웹 앱은 버튼을 숨기지만, VR에서는 손이 먼저 닿아 버리므로 카리나가 카리나답게 피하게 한다.
 */
export function lockedTouchNote(item: Interaction): string {
  return `[이번 행동에 대한 주의] 상대가 허락도 없이 ${item.label.replace(/\s+/g, ' ')}를 하려 한다. 아직 그럴 만큼 가까운 사이가 아니다. 허락하지 않는다: 카리나답게 손을 탁 쳐내거나 한 발 물러나며 짧게 쏘아붙인다. 하던 이야기와 장소는 그대로 이어 간다.`
}

function greetingMessage(userName: string, now: number): SessionMessage {
  // 첫 인사는 마커(<|EMOTE:…|>)가 섞인 글이다: 표정만 빼서 대사로 쓴다
  const raw = buildGreeting(userName)
  const emotion = /<\|EMOTE:(\w+)\|>/.exec(raw)?.[1] as Emotion | undefined
  return { role: 'assistant', text: finishReply(raw.replace(/<\|[^|]*\|>/g, '').trim()), at: now, ...(emotion ? { emotion } : {}) }
}

export function freshState(userName = '포터', now = Date.now()): SessionState {
  return {
    version: 1,
    userName,
    affection: INITIAL_AFFECTION,
    messages: [greetingMessage(userName, now)],
    memories: [],
    scene: 'manor',
    lastActiveAt: now,
    pendingEvent: null,
  }
}

/** 저장된 상태를 읽을 때 망가진 값은 기본값으로 */
export function sanitizeState(raw: unknown, now = Date.now()): SessionState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<SessionState>
  const base = freshState(typeof s.userName === 'string' && s.userName.trim() ? s.userName.trim() : '포터', now)
  return {
    ...base,
    affection: Number.isFinite(s.affection) ? clampAffection(s.affection!) : base.affection,
    messages: Array.isArray(s.messages) && s.messages.length ? s.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') : base.messages,
    memories: Array.isArray(s.memories) ? s.memories : [],
    scene: isScene(s.scene) ? s.scene : 'manor',
    lastActiveAt: typeof s.lastActiveAt === 'number' ? s.lastActiveAt : now,
    pendingEvent: s.pendingEvent && typeof s.pendingEvent.from === 'string' ? s.pendingEvent : null,
  }
}

export class BusyError extends Error {
  constructor() {
    super('카리나가 아직 대답하는 중이에요')
  }
}

export class ChatSession {
  state: SessionState
  private busy = false
  private gesture: GestureId = 'idle'
  private readonly historyLimit: number
  private readonly now: () => number
  private readonly rand: () => number

  constructor(private readonly store: SessionStore, private readonly chat: ChatFn, opts: SessionOptions = {}) {
    this.now = opts.now ?? Date.now
    this.rand = opts.rand ?? Math.random
    this.historyLimit = opts.historyLimit ?? 20
    this.state = sanitizeState(store.load(), this.now())
  }

  get isBusy(): boolean {
    return this.busy
  }

  /** 지금 상태 (VR 앱이 처음 켜질 때·설정 화면에서 본다) */
  snapshot() {
    const s = this.state
    const last = [...s.messages].reverse().find(m => m.role === 'assistant')
    return {
      userName: s.userName,
      affection: s.affection,
      stage: stageOf(s.affection).name,
      stages: STAGES.map(st => ({ min: st.min, name: st.name })),
      scene: s.scene,
      emotion: last?.emotion ?? 'neutral',
      choices: last?.suggestions ?? [],
      messages: s.messages.slice(-30).map(m => ({ role: m.role, text: m.text, emotion: m.emotion ?? null, thought: m.thought ?? null })),
      memories: s.memories.map(m => m.text),
      actions: ACTIONS.map(a => ({ id: a.id, kind: a.kind, label: a.label, minAffection: a.minAffection ?? 0, unlocked: s.affection >= (a.minAffection ?? 0) })),
      busy: this.busy,
    }
  }

  setUserName(name: string) {
    const clean = name.trim().slice(0, 20)
    if (!clean)
      return
    this.state.userName = clean
    // 아직 대화를 시작하기 전이면 첫 인사도 새 이름으로
    if (this.state.messages.length === 1 && this.state.messages[0].role === 'assistant')
      this.state.messages = [greetingMessage(clean, this.now())]
    this.save()
  }

  reset() {
    if (this.busy)
      throw new BusyError()
    this.state = freshState(this.state.userName, this.now())
    this.gesture = 'idle'
    this.save()
  }

  /**
   * 말 또는 행동 하나에 카리나가 대답한다.
   * @param input text: 말, action: 행동 id (ACTIONS)
   */
  async say(input: { text?: string, action?: string }, emit: (e: SessionEvent) => void, signal: AbortSignal): Promise<void> {
    if (this.busy)
      throw new BusyError()
    const action = input.action ? ACTIONS.find(a => a.id === input.action) : undefined
    if (input.action && !action)
      throw new Error(`모르는 행동이에요: ${input.action}`)
    const content = action ? actionMessage(action) : (input.text ?? '').trim().slice(0, 500)
    if (!content)
      throw new Error('할 말이 비어 있어요')

    const s = this.state
    s.messages.push({ role: 'user', text: content, at: this.now() })
    emit({ type: 'turn', user: content })

    const notes: string[] = []
    const recentUserTexts = s.messages.filter(m => m.role === 'user').slice(-3).map(m => m.text)
    const guard = boundaryNote(recentUserTexts, s.affection)
    const locked = action && action.kind === 'touch' && s.affection < (action.minAffection ?? 0)
    // 행동에는 모델의 답이 오기 전에 먼저 반응한다 (허락하지 않은 손길은 홱 돌아선다)
    const reaction = action ? reactionFor(locked ? 'dodge' : action.id) : null
    if (action && reaction) {
      this.gesture = reaction.gesture
      emit({ type: 'reaction', id: action.id, gesture: reaction.gesture, emotion: reaction.emotion, prop: reaction.prop ?? null })
    }
    // 거절해야 하는 턴에는 단계 상승 이벤트를 다음으로 미룬다
    const event = guard || locked ? null : s.pendingEvent
    if (guard)
      notes.push(guard)
    else if (locked)
      notes.push(lockedTouchNote(action))
    else if (event)
      notes.push(stageUpNote(event.from, event.to))

    await this.runReply(notes, emit, signal, {
      guarded: suggestive(content),
      noRise: !!guard || !!locked,
      showsEvent: !!event,
      userText: content,
    })
  }

  /** 오랜만에(6시간 넘게) 다시 찾아왔으면 카리나가 먼저 말을 건다. 인사했으면 true */
  async greetIfAway(emit: (e: SessionEvent) => void, signal: AbortSignal): Promise<boolean> {
    const s = this.state
    const last = s.lastActiveAt
    const hasTalked = s.messages.some(m => m.role === 'user')
    if (this.busy || !hasTalked || last === null || this.now() - last < RETURN_GAP_MS || s.messages.at(-1)?.greeting)
      return false
    await this.runReply([returnNote(this.now() - last)], emit, signal, { greeting: true })
    return true
  }

  private history(): ChatMessage[] {
    const list = this.state.messages
    return list.slice(historyStart(list.length, this.historyLimit)).map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? formatReply({ emotion: m.emotion, affection: m.affectionDelta, scene: m.scene, reply: m.text, thought: m.thought })
        : m.text,
    }))
  }

  private async runReply(notes: string[], emit: (e: SessionEvent) => void, signal: AbortSignal, opts: { greeting?: boolean, guarded?: boolean, noRise?: boolean, showsEvent?: boolean, userText?: string }) {
    const { greeting = false, guarded = false, noRise = guarded, showsEvent = false, userText = '' } = opts
    const s = this.state
    const now = this.now()
    const messages = composeChat(
      buildSystemPrompt(s.userName, s.affection),
      this.history(),
      buildStateNote(s.affection, { now: new Date(now), lastActiveAt: s.lastActiveAt, memories: s.memories }),
      notes,
    )
    const reply: SessionMessage = { role: 'assistant', text: '', at: now, ...(greeting ? { greeting: true } : {}) }
    let delta = 0
    let memory: string | null = null
    let emotion: Emotion = 'neutral'
    let gesturePicked = false
    const chunker = new SpeechChunker()
    const speak = (sentences: string[]) => sentences.forEach(text => emit({ type: 'sentence', text, emotion }))
    /** 대사(reply)가 끝나면 남은 문장을 바로 읽게 내보낸다. 속마음·선택지를 다 만들 때까지(10~20초) 기다리지 않게 */
    let flushed = false
    const flushSpeech = () => {
      if (!flushed) {
        flushed = true
        speak(chunker.flush())
      }
    }
    /** 감정과 장소가 정해지면(대사가 나오기 전에) 그에 맞는 몸짓을 고른다 */
    const pickNow = () => {
      if (gesturePicked)
        return
      gesturePicked = true
      this.gesture = pickGesture(emotion, s.scene, this.gesture, this.rand)
      emit({ type: 'gesture', gesture: this.gesture })
    }

    const parser = new ReplyStreamParser((e) => {
      if (e.type === 'text') {
        pickNow()
        reply.text += e.text
        emit({ type: 'text', text: e.text })
        speak(chunker.push(e.text))
      }
      else if (e.type === 'emote') {
        emotion = e.emotion
        reply.emotion = e.emotion
        emit({ type: 'emotion', emotion })
      }
      else if (e.type === 'affection') {
        delta += e.delta
      }
      else if (e.type === 'scene') {
        reply.scene = e.scene
        s.scene = e.scene
        emit({ type: 'scene', scene: e.scene })
        pickNow()
      }
      else if (e.type === 'thought') {
        if (!suggestive(e.text)) {
          reply.thought = e.text
          emit({ type: 'thought', text: e.text })
        }
      }
      else if (e.type === 'memory') {
        memory = e.text
      }
      else {
        const items = cleanSuggestions(e.items, callName(s.userName))
        if (items.length) {
          reply.suggestions = items
          emit({ type: 'choices', items })
        }
      }
    })

    /** 대사를 다 받았으면 호감도·단계·기억을 반영한다 */
    const commit = () => {
      flushSpeech()
      reply.text = finishReply(reply.text)
      const applied = greeting ? 0 : noRise ? Math.min(0, clampDelta(delta)) : clampDelta(delta)
      reply.affectionDelta = applied
      const before = s.affection
      s.affection = clampAffection(before + applied)
      if (showsEvent)
        s.pendingEvent = null
      const [from, to] = [STAGES.indexOf(stageOf(before)), STAGES.indexOf(stageOf(s.affection))]
      let stageUp: { from: string, to: string, up: boolean } | null = null
      if (from !== to) {
        stageUp = { from: STAGES[from].name, to: STAGES[to].name, up: to > from }
        s.pendingEvent = to > from ? { from: STAGES[from].name, to: STAGES[to].name } : null
      }
      const fact = memory && !greeting && !guarded ? cleanMemory(memory, callName(s.userName), userText) : null
      if (fact && !knowsMemory(s.memories, fact))
        s.memories = addMemory(s.memories, fact, this.now(), Math.random().toString(36).slice(2, 10))
      s.messages.push(reply)
      s.messages = s.messages.slice(-MAX_MESSAGES)
      s.lastActiveAt = this.now()
      this.save()
      emit({ type: 'done', affection: s.affection, delta: applied, stage: stageOf(s.affection).name, stageUp, memory: fact && !greeting ? fact : null })
    }

    this.busy = true
    try {
      await this.chat(messages, (t) => {
        parser.push(t)
        if (parser.replyFinished)
          flushSpeech()
      }, signal)
      parser.flush()
      commit()
    }
    catch (e) {
      parser.flush()
      // 대사를 다 받은 뒤에 끊겼으면(앱이 연결을 끊었든 서버가 끊겼든) 받은 데까지 반영한다
      if (parser.replyFinished) {
        commit()
      }
      else {
        // 대답을 못 받았다: 방금 한 말도 기록에서 뺀다 (다시 보낼 수 있게)
        if (!greeting && s.messages.at(-1)?.role === 'user')
          s.messages.pop()
        this.save()
        if ((e as Error).name !== 'AbortError')
          emit({ type: 'error', message: (e as Error).message })
      }
    }
    finally {
      this.busy = false
    }
  }

  private save() {
    this.store.save(this.state)
  }
}
