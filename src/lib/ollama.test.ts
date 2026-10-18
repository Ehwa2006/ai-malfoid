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
