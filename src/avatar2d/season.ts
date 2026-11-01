// 날짜·시간·장소에 따라 달라지는 차림새: 할로윈 마녀 모자, 크리스마스 호랑가시, 겨울·호그스미드 목도리와 머리에 앉은 눈,
// 늦은 밤의 졸린 눈.
import type { Scene } from '../lib/scenes'

export interface Look {
  /** 작은 마녀 모자 (할로윈 무렵) */
  witchHat: boolean
  /** 리본에 꽂은 호랑가시 (크리스마스 무렵) */
  holly: boolean
  /** 초록·은색 줄무늬 목도리 (겨울, 눈 오는 호그스미드) */
  scarf: boolean
  /** 머리에 내려앉은 눈 */
  snow: boolean
  /** 늦은 밤이라 졸리다 */
  sleepy: boolean
}

const between = (d: Date, [m1, d1]: [number, number], [m2, d2]: [number, number]) => {
  const v = (d.getMonth() + 1) * 100 + d.getDate()
  return v >= m1 * 100 + d1 && v <= m2 * 100 + d2
}

export function lookFor(now: Date, scene: Scene): Look {
  const month = now.getMonth() + 1
  const hour = now.getHours()
  return {
    witchHat: between(now, [10, 24], [10, 31]),
    holly: between(now, [12, 18], [12, 26]),
    scarf: scene === 'hogsmeade' || month === 12 || month <= 2,
    snow: scene === 'hogsmeade',
    sleepy: hour >= 23 || hour < 5,
  }
}
