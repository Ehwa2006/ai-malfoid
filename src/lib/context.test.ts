import { describe, expect, it } from 'vitest'
import { composeChat, HISTORY_STEP, historyStart } from './context'

describe('보낼 메시지 순서', () => {
  it('지금의 상태는 상대의 마지막 말 바로 앞에, 메모는 맨 뒤에 둔다', () => {
    const out = composeChat('설정', [
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u1' },
    ], '상태', ['메모'])
    expect(out.map(m => m.content)).toEqual(['설정', 'a1', '상태', 'u1', '메모'])
  })

  it('먼저 말을 걸 때(마지막이 카리나의 말)는 상태를 맨 뒤 메모 앞에 둔다', () => {
    const out = composeChat('설정', [{ role: 'assistant', content: 'a1' }], '상태', ['인사'])
    expect(out.map(m => m.content)).toEqual(['설정', 'a1', '상태', '인사'])
  })

  it('지난 요청과 앞부분이 같다 (캐시를 다시 쓸 수 있다)', () => {
    const turn1 = composeChat('설정', [{ role: 'assistant', content: 'a0' }, { role: 'user', content: 'u1' }], '상태1', [])
    const turn2 = composeChat('설정', [{ role: 'assistant', content: 'a0' }, { role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'u2' }], '상태2', [])
    expect(turn2.slice(0, 2)).toEqual(turn1.slice(0, 2))
  })
})

describe('대화 기록 범위', () => {
  it('한도 안이면 처음부터 보낸다', () => {
    expect(historyStart(5, 20)).toBe(0)
    expect(historyStart(20, 20)).toBe(0)
  })

  it('넘치면 몇 개씩 묶어서 밀어낸다 (시작 위치가 매 턴 바뀌지 않는다)', () => {
    const starts = Array.from({ length: 25 }, (_, i) => historyStart(20 + i, 20))
    expect(new Set(starts.slice(0, HISTORY_STEP))).toEqual(new Set([0]))
    expect(starts[HISTORY_STEP]).toBe(HISTORY_STEP)
    for (let n = 1; n < 80; n++) {
      const kept = n - historyStart(n, 20)
      expect(kept).toBeGreaterThanOrEqual(Math.min(n, 20))
      expect(kept).toBeLessThan(20 + HISTORY_STEP)
    }
  })
})
