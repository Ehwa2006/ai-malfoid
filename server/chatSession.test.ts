import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../src/lib/ollama'
import { CHOICES_KEY } from '../src/lib/reply'
import { type ChatFn, freshState, lockedTouchNote, type SessionStore, type SessionEvent, type SessionState, ChatSession } from './chatSession'
import { TOUCHES } from '../src/lib/interactions'

interface FakeReply {
  emotion?: string
  affection?: number
  scene?: string
  reply?: { kind: 'action' | 'say', text: string }[]
  thought?: string
  memory?: string
  choices?: string[]
}

/** 모델 대신 JSON 답변을 몇 글자씩 흘려보낸다. 받은 메시지는 calls에 남는다 */
function fakeChat(replies: FakeReply[], opts: { stopAfter?: number } = {}) {
  const calls: ChatMessage[][] = []
  const chat: ChatFn = async (messages, onToken, signal) => {
    calls.push(messages)
    const r = replies[Math.min(calls.length - 1, replies.length - 1)]
    const json = JSON.stringify({
      emotion: r.emotion ?? 'smirk',
      affection: r.affection ?? 2,
      scene: r.scene ?? 'manor',
      reply: r.reply ?? [{ kind: 'action', text: '부채를 펼친다' }, { kind: 'say', text: '흥, 오늘은 봐줄게. 차라도 한 잔 할래?' }],
      thought: r.thought ?? '조금은 기다렸어.',
      memory: r.memory ?? '',
      [CHOICES_KEY]: r.choices ?? ['좋아, 마시자', '오늘은 바빠', '네가 타 줄래?'],
    })
    const limit = opts.stopAfter ?? json.length
    for (let i = 0; i < limit; i += 7) {
      if (signal.aborted)
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      onToken(json.slice(i, Math.min(limit, i + 7)))
    }
    if (limit < json.length)
      throw new Error('connection lost')
  }
  return { chat, calls }
}

function memoryStore(initial: SessionState | null = null): SessionStore & { saved: SessionState | null } {
  const store = {
    saved: initial,
    load: () => (store.saved ? structuredClone(store.saved) : null),
    save: (s: SessionState) => { store.saved = structuredClone(s) },
  }
  return store
}

async function run(session: ChatSession, input: { text?: string, action?: string }) {
  const events: SessionEvent[] = []
  await session.say(input, e => events.push(e), new AbortController().signal)
  return events
}

const systemNotes = (messages: ChatMessage[]) => messages.filter(m => m.role === 'system').map(m => m.content)

