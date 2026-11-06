import { describe, expect, it } from 'vitest'
import { gsvRequest, looksTruncated, wavSeconds } from './gptSovits'

describe('GPT-SoVITS 합성 요청', () => {
  const ref = { file: 'smirk.wav', text: '후후, 그 표정은 뭐야?', path: '/voices/karina/smirk.wav' }

  it('쉼표에서 자르지 않고, 대사를 읽기 좋게 다듬어 보낸다', () => {
    const body = gsvRequest('말포이가를 그렇게 부르다니, 3시까지 기다렸다고~', ref, { lang: 'ko' }, 1.05)
    expect(body.text_split_method).toBe('cut0')
    expect(body.text).toBe('말포이가를 그렇게 부르다니, 세 시까지 기다렸다고.')
    expect(body).toMatchObject({ text_lang: 'ko', prompt_lang: 'ko', prompt_text: ref.text, ref_audio_path: ref.path, speed_factor: 1.05, media_type: 'wav' })
  })

  it('WAV 길이를 머리글에서 읽는다', () => {
    const rate = 32000
    const samples = rate * 2 // 2초, 16비트 모노
    const buf = new Uint8Array(44 + samples * 2)
    const view = new DataView(buf.buffer)
    const put = (at: number, s: string) => [...s].forEach((c, i) => (buf[at + i] = c.charCodeAt(0)))
    put(0, 'RIFF')
    view.setUint32(4, 36 + samples * 2, true)
    put(8, 'WAVE')
    put(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    put(36, 'data')
    view.setUint32(40, samples * 2, true)
    expect(wavSeconds(buf)).toBeCloseTo(2)
    expect(wavSeconds(new Uint8Array(10))).toBeNull()
  })

  it('글자 수에 비해 너무 짧은 소리는 잘린 것으로 본다', () => {
    const text = '어머, 그 나이에 매운 것도 못 먹는다고? 다음에 우리 집 요리사한테 순하게 만들라고 해 둘게.'
    expect(looksTruncated(text, 3.66)).toBe(true) // 실험에서 두 번째 문장이 빠졌을 때 (36음절 3.66초)
    expect(looksTruncated(text, 6.1)).toBe(false) // 끝까지 읽었을 때
    expect(looksTruncated(text, 3.66, 1.5)).toBe(false) // 빠르기 1.5배면 그만큼 짧아도 된다
    expect(looksTruncated('흥.', 0.3)).toBe(false) // 짧은 말은 보지 않는다
    expect(looksTruncated(text, null)).toBe(false)
  })
})
