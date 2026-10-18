import { describe, expect, it } from 'vitest'
import { buildGreeting, buildSystemPrompt, isHarry } from './persona'
import { stripMarkers } from './markers'

describe('persona', () => {
  it('해리 판별', () => {
    expect(isHarry('포터')).toBe(true)
    expect(isHarry('Harry')).toBe(true)
    expect(isHarry('지민')).toBe(false)
  })

  it('이름에 따라 관계 설정이 달라진다', () => {
    expect(buildSystemPrompt('포터', 20)).toContain('대화 상대는 해리 포터다')
    expect(buildSystemPrompt('지민', 20)).toContain('"지민"은(는) 전쟁 후 새로 알게 된 사람')
  })

  it('인사말에는 표정 마커만 있고 이름이 들어간다', () => {
    expect(stripMarkers(buildGreeting('지민'))).toContain('지민')
    expect(buildGreeting('포터')).toMatch(/^<\|EMOTE:smirk\|>/)
  })
})
