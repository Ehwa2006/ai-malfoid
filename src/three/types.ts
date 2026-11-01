import type { Object3D, Raycaster, Vector3 } from 'three'
import type { Emotion } from '../lib/markers'
import type { Scene } from '../lib/scenes'
import type { Gesture, Prop } from '../avatar2d/gestures'
import type { Look } from '../avatar2d/season'

/** 연출(avatar2d/director)이 정한 지금의 몸짓·감정·소품·차림새 */
export interface Direction {
  gesture: Gesture
  mood: Emotion
  prop: Prop
  look: Look
  heartEyes: boolean
}

export interface AvatarFrameState {
  speaking: boolean
  /** 실제 목소리 크기로 정한 입 벌림 0~1. null이면 speaking 동안 입을 적당히 여닫는다 */
  mouth: number | null
  /** 포인터 위치, -1 ~ 1 */
  lookX: number
  lookY: number
  /** 몸짓 연출 (없으면 감정에 따른 표정·고개만) */
  direction?: Direction
}

/** 화면 위 효과를 머리에 맞춰 띄우기 위한 머리의 세계 좌표 */
export interface HeadAnchor {
  /** 얼굴 가운데 (두 눈 사이) */
  center: Vector3
  /** 얼굴 가운데에서 캐릭터의 왼쪽으로 얼굴 반 폭만큼 떨어진 점 */
  side: Vector3
}

/** 절차적 모델과 VRM 모델이 같은 방식으로 움직이도록 맞춘 인터페이스 */
export interface AvatarController {
  object: Object3D
  /** 카메라가 바라볼 중심점과 화면에 담을 세로 높이(m) */
  frame: { target: Vector3, height: number }
  /** 모델 재질에 맞춘 조명 세기 (없으면 기본값) */
  lighting?: { hemisphere: number, key: number, rim: number }
  /** false면 OutlineEffect 없이 그린다 (재질이 외곽선을 직접 그리는 MToon 등). 기본 true */
  outlineEffect?: boolean
  setEmotion: (emotion: Emotion) => void
  /** 장소에 맞춰 림 라이트 색 등을 바꾼다 */
  setScene?: (scene: Scene) => void
  /** 머리 위치 (효과 오버레이용) */
  headAnchor?: () => HeadAnchor | null
  /** 누른 곳이 머리인지 볼인지 */
  pick?: (raycaster: Raycaster) => 'head' | 'cheek' | null
  update: (dt: number, state: AvatarFrameState) => void
  dispose: () => void
}

/** 말하는 동안 입 벌림: 목소리 크기를 알면 그대로, 모르면 적당히 여닫는다 */
export function mouthOpen(state: AvatarFrameState, time: number): number {
  if (state.mouth !== null)
    return Math.min(1, state.mouth * 1.6)
  if (!state.speaking)
    return 0
  return Math.min(1, Math.max(0, 0.55 + 0.4 * Math.sin(time * 17) + 0.2 * Math.sin(time * 29)))
}
