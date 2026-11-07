import { describe, expect, it } from 'vitest'
import { SpeechChunker, splitSpeech } from './chunker'

describe('SpeechChunker', () => {
  it('행동 묘사는 빼고 문장 단위로 자른다', () => {
    expect(splitSpeech('*귀 끝이 붉어진다* 누, 누가 보고 싶었대? 흥. *고개를 돌린다* 그냥 지나가던 길이야!'))
      .toEqual(['누, 누가 보고 싶었대?', '흥. 그냥 지나가던 길이야!'])
  })

  it('스트리밍 중에는 끝난 문장만 먼저 내보낸다', () => {
    const c = new SpeechChunker()
    expect(c.push('*팔짱을 낀다* 어머, 포터')).toEqual([])
    expect(c.push('. 아직도 그 꼴이')).toEqual([])
    expect(c.push('야? 영광으로')).toEqual(['어머, 포터. 아직도 그 꼴이야?'])
    expect(c.flush()).toEqual(['영광으로'])
  })

  it('한 글자씩 들어와도 같은 결과', () => {
    const text = '*찻잔을 내려놓는다* 말포이가를 깔보다니… 간이 부었구나? 다시는 그러지 마.'
    const c = new SpeechChunker()
    const out = [...text].flatMap(ch => c.push(ch))
    expect([...out, ...c.flush()]).toEqual(splitSpeech(text))
  })

  it('말줄임표만 있는 조각과 이모지는 읽지 않는다', () => {
    expect(splitSpeech('… 흥! 😤 됐어.')).toEqual(['흥! 됐어.'])
  })

  it('자모만 있는 조각(ㅋㅋ, ㅠㅠ, ㅎㅎ~)은 건너뛴다', () => {
    // Edge 음성은 이런 조각에 소리를 만들지 못한다
    expect(splitSpeech('흥. ㅎㅎ~ 그래서 뭐? ㅠㅠ\n진짜야. ㅋㅋㅋ')).toEqual(['흥. 그래서 뭐? 진짜야.'])
    expect(splitSpeech('ㅋㅋ 바보.')).toEqual(['ㅋㅋ 바보.'])
  })

  it('닫히지 않은 *는 답변 끝이나 줄바꿈에서 대사로 되돌린다', () => {
    expect(splitSpeech('*고개를 홱 돌리며 흥, 포터. 오늘은 봐줄게.')).toEqual(['고개를 홱 돌리며 흥, 포터.', '오늘은 봐줄게.'])
    expect(splitSpeech('*팔짱을 끼며\n어머, 포터. *웃는다* 됐어.')).toEqual(['팔짱을 끼며 어머, 포터.', '됐어.'])
  })

  it('아주 짧은 문장은 다음 문장과 붙여 읽는다 (따로 읽으면 억양이 납작하고 말이 끊긴다)', () => {
    expect(splitSpeech('흥. 포터. 오늘은 봐줄게.')).toEqual(['흥. 포터. 오늘은 봐줄게.'])
    expect(splitSpeech('말포이가의 영애가 직접 왔어. 뭐?')).toEqual(['말포이가의 영애가 직접 왔어.', '뭐?'])
    // 답변이 끝나면 붙일 문장이 없어도 남은 것을 읽는다
    const c = new SpeechChunker()
    expect(c.push('흥. ')).toEqual([])
    expect(c.flush()).toEqual(['흥.'])
  })

  it('마침표 없이 긴 문장은 쉼표에서 끊는다', () => {
    const long = `${'말포이가의 영애는 '.repeat(6)}언제나 최고야, ${'그러니까 너도 '.repeat(5)}인정해`
    const parts = new SpeechChunker().push(long)
    expect(parts.length).toBe(1)
    expect(parts[0].endsWith('최고야,')).toBe(true)
  })
})
