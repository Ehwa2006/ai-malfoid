import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeModel } from './modelFile'

describe('model file as text', () => {
  it('round-trips the real VRM through base64', () => {
    const vrm = new Uint8Array(readFileSync(new URL('../public/models/malfoy-draconia.vrm', import.meta.url)))
    const back = decodeModel(Buffer.from(vrm).toString('base64'))
    expect(back.length).toBe(vrm.length)
    expect(String.fromCharCode(...back.subarray(0, 4))).toBe('glTF')
    expect(Buffer.from(back).equals(Buffer.from(vrm))).toBe(true)
  })

  it('ignores line breaks in the text', () => {
    expect(Array.from(decodeModel('AQID\nBAU=\n'))).toEqual([1, 2, 3, 4, 5])
  })
})
