// LLM 답변 형식: Ollama 구조화 출력(JSON 스키마)으로 감정·호감도·대사를 함께 받는다.
// 작은 모델은 <|EMOTE:…|> 같은 특수 토큰을 자주 빠뜨리지만, 스키마로 디코딩을 제한하면 항상 채운다.
// 키 순서대로 생성되므로 감정이 먼저 정해져 아바타 표정이 대사보다 앞서 바뀌고, 대사는 흘러나오는 대로 보여준다.
import { EMOTIONS, MarkerParser, type Emotion, type MarkerEvent } from './markers'

/** 대사의 한 조각: 몸짓·표정 같은 행동 묘사(action) 또는 입으로 하는 말(say) */
export interface ReplySegment {
  kind: 'action' | 'say'
  text: string
}

/**
 * reply를 행동과 말로 나눈 목록으로 받는다.
 * 한 문자열 안에 *별표*로 행동을 표시하게 하면, 작은 모델은 별표를 빠뜨리거나 "별표:"라고 글자로 쓰기도 한다.
 * 종류를 따로 적게 하면 디코딩 단계에서 형식이 강제되므로 행동과 말이 섞이지 않는다.
 */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    emotion: { type: 'string', enum: [...EMOTIONS] },
    affection: { type: 'integer' },
    reply: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['action', 'say'] },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
      },
    },
  },
  required: ['emotion', 'affection', 'reply'],
} as const

export interface ReplyRecord {
  emotion?: Emotion
  affection?: number
  /** 화면에 보이는 대사 (행동 묘사는 *…*) */
  reply: string
}

/** "*고개를 돌린다* 흥." → [{action: 고개를 돌린다}, {say: 흥.}] */
export function toSegments(text: string): ReplySegment[] {
  return text.split(/(\*[^*]+\*)/g)
    .map(t => t.trim())
    .filter(t => t && t !== '*')
    .map(t => /^\*[^*]+\*$/.test(t)
      ? { kind: 'action' as const, text: t.slice(1, -1).trim() }
      : { kind: 'say' as const, text: t.replace(/\*/g, '').trim() }) // 짝 없는 별표는 버린다
    .filter(seg => seg.text)
}

/** 히스토리로 보낼 때도 같은 형식을 써서 모델이 형식을 유지하게 한다. */
export function formatReply(r: ReplyRecord): string {
  // 이전 버전에서 저장된 깨진 표시("별표:", ＊ 등)는 바로잡아서 보낸다 (모델이 그대로 따라 하지 않게)
  return JSON.stringify({ emotion: r.emotion ?? 'neutral', affection: r.affection ?? 0, reply: toSegments(finishReply(r.reply)) })
}

const ESCAPES: Record<string, string> = { 'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f', '"': '"', '\\': '\\', '/': '/' }

/** s[i]부터 JSON 문자열 본문을 읽는다 (여는 따옴표 다음 위치). 끝까지 안 왔으면 closed=false */
function readString(s: string, i: number): { value: string, end: number, closed: boolean } {
  let value = ''
  while (i < s.length) {
    const c = s[i]
    if (c === '"')
      return { value, end: i + 1, closed: true }
    if (c === '\\') {
      if (i + 1 >= s.length)
        break // 이스케이프가 다음 청크로 넘어갔다
      const next = s[i + 1]
      if (next === 'u') {
        if (i + 6 > s.length)
          break
        value += String.fromCharCode(Number.parseInt(s.slice(i + 2, i + 6), 16))
        i += 6
        continue
      }
      value += ESCAPES[next] ?? next
      i += 2
      continue
    }
    value += c
    i++
  }
  return { value, end: i, closed: false }
}

