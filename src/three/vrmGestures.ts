// 2D 초상화와 같은 몸짓(avatar2d/gestures)을 VRM 모델의 뼈대로 옮긴 표.
// 손목 목표는 머리(두 눈 사이)나 가슴 본을 기준으로 한 캐릭터 좌표(미터)로 적는다: +x는 캐릭터의 왼쪽, +y는 위, +z는 앞.
// Malfoy Draconia 기준: 눈 1.46m, 어깨 1.31m, 가슴 본 1.23m, 위팔 0.24m, 아래팔 0.22m, 얼굴 앞면은 눈 본보다 7cm 앞.
// 가슴 앞의 몸짓은 쇄골 높이로 올려 화면(얼굴부터 가슴 위까지)에 들어오게 한다.
// 머리를 기준으로 한 손(볼 감싸기, 입 가리기)은 고개를 기울여도 얼굴에 붙어 다닌다.
import type { GestureId } from '../avatar2d/gestures'

export type Anchor = 'head' | 'chest'
export type Fingers = 'relaxed' | 'open' | 'grip' | 'point' | 'soft'

export interface ArmTarget {
  anchor: Anchor
  /** 기준점에서 손목까지 [x, y, z] (캐릭터의 오른손이면 x가 음수) */
  at: [number, number, number]
  /** 팔꿈치가 향할 방향 [x, y, z] */
  pole: [number, number, number]
  /** 손목 회전 [x, y, z] (라디안, 정규화 손 본 기준) */
  hand?: [number, number, number]
  fingers?: Fingers
}

export interface ArmPose3D {
  /** 캐릭터의 왼팔 (화면 오른쪽) */
  left?: ArmTarget
  /** 캐릭터의 오른팔 (화면 왼쪽) */
  right?: ArmTarget
}

