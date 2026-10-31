import { describe, expect, it } from 'vitest'
import { cleanMemory, cleanSuggestions } from './extras'

describe('기억 거르기', () => {
  it('상대가 한 말에서 나온 사실 문장은 남긴다', () => {
    expect(cleanMemory('포터는 매운 음식을 못 먹는다.', '포터', '나 사실 매운 거 하나도 못 먹어')).toBe('포터는 매운 음식을 못 먹는다')
    expect(cleanMemory('포터는 고양이를 키운다', '포터', '우리 집 고양이가 아파')).toBe('포터는 고양이를 키운다')
    expect(cleanMemory('포터의 생일은 5월 3일이다', '포터', '내 생일 5월 3일이야')).toBe('포터의 생일은 5월 3일이다')
    expect(cleanMemory('포터는 얼그레이 홍차를 선물했다', '포터', '*얼그레이 홍차를 건넨다*')).toBe('포터는 얼그레이 홍차를 선물했다')
  })

  it('상대가 하지 않은 말을 지어낸 기억은 버린다', () => {
    expect(cleanMemory('포터는 다음 주 토요일에 퀴디치 시합이 있다', '포터', '오늘 날씨 좋다')).toBeNull()
    expect(cleanMemory('포터는 매운 음식을 못 먹는다', '포터', '안녕, 카리나')).toBeNull()
    // 실제 모델: "같이 퀴디치 경기장 가서 연습할래?"에서 지어낸 칭찬
    expect(cleanMemory('포터는 퀴디치 실력이 꽤 뛰어나다', '포터', '미안. 그냥 오늘 같이 퀴디치 경기장 가서 연습할래?')).toBeNull()
    expect(cleanMemory('포터는 요리를 잘한다', '포터', '나 요리 잘한다?')).toBe('포터는 요리를 잘한다')
  })

  it('감상·질문·카리나 자신에 대한 문장은 버린다', () => {
    expect(cleanMemory('포터는 고양이를 키우는구나', '포터', '나 고양이 키워')).toBeNull()
    expect(cleanMemory('포터가 고양이를 키운다니 귀엽네', '포터', '나 고양이 키워')).toBeNull()
    expect(cleanMemory('포터는 고양이를 키울까?', '포터', '나 고양이 키워')).toBeNull()
    expect(cleanMemory('카리나는 고양이를 키운다', '포터', '나 고양이 키워')).toBeNull()
    expect(cleanMemory('', '포터', '나 고양이 키워')).toBeNull()
  })

  it('성적인 말에서 나온 기억은 버린다', () => {
    expect(cleanMemory('포터는 같이 자고 싶어 한다', '포터', '오늘 같이 자자')).toBeNull()
  })
})

describe('선택지 거르기', () => {
  it('상대의 말만 남기고 카리나 말투·호칭이 섞인 것은 버린다', () => {
    expect(cleanSuggestions(['포터야, 이리 와', '말포이가의 영애가 직접 왔다', '진심이야', '흥, 날라리 주제에', '나도 보고 싶었어'], '포터'))
      .toEqual(['진심이야', '나도 보고 싶었어'])
  })

  it('이름이 낱말 안에 들어 있는 것은 괜찮다', () => {
    expect(cleanSuggestions(['포터블 게임 할래?'], '포터')).toEqual(['포터블 게임 할래?'])
  })

  it('별표·공백을 다듬고 겹치거나 긴 것, 성적인 것은 버린다', () => {
    expect(cleanSuggestions([' *웃는다* 좋아  ', '좋아', '같이 자자', '가'.repeat(41), ''], '지민')).toEqual(['웃는다 좋아', '좋아'])
    expect(cleanSuggestions(['좋아!', '좋아'], '지민')).toEqual(['좋아!'])
  })
})
