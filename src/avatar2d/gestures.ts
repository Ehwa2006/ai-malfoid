// 몸짓: 손목을 어디에 둘지, 고개를 어떻게 기울일지, 어떤 효과를 띄울지를 데이터로 정한다.
// 팔은 IK로 따라가므로 몸짓이 바뀌면 손이 자연스럽게 옮겨 간다.
import type { Emotion } from '../lib/markers'
import type { Scene } from '../lib/scenes'
import type { Expression } from './expressions'

export type HandShape = 'hidden' | 'tips' | 'open' | 'hold' | 'point'
export type Prop = 'fanOpen' | 'fanClosed' | 'teacup' | 'bouquet' | 'giftbox' | null
export type Effect = 'steam' | 'sweat' | 'anger' | 'sparkle' | 'hearts' | 'tear' | 'gloom' | 'exclaim' | 'ohoho' | 'hmph' | 'think' | 'pat' | 'poke' | 'flowers'

export interface ArmPose {
  /** 손목 (화면 좌표, viewBox 300×390) */
  x: number
  y: number
  /** 팔꿈치. 카메라 쪽으로 나온 팔은 짧아 보이므로(원근) 길이를 맞추지 않고 그림처럼 직접 정한다 */
  ex: number
  ey: number
  hand: HandShape
  /** 손가락 방향을 팔뚝 방향에서 더 돌리는 각도 (도) */
  twist?: number
}

export interface Gesture {
  id: GestureId
  /** 화면 왼쪽 팔 (카리나의 오른팔) */
  left: ArmPose
  /** 화면 오른쪽 팔 (카리나의 왼팔) */
  right: ArmPose
  /** 어느 팔이 앞에 오는지 (팔짱) */
  front?: 'left' | 'right'
  /** 오른손(화면 오른쪽)에 든 것 */
  prop?: Prop
  /** 고개: 좌우(-1~1, +는 화면 오른쪽), 위아래(-1~1, +는 숙임), 기울기(도) */
  head?: { yaw?: number, pitch?: number, roll?: number }
  /** 시선 (-1~1). 없으면 보는 사람(마우스)을 본다 */
  gaze?: { x: number, y: number }
  /** 표정 덮어쓰기 */
  face?: Partial<Expression>
  effects?: Effect[]
  /** 손을 살랑살랑 흔든다 (px) */
  waveAmp?: number
  /** 옆머리를 손으로 튕긴다 */
  flipHair?: boolean
}

const IDLE_L: ArmPose = { x: 64, y: 462, ex: 58, ey: 360, hand: 'hidden' }
const IDLE_R: ArmPose = { x: 236, y: 462, ex: 242, ey: 360, hand: 'hidden' }

