// 모델이 답변 뒤에 붙이는 기억·선택지를 그대로 믿지 않고 거른다.
// 7~8B 모델은 기억에 자기 감상("…구나")을 적거나 상대가 하지 않은 말을 지어내고,
// 선택지를 카리나의 말투("말포이가의 영애가…", "포터야")로 쓰곤 한다.

import { suggestive } from './persona'

const compact = (t: string) => t.replace(/[\s.,!?~…"'“”‘’()*＊]/g, '').toLowerCase()

function bigrams(t: string): Set<string> {
  return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)))
}

/**
 * 저장해도 될 기억이면 다듬어 돌려주고, 아니면 null.
 * @param name 카리나가 상대를 부르는 이름 ("포터")
 * @param userText 이번에 상대가 한 말. 기억은 이 말에서 나와야 한다.
 */
export function cleanMemory(text: string, name: string, userText: string): string | null {
  const clean = text.replace(/[*＊]/g, '').replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '')
  if (!clean || /[?？]/.test(clean) || suggestive(clean) || suggestive(userText))
    return null
  // "…다"로 끝나는 사실 문장만 ("…구나", "…네", "…잖아" 같은 감상은 버린다)
  if (!/다$/.test(clean))
    return null
  // 카리나 자신에 대한 문장은 상대에 대한 기억이 아니다
  if (/^(카리나|말포이|나는|내가|난 )/.test(clean))
    return null
  // 상대가 실제로 한 말과 낱말이 겹쳐야 한다 (지어낸 기억을 거른다)
  const body = compact(clean.startsWith(name) ? clean.slice(name.length) : clean)
  const said = bigrams(compact(userText))
  let shared = 0
  for (const g of bigrams(body)) {
    if (said.has(g))
      shared++
  }
  return shared >= 2 ? clean : null
}

// 카리나 쪽 말버릇. 이게 들어 있으면 상대의 말이 아니라 카리나의 말이다.
const KARINA_VOICE = /말포이가의\s*영애|날라리|위즐리네|란\s*말이야/

/** 선택지 중 상대의 말로 쓸 만한 것만 남긴다 */
export function cleanSuggestions(items: string[], name: string): string[] {
  const seen = new Set<string>()
  const vocative = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(야|아|씨|군|님)?(?![가-힣])`)
  return items
    .map(t => t.replace(/[*＊]/g, '').replace(/\s+/g, ' ').trim())
    .filter((t) => {
      if (!t || t.length > 40 || seen.has(compact(t)))
        return false
      seen.add(compact(t))
      return !vocative.test(t) && !KARINA_VOICE.test(t) && !suggestive(t)
    })
}