/** 문장부호 뒤(띄어쓰기를 사이에 두어도)에 붙은 밑줄 */
const SENTENCE_UNDERSCORE = /(?<=[.!?…~,"'][\s_]*)_/g

const skipSpace = (s: string, i: number) => {
  while (i < s.length && /\s/.test(s[i]))
    i++
  return i
}

/**
 * reply 목록을 지금까지 온 만큼 화면용 텍스트("*행동* 말 …")로 바꾼다.
 * 입력이 길어질수록 결과는 뒤에 덧붙기만 하므로, 새로 늘어난 부분만 내보내면 된다.
 */
function renderSegments(s: string, i: number): string {
  let out = ''
  let started = false
  while (true) {
    i = skipSpace(s, i)
    if (i >= s.length || s[i] === ']')
      return out
    if (s[i] === ',') {
      i++
      continue
    }
    if (s[i] !== '{')
      return out
    i++
    let kind: string | null = null
    while (true) {
      i = skipSpace(s, i)
      if (i >= s.length)
        return out
      if (s[i] === ',') {
        i++
        continue
      }
      if (s[i] === '}') {
        i++
        break
      }
      if (s[i] !== '"')
        return out
      const key = readString(s, i + 1)
      if (!key.closed)
        return out
      i = skipSpace(s, key.end)
      if (s[i] !== ':')
        return out
      i = skipSpace(s, i + 1)
      if (i >= s.length)
        return out
      if (s[i] !== '"') { // 문자열이 아닌 값은 건너뛴다
        while (i < s.length && s[i] !== ',' && s[i] !== '}')
          i++
        continue
      }
      const value = readString(s, i + 1)
      if (key.value === 'kind') {
        if (!value.closed)
          return out
        kind = value.value.trim().toLowerCase()
      }
      else if (key.value === 'text') {
        const action = kind === 'action'
        // 종류가 따로 있으니 글 안의 별표는 모두 지운다 (모델이 습관처럼 *…*를 섞으면 짝이 어긋난다).
        // 행동 안의 줄바꿈은 띄어쓰기로 (음성의 문장 나누기가 행동 묘사를 대사로 착각하지 않게)
        const unstarred = value.value.replace(/[*＊∗⁎✱✲]/g, '')
        const body = (action ? unstarred.replace(/\s/g, ' ') : unstarred).replace(/^\s+/, '')
        if (body) {
          out += `${started ? ' ' : ''}${action ? '*' : ''}${body}`
          if (value.closed && action)
            out += '*'
          started = true
        }
      }
      if (!value.closed)
        return out
      i = value.end
    }
  }
}

/**
 * 스트리밍되는 JSON 답변을 조금씩 읽어 MarkerEvent로 바꾼다.
 * - "emotion", "affection"은 값이 완성되는 즉시 내보낸다 (키 순서와 무관).
 * - "reply" 목록은 행동 묘사를 *…*로 감싼 텍스트로 바꿔 글자 단위로 내보낸다.
 *   예전 형식(reply가 문자열)도 받는다. 대사 안에 섞인 <|…|> 마커는 MarkerParser가 걸러낸다.
 * - 끝까지 JSON이 아니면(형식을 무시한 모델) 전체를 예전 마커 형식의 텍스트로 처리한다.
 */
export class ReplyStreamParser {
  private buf = ''
  private emotionDone = false
  private affectionDone = false
  private replyPos = -1
  private emitted = 0
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
      const m = /"reply"\s*:\s*([["])/.exec(this.buf)
      if (m)
        this.replyPos = m.index + m[0].length
    }
    if (this.replyPos >= 0) {
      const opener = this.buf[this.replyPos - 1]
      // 문장 사이에 끼는 밑줄("있었지._하긴")은 띄어쓰기로 바꾼다. 앞 글자만 보고 정하므로 뒤에 덧붙기만 한다는 성질은 그대로다.
      // (이름이나 ^_^ 같은 데 쓰인 밑줄은 건드리지 않는다)
      const rendered = (opener === '[' ? renderSegments(this.buf, this.replyPos) : readString(this.buf, this.replyPos).value).replace(SENTENCE_UNDERSCORE, ' ')
      if (rendered.length > this.emitted) {
        this.text.push(rendered.slice(this.emitted))
        this.emitted = rendered.length
      }
    }
  }

  flush(): void {
    if (this.replyPos < 0 && !this.emotionDone && this.buf.trim())
      this.text.push(this.buf) // JSON이 아니었다
    this.text.flush()
  }
}

/**
 * 행동 묘사(*…*) 안의 깨진 토큰을 지운다.
 * Qwen처럼 한글을 바이트 단위로 쪼개는 모델은 JSON 제한 디코딩에서 한글 첫 토큰이 막히면
 * `*createStatefully_raises_eyebrow*`, `*눈썹을 치켜📐*` 같은 영어·코드·이모지를 대신 낸다.
 * 한국어 행동 묘사에는 로마자와 이모지가 들어갈 일이 없으므로 행동 묘사 안에서만 걷어낸다.
 */
export function cleanReply(text: string): string {
  return normalizeMarks(text)
    .replace(/\*([^*]*)\*/g, (_, body: string) => {
      // 빈 짝("…포터* *걸어간다*")은 대사 끝에 잘못 붙은 별표와 다음 행동의 여는 별표다. 앞의 것만 버린다
      if (!body.trim())
        return ' *'
      const cleaned = body
        .replace(/[A-Za-z_/\\][\w/\\]*/g, '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        // 지운 단어에 붙어 있던 조사만 남으면 함께 지운다 ("createState를 …" → "를 …")
        .replace(/^(을|를|이|가|은|는|의|로|으로|와|과)(\s|$)/, '')
        .replace(/^[,.\s]+/, '')
      return /[가-힣]/.test(cleaned) ? `*${cleaned}*` : ' ' // 지운 자리는 띄워서 앞뒤 낱말이 붙지 않게
    })
    .split(/(\*[^*]+\*)/g)
    .reduce(joinAction, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** 행동 묘사와 붙어 있는 문장 사이를 띄운다 ("있으니까.*걸어간다*흥" → "있으니까. *걸어간다* 흥") */
function joinAction(out: string, part: string, i: number): string {
  if (!part)
    return out
  const action = i % 2 === 1 // split의 홀수 번째 조각이 *…*
  if (action && out && !/\s$/.test(out))
    return `${out} ${part}`
  if (!action && /\*$/.test(out) && /^[^\s.,!?…~"')\]]/.test(part))
    return `${out} ${part}`
  return out + part
}

/**
 * 모델이 기호를 잘못 쓴 것을 바로잡는다.
 * - 별표 대신 `별표:고개를 돌린다*`처럼 글자로 쓰거나, ＊ 같은 다른 별 기호, **굵게**를 쓴 것 → *
 * - 문장 사이에 끼운 밑줄("있었지._하긴") → 띄어쓰기 (이름·이모티콘의 밑줄은 그대로)
 */
function normalizeMarks(text: string): string {
  return text
    .replace(SENTENCE_UNDERSCORE, ' ')
    .replace(/_+$/, '')
    .replace(/[＊∗⁎✱✲]/g, '*')
    .replace(/\s*\(?별표\)?\s*[:：]\s*/g, ' *')
    .replace(/\*{2,}/g, '*')
}

/**
 * 답변이 끝났을 때 한 번 더 다듬는다. 별표 짝이 안 맞으면 바로잡는다.
 * - 닫는 별표만 있으면(`…있으니까. 문으로 걸어간다*`) 그 문장 앞에 여는 별표를 넣는다.
 * - 그 밖의 짝 없는 별표는 지운다 (화면에 별표가 그대로 보이지 않게).
 */
export function finishReply(text: string): string {
  const t = cleanReply(text)
  const stars = [...t.matchAll(/\*/g)].map(m => m.index)
  if (stars.length % 2 === 0)
    return t
  const lone = stars[stars.length - 1]
  const without = () => cleanReply(t.slice(0, lone) + t.slice(lone + 1))
  // 끝의 별표가 글자 바로 뒤에 붙어 있으면 닫는 별표다. 띄어 있으면 내용 없이 열기만 한 것이라 지운다
  if (lone !== t.length - 1 || /\s/.test(t[lone - 1] ?? ' '))
    return without()
  const before = t.slice(0, lone)
  const prev = stars.length > 1 ? stars[stars.length - 2] + 1 : 0
  let start = prev
  for (const m of before.slice(prev).matchAll(/[.!?…~\n]+\s*/g))
    start = prev + m.index + m[0].length
  start += /^\s*/.exec(before.slice(start))![0].length
  if (start >= lone)
    return without()
  const fixed = cleanReply(`${before.slice(0, start)} *${before.slice(start)}*`)
  return (fixed.match(/\*/g) ?? []).length % 2 === 0 ? fixed : without()
}
