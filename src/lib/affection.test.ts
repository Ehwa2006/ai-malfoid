import { describe, expect, it } from 'vitest'
import { clampAffection, clampDelta, stageOf } from './affection'

describe('affection', () => {
  it('단계 계산', () => {
    expect(stageOf(0).name).toBe('적대')
    expect(stageOf(20).name).toBe('경계')
    expect(stageOf(79).name).toBe('호감')
    expect(stageOf(100).name).toBe('연인')
  })
  it('범위 제한', () => {
    expect(clampAffection(130)).toBe(100)
    expect(clampAffection(-4)).toBe(0)
    expect(clampDelta(42)).toBe(5)
    expect(clampDelta(-9)).toBe(-5)
  })
})
