import { describe, expect, it } from 'vitest'
import { diaryMessages } from './diary'

describe('비밀 일기', () => {
  const recent = [
    { role: 'user' as const, text: '오늘 퀴디치 이겼어' },
    { role: 'assistant' as const, text: '흥, 운이 좋았을 뿐이야.' },
    { role: 'user' as const, text: '오늘 같이 자자' },
  ]
  const [system, user] = diaryMessages('지민', 50, [{ id: 'a', text: '지민은 홍차를 좋아한다', at: 1 }], recent, new Date(2026, 9, 31))

  it('오늘의 대화와 기억을 대본 꼴로 넘긴다', () => {
    expect(system.content).toContain('10월 31일 밤')
    expect(user.content).toContain('지민: 오늘 퀴디치 이겼어')
    expect(user.content).toContain('카리나: 흥, 운이 좋았을 뿐이야.')
    expect(user.content).toContain('- 지민은 홍차를 좋아한다')
  })

  it('품위 없는 말은 옮기지 않고, 해로운 내용은 쓰지 않게 한다', () => {
    expect(user.content).not.toContain('같이 자자')
    expect(user.content).toContain('지민: (품위 없는 말을 해서 잘라냈다)')
    expect(system.content).toContain('성적인 내용은 쓰지 않는다')
  })
})
