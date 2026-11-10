import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanTranscript, stt, sttOrigin } from './stt'

describe('cleanTranscript', () => {
  it('keeps what was said, tidying spaces', () => {
    expect(cleanTranscript('  오늘   정원에서 차 마실래?  ', 0.98)).toBe('오늘 정원에서 차 마실래?')
    expect(cleanTranscript('감사합니다.', 0.95)).toBe('감사합니다.')
  })

  it('drops text when there was hardly any speech', () => {
    expect(cleanTranscript('네.', 0.1)).toBe('')
    expect(cleanTranscript('', 1)).toBe('')
  })

  it('drops subtitles Whisper invents from noise', () => {
    for (const t of ['시청해 주셔서 감사합니다.', '구독과 좋아요 부탁드립니다!', 'MBC 뉴스 이덕영입니다.', '자막 제공 배달의민족'])
      expect(cleanTranscript(t, 0.9)).toBe('')
  })

  it('drops the name prompt leaking into the output', () => {
    expect(cleanTranscript('호그와트, 퀴디치, 슬리데린', 0.8)).toBe('')
    expect(cleanTranscript('카리나 말포이와 포터의 대화.', 0.8)).toBe('')
    // 이름이 든 진짜 말은 남긴다
    expect(cleanTranscript('카리나, 퀴디치 보러 갈래?', 0.9)).toBe('카리나, 퀴디치 보러 갈래?')
  })

  it('uses the same prompt as the recognizer', () => {
    const py = readFileSync(new URL('../scripts/stt/stt_server.py', import.meta.url), 'utf8')
    const ts = readFileSync(new URL('./stt.ts', import.meta.url), 'utf8')
    const pyPrompt = /^PROMPT = "([^"]+)"/m.exec(py)?.[1]
    const tsPrompt = /^const PROMPT = '([^']+)'/m.exec(ts)?.[1]
    expect(pyPrompt).toBeTruthy()
    expect(tsPrompt).toBe(pyPrompt)
  })

  it('reads the recognizer address like the other servers', () => {
    expect(sttOrigin()).toBe('http://127.0.0.1:9881')
    expect(sttOrigin('0.0.0.0:9999')).toBe('http://127.0.0.1:9999')
  })
})

describe('stt plugin (HTTP)', () => {
  const servers: Server[] = []
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(s => new Promise<void>(done => s.close(() => done()))))
  })

  const listen = async (s: Server) => {
    servers.push(s)
    await new Promise<void>(done => s.listen(0, '127.0.0.1', () => done()))
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
  }

  async function app(upstream: string) {
    let handler: ((req: unknown, res: unknown, next: () => void) => void) | null = null
    const plugin = stt({ url: upstream })
    ;(plugin.configureServer as (s: unknown) => void)({ middlewares: { use: (h: typeof handler) => { handler = h } } })
    return listen(createServer((req, res) => handler!(req, res, () => { res.statusCode = 404; res.end() })))
  }

  /** 가짜 faster-whisper 서버 */
  async function recognizer(reply: (req: IncomingMessage, body: Buffer) => [number, unknown], ready = true) {
    const seen: { type?: string, size: number, url?: string }[] = []
    const url = await listen(createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = Buffer.concat(chunks)
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/health')
        return res.end(JSON.stringify({ ok: true, ready, model: 'large-v3-turbo', device: 'cpu' }))
      seen.push({ type: req.headers['content-type'], size: body.length, url: req.url })
      const [status, data] = reply(req, body)
      res.statusCode = status
      res.end(JSON.stringify(data))
    }))
    return { url, seen }
  }

  it('forwards the recording as is and returns the cleaned text', async () => {
    const r = await recognizer(() => [200, { text: '  오늘 기분 어때?  ', speech: 0.97, seconds: 2.1, took: 1.4 }])
    const url = await app(r.url)
    const res = await fetch(`${url}/stt`, { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body: new Uint8Array(1234) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: '오늘 기분 어때?', seconds: 2.1, took: 1.4 })
    expect(r.seen).toEqual([{ type: 'audio/webm;codecs=opus', size: 1234, url: '/transcribe?lang=ko' }])
  })

  it('returns empty text for invented subtitles', async () => {
    const r = await recognizer(() => [200, { text: '시청해 주셔서 감사합니다.', speech: 0.6 }])
    const url = await app(r.url)
    const res = await fetch(`${url}/stt`, { method: 'POST', body: new Uint8Array(10) })
    expect(((await res.json()) as { text: string }).text).toBe('')
  })

  it('reports status: ready, still loading the model, or not running', async () => {
    const ready = await recognizer(() => [200, {}])
    expect(await (await fetch(`${await app(ready.url)}/stt/status`)).json()).toMatchObject({ server: true, starting: false, device: 'cpu' })
    const loading = await recognizer(() => [200, {}], false)
    expect(await (await fetch(`${await app(loading.url)}/stt/status`)).json()).toMatchObject({ server: false, starting: true })
    expect(await (await fetch(`${await app('http://127.0.0.1:1')}/stt/status`)).json()).toMatchObject({ server: false, starting: false })
  })

  it('maps failures: model loading 503, unreadable audio 422, server down 503, empty body 400', async () => {
    const loading = await recognizer(() => [503, { error: '음성 인식 모델을 올리는 중이에요' }])
    const r1 = await fetch(`${await app(loading.url)}/stt`, { method: 'POST', body: new Uint8Array(10) })
    expect(r1.status).toBe(503)
    expect(((await r1.json()) as { error: { message: string } }).error.message).toContain('올리는 중')
    const bad = await recognizer(() => [422, { error: '녹음을 읽지 못했어요' }])
    expect((await fetch(`${await app(bad.url)}/stt`, { method: 'POST', body: new Uint8Array(10) })).status).toBe(422)
    const down = await app('http://127.0.0.1:1')
    expect((await fetch(`${down}/stt`, { method: 'POST', body: new Uint8Array(10) })).status).toBe(503)
    expect((await fetch(`${down}/stt`, { method: 'POST', body: new Uint8Array(0) })).status).toBe(400)
    expect((await fetch(`${down}/stt`)).status).toBe(405)
  })
})