describe('ChatSession', () => {
  it('streams face, gesture, subtitles, sentences to read, thought and choices, then commits', async () => {
    const { chat } = fakeChat([{ affection: 3, memory: '포터는 얼그레이를 좋아한다' }])
    const store = memoryStore()
    const s = new ChatSession(store, chat, { rand: () => 0 })
    const events = await run(s, { text: '나 얼그레이 좋아해' })
    const types = events.map(e => e.type)
    // 표정이 먼저, 몸짓은 대사보다 앞서, 마지막이 done
    expect(types[0]).toBe('turn')
    expect(types.indexOf('emotion')).toBeLessThan(types.indexOf('gesture'))
    expect(types.indexOf('gesture')).toBeLessThan(types.indexOf('text'))
    expect(types.at(-1)).toBe('done')
    // 자막은 행동 묘사까지, 읽을 문장은 말만
    const subtitle = events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')
    expect(subtitle).toContain('*부채를 펼친다*')
    const sentences = events.filter(e => e.type === 'sentence').map(e => (e as { text: string }).text)
    expect(sentences.join(' ')).toBe('흥, 오늘은 봐줄게. 차라도 한 잔 할래?')
    expect(sentences.every(t => !t.includes('부채'))).toBe(true)
    expect(events.find(e => e.type === 'sentence')).toMatchObject({ emotion: 'smirk' })
    expect(events).toContainEqual({ type: 'choices', items: ['좋아, 마시자', '오늘은 바빠', '네가 타 줄래?'] })
    // 대사의 마지막 문장은 속마음·선택지를 기다리지 않고 바로 읽는다
    const lastSentence = types.lastIndexOf('sentence')
    expect(lastSentence).toBeLessThan(types.indexOf('thought'))
    expect(events.at(-1)).toMatchObject({ type: 'done', affection: 23, delta: 3, stage: '경계', memory: '포터는 얼그레이를 좋아한다' })
    // 저장된다
    expect(store.saved!.affection).toBe(23)
    expect(store.saved!.memories.map(m => m.text)).toEqual(['포터는 얼그레이를 좋아한다'])
    expect(store.saved!.messages.at(-1)).toMatchObject({ role: 'assistant', emotion: 'smirk', thought: '조금은 기다렸어.' })
  })

  it('sends the same prompt order as the web app and keeps past replies in the JSON format', async () => {
    const { chat, calls } = fakeChat([{}])
    const s = new ChatSession(memoryStore(), chat)
    await run(s, { text: '안녕' })
    await run(s, { text: '뭐 해?' })
    const msgs = calls[1]
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('카리나')
    // [설정] → 첫 인사 → 안녕 → 대답 → [상태] → 뭐 해?
    expect(msgs.map(m => m.role)).toEqual(['system', 'assistant', 'user', 'assistant', 'system', 'user'])
    expect(JSON.parse(msgs[3].content)).toMatchObject({ emotion: 'smirk', reply: [{ kind: 'action' }, { kind: 'say' }] })
    expect(msgs.at(-1)!.content).toBe('뭐 해?')
  })

  it('applies the suggestive-line guard: refusal note, no rise, nothing remembered', async () => {
    const { chat, calls } = fakeChat([{ affection: 5, memory: '포터는 카리나와 자고 싶어 한다' }])
    const s = new ChatSession(memoryStore(), chat)
    const events = await run(s, { text: '오늘 밤 같이 자자' })
    expect(systemNotes(calls[0]).some(n => n.includes('성적인 뉘앙스가 있다'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', delta: 0, affection: 20, memory: null })
    expect(s.state.memories).toEqual([])
  })

  it('reacts at once to a gift and to a touch she has allowed', async () => {
    const { chat, calls } = fakeChat([{}])
    const s = new ChatSession(memoryStore({ ...freshState(), affection: 70 }), chat)
    const gift = await run(s, { action: 'lily' })
    expect(gift[1]).toEqual({ type: 'reaction', id: 'lily', gesture: 'receive', emotion: 'flustered', prop: 'bouquet' })
    expect(calls[0].at(-1)).toEqual({ role: 'user', content: '*은방울꽃과 하얀 장미 꽃다발을 건넨다*' })
    const pat = await run(s, { action: 'pat' })
    expect(pat[1]).toMatchObject({ type: 'reaction', id: 'pat', gesture: 'clasp' })
    expect(systemNotes(calls[1]).some(n => n.startsWith('[이번 행동에 대한 주의]'))).toBe(false)
  })

  it('brushes off a touch she has not allowed yet, without gaining affection', async () => {
    const { chat, calls } = fakeChat([{ affection: 4 }])
    const s = new ChatSession(memoryStore(), chat) // 호감도 20: 쓰다듬기는 60부터
    const events = await run(s, { action: 'pat' })
    expect(events[1]).toMatchObject({ type: 'reaction', id: 'pat', gesture: 'armsCrossed', emotion: 'annoyed' })
    const pat = TOUCHES.find(t => t.id === 'pat')!
    expect(systemNotes(calls[0])).toContain(lockedTouchNote(pat))
    expect(lockedTouchNote(pat)).toContain('머리 쓰다듬기를 하려 한다')
    expect(events.at(-1)).toMatchObject({ type: 'done', delta: 0, affection: 20 })
  })

  it('rejects unknown actions and empty lines', async () => {
    const s = new ChatSession(memoryStore(), fakeChat([{}]).chat)
    await expect(run(s, { action: 'kiss' })).rejects.toThrow('모르는 행동')
    await expect(run(s, { text: '   ' })).rejects.toThrow('비어')
  })

  it('announces a stage change and shows the stage-up scene on the next turn', async () => {
    const { chat, calls } = fakeChat([{ affection: 5 }, { affection: 1 }])
    const s = new ChatSession(memoryStore({ ...freshState(), affection: 38 }), chat)
    const first = await run(s, { text: '오늘 예쁘다' })
    expect(first.at(-1)).toMatchObject({ type: 'done', affection: 43, stage: '호기심', stageUp: { from: '경계', to: '호기심', up: true } })
    await run(s, { text: '정말이야' })
    expect(systemNotes(calls[1]).some(n => n.includes('호기심'))).toBe(true)
    expect(s.state.pendingEvent).toBeNull()
  })

  it('keeps a reply that finished before the connection dropped, and drops one that did not', async () => {
    // 대사(reply)까지 받고 끊김 → 반영
    const finished = fakeChat([{}], { stopAfter: 170 })
    const s1 = new ChatSession(memoryStore(), finished.chat)
    const e1 = await run(s1, { text: '안녕' })
    expect(e1.at(-1)).toMatchObject({ type: 'done' })
    // 대사 중간에 끊김 → 방금 한 말까지 기록에서 빼고 오류를 알린다
    const cut = fakeChat([{}], { stopAfter: 60 })
    const s2 = new ChatSession(memoryStore(), cut.chat)
    const e2 = await run(s2, { text: '안녕' })
    expect(e2.at(-1)).toEqual({ type: 'error', message: 'connection lost' })
    expect(s2.state.messages.map(m => m.role)).toEqual(['assistant'])
    expect(s2.isBusy).toBe(false)
  })

  it('greets first after a long absence, without changing affection', async () => {
    const t0 = Date.parse('2026-11-01T10:00:00Z')
    let now = t0
    const { chat, calls } = fakeChat([{ affection: 3 }, { affection: 5, emotion: 'happy' }])
    const s = new ChatSession(memoryStore(), chat, { now: () => now })
    await run(s, { text: '안녕' })
    const events: SessionEvent[] = []
    expect(await s.greetIfAway(e => events.push(e), new AbortController().signal)).toBe(false)
    now = t0 + 8 * 3600_000
    expect(await s.greetIfAway(e => events.push(e), new AbortController().signal)).toBe(true)
    expect(systemNotes(calls[1]).some(n => n.includes('시간'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', delta: 0, affection: 23 })
    expect(s.state.messages.at(-1)?.greeting).toBe(true)
    // 이미 인사했으면 또 하지 않는다
    expect(await s.greetIfAway(() => {}, new AbortController().signal)).toBe(false)
  })

  it('renames the greeting before the first talk and survives a corrupt save', () => {
    const s = new ChatSession(memoryStore({ messages: 'oops', affection: 'x', scene: 'moon' } as unknown as SessionState), fakeChat([{}]).chat)
    expect(s.state.affection).toBe(20)
    expect(s.state.scene).toBe('manor')
    s.setUserName('세드릭')
    expect(s.state.messages[0].text).toContain('세드릭')
    expect(s.snapshot()).toMatchObject({ userName: '세드릭', stage: '경계', actions: expect.arrayContaining([{ id: 'hug', kind: 'touch', label: '안아 주기', minAffection: 80, unlocked: false }]) })
  })
})
