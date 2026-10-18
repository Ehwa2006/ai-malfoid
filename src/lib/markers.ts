// AIRI처럼 LLM 출력 안에 특수 토큰을 섞어 캐릭터 표정/상태를 조종한다.
//   <|EMOTE:smirk|>      → 아바타 표정 변경
//   <|AFFECTION:+3|>     → 호감도 변화
// 스트리밍 중 토큰이 쪼개져 들어와도 안전하도록 버퍼링 파서로 구현한다.

export const EMOTIONS = ['neutral', 'smirk', 'annoyed', 'flustered', 'happy', 'sad', 'surprised'] as const
export type Emotion = typeof EMOTIONS[number]

export type MarkerEvent =
  | { type: 'text', text: string }
  | { type: 'emote', emotion: Emotion }
  | { type: 'affection', delta: number }

const OPEN = '<|'
const CLOSE = '|>'
const MAX_MARKER_LENGTH = 32

export function parseMarker(body: string): MarkerEvent | null {
  const [rawKey, rawValue = ''] = body.split(':', 2)
  const key = rawKey.trim().toUpperCase()
  const value = rawValue.trim()

  if (key === 'EMOTE') {
    const emotion = value.toLowerCase() as Emotion
    return EMOTIONS.includes(emotion) ? { type: 'emote', emotion } : null
  }
  if (key === 'AFFECTION') {
    const delta = Number.parseInt(value, 10)
    return Number.isFinite(delta) ? { type: 'affection', delta } : null
  }
  return null
}

export class MarkerParser {
  private buffer = ''

  constructor(private readonly emit: (event: MarkerEvent) => void) {}

  push(chunk: string): void {
    this.buffer += chunk

    while (this.buffer.length > 0) {
      const start = this.buffer.indexOf(OPEN)

      if (start === -1) {
        // '<' 하나로 끝나면 다음 청크에서 '<|'가 될 수 있으니 남겨둔다.
        const keep = this.buffer.endsWith('<') ? 1 : 0
        this.emitText(this.buffer.slice(0, this.buffer.length - keep))
        this.buffer = this.buffer.slice(this.buffer.length - keep)
        return
      }

      this.emitText(this.buffer.slice(0, start))
      this.buffer = this.buffer.slice(start)

      const end = this.buffer.indexOf(CLOSE, OPEN.length)
      if (end === -1) {
        if (this.buffer.length > MAX_MARKER_LENGTH) {
          // 마커가 아니었다 — 일반 텍스트로 흘려보낸다.
          this.emitText(OPEN)
          this.buffer = this.buffer.slice(OPEN.length)
          continue
        }
        return
      }

      const body = this.buffer.slice(OPEN.length, end)
      const event = parseMarker(body)
      // 알 수 없는 마커는 화면에 노출하지 않고 버린다.
      if (event)
        this.emit(event)
      this.buffer = this.buffer.slice(end + CLOSE.length)
    }
  }

  /** 스트림 종료 시 남은 텍스트를 흘려보낸다. */
  flush(): void {
    this.emitText(this.buffer)
    this.buffer = ''
  }

  private emitText(text: string) {
    if (text)
      this.emit({ type: 'text', text })
  }
}

/** 저장된 메시지 등 완성된 문자열에서 마커를 제거한다. */
export function stripMarkers(text: string): string {
  let out = ''
  const parser = new MarkerParser((e) => {
    if (e.type === 'text')
      out += e.text
  })
  parser.push(text)
  parser.flush()
  return out
}
