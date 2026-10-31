import { describe, expect, it } from 'vitest'
import { gapLabel, holidayOf, partOfDay, timeContext } from './time'

describe('time', () => {
  it('기념일, 하루 중 때, 지난 시간', () => {
    expect(holidayOf(new Date(2026, 9, 31))).toBe('할로윈')
    expect(holidayOf(new Date(2026, 9, 30))).toBeNull()
    expect(partOfDay(23)).toBe('밤')
    expect(partOfDay(8)).toBe('아침')
    expect(gapLabel(40 * 60_000)).toBe('40분')
    expect(gapLabel(3 * 3600_000)).toBe('3시간')
    expect(gapLabel(3 * 86400_000)).toBe('사흘')
    expect(gapLabel(15 * 86400_000)).toBe('2주')
  })

  it('[지금] 블록: 날짜·요일·때, 오랜만이면 지난 시간, 늦은 밤이면 챙기기', () => {
    const now = new Date(2026, 9, 31, 23, 20)
    const text = timeContext(now, now.getTime() - 3 * 86400_000)
    expect(text).toContain('2026년 10월 31일 토요일 밤 11시 20분 (할로윈)')
    expect(text).toContain('사흘이 지났다')
    expect(text).toContain('늦은 시간')
    expect(timeContext(new Date(2026, 9, 30, 14, 0), new Date(2026, 9, 30, 13, 50).getTime())).not.toContain('지났다')
  })
})
