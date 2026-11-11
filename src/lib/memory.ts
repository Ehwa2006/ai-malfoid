// 카리나의 장기 기억: 답변마다 모델이 "memory"에 적은 새 사실(좋아하는 것, 일정, 약속…)을 모아 두고
// 다음 대화의 시스템 프롬프트에 넣는다. 대화 기록(최근 20개)이 밀려나도 기억은 남는다.

export interface Memory {
  id: string
  text: string
  /** 기억한 시각 (ms) */
  at: number
}

export const MAX_MEMORIES = 40
/** 프롬프트에 넣는 개수 (최근 것부터) */
export const PROMPT_MEMORIES = 20

const normalize = (t: string) => t.replace(/[\s.,!?~…"'“”‘’()]/g, '').toLowerCase()

/** 두 글자씩 끊은 조각이 얼마나 겹치는지 (0~1, 자카드 유사도) */
function similarity(a: string, b: string): number {
  const grams = (t: string) => new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)))
  const ga = grams(a)
  const gb = grams(b)
  if (!ga.size || !gb.size)
    return a === b ? 1 : 0
  let common = 0
  for (const g of ga) {
    if (gb.has(g))
      common++
  }
  // 합집합으로 나눈다: "포터는 사과를 좋아한다"와 "포터는 배를 좋아한다"처럼 틀만 같은 건 다른 기억이다
  return common / (ga.size + gb.size - common)
}

/** 이미 알고 있는 내용인지 (같은 문장이거나 더 자세한 기억에 이미 들어 있다) */
export function knowsMemory(list: Memory[], text: string): boolean {
  const key = normalize(text)
  return !!key && list.some(m => normalize(m.text).includes(key))
}

/**
 * 새 기억을 더한다. 거의 같은 내용이 이미 있으면 새 문장으로 바꾸고(최신 정보가 맞을 가능성이 높다) 맨 뒤로 옮긴다.
 * 이미 아는 내용이면 문장은 그대로 두고 맨 뒤로만 옮긴다 (다시 꺼낸 이야기는 오래 남는다).
 * 너무 많아지면 오래된 것부터 버린다.
 */
export function addMemory(list: Memory[], text: string, now: number, id: string): Memory[] {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (normalize(clean).length < 4)
    return list
  const key = normalize(clean)
  const known = list.find(m => normalize(m.text).includes(key))
  if (known)
    return [...list.filter(m => m !== known), { ...known, at: now }]
  const rest = list.filter((m) => {
    const other = normalize(m.text)
    return !(key.includes(other) || similarity(other, key) >= 0.7)
  })
  return [...rest, { id, text: clean, at: now }].slice(-MAX_MEMORIES)
}

/** 시스템 프롬프트에 넣을 기억 목록 (없으면 빈 문자열) */
export function memoryBlock(list: Memory[]): string {
  if (!list.length)
    return ''
  const recent = list.slice(-PROMPT_MEMORIES)
  return `[카리나가 기억하는 것 — 대화에 자연스럽게 꺼내 쓴다. 매번 늘어놓지는 않는다]\n${recent.map(m => `- ${m.text}`).join('\n')}`
}
