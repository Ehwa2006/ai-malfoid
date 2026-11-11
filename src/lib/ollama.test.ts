import { describe, expect, it } from 'vitest'
import { pickModel } from './ollama'

describe('pickModel', () => {
  it('설정한 모델이 있으면 그대로 쓴다', () => {
    expect(pickModel(['qwen2.5:7b', 'llama3.1:8b'], 'llama3.1:8b')).toBe('llama3.1:8b')
  })
  it('없으면 추천 순서대로 고른다', () => {
    expect(pickModel(['qwen2.5:1.5b', 'qwen2.5:7b', 'exaone3.5:7.8b'], 'llama3.1:8b')).toBe('exaone3.5:7.8b')
    expect(pickModel(['qwen2.5:1.5b', 'qwen2.5:7b'], 'exaone3.5:7.8b')).toBe('qwen2.5:7b')
    expect(pickModel(['mistral:7b'], 'exaone3.5:7.8b')).toBe('mistral:7b')
  })
  it('설치된 모델이 없으면 바꾸지 않는다', () => {
    expect(pickModel([], 'exaone3.5:7.8b')).toBe('exaone3.5:7.8b')
  })
})

describe('streamChat', () => {
  it('컨텍스트 길이를 늘 같은 값으로 보낸다 (긴 대화가 잘리지 않고, 모델을 다시 올리지 않게)', async () => {
    const { NUM_CTX, streamChat } = await import('./ollama')
    const bodies: { options: { num_ctx: number } }[] = []
    const fetchMock = async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return new Response('{"message":{"content":"안녕"},"done":true}\n')
    }
    const original = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      let out = ''
      await streamChat({ baseUrl: '', model: 'm', messages: [], onToken: (t) => { out += t } })
      expect(out).toBe('안녕')
      expect(bodies[0].options.num_ctx).toBe(NUM_CTX)
      expect(NUM_CTX).toBeGreaterThanOrEqual(8192)
    }
    finally {
      globalThis.fetch = original
    }
  })
})
