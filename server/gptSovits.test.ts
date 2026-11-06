import { describe, expect, it } from 'vitest'
import { gsvRequest } from './gptSovits'

describe('GPT-SoVITS 합성 요청', () => {
  const ref = { file: 'smirk.wav', text: '후후, 그 표정은 뭐야?', path: '/voices/karina/smirk.wav' }

  it('쉼표에서 자르지 않고, 대사를 읽기 좋게 다듬어 보낸다', () => {
    const body = gsvRequest('말포이가를 그렇게 부르다니, 3시까지 기다렸다고~', ref, { lang: 'ko' }, 1.05)
    expect(body.text_split_method).toBe('cut0')
    expect(body.text).toBe('말포이가를 그렇게 부르다니, 세 시까지 기다렸다고.')
    expect(body).toMatchObject({ text_lang: 'ko', prompt_lang: 'ko', prompt_text: ref.text, ref_audio_path: ref.path, speed_factor: 1.05, media_type: 'wav' })
  })
})
