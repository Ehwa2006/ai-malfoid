import type { Emotion } from '../lib/markers'

/** 감정별 고개 자세 (라디안). x+ = 숙이기, y+ = 캐릭터 기준 왼쪽으로 돌리기, z+ = 갸웃 */
export const HEAD_POSE: Record<Emotion, { x: number, y: number, z: number }> = {
  neutral: { x: 0, y: 0, z: 0 },
  smirk: { x: -0.09, y: -0.12, z: 0.07 },
  annoyed: { x: -0.06, y: 0.32, z: -0.05 },
  flustered: { x: 0.16, y: -0.22, z: 0.06 },
  happy: { x: -0.03, y: 0, z: 0.1 },
  sad: { x: 0.2, y: 0.05, z: -0.04 },
  surprised: { x: -0.1, y: 0, z: 0 },
}
