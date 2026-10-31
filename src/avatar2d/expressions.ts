// 감정별 얼굴: 눈썹·눈·입·볼. 초상화(KarinaPortrait)가 이 값을 부드럽게 따라간다.
import type { Emotion } from '../lib/markers'

export type MouthShape = 'smile' | 'smirk' | 'pout' | 'frown' | 'o' | 'flat' | 'laugh' | 'wavy'

export interface Expression {
  /** 눈썹 높이 (+는 올라감, px) */
  browLift: number
  /** 눈썹 기울기 (+면 안쪽이 내려감: 화남, -면 안쪽이 올라감: 곤란·슬픔) */
  browTilt: number
  /** 한쪽 눈썹만 치켜뜨기 (비웃을 때, px) */
  browArch: number
  /** 눈 뜬 정도 (1 보통, 0.6 반쯤 내리깐 도도한 눈, 1.2 놀람) */
  eyeOpen: number
  /** 아래 눈꺼풀이 올라가 웃는 눈 (0~1) */
  smile: number
  /** 눈을 감은 모양: 웃음(∩), 도도함(―) */
  closed: 'happy' | 'smug' | null
  /** 눈동자 크기 배율 */
  pupil: number
  /** 눈이 반짝인다 (하이라이트 추가) */
  sparkle: boolean
  mouth: MouthShape
  /** 볼 붉어짐 (0~1) */
  blush: number
  /** 볼에 빗금 (부끄러움) */
  hatch: boolean
}

const base: Expression = { browLift: 0, browTilt: 0, browArch: 0, eyeOpen: 1, smile: 0, closed: null, pupil: 1, sparkle: false, mouth: 'flat', blush: 0.12, hatch: false }

export const EXPRESSIONS: Record<Emotion, Expression> = {
  neutral: { ...base, mouth: 'flat' },
  smirk: { ...base, browArch: 4, eyeOpen: 0.72, smile: 0.25, mouth: 'smirk', pupil: 0.95 },
  annoyed: { ...base, browLift: -3, browTilt: 5, eyeOpen: 0.78, mouth: 'pout', blush: 0.2 },
  flustered: { ...base, browLift: 2, browTilt: -4, eyeOpen: 1.05, mouth: 'wavy', blush: 0.95, hatch: true, pupil: 0.9 },
  happy: { ...base, browLift: 2, smile: 0.75, mouth: 'smile', blush: 0.45, sparkle: true },
  sad: { ...base, browLift: 1, browTilt: -6, eyeOpen: 0.82, mouth: 'frown', blush: 0.1, pupil: 1.05 },
  surprised: { ...base, browLift: 6, eyeOpen: 1.22, mouth: 'o', pupil: 0.82, blush: 0.25 },
}

/** 호감도가 높을수록 평소에도 볼이 조금 더 붉다 */
export function blushFor(expr: Expression, affection: number): number {
  return Math.min(1, expr.blush + Math.max(0, affection - 50) / 250)
}
