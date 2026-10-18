import { describe, expect, it } from 'vitest'
import { MarkerParser, stripMarkers, type MarkerEvent } from './markers'

function run(chunks: string[]) {
  const events: MarkerEvent[] = []
  const parser = new MarkerParser(e => events.push(e))
  chunks.forEach(c => parser.push(c))
  parser.flush()
  const text = events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')
  return { events, text }
}

describe('MarkerParser', () => {
  it('파싱: 표정과 호감도 마커', () => {
    const { events, text } = run(['<|EMOTE:smirk|>안녕, 포터.<|AFFECTION:+2|>'])
    expect(text).toBe('안녕, 포터.')
    expect(events).toContainEqual({ type: 'emote', emotion: 'smirk' })
    expect(events).toContainEqual({ type: 'affection', delta: 2 })
  })

  it('스트리밍 중 마커가 쪼개져도 처리한다', () => {
    const src = '<|EMOTE:flustered|>누, 누가!<|AFFECTION:-3|>'
    const { events, text } = run(src.split(''))
    expect(text).toBe('누, 누가!')
    expect(events).toContainEqual({ type: 'emote', emotion: 'flustered' })
    expect(events).toContainEqual({ type: 'affection', delta: -3 })
  })

  it('마커가 아닌 꺾쇠는 그대로 남긴다', () => {
    expect(run(['3 <', ' 5 그리고 <| 이건 그냥 텍스트인데 아주 길어서 마커가 아니야']).text)
      .toBe('3 < 5 그리고 <| 이건 그냥 텍스트인데 아주 길어서 마커가 아니야')
  })

  it('알 수 없는 마커와 잘못된 감정은 숨긴다', () => {
    const { events, text } = run(['<|EMOTE:angry|>흥<|FOO|>'])
    expect(text).toBe('흥')
    expect(events.some(e => e.type === 'emote')).toBe(false)
  })

  it('stripMarkers', () => {
    expect(stripMarkers('<|EMOTE:happy|>좋아.<|AFFECTION:+1|>')).toBe('좋아.')
  })
})
