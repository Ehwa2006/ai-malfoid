// VR 앱(유니티)용 API. 개발 서버(npm start / npm run start:vr)에 붙는다.
//
//   유니티 ──POST /vr/say {text | action}──▶ 이 서버 ──/api/chat──▶ Ollama
//         ◀── 줄 단위 JSON: turn, reaction, emotion, gesture, text, sentence, scene, thought, choices, done
//   유니티 ──POST /tts/gsv {input, emotion}──▶ AI 음성 (웹 앱과 같은 경로)
//
// GET  /vr/status    Ollama 연결·모델
// GET  /vr/state     호감도·단계·장소·최근 대화·기억·행동 목록
// POST /vr/say       말({text}) 또는 행동({action: 'pat' | 'tea' | …})에 대한 대답 (스트리밍)
// POST /vr/greet     오랜만에 왔으면 카리나가 먼저 인사 (스트리밍, 인사할 때가 아니면 바로 done 없이 끝)
// POST /vr/settings  {userName}
// POST /vr/reset     처음부터
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { listModels, pickModel, streamChat } from '../src/lib/ollama'
import { REPLY_SCHEMA } from '../src/lib/reply'
import { BusyError, type ChatFn, ChatSession, type SessionEvent, type SessionStore } from './chatSession'
import { patientFetch } from './patientFetch'

export const VR_PATH = '/vr'

export function fileStore(file: string): SessionStore {
  const path = resolve(file)
  return {
    load() {
      try {
        return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
      }
      catch {
        return null // 망가진 파일이면 새로 시작한다 (다음 저장에서 덮어쓴다)
      }
    },
    save(state) {
      mkdirSync(dirname(path), { recursive: true })
      // 저장 도중에 꺼져도 파일이 반쯤 쓰이지 않게 임시 파일에 쓰고 바꿔 끼운다
      writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 1))
      renameSync(`${path}.tmp`, path)
    },
  }
}

/** Ollama에 대답을 받는 함수. 설정한 모델이 없으면 설치된 모델 중 하나를 고른다 */
export function ollamaChat(baseUrl: string, wanted: string, temperature = 0.8): ChatFn & { model: () => Promise<string> } {
  let resolved: string | null = null
  const model = async () => {
    if (!resolved)
      resolved = pickModel(await listModels(baseUrl, AbortSignal.timeout(3000)), wanted)
    return resolved
  }
  const chat: ChatFn = async (messages, onToken, signal) => {
    await streamChat({ baseUrl, model: await model(), temperature, messages, format: REPLY_SCHEMA, signal, onToken, fetch: patientFetch as typeof fetch })
  }
  return Object.assign(chat, { model })
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 16_000)
      throw new Error('request too large')
  }
  const data: unknown = JSON.parse(body || '{}')
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(data))
}

/** 대답을 줄 단위 JSON으로 흘려보낸다. 앱이 연결을 끊으면 모델 호출도 멈춘다 */
async function stream(res: ServerResponse, run: (emit: (e: SessionEvent) => void, signal: AbortSignal) => Promise<unknown>) {
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished)
      abort.abort()
  })
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  const emit = (e: SessionEvent) => {
    if (!res.writableEnded)
      res.write(`${JSON.stringify(e)}\n`)
  }
  try {
    await run(emit, abort.signal)
  }
  catch (e) {
    emit({ type: 'error', message: (e as Error).message })
  }
  res.end()
}

export function vrApi(options: { ollama: string, model?: string, stateFile?: string, chat?: ChatFn }): Plugin {
  const chat = options.chat ?? ollamaChat(options.ollama, options.model || 'exaone3.5:7.8b')
  let session: ChatSession | null = null
  const getSession = () => (session ??= new ChatSession(fileStore(options.stateFile ?? '.malfoid/vr-session.json'), chat))

  const handle = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const path = req.url?.split('?')[0] ?? ''
    if (path !== VR_PATH && !path.startsWith(`${VR_PATH}/`))
      return next()
    const s = getSession()
    const route = `${req.method} ${path}`

    if (route === `GET ${VR_PATH}/status`) {
      let ollama = false
      let model: string | null = null
      try {
        model = 'model' in chat ? await (chat as { model: () => Promise<string> }).model() : options.model ?? null
        ollama = true
      }
      catch {}
      return sendJson(res, 200, { ok: true, ollama, model, busy: s.isBusy })
    }
    if (route === `GET ${VR_PATH}/state`)
      return sendJson(res, 200, s.snapshot())

    if (req.method !== 'POST')
      return sendJson(res, 405, { error: { message: 'POST only' } })
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    }
    catch {
      return sendJson(res, 400, { error: { message: 'invalid JSON' } })
    }

    if (path === `${VR_PATH}/say`) {
      const text = typeof body.text === 'string' ? body.text : undefined
      const action = typeof body.action === 'string' ? body.action : undefined
      if (!text?.trim() && !action)
        return sendJson(res, 400, { error: { message: 'text 또는 action이 필요해요' } })
      if (s.isBusy)
        return sendJson(res, 409, { error: { message: new BusyError().message } })
      return stream(res, (emit, signal) => s.say({ text, action }, emit, signal))
    }
    if (path === `${VR_PATH}/greet`) {
      if (s.isBusy)
        return sendJson(res, 409, { error: { message: new BusyError().message } })
      return stream(res, (emit, signal) => s.greetIfAway(emit, signal))
    }
    if (path === `${VR_PATH}/settings`) {
      if (typeof body.userName === 'string')
        s.setUserName(body.userName)
      return sendJson(res, 200, s.snapshot())
    }
    if (path === `${VR_PATH}/reset`) {
      if (s.isBusy)
        return sendJson(res, 409, { error: { message: new BusyError().message } })
      s.reset()
      return sendJson(res, 200, s.snapshot())
    }
    return sendJson(res, 404, { error: { message: `unknown route: ${route}` } })
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
    name: 'malfoid-vr-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
