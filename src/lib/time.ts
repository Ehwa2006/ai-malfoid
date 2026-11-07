// 지금이 언제인지, 얼마 만에 다시 찾아왔는지를 카리나가 알게 한다 ("또 밤늦게 왔네", "사흘 만이네?").

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 날짜에 맞는 기념일 (마법 세계 사람답게 서양 명절 위주) */
export function holidayOf(d: Date): string | null {
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  const table: Record<string, string> = {
    '1/1': '새해 첫날',
    '2/14': '발렌타인데이',
    '3/14': '화이트데이',
    '10/31': '할로윈',
    '12/24': '크리스마스 이브',
    '12/25': '크리스마스',
    '12/31': '한 해의 마지막 날',
  }
  return table[md] ?? null
}

export function partOfDay(hour: number): string {
  if (hour < 5)
    return '새벽'
  if (hour < 11)
    return '아침'
  if (hour < 17)
    return '낮'
  if (hour < 21)
    return '저녁'
  return '밤'
}

/** 지난 시간을 사람이 말하듯 ("40분", "3시간", "사흘", "2주") */
export function gapLabel(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 60)
    return `${Math.max(1, min)}분`
  const hour = Math.round(min / 60)
  if (hour < 24)
    return `${hour}시간`
  const day = Math.round(hour / 24)
  const words = ['', '하루', '이틀', '사흘', '나흘', '닷새', '엿새']
  if (day < 7)
    return words[day]
  if (day < 30)
    return `${Math.round(day / 7)}주`
  return `${Math.round(day / 30)}달`
}

/** 다시 찾아왔을 때 카리나가 먼저 말을 거는 기준 */
export const RETURN_GAP_MS = 6 * 60 * 60 * 1000

/**
 * 시스템 프롬프트에 넣을 [지금] 블록.
 * 날짜는 늘 알려 주고, 오래 비웠다 돌아온 첫 답변에서만 지난 시간·기념일·늦은 시간 이야기를 꺼내게 한다
 * (매 턴 넣으면 같은 말을 되풀이한다).
 */
export function timeContext(now: Date, lastActiveAt: number | null): string {
  const h = now.getHours()
  const holiday = holidayOf(now)
  const lines = [
    `- ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일 ${partOfDay(h)} ${h % 12 || 12}시${now.getMinutes() ? ` ${now.getMinutes()}분` : ''}${holiday ? ` (${holiday})` : ''}`,
  ]
  const gap = lastActiveAt === null ? null : now.getTime() - lastActiveAt
  if (gap !== null && gap >= RETURN_GAP_MS) {
    lines.push(`- 상대와 마지막으로 이야기한 지 ${gapLabel(gap)}이 지났다.`)
    if (holiday)
      lines.push(`- 오늘은 ${holiday}. 어울리면 슬쩍 꺼낸다.`)
    if (h < 5 || h >= 23)
      lines.push('- 늦은 시간이다. 어울리면 상대가 잠을 못 자는 걸 챙기거나 가볍게 놀린다.')
  }
  return `[지금]\n${lines.join('\n')}`
}
