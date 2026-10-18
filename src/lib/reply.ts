// LLM 답변 형식: Ollama 구조화 출력(JSON 스키마)으로 감정·호감도·대사를 함께 받는다.
// 작은 모델은 <|EMOTE:…|> 같은 특수 토큰을 자주 빠뜨리지만, 스키마로 디코딩을 제한하면 항상 채운다.
// 키 순서대로 생성되므로 감정이 먼저 정해져 아바타 표정이 대사보다 앞서 바뀌고, 대사는 흘러나오는 대로 보여준다.
import { EMOTIONS, MarkerParser, type Emotion, type MarkerEvent } from './markers'

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    emotion: { type: 'string', enum: [...EMOTIONS] },
    affection: { type: 'integer' },
    reply: { type: 'string' },
  },
  required: ['emotion', 'affection', 'reply'],
} as const

export interface ReplyRecord {
  emotion?: Emotion
  affection?: number
  reply: string
}

/** 히스토리로 보낼 때도 같은 형식을 써서 모델이 형식을 유지하게 한다. */
export function formatReply(r: ReplyRecord): string {
  return JSON.stringify({ emotion: r.emotion ?? 'neutral', affection: r.affection ?? 0, reply: r.reply })
}

const ESCAPES: Record<string, string> = { 'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f', '"': '"', '\\': '\\', '/': '/' }

/**
 * 스트리밍되는 JSON 답변을 조금씩 읽어 MarkerEvent로 바꾼다.
 * - "emotion", "affection"은 값이 완성되는 즉시 내보낸다 (키 순서와 무관).
 * - "reply" 문자열은 이스케이프를 풀어 가며 글자 단위로 내보낸다. 대사 안에 섞인
 *   <|…|> 마커는 MarkerParser가 걸러낸다.
 * - 끝까지 JSON이 아니면(형식을 무시한 모델) 전체를 예전 마커 형식의 텍스트로 처리한다.
 */
export class ReplyStreamParser {
  private buf = ''
  private emotionDone = false
  private affectionDone = false
  private replyPos = -1
  private replyDone = false
  private readonly text: MarkerParser

  constructor(private readonly emit: (event: MarkerEvent) => void) {
    this.text = new MarkerParser(emit)
  }

  push(chunk: string): void {
    this.buf += chunk
    if (!this.emotionDone) {
      const m = /"emotion"\s*:\s*"([^"\\]*)"/.exec(this.buf)
      if (m) {
        this.emotionDone = true
        const emotion = m[1].trim().toLowerCase() as Emotion
        if (EMOTIONS.includes(emotion))
          this.emit({ type: 'emote', emotion })
      }
    }
    if (!this.affectionDone) {
      // 숫자 뒤에 구분자가 와야 "1"이 "12"의 앞부분이 아님을 알 수 있다
      const m = /"affection"\s*:\s*"?(-?\d+)"?\s*[,}\s]/.exec(this.buf)
      if (m) {
        this.affectionDone = true
        this.emit({ type: 'affection', delta: Number.parseInt(m[1], 10) })
      }
    }
    if (this.replyPos < 0) {
      const m = /"reply"\s*:\s*"/.exec(this.buf)
      if (m)
        this.replyPos = m.index + m[0].length
    }
    if (this.replyPos >= 0 && !this.replyDone)
      this.decodeReply()
  }

  flush(): void {
    if (this.replyPos < 0 && !this.emotionDone && this.buf.trim())
      this.text.push(this.buf) // JSON이 아니었다
    this.text.flush()
  }

  private decodeReply() {
    let out = ''
    const s = this.buf
    let i = this.replyPos
    while (i < s.length) {
      const c = s[i]
      if (c === '"') {
        this.replyDone = true
        i++
        break
      }
      if (c === '\\') {
        if (i + 1 >= s.length)
          break // 이스케이프가 다음 청크로 넘어갔다
        const next = s[i + 1]
        if (next === 'u') {
          if (i + 6 > s.length)
            break
          out += String.fromCharCode(Number.parseInt(s.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        out += ESCAPES[next] ?? next
        i += 2
        continue
      }
      out += c
      i++
    }
    this.replyPos = i
    if (out)
      this.text.push(out)
  }
}
