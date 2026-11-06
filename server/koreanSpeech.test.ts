import { describe, expect, it } from 'vitest'
import { nativeNumber, sinoNumber, speakableKorean, withoutLatin } from './koreanSpeech'

describe('한국어 읽기 다듬기', () => {
  it('수 읽기: 고유어와 한자어', () => {
    expect(nativeNumber(1)).toBe('한')
    expect(nativeNumber(20)).toBe('스무')
    expect(nativeNumber(21)).toBe('스물한')
    expect(nativeNumber(100)).toBeNull()
    expect(sinoNumber(2026)).toBe('이천이십육')
    expect(sinoNumber(10000)).toBe('만')
    expect(sinoNumber(15300)).toBe('만 오천삼백')
    expect(sinoNumber(110)).toBe('백십')
  })

  it('단위에 맞춰 숫자를 읽는다', () => {
    expect(speakableKorean('3시 30분에 만나')).toBe('세 시 삼십 분에 만나.')
    expect(speakableKorean('사탕 2개랑 홍차 1잔')).toBe('사탕 두 개랑 홍차 한 잔.')
    expect(speakableKorean('10월 31일이니까')).toBe('시월 삼십일일이니까.')
    expect(speakableKorean('6월에 23살이 돼')).toBe('유월에 스물세 살이 돼.')
    expect(speakableKorean('2026년, 10,000원')).toBe('이천이십육년, 만원.')
    expect(speakableKorean('1번째 시합')).toBe('첫 번째 시합.')
    expect(speakableKorean('승률 75%')).toBe('승률 칠십오 퍼센트.')
    expect(speakableKorean('3.5배')).toBe('삼 점 오배.')
  })

  it('영어 이름과 약어는 한글로', () => {
    expect(speakableKorean('AI라니, 무슨 소리야?')).toBe('에이아이라니, 무슨 소리야?')
    expect(speakableKorean('Potter, OK?')).toBe('포터, 오케이?')
    expect(speakableKorean('Slytherin 출신이야')).toBe('슬리데린 출신이야.')
  })

  it('물결표·말줄임표·겹친 부호를 억양이 살도록 다듬는다', () => {
    expect(speakableKorean('흥, 이번만 같이 마셔 주는 거야~')).toBe('흥, 이번만 같이 마셔 주는 거야.')
    expect(speakableKorean('어머~ 정말?')).toBe('어머, 정말?')
    expect(speakableKorean('그런 말은… 반칙이잖아.')).toBe('그런 말은, 반칙이잖아.')
    expect(speakableKorean('정말이야...?')).toBe('정말이야?')
    expect(speakableKorean('뭐?! 진짜!!')).toBe('뭐? 진짜!')
    expect(speakableKorean('누, 누가 기다렸대')).toBe('누, 누가 기다렸대.')
  })

  it('이모지·자모·괄호·따옴표는 지운다', () => {
    expect(speakableKorean('좋아 ㅋㅋ 😊')).toBe('좋아.')
    expect(speakableKorean('"말포이가"의 (진짜) 영애')).toBe('말포이가의 진짜 영애.')
  })

  it('못 읽는 영어를 빼고 다시 시도할 문장', () => {
    expect(withoutLatin('완전 cute하잖아?')).toBe('완전 하잖아?')
    expect(withoutLatin('hello')).toBe('')
  })
})
