import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { armChain, elbowBend, solveArm, wristWorld } from './ik'

/** T포즈 팔: 어깨 → 위팔(0.25) → 아래팔(0.22) → 손. 왼팔은 +X, 오른팔은 -X 쪽으로 뻗는다 */
function makeArm(side: 'left' | 'right') {
  const sign = side === 'left' ? 1 : -1
  const chest = new Object3D()
  chest.position.set(0, 1.3, 0)
  const shoulder = new Object3D()
  shoulder.position.set(sign * 0.08, 0.1, 0)
  const upper = new Object3D()
  upper.position.set(sign * 0.06, 0, 0)
  const lower = new Object3D()
  lower.position.set(sign * 0.25, 0, 0)
  const hand = new Object3D()
  hand.position.set(sign * 0.22, 0, 0)
  chest.add(shoulder)
  shoulder.add(upper)
  upper.add(lower)
  lower.add(hand)
  chest.updateMatrixWorld(true)
  return { chest, chain: armChain(upper, lower, hand, side), upper, lower }
}

describe('팔 IK', () => {
  it('팔꿈치 각도: 다 뻗으면 0, 가까울수록 많이 접는다', () => {
    expect(elbowBend(0.25, 0.22, 0.47)).toBeCloseTo(0, 1)
    expect(elbowBend(0.25, 0.22, 0.2)).toBeGreaterThan(elbowBend(0.25, 0.22, 0.4))
    expect(Number.isFinite(elbowBend(0.25, 0.22, 5))).toBe(true)
    expect(Number.isFinite(elbowBend(0.25, 0.22, 0))).toBe(true)
  })

  for (const side of ['left', 'right'] as const) {
    it(`${side === 'left' ? '왼' : '오른'}손이 목표(볼 높이, 앞쪽)에 닿고 팔꿈치는 아래로 향한다`, () => {
      const { chain, lower } = makeArm(side)
      const sign = side === 'left' ? 1 : -1
      const target = new Vector3(sign * 0.08, 1.55, 0.12)
      solveArm(chain, target, new Vector3(sign * 0.5, -1, 0))
      const w = wristWorld(chain, new Vector3())
      expect(w.distanceTo(target)).toBeLessThan(0.005)
      const elbow = lower.getWorldPosition(new Vector3())
      expect(elbow.y).toBeLessThan(1.42) // 어깨보다 아래
      expect(elbow.x * sign).toBeGreaterThan(0.1) // 몸 바깥쪽
    })
  }

  it('닿지 않는 곳이면 그쪽으로 팔을 쭉 뻗는다', () => {
    const { chain } = makeArm('left')
    const target = new Vector3(2, 1.4, 0)
    solveArm(chain, target, new Vector3(0, -1, 0))
    const w = wristWorld(chain, new Vector3())
    expect(w.x).toBeGreaterThan(0.55)
    expect(Math.abs(w.y - 1.4)).toBeLessThan(0.02)
  })

  it('팔짱: 왼손이 몸 반대편으로 건너가도 손목이 목표에 닿는다', () => {
    const { chain } = makeArm('left')
    const target = new Vector3(-0.08, 1.2, 0.14)
    solveArm(chain, target, new Vector3(1, -0.5, 0.5))
    expect(wristWorld(chain, new Vector3()).distanceTo(target)).toBeLessThan(0.005)
  })
})