// 화면 오른쪽 팔(2D의 right)은 캐릭터의 왼팔이다. 소품은 2D와 같이 화면 오른쪽 손(캐릭터의 왼손)에 든다.
export const POSES_3D: Record<GestureId, ArmPose3D> = {
  idle: {},
  fanLaugh: {
    left: { anchor: 'head', at: [0.06, -0.16, 0.1], pole: [1, -1, -0.1], hand: [0, 0.4, 1.3], fingers: 'grip' },
  },
  fanPoint: {
    left: { anchor: 'chest', at: [0.14, 0.2, 0.26], pole: [1, -1, -0.2], hand: [0, 0, 0.4], fingers: 'grip' },
  },
  fanHide: {
    left: { anchor: 'head', at: [0.03, -0.16, 0.1], pole: [1, -1, 0], hand: [0, 0.4, 1.3], fingers: 'grip' },
    right: { anchor: 'chest', at: [0.0, 0.03, 0.21], pole: [-1, -0.6, 0.2], hand: [0, 0, 0.4], fingers: 'soft' },
  },
  armsCrossed: {
    left: { anchor: 'chest', at: [-0.08, 0.0, 0.25], pole: [1, -0.6, 0.4], hand: [0, 0, 0.2], fingers: 'soft' },
    right: { anchor: 'chest', at: [0.08, 0.02, 0.23], pole: [-1, -0.6, 0.4], hand: [0, 0, -0.2], fingers: 'soft' },
  },
  hairFlip: {
    left: { anchor: 'head', at: [0.1, -0.07, 0.0], pole: [1, -0.2, -0.3], hand: [0, -0.6, 1.2], fingers: 'open' },
  },
  cheeks: {
    left: { anchor: 'head', at: [0.085, -0.17, 0.07], pole: [0.5, -1, -0.1], hand: [0, 0.8, 1.4], fingers: 'soft' },
    right: { anchor: 'head', at: [-0.085, -0.17, 0.07], pole: [-0.5, -1, -0.1], hand: [0, -0.8, -1.4], fingers: 'soft' },
  },
  fidget: {
    left: { anchor: 'chest', at: [0.02, 0.04, 0.2], pole: [1, -1, 0], hand: [0, 0.6, 0.3], fingers: 'point' },
    right: { anchor: 'chest', at: [-0.02, 0.04, 0.2], pole: [-1, -1, 0], hand: [0, -0.6, -0.3], fingers: 'point' },
  },
  coverMouth: {
    left: { anchor: 'head', at: [0.01, -0.14, 0.1], pole: [1, -1, 0], hand: [0, 0.6, 1.5], fingers: 'soft' },
  },
  teacup: {
    left: { anchor: 'chest', at: [0.05, 0.04, 0.22], pole: [1, -1, 0], hand: [0, 0, 0.2], fingers: 'grip' },
    right: { anchor: 'chest', at: [-0.03, 0.01, 0.2], pole: [-1, -1, 0], hand: [0, 0, -0.3], fingers: 'relaxed' },
  },
  clasp: {
    left: { anchor: 'chest', at: [0.012, 0.06, 0.18], pole: [1, -1, 0], hand: [0, 0.8, 0.4], fingers: 'soft' },
    right: { anchor: 'chest', at: [-0.012, 0.06, 0.18], pole: [-1, -1, 0], hand: [0, -0.8, -0.4], fingers: 'soft' },
  },
  wave: {
    left: { anchor: 'head', at: [0.11, -0.04, 0.1], pole: [1, -1, -0.2], hand: [0, 0, 0.7], fingers: 'open' },
  },
  chin: {
    left: { anchor: 'head', at: [0.02, -0.15, 0.09], pole: [0.6, -1, 0.3], hand: [0, 0.5, 1.4], fingers: 'point' },
    right: { anchor: 'chest', at: [0.06, -0.06, 0.24], pole: [-1, -0.6, 0.3], hand: [0, 0, -0.2], fingers: 'soft' },
  },
  clutch: {
    left: { anchor: 'chest', at: [0.0, 0.07, 0.15], pole: [1, -1, 0], hand: [0, 0.6, 0.5], fingers: 'soft' },
  },
  handsUp: {
    left: { anchor: 'head', at: [0.15, -0.12, 0.08], pole: [1, -1, 0], hand: [0, 0, 1.4], fingers: 'open' },
    right: { anchor: 'head', at: [-0.15, -0.12, 0.08], pole: [-1, -1, 0], hand: [0, 0, -1.4], fingers: 'open' },
  },
  receive: {
    left: { anchor: 'chest', at: [0.05, 0.02, 0.24], pole: [1, -1, 0], hand: [0, 0.3, 0.2], fingers: 'relaxed' },
    right: { anchor: 'chest', at: [-0.05, 0.02, 0.24], pole: [-1, -1, 0], hand: [0, -0.3, -0.2], fingers: 'relaxed' },
  },
  yawn: {
    left: { anchor: 'head', at: [0.01, -0.14, 0.1], pole: [1, -1, 0], hand: [0, 0.6, 1.5], fingers: 'soft' },
  },
  parasol: {
    left: { anchor: 'chest', at: [0.1, 0.05, 0.2], pole: [1, -1, 0], hand: [0, 0, 0.6], fingers: 'grip' },
  },
  broom: {
    left: { anchor: 'chest', at: [0.11, 0.0, 0.2], pole: [1, -0.6, -0.2], hand: [0, 0, 0.2], fingers: 'grip' },
  },
}

/** 손가락 굽힘 (0: 폄, 1: 꽉 쥠): [엄지, 검지, 중지, 약지, 새끼] */
export const FINGERS: Record<Fingers, [number, number, number, number, number]> = {
  open: [0, 0, 0, 0, 0],
  relaxed: [0.15, 0.25, 0.3, 0.35, 0.4],
  soft: [0.3, 0.5, 0.55, 0.6, 0.65],
  grip: [0.65, 1, 1, 1, 1],
  point: [0.6, 0.05, 1, 1, 1],
}
