import { describe, expect, it } from 'vitest'
import { SpeechChunker, splitSpeech } from './chunker'

describe('SpeechChunker', () => {
  it('행동 묘사는 빼고 문장 단위로 자른다', () => {
    expect(splitSpeech('*귀 끝이 붉어진다* 누, 누가 보고 싶었대? 흥. *고개를 돌린다* 그냥 지나가던 길이야!'))
      .toEqual(['누, 누가 보고 싶었대?', '흥.', '그냥 지나가던 길이야!'])
  })

  it('스트리밍 중에는 끝난 문장만 먼저 내보낸다', () => {
    const c = new SpeechChunker()
    expect(c.push('*팔짱을 낀다* 어머, 포터')).toEqual([])
    expect(c.push('. 아직도 그 꼴이')).toEqual(['어머, 포터.'])
    expect(c.push('야? 영광으로')).toEqual(['아직도 그 꼴이야?'])
    expect(c.flush()).toEqual(['영광으로'])
  })

  it('한 글자씩 들어와도 같은 결과', () => {
    const text = '*찻잔을 내려놓는다* 말포이가를 깔보다니… 간이 부었구나? 다시는 그러지 마.'
    const c = new SpeechChunker()
    const out = [...text].flatMap(ch => c.push(ch))
    expect([...out, ...c.flush()]).toEqual(splitSpeech(text))
  })

  it('말줄임표만 있는 조각과 이모지는 읽지 않는다', () => {
    expect(splitSpeech('… 흥! 😤 됐어.')).toEqual(['흥!', '됐어.'])
  })

  it('마침표 없이 긴 문장은 쉼표에서 끊는다', () => {
    const long = `${'말포이가의 영애는 '.repeat(6)}언제나 최고야, ${'그러니까 너도 '.repeat(5)}인정해`
    const parts = new SpeechChunker().push(long)
    expect(parts.length).toBe(1)
    expect(parts[0].endsWith('최고야,')).toBe(true)
  })
})
