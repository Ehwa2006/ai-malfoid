// VRM 정규화 본으로 팔을 원하는 곳에 가져가는 두 마디 IK.
// 정규화 본은 T포즈에서 회전이 0이고 축이 세계 축과 같다 (모델은 +Z를 보고, 캐릭터의 왼쪽이 +X).
// - 팔꿈치는 경첩이다: 왼팔은 Y축으로 -θ, 오른팔은 +θ만큼 굽히면 아래팔이 앞으로 접힌다.
// - 위팔은 손이 목표 방향을 향하도록 돌리고, 그 축을 중심으로 비틀어 팔꿈치가 pole 쪽을 보게 한다.
import { Quaternion, Vector3, type Object3D } from 'three'

export type Side = 'left' | 'right'

const tmp = {
  s: new Vector3(),
  t: new Vector3(),
  v: new Vector3(),
  e: new Vector3(),
  p: new Vector3(),
  q: new Quaternion(),
  qp: new Quaternion(),
  qTwist: new Quaternion(),
  hand: new Vector3(),
}

export interface ArmChain {
  upper: Object3D
  lower: Object3D
  hand: Object3D
  side: Side
  /** 위팔·아래팔 길이 (정규화 본의 자식 위치에서 잰다) */
  a: number
  b: number
}

export function armChain(upper: Object3D, lower: Object3D, hand: Object3D, side: Side): ArmChain {
  return { upper, lower, hand, side, a: lower.position.length(), b: hand.position.length() }
}

/** 팔꿈치를 굽힌 각도(라디안). 손목이 어깨에서 d만큼 떨어지려면 얼마나 접어야 하는지 */
export function elbowBend(a: number, b: number, d: number): number {
  const dd = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, d))
  const cos = (a * a + b * b - dd * dd) / (2 * a * b)
  return Math.PI - Math.acos(Math.min(1, Math.max(-1, cos)))
}

/**
 * target(세계 좌표)에 손목이 오도록 위팔·아래팔을 돌린다.
 * @param pole 팔꿈치가 향할 방향 (세계 좌표의 방향 벡터)
 * @param weight 0이면 그대로, 1이면 완전히 목표 자세 (사이 값은 부드럽게 섞기)
 */
export function solveArm(chain: ArmChain, target: Vector3, pole: Vector3, weight = 1): void {
  const { upper, lower, hand, side, a, b } = chain
  upper.parent?.updateWorldMatrix(true, false)
  const S = upper.getWorldPosition(tmp.s)
  const toTarget = tmp.t.copy(target).sub(S)
  const d = toTarget.length()

  // 1) 팔꿈치 굽히기 (경첩)
  const bend = elbowBend(a, b, d)
  const lowerQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), side === 'left' ? -bend : bend)

  // 2) 위팔 좌표계에서 본 손목 위치: 팔꿈치까지 + 굽힌 아래팔
  const e = tmp.e.copy(lower.position)
  const v = tmp.v.copy(hand.position).applyQuaternion(lowerQ).add(e)

  // 3) 부모(어깨) 좌표계로 목표 방향과 pole을 옮긴다
  const parentQ = upper.parent ? upper.parent.getWorldQuaternion(tmp.qp).invert() : tmp.qp.identity()
  const tDir = toTarget.normalize().applyQuaternion(parentQ)
  const pDir = tmp.p.copy(pole).normalize().applyQuaternion(parentQ)

  const q1 = new Quaternion().setFromUnitVectors(v.clone().normalize(), tDir)
  // 4) 손목 방향을 축으로 비틀어 팔꿈치가 pole 쪽을 보게 한다
  const e1 = e.clone().applyQuaternion(q1)
  const e1p = e1.sub(tDir.clone().multiplyScalar(e1.dot(tDir)))
  const pp = pDir.sub(tDir.clone().multiplyScalar(pDir.dot(tDir)))
  let twist = 0
  if (e1p.lengthSq() > 1e-10 && pp.lengthSq() > 1e-10)
    twist = Math.atan2(tDir.dot(e1p.clone().cross(pp)), e1p.dot(pp))
  const upperQ = tmp.qTwist.setFromAxisAngle(tDir, twist).multiply(q1)

  if (weight >= 1) {
    upper.quaternion.copy(upperQ)
    lower.quaternion.copy(lowerQ)
  }
  else {
    upper.quaternion.slerp(upperQ, weight)
    lower.quaternion.slerp(lowerQ, weight)
  }
}

/** 지금 손목의 세계 위치 (확인용) */
export function wristWorld(chain: ArmChain, out = tmp.hand): Vector3 {
  chain.upper.updateWorldMatrix(true, true)
  return chain.hand.getWorldPosition(out)
}
