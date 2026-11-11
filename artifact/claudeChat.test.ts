// 아티팩트가 앱과 같은 대화 흐름(ChatSession)을 Claude에게 그대로 보내는지, 가짜 sample로 확인한다
import { describe, expect, it } from 'vitest'
import { ChatSession, freshState, type SessionEvent, type SessionState } from '../server/chatSession'
import { CHOICES_KEY } from '../src/lib/reply'
import { claudeChat, PREAMBLE, type SampleFn, type SampleTurn, toSampleTurns } from './claudeChat'

function store(initial: SessionState) {
  let saved = structuredClone(initial)
  return { load: () => structuredClone(saved), save: (s: SessionState) => { saved = structuredClone(s) } }
}

/** 정해 둔 JSON을 몇 글자씩 흘려보내는 가짜 sample */
function fakeSample(reply: object, seen: SampleTurn[][]): SampleFn {
  return async (input, opts) => {
    seen.push(input)
    const text = `\`\`\`json\n${JSON.stringify(reply)}\n\`\`\``
    for (let i = 0; i < text.length; i += 7)
      opts?.onText?.({ text: text.slice(0, i + 7), delta: text.slice(i, i + 7) })
    return { text, truncated: false }
  }
}

describe('toSampleTurns', () => {
  it('starts and ends on a user turn, merging notes and labelling the player', () => {
    const turns = toSampleTurns([
      { role: 'system', content: '설정' },
      { role: 'user', content: '안녕' },
      { role: 'assistant', content: '{"reply":[]}' },
      { role: 'system', content: '[현재 호감도] 20' },
      { role: 'user', content: '차 마실래?' },
      { role: 'system', content: '[이번 말에 대한 주의] …' },
    ], '포터')
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant', 'user'])
    expect(turns[0].content).toBe(`${PREAMBLE}\n\n설정\n\n포터: 안녕`)
    expect(turns[2].content).toBe('[현재 호감도] 20\n\n포터: 차 마실래?\n\n[이번 말에 대한 주의] …')
  })

  it('never ends on an assistant turn', () => {
    expect(toSampleTurns([{ role: 'assistant', content: '흥' }], '포터').at(-1)!.role).toBe('user')
  })
})

describe('claudeChat', () => {
  const reply = {
    emotion: 'annoyed',
    affection: 3,
    scene: 'garden',
    reply: [{ kind: 'action', text: '손을 탁 쳐낸다' }, { kind: 'say', text: '어머, 손 치워.' }],
    thought: '깜짝 놀랐잖아.',
    memory: '포터는 카리나를 만지고 싶어 한다',
    [CHOICES_KEY]: ['미안', '장난이야', '정원 걷자'],
  }

  it('runs the app flow on Claude: refusal note, no rise, nothing remembered', async () => {
    const seen: SampleTurn[][] = []
    const session = new ChatSession(store({ ...freshState('포터'), affection: 30 }), claudeChat(fakeSample(reply, seen), { tier: () => 'quick', speaker: () => '포터' }))
    const events: SessionEvent[] = []
    await session.say({ text: '*카리나의 허벅지를 쓰다듬는다*' }, e => events.push(e), new AbortController().signal)
    const last = seen[0].at(-1)!.content
    expect(last).toContain('포터: *카리나의 허벅지를 쓰다듬는다*')
    expect(last).toContain('[이번 말에 대한 주의]')
    expect(seen[0][0].content).toContain('카리나 말포이')
    const done = events.find(e => e.type === 'done') as Extract<SessionEvent, { type: 'done' }>
    expect(done).toMatchObject({ affection: 30, delta: 0, memory: null })
    expect(session.state.messages.at(-1)).toMatchObject({ role: 'assistant', text: '*손을 탁 쳐낸다* 어머, 손 치워.', scene: 'garden' })
    expect(events.filter(e => e.type === 'sentence').map(e => (e as { text: string }).text).join(' ')).toBe('어머, 손 치워.')
  })

  it('turns a failure into a message and drops the unanswered line', async () => {
    const codes: string[] = []
    const failing: SampleFn = () => Promise.reject({ code: 'rate_limited', message: 'slow down' })
    const session = new ChatSession(store(freshState('포터')), claudeChat(failing, { tier: () => 'quick', speaker: () => '포터', onFailure: c => codes.push(c) }))
    const events: SessionEvent[] = []
    await session.say({ text: '안녕' }, e => events.push(e), new AbortController().signal)
    expect(codes).toEqual(['rate_limited'])
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Claude 사용량이 잠깐 찼어요. 조금 뒤에 다시 보내 주세요.' })
    expect(session.state.messages.map(m => m.role)).toEqual(['assistant'])
  })

  it('stays quiet when the viewer stops the answer', async () => {
    const stopped: SampleFn = () => Promise.reject({ code: 'cancelled', message: 'aborted' })
    const session = new ChatSession(store(freshState('포터')), claudeChat(stopped, { tier: () => 'quick', speaker: () => '포터' }))
    const events: SessionEvent[] = []
    await session.say({ text: '안녕' }, e => events.push(e), new AbortController().signal)
    expect(events.some(e => e.type === 'error')).toBe(false)
  })
})
