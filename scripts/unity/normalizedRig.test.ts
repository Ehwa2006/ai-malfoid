// 유니티의 NormalizedRig.cs가 three-vrm의 정규화 본과 같은 자세를 만드는지 수식으로 확인한다.
// (유니티 쿼터니언과 three.js 쿼터니언은 곱셈·축 회전 공식이 같으므로, C#의 식을 그대로 three.js 수학으로 옮겨 계산한다)
//   - 실제 본의 축은 모델마다 제각각이다: 여기서는 T포즈의 본 회전을 아무렇게나 줘서 그 점을 흉내 낸다
//   - three.js 좌표(+x가 캐릭터의 왼쪽)와 유니티 좌표(+x가 캐릭터의 오른쪽)는 x를 뒤집은 관계다
import { Euler, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { REST_POSE } from '../../src/three/vrm'
import { POSES_3D } from '../../src/three/vrmGestures'

const mirrorV = (v: Vector3) => new Vector3(-v.x, v.y, v.z)
const mirrorQ = (q: Quaternion) => new Quaternion(q.x, -q.y, -q.z, q.w)
const axis = (x: number, y: number, z: number, rad: number) => new Quaternion().setFromAxisAngle(new Vector3(x, y, z), rad)
const inv = (q: Quaternion) => q.clone().invert()
const mul = (...qs: Quaternion[]) => qs.reduce((a, b) => a.clone().multiply(b))

/** NormalizedRig.FromThreeEuler: AngleAxis(x, right) * AngleAxis(-y, up) * AngleAxis(-z, forward) */
const fromThreeEuler = (x: number, y: number, z: number) => mul(axis(1, 0, 0, x), axis(0, 1, 0, -y), axis(0, 0, 1, -z))

// 왼팔 사슬 (Malfoy Draconia의 치수): 가슴 → 어깨 → 위팔 → 아래팔 → 손
const CHAIN = ['chest', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'] as const
const REST_POS: Record<(typeof CHAIN)[number], Vector3> = {
  chest: new Vector3(0, 1.227, 0),
  leftShoulder: new Vector3(0.03, 1.3, 0),
  leftUpperArm: new Vector3(0.103, 1.306, 0),
  leftLowerArm: new Vector3(0.339, 1.306, 0),
  leftHand: new Vector3(0.555, 1.306, 0),
}

/** three-vrm 기준: 정규화 본의 로컬 회전만으로 손목이 어디에 오는지 (정규화 본은 T포즈에서 회전 0) */
function threeWrist(q: Record<string, Quaternion>): Vector3 {
  let pos = REST_POS.chest.clone()
  let rot = q.chest ?? new Quaternion()
  for (let i = 1; i < CHAIN.length; i++) {
    const offset = REST_POS[CHAIN[i]].clone().sub(REST_POS[CHAIN[i - 1]])
    pos = pos.add(offset.applyQuaternion(rot))
    rot = rot.clone().multiply(q[CHAIN[i]] ?? new Quaternion())
  }
  return pos
}

/**
 * 유니티 쪽: 실제 본(축이 제각각)의 로컬 회전 = inv(부모의 T포즈 회전) × q × (이 본의 T포즈 회전),
 * 그리고 실제 본으로 정기구학을 돌려 손목 위치를 구한다 (모두 유니티 좌표).
 */
function unityWrist(qThree: Record<string, Quaternion>, restRot: Record<string, Quaternion>): Vector3 {
  const rootRestRel = new Quaternion() // 가슴의 부모 (hips 등): 회전 없음으로 둔다
  let pos = mirrorV(REST_POS.chest)
  let world = new Quaternion()
  let parentRest = rootRestRel
  let parentPos = pos
  for (let i = 0; i < CHAIN.length; i++) {
    const b = CHAIN[i]
    const restRel = restRot[b]
    const q = mirrorQ(qThree[b] ?? new Quaternion())
    const local = mul(inv(parentRest), q, restRel)
    if (i > 0) {
      // 실제 본의 로컬 위치는 T포즈에서 정해진 값 그대로다
      const restLocalPos = mirrorV(REST_POS[b]).sub(mirrorV(REST_POS[CHAIN[i - 1]])).applyQuaternion(inv(parentRest))
      pos = parentPos.clone().add(restLocalPos.applyQuaternion(world))
    }
    world = world.clone().multiply(local)
    parentRest = restRel
    parentPos = pos
  }
  return pos
}

function randomRest(seed: number): Record<string, Quaternion> {
  let s = seed
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
  return Object.fromEntries(CHAIN.map(b => [b, new Quaternion(r(), r(), r(), r()).normalize()]))
}

describe('NormalizedRig (unity) matches three-vrm normalized bones', () => {
  it('converts three.js Euler angles by mirroring x', () => {
    for (const [x, y, z] of [[0.3, -0.7, 1.1], [0, 0, -1.22], [0.5, 0.4, 0.3]]) {
      const three = new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ'))
      const unity = fromThreeEuler(x, y, z)
      expect(unity.angleTo(mirrorQ(three))).toBeLessThan(1e-6)
    }
  })

  it('puts the wrist where three-vrm would, whatever the real bone axes are', () => {
    const poses: Record<string, Quaternion>[] = [
      // 쉬는 자세 (팔을 내림)
      { leftUpperArm: new Quaternion().setFromEuler(new Euler(...REST_POSE.leftUpperArm!)), leftLowerArm: new Quaternion().setFromEuler(new Euler(...REST_POSE.leftLowerArm!)) },
      // 숨쉬는 가슴 + 아무 자세
      { chest: new Quaternion().setFromEuler(new Euler(0.05, 0.1, -0.02)), leftShoulder: new Quaternion().setFromEuler(new Euler(0, 0.1, 0.2)), leftUpperArm: new Quaternion().setFromEuler(new Euler(0.4, -0.3, -0.9)), leftLowerArm: new Quaternion().setFromEuler(new Euler(0, -1.4, 0)) },
    ]
    for (const seed of [1, 7, 42, 1234]) {
      const rest = randomRest(seed)
      for (const q of poses) {
        const expected = threeWrist(q)
        const got = mirrorV(unityWrist(q, rest))
        expect(got.distanceTo(expected)).toBeLessThan(1e-6)
      }
    }
  })

  it('lowers the arms in the rest pose (wrist below the shoulder, on the character\'s left)', () => {
    const q = { leftUpperArm: new Quaternion().setFromEuler(new Euler(...REST_POSE.leftUpperArm!)), leftLowerArm: new Quaternion().setFromEuler(new Euler(...REST_POSE.leftLowerArm!)) }
    const unity = unityWrist(q, randomRest(3))
    // 유니티 좌표에서 캐릭터의 왼쪽은 -x
    expect(unity.x).toBeLessThan(-0.05)
    expect(unity.y).toBeLessThan(REST_POS.leftUpperArm.y - 0.3)
  })

  it('reads gesture targets in the same character space (left hand targets go to -x in unity)', () => {
    const fan = POSES_3D.fanLaugh.left!
    expect(fan.at[0]).toBeGreaterThan(0) // three.js: 캐릭터의 왼쪽
    expect(mirrorV(new Vector3(...fan.at)).x).toBeLessThan(0)
  })
})