export const GESTURES = {
  idle: { left: IDLE_L, right: IDLE_R },
  // 악역영애의 상징: 부채로 입을 가리고 "오~호호"
  fanLaugh: {
    left: IDLE_L,
    right: { x: 184, y: 236, ex: 236, ey: 340, hand: 'hold', twist: -150 },
    prop: 'fanOpen',
    head: { pitch: -0.35, roll: -4 },
    face: { closed: 'smug', mouth: 'laugh', browArch: 0 },
    effects: ['ohoho', 'sparkle'],
  },
  // 접은 부채로 콕 가리키며 도발
  fanPoint: {
    left: IDLE_L,
    right: { x: 250, y: 206, ex: 268, ey: 320, hand: 'hold', twist: -170 },
    prop: 'fanClosed',
    head: { yaw: 0.15, pitch: -0.15, roll: 3 },
  },
  // 펼친 부채 뒤로 빨개진 얼굴을 숨긴다
  fanHide: {
    left: { x: 148, y: 330, ex: 92, ey: 352, hand: 'tips', twist: -20 },
    right: { x: 180, y: 240, ex: 236, ey: 344, hand: 'hold', twist: -160 },
    prop: 'fanOpen',
    head: { pitch: 0.2, roll: 5 },
    gaze: { x: -0.5, y: 0.2 },
    effects: ['steam'],
  },
  // 팔짱 끼고 고개를 홱 돌린다 "흥!"
  armsCrossed: {
    left: { x: 192, y: 327, ex: 78, ey: 350, hand: 'hidden' },
    right: { x: 111, y: 321, ex: 222, ey: 352, hand: 'tips', twist: 10 },
    front: 'left',
    head: { yaw: -0.55, pitch: -0.25, roll: -5 },
    face: { closed: 'smug' },
    effects: ['hmph'],
  },
  // 옆머리를 손등으로 휙 넘긴다
  hairFlip: {
    left: IDLE_L,
    right: { x: 204, y: 180, ex: 266, ey: 292, hand: 'open', twist: 160 },
    head: { yaw: -0.2, pitch: -0.2, roll: -6 },
    flipHair: true,
    effects: ['sparkle'],
  },
  // 두 손(소매)으로 볼을 감싼다
  cheeks: {
    left: { x: 116, y: 196, ex: 100, ey: 330, hand: 'tips', twist: 12 },
    right: { x: 184, y: 196, ex: 200, ey: 330, hand: 'tips', twist: -12 },
    head: { pitch: 0.15, roll: 4 },
    gaze: { x: 0.4, y: 0.3 },
    effects: ['steam', 'sweat'],
  },
  // 가슴 앞에서 검지를 콕콕 맞댄다 (츤 → 데레)
  fidget: {
    left: { x: 144, y: 305, ex: 96, ey: 352, hand: 'point', twist: -10 },
    right: { x: 156, y: 305, ex: 204, ey: 352, hand: 'point', twist: 10 },
    head: { pitch: 0.2, roll: -4 },
    gaze: { x: -0.6, y: 0.3 },
    waveAmp: 2,
  },
  // 소매로 입을 가린다
  coverMouth: {
    left: IDLE_L,
    right: { x: 158, y: 196, ex: 208, ey: 312, hand: 'tips', twist: -30 },
    head: { pitch: 0.05 },
  },
  // 찻잔과 받침을 든다
  teacup: {
    left: { x: 133, y: 310, ex: 88, ey: 352, hand: 'hold', twist: -70 },
    right: { x: 176, y: 300, ex: 214, ey: 352, hand: 'hold', twist: 60 },
    prop: 'teacup',
    head: { pitch: 0.08, roll: 3 },
  },
  // 두 손을 가슴 앞에 모은다
  clasp: {
    left: { x: 144, y: 296, ex: 96, ey: 350, hand: 'tips', twist: -30 },
    right: { x: 156, y: 296, ex: 204, ey: 350, hand: 'tips', twist: 30 },
    head: { roll: 5 },
  },
  // 작게 손을 흔든다
  wave: {
    left: IDLE_L,
    right: { x: 244, y: 192, ex: 266, ey: 316, hand: 'open', twist: 0 },
    head: { roll: 4, yaw: 0.1 },
    waveAmp: 9,
  },
  // 턱을 괴고 생각한다
  chin: {
    left: { x: 190, y: 324, ex: 90, ey: 352, hand: 'hidden' },
    right: { x: 166, y: 212, ex: 216, ey: 322, hand: 'point', twist: -24 },
    front: 'right',
    head: { roll: 6, yaw: 0.12 },
    gaze: { x: 0.5, y: -0.5 },
    effects: ['think'],
  },
  // 가슴께 브로치를 꼭 쥔다
  clutch: {
    left: IDLE_L,
    right: { x: 160, y: 282, ex: 220, ey: 350, hand: 'tips', twist: -20 },
    head: { pitch: 0.3, roll: -3 },
    gaze: { x: -0.3, y: 0.6 },
  },
  // 깜짝 놀라 두 손을 든다
  handsUp: {
    left: { x: 88, y: 222, ex: 66, ey: 320, hand: 'open', twist: 0 },
    right: { x: 212, y: 222, ex: 234, ey: 320, hand: 'open', twist: 0 },
    head: { pitch: -0.1 },
    effects: ['exclaim'],
  },
  // 선물을 두 손으로 받아 든다
  receive: {
    left: { x: 136, y: 306, ex: 90, ey: 352, hand: 'hold', twist: -60 },
    right: { x: 164, y: 306, ex: 210, ey: 352, hand: 'hold', twist: 60 },
    prop: 'giftbox',
    head: { pitch: 0.12, roll: 4 },
    gaze: { x: 0, y: 0.6 },
    effects: ['sparkle'],
  },
} satisfies Record<string, Omit<Gesture, 'id'>>

