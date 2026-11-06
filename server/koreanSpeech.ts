// AI 음성(GPT-SoVITS)에 보내기 전에 한국어 대사를 소리 내어 읽기 좋게 다듬는다.
// GPT-SoVITS의 한국어 처리(g2pk2)는 숫자·영어·기호를 어색하게 읽는 일이 많다:
//   "3시" → "삼시", "AI" → 영어 발음, "거야~" → 물결표 때문에 끝 억양이 흐트러짐, "…"마다 문장이 끊김.
// 그래서 사람이 읽듯 바꿔 둔다: "세 시", "에이아이", "거야.", "그런 말은, 반칙이잖아."

const NATIVE_ONES = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉']
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']
const SINO_DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']

/** 고유어 수 (1~99, 단위 앞에 쓰는 꼴: 한 개, 두 시, 스무 살) */
export function nativeNumber(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 99)
    return null
  if (n === 20)
    return '스무'
  return NATIVE_TENS[Math.floor(n / 10)] + NATIVE_ONES[n % 10]
}

/** 한자어 수 (0 ~ 9999조): 2026 → 이천이십육, 10000 → 만, 15000 → 만 오천 */
export function sinoNumber(n: number): string {
  if (!Number.isFinite(n))
    return ''
  if (n === 0)
    return '영'
  const four = (v: number) => {
    let out = ''
    for (const [unit, size] of [['천', 1000], ['백', 100], ['십', 10]] as const) {
      const d = Math.floor(v / size) % 10
      if (d)
        out += (d === 1 ? '' : SINO_DIGITS[d]) + unit
    }
    const ones = v % 10
    return out + (ones ? SINO_DIGITS[ones] : '')
  }
  const parts: string[] = []
  const units = ['', '만', '억', '조']
  let rest = Math.floor(n)
  for (let i = 0; rest > 0 && i < units.length; i++) {
    const chunk = rest % 10000
    if (chunk)
      parts.unshift((i === 1 && chunk === 1 ? '' : four(chunk)) + units[i])
    rest = Math.floor(rest / 10000)
  }
  return parts.join(' ')
}

/** 고유어 수로 세는 단위 (한 개, 두 명, 세 시, 네 살…) */
const NATIVE_COUNTERS = ['시간', '시', '개', '명', '마리', '번째', '번', '살', '잔', '권', '병', '장', '대', '켤레', '송이', '가지', '군데', '판', '곡', '벌', '통', '척', '채', '그루', '알', '봉지', '조각', '걸음', '사람', '달']

const LETTER_NAMES: Record<string, string> = {
  A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지', H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠',
  N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티', U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '제트',
}

/** 대화에 자주 나오는 영어 이름·낱말 (한국어로 읽는다) */
const WORDS: Record<string, string> = {
  harry: '해리',
  potter: '포터',
  malfoy: '말포이',
  draco: '드레이코',
  karina: '카리나',
  hogwarts: '호그와트',
  hogsmeade: '호그스미드',
  slytherin: '슬리데린',
  gryffindor: '그리핀도르',
  ravenclaw: '래번클로',
  hufflepuff: '후플푸프',
  quidditch: '퀴디치',
  snitch: '스니치',
  london: '런던',
  ok: '오케이',
  okay: '오케이',
  yes: '예스',
  no: '노',
  hello: '헬로',
  hi: '하이',
  bye: '바이',
  sorry: '쏘리',
  thank: '땡큐',
  thanks: '땡스',
}

