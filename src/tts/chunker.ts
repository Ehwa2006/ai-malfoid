// 흘러나오는 대사를 TTS로 읽을 문장 단위로 자른다.
// 문장이 끝나는 대로 바로 읽기 시작해서, 답변이 다 나오기 전에도 목소리가 나온다.
// *행동 묘사*는 소리 내어 읽지 않는다.

const SENTENCE_END = /[.!?…~]+["'”’)\]]*\s+|\n+/g
const MAX_LENGTH = 90

function normalize(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 글자나 숫자가 하나도 없는 조각("…", "?!")은 읽지 않는다 */
function speakable(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

export class SpeechChunker {
  private inAction = false
  private pending = ''

  /** 새로 들어온 대사 조각을 넣고, 읽을 준비가 된 문장들을 돌려준다 */
  push(text: string): string[] {
    for (const ch of text) {
      if (ch === '*') {
        this.inAction = !this.inAction
        this.pending += ' '
        continue
      }
      if (!this.inAction)
        this.pending += ch
    }
    return this.drain(false)
  }

  /** 답변이 끝났을 때 남은 문장을 모두 돌려준다 */
  flush(): string[] {
    const out = this.drain(true)
    this.inAction = false
    return out
  }

  private drain(final: boolean): string[] {
    const out: string[] = []
    const emit = (s: string) => {
      const t = normalize(s)
      if (speakable(t))
        out.push(t)
    }
    let last = 0
    SENTENCE_END.lastIndex = 0
    for (let m = SENTENCE_END.exec(this.pending); m; m = SENTENCE_END.exec(this.pending)) {
      emit(this.pending.slice(last, m.index + m[0].length))
      last = m.index + m[0].length
    }
    this.pending = this.pending.slice(last)
    // 마침표 없이 길게 이어지면 쉼표에서 끊어 첫 소리가 너무 늦지 않게 한다
    while (this.pending.length > MAX_LENGTH) {
      const cut = this.pending.lastIndexOf(', ', MAX_LENGTH)
      if (cut < 20)
        break
      emit(this.pending.slice(0, cut + 1))
      this.pending = this.pending.slice(cut + 1)
    }
    if (final) {
      emit(this.pending)
      this.pending = ''
    }
    return out
  }
}

/** 완성된 대사 전체를 문장들로 (다시 듣기용) */
export function splitSpeech(text: string): string[] {
  const c = new SpeechChunker()
  return [...c.push(text), ...c.flush()]
}
