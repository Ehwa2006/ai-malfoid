// 개발 서버(npm start / npm run dev)에 붙는 TTS 엔드포인트.
// OpenAI 호환 형식(POST /tts/v1/audio/speech)으로 받아 Microsoft Edge 읽어주기 서비스의
// 한국어 신경망 음성으로 합성한 mp3를 돌려준다. 인터넷 연결이 필요하고, API 키는 필요 없다.
// (Edge 브라우저의 "소리 내어 읽기" 서비스를 비공식적으로 쓰는 것이라 개인 용도로만 쓴다.)
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const EDGE_TTS_PATH = '/tts/v1/audio/speech'
export const EDGE_VOICES = ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural', 'ko-KR-HyunsuMultilingualNeural'] as const
const MAX_CHARS = 600

interface SpeechRequest {
  input?: unknown
  voice?: unknown
  speed?: unknown
  pitch?: unknown
}

/** SSML 안에 그대로 들어가므로 XML 특수문자를 이스케이프한다 */
export function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&apos;' })[c]!)
}

/** speed(0.5~2, 1=보통)와 pitch(-50~50, %)를 SSML prosody 값으로 바꾼다. 범위 밖이면 잘라낸다. */
export function prosody(speed: unknown, pitch: unknown) {
  const s = Number.isFinite(Number(speed)) ? Math.min(2, Math.max(0.5, Number(speed))) : 1
  const p = Number.isFinite(Number(pitch)) ? Math.min(50, Math.max(-50, Math.round(Number(pitch)))) : 0
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`
  return { rate: pct(Math.round((s - 1) * 100)), pitch: pct(p) }
}

async function readJson(req: IncomingMessage): Promise<SpeechRequest> {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 16_000)
      throw new Error('request too large')
  }
  const data: unknown = JSON.parse(body || '{}')
  // "null", 숫자, 배열 같은 본문은 빈 요청으로 본다
  return data && typeof data === 'object' && !Array.isArray(data) ? data as SpeechRequest : {}
}

function sendError(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: { message } }))
}

const handler: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url?.split('?')[0] !== EDGE_TTS_PATH)
    return next()
  // 비동기 처리 중 예상 못 한 오류가 개발 서버 전체를 죽이지 않도록 여기서 받는다
  speak(req, res).catch((e) => {
    if (!res.headersSent)
      sendError(res, 500, (e as Error).message)
    else
      res.end()
  })
}

async function speak(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST')
    return sendError(res, 405, 'POST only')

  let body: SpeechRequest
  try {
    body = await readJson(req)
  }
  catch {
    return sendError(res, 400, 'invalid JSON')
  }
  const input = typeof body.input === 'string' ? body.input.trim().slice(0, MAX_CHARS) : ''
  if (!input)
    return sendError(res, 400, 'input is required')
  const voice = EDGE_VOICES.find(v => v === body.voice) ?? EDGE_VOICES[0]

  const tts = new MsEdgeTTS()
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(escapeXml(input), prosody(body.speed, body.pitch))
    const chunks: Buffer[] = []
    for await (const chunk of audioStream)
      chunks.push(chunk as Buffer)
    const audio = Buffer.concat(chunks)
    // "ㅋㅋ"처럼 읽을 수 없는 글자만 있으면 소리가 비어 온다. 이 문장 문제이므로 4xx로 알린다(앱은 건너뛴다)
    if (!audio.length)
      return sendError(res, 422, 'empty audio from Edge TTS (nothing speakable in input)')
    res.statusCode = 200
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.end(audio)
  }
  catch (e) {
    sendError(res, 502, `Edge TTS failed: ${(e as Error).message}`)
  }
  finally {
    tts.close()
  }
}

export function edgeTts(): Plugin {
  return {
    name: 'malfoid-edge-tts',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
