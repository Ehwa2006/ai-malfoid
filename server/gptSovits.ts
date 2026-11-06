// AI 음성 모델(GPT-SoVITS) 연결. 개발 서버(npm start / npm run dev)에 붙는다.
//
//   앱  ──POST /tts/gsv {input, emotion, speed}──▶  이 서버  ──POST /tts──▶  GPT-SoVITS api_v2 (기본 127.0.0.1:9880)
//
// GPT-SoVITS는 참고 음성(짧은 wav)과 그 대사를 받아 같은 목소리·말투로 새 문장을 읽는다(제로샷 복제).
// 감정마다 다른 참고 음성을 써서, 카리나가 비웃을 때와 당황할 때 목소리 톤이 달라지게 한다.
// 참고 음성 묶음(보이스 팩)은 voices/<이름>/voice.json 에 있다.
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { speakableKorean, withoutLatin } from './koreanSpeech'

export const GSV_PATH = '/tts/gsv'
const EMOTIONS = ['neutral', 'smirk', 'annoyed', 'flustered', 'happy', 'sad', 'surprised'] as const
const MAX_CHARS = 300

export interface VoiceRef {
  /** voice.json 기준 상대 경로의 참고 음성 (3~10초 wav) */
  file: string
  /** 참고 음성에서 실제로 말하는 대사 */
  text: string
}

export interface VoicePack {
  name: string
  /** 참고 음성의 언어 (GPT-SoVITS 코드: ko, ja, zh, en …) */
  lang: string
  credit?: string
  license?: string
  /** 감정별 참고 음성. 없는 감정은 neutral을 쓴다 */
  refs: Partial<Record<(typeof EMOTIONS)[number], VoiceRef>> & { neutral: VoiceRef }
}

