// VR 앱(유니티)용 HTTP API: 줄 단위 JSON 스트림, 바쁠 때 409, 오류 응답 (대화 흐름 자체는 chatSession.test.ts)
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '../src/lib/ollama'
import { CHOICES_KEY } from '../src/lib/reply'
import type { ChatFn, SessionEvent } from './chatSession'
import { patientFetch } from './patientFetch'
import { vrApi } from './vrApi'

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

describe('vrApi (HTTP)', () => {
  let server: Server | null = null
  afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())))

  async function start(chat: ChatFn) {
    let handler: ((req: unknown, res: unknown, next: () => void) => void) | null = null
    const plugin = vrApi({ ollama: 'http://127.0.0.1:1', chat, stateFile: `/tmp/vrapi-test-${process.pid}-${Math.random()}.json` })
    ;(plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (h: typeof handler) => { handler = h } } })
    server = createServer((req, res) => handler!(req, res, () => { res.statusCode = 404; res.end() }))
    await new Promise<void>(done => server!.listen(0, '127.0.0.1', () => done()))
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  }

  it('streams one JSON event per line and refuses a second turn while busy', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const base = fakeChat([{}]).chat
    const url = await start(async (m, onToken, signal) => {
      await gate
      await base(m, onToken, signal)
    })
    const first = fetch(`${url}/vr/say`, { method: 'POST', body: JSON.stringify({ text: '안녕' }) })
    await new Promise(r => setTimeout(r, 50))
    const second = await fetch(`${url}/vr/say`, { method: 'POST', body: JSON.stringify({ text: '또 안녕' }) })
    expect(second.status).toBe(409)
    release()
    const res = await first
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l) as SessionEvent)
    expect(lines[0]).toEqual({ type: 'turn', user: '안녕' })
    expect(lines.at(-1)).toMatchObject({ type: 'done', affection: 22 })

    const state = await (await fetch(`${url}/vr/state`)).json() as { messages: { role: string }[] }
    expect(state).toMatchObject({ affection: 22, choices: ['좋아, 마시자', '오늘은 바빠', '네가 타 줄래?'], busy: false })
    expect(state.messages.map(m => m.role)).toEqual(['assistant', 'user', 'assistant'])
  })

  it('streams through the no-timeout fetch used for Ollama', async () => {
    const url = await start(fakeChat([{}]).chat)
    const res = await patientFetch(`${url}/vr/say`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '안녕' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l) as SessionEvent)
    expect(lines.at(-1)).toMatchObject({ type: 'done' })
    const aborted = new AbortController()
    aborted.abort()
    await expect(patientFetch(`${url}/vr/state`, { signal: aborted.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports errors as JSON and lets the next unknown route through', async () => {
    const url = await start(fakeChat([{}]).chat)
    expect((await fetch(`${url}/vr/say`, { method: 'POST', body: '{' })).status).toBe(400)
    expect((await fetch(`${url}/vr/say`, { method: 'POST', body: '{}' })).status).toBe(400)
    const bad = await fetch(`${url}/vr/say`, { method: 'POST', body: JSON.stringify({ action: 'kiss' }) })
    const lines = (await bad.text()).trim().split('\n').map(l => JSON.parse(l))
    expect(lines).toEqual([{ type: 'error', message: '모르는 행동이에요: kiss' }])
    expect((await fetch(`${url}/vr/nope`, { method: 'POST', body: '{}' })).status).toBe(404)
    expect((await fetch(`${url}/other`)).status).toBe(404)
    const reset = await (await fetch(`${url}/vr/reset`, { method: 'POST', body: '{}' })).json()
    expect(reset).toMatchObject({ affection: 20 })
  })
})
