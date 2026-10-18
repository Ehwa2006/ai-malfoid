import type { Object3D, Vector3 } from 'three'
import type { Emotion } from '../lib/markers'

export interface AvatarFrameState {
  speaking: boolean
  /** 포인터 위치, -1 ~ 1 */
  lookX: number
  lookY: number
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
  update: (dt: number, state: AvatarFrameState) => void
  dispose: () => void
}