export function gsvOrigin(value?: string): string {
  const url = new URL(/^https?:\/\//.test(value || '') ? value! : `http://${value || '127.0.0.1:9880'}`)
  if (url.hostname === '0.0.0.0')
    url.hostname = '127.0.0.1'
  return url.origin
}

export function loadVoicePack(file: string): VoicePack {
  const pack = JSON.parse(readFileSync(file, 'utf8')) as VoicePack
  if (!pack.refs?.neutral)
    throw new Error(`${file}: refs.neutral이 필요해요`)
  return pack
}

/** 감정에 맞는 참고 음성 (절대 경로). 파일이 없으면 neutral로 */
export function pickReference(pack: VoicePack, packDir: string, emotion: unknown): VoiceRef & { path: string } {
  const key = EMOTIONS.find(e => e === emotion) ?? 'neutral'
  for (const ref of [pack.refs[key], pack.refs.neutral]) {
    if (!ref)
      continue
    const path = isAbsolute(ref.file) ? ref.file : resolve(packDir, ref.file)
    if (existsSync(path))
      return { ...ref, path }
  }
  throw new Error(`참고 음성 파일이 없어요: ${join(packDir, pack.refs.neutral.file)}`)
}

/**
 * GPT-SoVITS에 보낼 합성 요청.
 * - 대사는 소리 내어 읽기 좋게 다듬는다 (숫자·영어·물결표·말줄임표, server/koreanSpeech.ts)
 * - 쉼표마다 자르지 않는다(cut0): 앱이 이미 문장 단위로 보내므로, 쉼표에서 잘라 따로 합성하면
 *   쉼표마다 억양이 처음부터 다시 시작되고 0.3초씩 끊겨 말이 로봇처럼 들린다
 * - 샘플링은 조금 보수적으로: 한국어 억양이 들쭉날쭉하거나 끝을 흐리는 일이 줄어든다 (scripts/gpt-sovits 실험 참고)
 */
export function gsvRequest(input: string, ref: VoiceRef & { path: string }, pack: Pick<VoicePack, 'lang'>, speed: number) {
  return {
    text: speakableKorean(input),
    text_lang: 'ko',
    ref_audio_path: ref.path,
    prompt_text: ref.text,
    prompt_lang: pack.lang,
    text_split_method: 'cut0',
    ...SAMPLING,
    batch_size: 1,
    speed_factor: speed,
    media_type: 'wav',
    streaming_mode: false,
  }
}

/** 샘플링 설정 (GPT-SoVITS 기본값: top_k 15, top_p 1, temperature 1, repetition_penalty 1.35) */
export const SAMPLING = { top_k: 15, top_p: 1, temperature: 1, repetition_penalty: 1.35 }

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
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export function gptSovits(options: { packFile: string, url?: string }): Plugin {
  const packFile = resolve(options.packFile)
  const packDir = dirname(packFile)
  const target = gsvOrigin(options.url)

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    // 비동기 처리 중 예상 못 한 오류가 개발 서버 전체를 죽이지 않도록 여기서 받는다
    handle(req, res, next).catch((e) => {
      if (!res.headersSent)
        sendJson(res, 500, { error: { message: (e as Error).message } })
      else
        res.end()
    })
  }

  const handle = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const path = req.url?.split('?')[0]
    if (path === `${GSV_PATH}/status`) {
      // 앱이 설정 화면과 자동 선택에 쓰는 상태 확인
      const packReady = existsSync(packFile)
      let serverReady = false
      try {
        // api_v2에는 상태 확인 경로가 없어서, 빈 요청에 400(JSON)이 오면 살아 있는 것으로 본다
        const r = await fetch(`${target}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) })
        serverReady = r.status === 400 || r.ok
      }
      catch {}
      let pack: Pick<VoicePack, 'name' | 'credit'> | null = null
      if (packReady) {
        try {
          const p = loadVoicePack(packFile)
          pack = { name: p.name, credit: p.credit }
        }
        catch {}
      }
      return sendJson(res, 200, { server: serverReady, url: target, pack })
    }
    if (path !== GSV_PATH)
      return next()
    if (req.method !== 'POST')
      return sendJson(res, 405, { error: { message: 'POST only' } })

    let body: Record<string, unknown>
    let pack: VoicePack
    let ref: VoiceRef & { path: string }
    try {
      body = await readJson(req)
      pack = loadVoicePack(packFile)
      ref = pickReference(pack, packDir, body.emotion)
    }
    catch (e) {
      return sendJson(res, 400, { error: { message: (e as Error).message } })
    }
    const input = typeof body.input === 'string' ? body.input.trim().slice(0, MAX_CHARS) : ''
    if (!input)
      return sendJson(res, 400, { error: { message: 'input is required' } })
    const speed = Number.isFinite(Number(body.speed)) ? Math.min(1.6, Math.max(0.6, Number(body.speed))) : 1

    const abort = new AbortController()
    res.on('close', () => abort.abort()) // 앱이 중지하면 합성도 그만둔다
    const synth = (text: string) => fetch(`${target}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60_000)]),
      body: JSON.stringify({ ...gsvRequest(input, ref, pack, speed), text }),
    })
    try {
      const request = gsvRequest(input, ref, pack, speed)
      let upstream = await synth(request.text)
      // 400은 이 문장을 못 읽은 것(낯선 영어 낱말 등): 영어를 빼고 한 번 더 읽어 본다
      if (upstream.status === 400) {
        const retry = withoutLatin(input)
        if (retry && retry !== request.text)
          upstream = await synth(retry)
      }
      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 300)
        // 문장 탓이면 422: 앱은 이 문장만 다른 음성으로 읽고 AI 음성을 계속 쓴다. 서버 탓이면 502
        return sendJson(res, upstream.status < 500 ? 422 : 502, { error: { message: `GPT-SoVITS ${upstream.status}: ${detail}` } })
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/wav')
      res.setHeader('Cache-Control', 'no-store')
      res.end(Buffer.from(await upstream.arrayBuffer()))
    }
    catch (e) {
      if (!abort.signal.aborted)
        sendJson(res, 502, { error: { message: `GPT-SoVITS(${target})에 연결하지 못했어요: ${(e as Error).message}` } })
    }
  }

  return {
    name: 'malfoid-gpt-sovits',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
