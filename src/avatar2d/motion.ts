// 2D 초상화를 움직이는 작은 물리: 스프링(부드럽게 따라가기), 눈 깜빡임 일정.

/** 목표값을 출렁이며 따라가는 스프링 (감쇠 진동). 머리카락·팔·고개가 한 박자 늦게 따라오게 한다 */
export class Spring {
  velocity = 0
  constructor(public value: number, public stiffness = 120, public damping = 16) {}

  step(target: number, dt: number): number {
    // 프레임이 길어져도 터지지 않게 잘게 나눠 계산한다
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const force = this.stiffness * (target - this.value) - this.damping * this.velocity
      this.velocity += force * h
      this.value += this.velocity * h
    }
    return this.value
  }
}

export interface Point { x: number, y: number }

/** 다음 눈 깜빡임까지의 시간 (초). 가끔 두 번 연달아 깜빡인다 */
export function nextBlink(rand: () => number): { wait: number, double: boolean } {
  return { wait: 2.2 + rand() * 4, double: rand() < 0.18 }
}

/** 깜빡임 진행(0~1)에 따른 눈 감김 정도 (0: 뜸, 1: 감음). 빨리 감고 조금 천천히 뜬다 */
export function blinkCurve(t: number): number {
  if (t <= 0 || t >= 1)
    return 0
  return t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65
}

/** 결정적인 난수 (테스트·미리보기에서 같은 결과) */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}
