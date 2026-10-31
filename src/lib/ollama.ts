// Ollama REST API 최소 클라이언트 (https://github.com/ollama/ollama/blob/main/docs/api.md)

export type Role = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: Role
  content: string
}

export interface ChatOptions {
  baseUrl: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  /** 구조화 출력용 JSON 스키마 (Ollama `format`) */
  format?: unknown
  signal?: AbortSignal
  /** 컨텍스트 길이 (토큰). 기본 NUM_CTX */
  numCtx?: number
  onToken: (token: string) => void
}

/** 설정 프롬프트(약 2천5백 토큰)와 대화 기록(최대 40개 남짓)이 함께 들어가는 길이 */
export const NUM_CTX = 8192

interface ChatChunk {
  message?: { content?: string }
  done?: boolean
  error?: string
}

export async function listModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal })
  if (!res.ok)
    throw new Error(`Ollama 모델 목록을 가져오지 못했어요 (${res.status})`)
  const data = await res.json() as { models?: { name: string }[] }
  return (data.models ?? []).map(m => m.name)
}

// 실제 대화 테스트(CPU, 2026-10)에서 한국어 캐릭터 대화가 잘 된 순서
const PREFERRED_MODELS = [/^exaone3\.5/, /^qwen2\.5:(7|14|32|72)b/, /^gemma[23]/, /^llama3/, /^qwen2\.5:3b/]

/** 설정한 모델이 설치돼 있지 않으면, 설치된 모델 중 추천 순서대로 하나를 고른다. */
export function pickModel(installed: string[], current: string): string {
  if (!installed.length || installed.includes(current))
    return current
  for (const pattern of PREFERRED_MODELS) {
    const found = installed.find(name => pattern.test(name))
    if (found)
      return found
  }
  return installed[0]
}

/** /api/chat 스트리밍 호출. 응답은 줄 단위 JSON(NDJSON)으로 온다. */
export async function streamChat(opts: ChatOptions): Promise<void> {
  const res = await fetch(`${opts.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      ...(opts.format ? { format: opts.format } : {}),
      // 기본(4096)이면 설정 프롬프트와 대화 20여 개가 넘쳐 앞부분이 잘린다 (잘리면 캐시도 못 쓴다).
      // 요청마다 같은 값을 보내야 Ollama가 모델을 다시 올리지 않는다.
      options: { temperature: opts.temperature ?? 0.8, num_ctx: opts.numCtx ?? NUM_CTX },
    }),
  })
  if (!res.ok || !res.body)
    throw new Error(`Ollama 요청 실패 (${res.status}): ${await res.text().catch(() => '')}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleLine = (line: string) => {
    if (!line.trim())
      return
    const chunk = JSON.parse(line) as ChatChunk
    if (chunk.error)
      throw new Error(chunk.error)
    if (chunk.message?.content)
      opts.onToken(chunk.message.content)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done)
      break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(handleLine)
  }
  handleLine(buffer + decoder.decode())
}