export type GestureId = keyof typeof GESTURES

export function gesture(id: GestureId): Gesture {
  return { id, ...GESTURES[id] } as Gesture
}

// 감정마다 고를 수 있는 몸짓과 무게. 같은 감정이어도 매번 다른 몸짓을 하게 한다.
const BY_EMOTION: Record<Emotion, [GestureId, number][]> = {
  neutral: [['idle', 3], ['chin', 2], ['teacup', 2], ['hairFlip', 1]],
  smirk: [['fanLaugh', 3], ['fanPoint', 2], ['hairFlip', 2], ['armsCrossed', 1]],
  annoyed: [['armsCrossed', 4], ['fanPoint', 1]],
  flustered: [['fidget', 3], ['cheeks', 2], ['fanHide', 2], ['coverMouth', 2]],
  happy: [['clasp', 2], ['teacup', 1], ['wave', 1], ['fanLaugh', 1]],
  sad: [['clutch', 3], ['idle', 1]],
  surprised: [['handsUp', 2], ['coverMouth', 2]],
}

/** 장소에 어울리지 않는 몸짓 (찻잔은 실내에서만) */
const NEEDS_TEA: Scene[] = ['manor', 'tearoom', 'library', 'garden']

/** 이번 감정에 맞는 몸짓을 하나 고른다. 방금 한 몸짓은 피한다 */
export function pickGesture(emotion: Emotion, scene: Scene, last: GestureId | null, rand: () => number): GestureId {
  const options = BY_EMOTION[emotion].filter(([id]) => id !== last && (id !== 'teacup' || NEEDS_TEA.includes(scene)))
  const pool = options.length ? options : BY_EMOTION[emotion]
  const total = pool.reduce((sum, [, w]) => sum + w, 0)
  let r = rand() * total
  for (const [id, w] of pool) {
    r -= w
    if (r < 0)
      return id
  }
  return pool[pool.length - 1][0]
}

/** 감정마다 기본으로 띄우는 효과 */
export const EMOTION_EFFECTS: Record<Emotion, Effect[]> = {
  neutral: [],
  smirk: ['sparkle'],
  annoyed: ['anger'],
  flustered: ['steam', 'sweat'],
  happy: ['flowers'],
  sad: ['gloom', 'tear'],
  surprised: ['exclaim', 'sweat'],
}

/** 상대의 행동(선물·다가가기)에 곧바로 보이는 반응. 모델의 답이 오기 전에 먼저 움직여서 기다림을 덜 느끼게 한다 */
export interface Reaction {
  gesture: GestureId
  prop?: Prop
  effects: Effect[]
  emotion: Emotion
}

export function reactionFor(actionId: string): Reaction | null {
  switch (actionId) {
    case 'tea': return { gesture: 'teacup', effects: ['sparkle'], emotion: 'happy' }
    case 'lily': return { gesture: 'receive', prop: 'bouquet', effects: ['sparkle', 'flowers'], emotion: 'flustered' }
    case 'chocolate': case 'broom': case 'book': case 'brooch':
      return { gesture: 'receive', prop: 'giftbox', effects: ['sparkle'], emotion: 'surprised' }
    case 'candy': case 'scarf': return { gesture: 'armsCrossed', effects: ['anger', 'hmph'], emotion: 'annoyed' }
    case 'wave': return { gesture: 'wave', effects: [], emotion: 'smirk' }
    case 'poke': return { gesture: 'coverMouth', effects: ['poke', 'sweat'], emotion: 'flustered' }
    case 'hand': return { gesture: 'fidget', effects: ['sweat'], emotion: 'flustered' }
    case 'pat': return { gesture: 'clasp', effects: ['pat', 'flowers'], emotion: 'flustered' }
    case 'hug': return { gesture: 'cheeks', effects: ['hearts', 'steam'], emotion: 'flustered' }
    // 아직 허락하지 않은 손길: 팔짱 끼고 홱 돌아선다
    case 'dodge': return { gesture: 'armsCrossed', effects: ['hmph'], emotion: 'annoyed' }
    default: return null
  }
}
