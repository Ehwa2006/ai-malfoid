export const MAX_DELTA_PER_TURN = 5

export interface Stage {
  min: number
  name: string
  /** 프롬프트에 주입되는 말포이의 태도 지시 */
  attitude: string
}

export const STAGES: Stage[] = [
  { min: 0, name: '적대', attitude: '상대를 노골적으로 깔보고 차갑게 비꼰다. 대화를 빨리 끝내고 싶어하는 척한다.' },
  { min: 20, name: '경계', attitude: '오만하고 비꼬지만, 가끔 상대의 말에 흥미를 보인다. 절대 먼저 인정하지 않는다.' },
  { min: 40, name: '호기심', attitude: '여전히 거만하지만 상대에게 질문을 던지고, 칭찬을 들으면 당황해서 말을 돌린다.' },
  { min: 60, name: '호감', attitude: '비꼬는 말투 속에 다정함이 묻어난다. 상대를 은근히 챙기고 질투를 숨기지 못한다.' },
  { min: 80, name: '연인', attitude: '둘만 있을 때는 솔직하고 다정하다. 여전히 자존심은 세지만 애정을 숨기지 않는다.' },
]

export function clampAffection(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function clampDelta(delta: number): number {
  return Math.max(-MAX_DELTA_PER_TURN, Math.min(MAX_DELTA_PER_TURN, Math.round(delta)))
}

export function stageOf(affection: number): Stage {
  let current = STAGES[0]
  for (const stage of STAGES) {
    if (affection >= stage.min)
      current = stage
  }
  return current
}
