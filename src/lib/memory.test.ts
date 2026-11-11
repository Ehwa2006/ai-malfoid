import { describe, expect, it } from 'vitest'
import { addMemory, knowsMemory, MAX_MEMORIES, memoryBlock, type Memory } from './memory'

const add = (list: Memory[], text: string, i = list.length) => addMemory(list, text, 1000 + i, `m${i}`)

describe('memory', () => {
  it('새 기억을 더하고 프롬프트 목록으로 만든다', () => {
    let list: Memory[] = []
    list = add(list, '포터는 얼그레이 홍차를 좋아한다')
    list = add(list, '포터는 다음 주 토요일에 퀴디치 시합이 있다')
    expect(list.map(m => m.text)).toEqual(['포터는 얼그레이 홍차를 좋아한다', '포터는 다음 주 토요일에 퀴디치 시합이 있다'])
    expect(memoryBlock(list)).toContain('- 포터는 얼그레이 홍차를 좋아한다')
    expect(memoryBlock([])).toBe('')
  })

  it('거의 같은 기억은 새 문장으로 바꿔 맨 뒤로 옮긴다', () => {
    let list = add([], '포터는 얼그레이 홍차를 좋아한다')
    list = add(list, '포터는 고양이를 키운다')
    list = add(list, '포터는 얼그레이 홍차를 정말 좋아한다.')
    expect(list.map(m => m.text)).toEqual(['포터는 고양이를 키운다', '포터는 얼그레이 홍차를 정말 좋아한다.'])
  })

  it('이미 아는 내용이면 문장을 그대로 두고 맨 뒤로만 옮긴다', () => {
    let list = add([], '포터는 얼그레이 홍차를 정말 좋아한다')
    list = add(list, '포터는 고양이를 키운다')
    expect(knowsMemory(list, '포터는 얼그레이 홍차를')).toBe(true)
    expect(knowsMemory(list, '포터는 개를 키운다')).toBe(false)
    list = add(list, '포터는 얼그레이 홍차를 정말 좋아한다!', 9)
    expect(list.map(m => m.text)).toEqual(['포터는 고양이를 키운다', '포터는 얼그레이 홍차를 정말 좋아한다'])
    expect(list[1]).toMatchObject({ id: 'm0', at: 1009 })
  })

  it('틀만 같고 내용이 다른 기억은 따로 둔다', () => {
    let list = add([], '포터는 사과를 좋아한다')
    list = add(list, '포터는 배를 좋아한다')
    expect(list).toHaveLength(2)
  })

  it('너무 짧은 것은 버리고, 개수는 넘치지 않는다', () => {
    expect(add([], ' 응 ')).toEqual([])
    let list: Memory[] = []
    const word = (i: number) => Array.from({ length: 6 }, (_, k) => String.fromCharCode(0xAC00 + ((i * 131 + k * 977) % 11172))).join('')
    for (let i = 0; i < MAX_MEMORIES + 10; i++)
      list = add(list, `포터는 ${word(i)}`, i)
    expect(list).toHaveLength(MAX_MEMORIES)
  })
})