function convertNumbers(text: string): string {
  return text
    // 시각: 3시 30분 → 세 시 삼십 분
    .replace(/(\d{1,2})\s*시\s*(\d{1,2})\s*분/g, (_, h, m) => `${nativeNumber(Number(h)) ?? sinoNumber(Number(h))} 시 ${sinoNumber(Number(m))} 분`)
    // 6월은 유월, 10월은 시월
    .replace(/(\d{1,2})\s*월/g, (_, m) => (Number(m) === 6 ? '유월' : Number(m) === 10 ? '시월' : `${sinoNumber(Number(m))}월`))
    // 첫 번째: 1번째 → 첫 번째
    .replace(/(^|[^\d])1\s*번째/g, '$1첫 번째')
    // 고유어로 세는 단위 (1~99)
    .replace(new RegExp(`(\\d{1,2})\\s*(${NATIVE_COUNTERS.join('|')})`, 'g'), (whole, n, unit) => {
      const native = nativeNumber(Number(n))
      return native ? `${native} ${unit}` : whole
    })
    // 소수: 3.5 → 삼 점 오
    .replace(/(\d+)\.(\d+)/g, (_, a, b) => `${sinoNumber(Number(a))} 점 ${[...b].map(d => SINO_DIGITS[Number(d)]).join('')}`)
    // 퍼센트
    .replace(/(\d[\d,]*)\s*%/g, (_, n) => `${sinoNumber(Number(n.replace(/,/g, '')))} 퍼센트`)
    // 나머지 수는 한자어로: 2026년 → 이천이십육 년, 10,000원 → 만 원
    .replace(/\d[\d,]*/g, n => sinoNumber(Number(n.replace(/,/g, ''))))
}

function convertLatin(text: string): string {
  return text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => {
    const known = WORDS[word.toLowerCase()]
    if (known)
      return known
    // 짧은 대문자 약어는 글자대로 읽는다: AI → 에이아이, SNS → 에스엔에스
    if (/^[A-Z]{1,5}$/.test(word))
      return [...word].map(c => LETTER_NAMES[c]).join('')
    return word
  })
}

/**
 * 소리 내어 읽을 문장으로 다듬는다.
 * - 숫자는 한국어 읽기로 (고유어 단위·시각·월 이름 포함), 영어 이름과 약어는 한글로
 * - 물결표(~)는 늘이는 표시일 뿐이라 지우고, 문장 끝이면 마침표로
 * - 말줄임표(…)는 문장 안에서는 쉼표, 끝에서는 마침표 (문장이 조각나지 않게)
 * - "?!"는 "?"로 (물음 억양이 살도록), 괄호·따옴표·이모지·자모(ㅋㅋ)는 지운다
 */
export function speakableKorean(input: string): string {
  let t = input
    .normalize('NFC')
    .replace(/\p{Extended_Pictographic}|‍|️/gu, '')
    .replace(/[ㄱ-ㅎㅏ-ㅣ]+/g, ' ')
    .replace(/["“”„'‘’`]/g, '')
    .replace(/[「」『』()（）[\]{}<>《》〈〉]/g, ' ')
  t = convertNumbers(t)
  t = convertLatin(t)
  t = t
    .replace(/\s*[~～∼〜]+\s*(?=[.!?…,]|$)/g, '')
    .replace(/\s*[~～∼〜]+\s*/g, ', ')
    .replace(/\s*(?:…|\.{2,}|‥)+\s*(?=[!?.]|$)/g, '')
    .replace(/\s*(?:…|\.{2,}|‥)+\s*/g, ', ')
    .replace(/\s*[—–]+\s*|\s+-\s+/g, ', ')
    .replace(/\s*[/&]\s*/g, ' ')
    .replace(/[?？]+[!！]+[?？!！]*|[!！]+[?？]+[?？!！]*/g, '?')
    .replace(/([!?.,])[!?.,]+/g, '$1')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/,(?=[^\s])/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.!?]+/, '')
    .trim()
  // 끝 억양이 내려앉도록 문장 끝에 부호가 없으면 마침표를 붙인다
  if (t && !/[.!?]$/.test(t))
    t = `${t.replace(/,$/, '')}.`
  return t
}

/** 남은 영어 낱말을 뺀 문장 (GPT-SoVITS가 낯선 영어 때문에 못 읽을 때 한 번 더 시도한다). 읽을 한글이 없으면 빈 문자열 */
export function withoutLatin(text: string): string {
  const t = speakableKorean(text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, ' '))
  return /[가-힣]/.test(t) ? t : ''
}
