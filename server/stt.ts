// 음성 입력(받아쓰기). 개발 서버(npm start / npm run dev)에 붙는다.
//
//   앱(웹·유니티) ──POST /stt (녹음 파일)──▶ 이 서버 ──POST /transcribe──▶ faster-whisper 서버 (scripts/stt/stt_server.py, 기본 127.0.0.1:9881)
//
// 받아쓴 글을 그대로 믿지 않고 거른다: Whisper는 말소리가 거의 없을 때 앞 문맥(이름 목록)을 그대로 내놓거나
// "시청해 주셔서 감사합니다" 같은 방송 자막을 지어내곤 한다.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

export const STT_PATH = '/stt'
const MAX_BYTES = 20 * 1024 * 1024

/** stt_server.py의 앞 문맥 (새어 나온 것을 알아보려고 같은 글을 둔다) */
const PROMPT = '카리나 말포이와 포터의 대화. 호그와트, 퀴디치, 슬리데린, 얼그레이.'
/** 말소리 없이 Whisper가 자주 지어내는 문장 (유튜브 자막에서 배운 것) */
const HALLUCINATION = /^(?:시청해\s*주셔서\s*감사합니다|구독과\s*좋아요(?:\s*부탁드립니다)?|(?:MBC|KBS|SBS)\s*뉴스.*|자막\s*(?:제공|by).*|한글\s*자막.*|다음\s*영상에서\s*만나요)[.!?\s]*$/i

const compact = (t: string) => t.replace(/[\s.,!?~…"'“”‘’]/g, '')

/**
 * 받아쓴 글을 다듬는다. 믿을 수 없으면 빈 문자열.
 * @param speech 말소리로 볼 만한 정도 (0~1, 가장 말소리다운 구간 기준)
 */
export function cleanTranscript(text: string, speech = 1): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t || speech < 0.3)
    return ''
  if (HALLUCINATION.test(t))
    return ''
  // 앞 문맥이 그대로 새어 나왔다 (말한 내용이 아니라 이름 목록)
  const c = compact(t)
  if (c.length >= 4 && compact(PROMPT).includes(c))
    return ''
  return t
}

export function sttOrigin(value?: string): string {
  const url = new URL(/^https?:\/\//.test(value || '') ? value! : `http://${value || '127.0.0.1:9881'}`)
  if (url.hostname === '0.0.0.0')
    url.hostname = '127.0.0.1'
  return url.origin
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BYTES)
      throw new Error('녹음이 너무 길어요')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export function stt(options: { url?: string } = {}): Plugin {
  const target = sttOrigin(options.url)

  const handle = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const path = req.url?.split('?')[0]
    if (path === `${STT_PATH}/status`) {
      // 앱이 마이크 버튼에 어떤 받아쓰기를 쓸지 정할 때 본다
      try {
        const r = await fetch(`${target}/health`, { signal: AbortSignal.timeout(1500) })
        const h = await r.json() as { ready?: boolean, model?: string, device?: string | null }
        return sendJson(res, 200, { server: !!h.ready, starting: !h.ready, url: target, device: h.device ?? null })
      }
      catch {
        return sendJson(res, 200, { server: false, starting: false, url: target, device: null })
      }
    }
    if (path !== STT_PATH)
      return next()
    if (req.method !== 'POST')
      return sendJson(res, 405, { error: { message: 'POST only' } })
    let audio: Buffer
    try {
      audio = await readBody(req)
    }
    catch (e) {
      return sendJson(res, 413, { error: { message: (e as Error).message } })
    }
    if (!audio.length)
      return sendJson(res, 400, { error: { message: '녹음이 비었어요' } })
    const abort = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished)
        abort.abort()
    })
    try {
      const upstream = await fetch(`${target}/transcribe?lang=ko`, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] || 'application/octet-stream' },
        body: audio,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
      })
      const data = await upstream.json().catch(() => ({})) as { text?: string, speech?: number, seconds?: number, took?: number, error?: string }
      if (!upstream.ok)
        return sendJson(res, upstream.status === 503 ? 503 : upstream.status < 500 ? 422 : 502, { error: { message: data.error || `음성 인식 서버 오류 (${upstream.status})` } })
      return sendJson(res, 200, { text: cleanTranscript(data.text ?? '', data.speech ?? 1), seconds: data.seconds ?? null, took: data.took ?? null })
    }
    catch (e) {
      if (!abort.signal.aborted)
        sendJson(res, 503, { error: { message: `음성 인식 서버(${target})에 연결하지 못했어요: ${(e as Error).message}` } })
    }
  }

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    handle(req, res, next).catch((e) => {
      if (!res.headersSent)
        sendJson(res, 500, { error: { message: (e as Error).message } })
      else
        res.end()
    })
  }

  return {
    name: 'malfoid-stt',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
