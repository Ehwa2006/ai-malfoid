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

/**
 * 읽을 글자가 있는 조각만 읽는다. "…", "?!" 그리고 "ㅋㅋ", "ㅠㅠ", "ㅎㅎ~"처럼 자모만 있는 조각은
 * 음성 엔진이 소리를 만들지 못하므로 건너뛴다.
 */
function speakable(text: string): boolean {
  return /[가-힣A-Za-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
}

export class SpeechChunker {
  private inAction = false
  /** 여는 '*' 뒤의 글자. 닫는 '*'가 오면 버리고, 안 오면(줄바꿈·답변 끝) 대사로 되돌린다 */
  private action = ''
  private pending = ''

  /** 새로 들어온 대사 조각을 넣고, 읽을 준비가 된 문장들을 돌려준다 */
  push(text: string): string[] {
    for (const ch of text) {
      if (ch === '*') {
        if (this.inAction)
          this.action = '' // 닫혔다: 행동 묘사이므로 읽지 않는다
        this.inAction = !this.inAction
        this.pending += ' '
        continue
      }
      if (!this.inAction) {
        this.pending += ch
        continue
      }
      if (ch === '\n') {
        // 줄이 바뀔 때까지 닫히지 않은 '*'는 행동 묘사가 아니라 잘못 붙은 기호로 본다
        // (화면에도 대사로 보인다)
        this.pending += `${this.action}\n`
        this.action = ''
        this.inAction = false
        continue
      }
      this.action += ch
    }
    return this.drain(false)
  }

  /** 답변이 끝났을 때 남은 문장을 모두 돌려준다 */
  flush(): string[] {
    if (this.inAction)
      this.pending += this.action
    this.action = ''
    this.inAction = false
    return this.drain(true)
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
