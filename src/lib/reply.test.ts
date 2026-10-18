import { describe, expect, it } from 'vitest'
import type { MarkerEvent } from './markers'
import { formatReply, ReplyStreamParser } from './reply'

function run(chunks: string[]) {
  const events: MarkerEvent[] = []
  const parser = new ReplyStreamParser(e => events.push(e))
  chunks.forEach(c => parser.push(c))
  parser.flush()
  const text = events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')
  return { events, text }
}

describe('ReplyStreamParser', () => {
  const json = '{"emotion":"flustered","affection":3,"reply":"*귀가 빨개진다* 누, 누가 \\"보고 싶었\\"대?\\n흥."}'

  it('감정·호감도·대사를 뽑는다', () => {
    const { events, text } = run([json])
    expect(events[0]).toEqual({ type: 'emote', emotion: 'flustered' })
    expect(events).toContainEqual({ type: 'affection', delta: 3 })
    expect(text).toBe('*귀가 빨개진다* 누, 누가 "보고 싶었"대?\n흥.')
  })

  it('한 글자씩 쪼개져 와도 같은 결과', () => {
    const whole = run([json])
    const split = run(json.split(''))
    expect(split.text).toBe(whole.text)
    expect(split.events.filter(e => e.type !== 'text')).toEqual(whole.events.filter(e => e.type !== 'text'))
  })

  it('음수 호감도는 숫자가 끝난 뒤에 확정한다', () => {
    const { events } = run(['{"emotion":"annoyed","affection":-', '1', '2', ',"reply":"꺼져."}'])
    expect(events).toContainEqual({ type: 'affection', delta: -12 })
  })

  it('\\u 이스케이프와 키 순서가 달라도 처리한다', () => {
    const { events, text } = run(['{"reply":"\\uc548\\ub155 ', '\\ud83d\\ude00","affection":0,"emotion":"happy"}'])
    expect(text).toBe('안녕 😀')
    expect(events).toContainEqual({ type: 'emote', emotion: 'happy' })
    expect(events).toContainEqual({ type: 'affection', delta: 0 })
  })

  it('목록에 없는 감정은 무시한다', () => {
    const { events } = run(['{"emotion":"angry","affection":0,"reply":"흥"}'])
    expect(events.some(e => e.type === 'emote')).toBe(false)
  })

  it('JSON이 아니면 예전 마커 형식으로 처리한다', () => {
    const { events, text } = run(['<|EMOTE:smirk|>흥, 포터.', '<|AFFECTION:+1|>'])
    expect(text).toBe('흥, 포터.')
    expect(events).toContainEqual({ type: 'emote', emotion: 'smirk' })
    expect(events).toContainEqual({ type: 'affection', delta: 1 })
  })

  it('formatReply는 파서로 되읽을 수 있다', () => {
    const { text, events } = run([formatReply({ emotion: 'sad', affection: -2, reply: '…"그날" 얘기는 하지 마.' })])
    expect(text).toBe('…"그날" 얘기는 하지 마.')
    expect(events).toContainEqual({ type: 'emote', emotion: 'sad' })
  })
})
