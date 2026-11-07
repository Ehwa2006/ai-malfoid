import { describe, expect, it } from 'vitest'
import { GESTURES, type GestureId } from '../avatar2d/gestures'
import { FINGERS, POSES_3D } from './vrmGestures'

// Malfoy Draconia에서 잰 값 (미터): 두 눈 사이, 가슴 본, 어깨, 팔 길이
const EYES = [0, 1.46, -0.02]
const CHEST = [0, 1.227, -0.015]
const SHOULDER = { left: [0.103, 1.306, -0.021], right: [-0.103, 1.306, -0.021] }
const REACH = 0.236 + 0.216

describe('VRM 몸짓 표', () => {
  it('2D 초상화의 모든 몸짓이 VRM에도 있다', () => {
    for (const id of Object.keys(GESTURES) as GestureId[])
      expect(POSES_3D[id], id).toBeDefined()
  })

  it('손목 목표가 팔이 닿는 곳에 있고, 몸 앞쪽에 있다', () => {
    for (const [id, pose] of Object.entries(POSES_3D)) {
      for (const side of ['left', 'right'] as const) {
        const t = pose[side]
        if (!t)
          continue
        const base = t.anchor === 'head' ? EYES : CHEST
        const w = t.at.map((v, i) => v + base[i])
        const d = Math.hypot(...w.map((v, i) => v - SHOULDER[side][i]))
        expect(d, `${id}.${side}`).toBeLessThan(REACH)
        expect(t.at[2], `${id}.${side} 앞쪽`).toBeGreaterThanOrEqual(-0.02)
      }
    }
  })

  it('보이는 범위(얼굴 가운데 ±0.17m) 안에 손이 온다', () => {
    for (const [id, pose] of Object.entries(POSES_3D)) {
      for (const side of ['left', 'right'] as const) {
        const t = pose[side]
        if (t)
          expect(Math.abs(t.at[0]), `${id}.${side}`).toBeLessThanOrEqual(0.17)
      }
    }
  })

  it('손가락 굽힘은 0~1 사이', () => {
    for (const curls of Object.values(FINGERS)) {
      expect(curls).toHaveLength(5)
      for (const c of curls) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})
