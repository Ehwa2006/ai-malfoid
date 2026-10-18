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
  signal?: AbortSignal
  onToken: (token: string) => void
}

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
      options: { temperature: opts.temperature ?? 0.8 },
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
