<script setup lang="ts">
// 카리나 말포이 2D 초상화 (Live2D처럼 층을 나눠 움직이는 SVG).
// - 고개를 돌리면 앞머리·얼굴·뒷머리가 서로 다르게 움직여(시차) 입체감이 난다.
// - 팔은 두 마디 IK라서 몸짓이 바뀌면 손이 자연스럽게 옮겨 간다.
// - 머리카락은 스프링이라 고개를 따라 한 박자 늦게 출렁인다.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { Emotion } from '../../lib/markers'
import type { Scene } from '../../lib/scenes'
import { blushFor, EXPRESSIONS, type MouthShape } from '../../avatar2d/expressions'
import type { Effect, GestureId } from '../../avatar2d/gestures'
import { useDirector } from '../../avatar2d/director'
import { blinkCurve, nextBlink, Spring } from '../../avatar2d/motion'
import { backHair, bangClumps, fanClosedPath, fanOpenPaths, handPaths, mouthPaths, ringlet, sleeve } from '../../avatar2d/paint'
import SceneBackdrop from './SceneBackdrop.vue'
import MoeEffects from './MoeEffects.vue'

const props = withDefaults(defineProps<{
  emotion: Emotion
  speaking?: boolean
  /** 목소리 크기 (0~1). 있으면 입이 실제 목소리를 따라 움직인다 (null이면 크기를 알 수 없는 음성) */
  mouthLevel?: () => number | null
  scene?: Scene
  affection?: number
  /** 상대의 행동(선물·다가가기). at이 바뀔 때마다 한 번 반응한다 */
  reaction?: { id: string, at: number } | null
  /** 답을 생각하는 중 (첫 글자가 오기 전) */
  thinking?: boolean
  /** 미리보기용: 몸짓을 고정한다 */
  fixedGesture?: GestureId
  /** 미리보기용: 움직임을 멈추고 같은 모습으로 그린다 */
  still?: boolean
  /** 머리·볼을 눌러 상호작용할 수 있다 */
  interactive?: boolean
  /** 미리보기용: 날짜·시간 (계절 차림새, 늦은 밤) */
  now?: Date
}>(), { scene: 'manor', affection: 50, reaction: null, interactive: false })

const emit = defineEmits<{ touch: [id: 'pat' | 'poke'] }>()

/** 한 화면에 여러 개 그려도(미리보기) 눈 모양 클립이 섞이지 않게 */
const uid = `kp${Math.random().toString(36).slice(2, 7)}`

// ── 연출 (몸짓·감정·효과·소품·차림새는 VRM 모델과 같이 쓴다) ──────────
const director = useDirector(() => ({
  emotion: props.emotion,
  scene: props.scene,
  affection: props.affection,
  speaking: props.speaking,
  thinking: props.thinking,
  reaction: props.reaction,
  fixedGesture: props.fixedGesture,
  now: props.now,
  still: props.still,
}))
const { mood, prop, effects, look, heartEyes, rand } = director
const g = director.gesture
const expr = computed(() => {
  const e = { ...EXPRESSIONS[mood.value], ...g.value.face }
  // 늦은 밤에는 평소 눈이 조금 졸리다
  if (look.value.sleepy && mood.value === 'neutral')
    e.eyeOpen *= 0.8
  return e
})
const has = (e: Effect) => effects.value.has(e)

// 시선의 작은 떨림 (사람 눈은 가만히 있지 않는다)
let saccadeAt = 1
const saccade = { x: 0, y: 0 }

// ── 움직임 상태 ─────────────────────────────────────────
const r = reactive({
  yaw: 0,
  pitch: 0,
  roll: 0,
  breath: 0,
  gazeX: 0,
  gazeY: 0,
  lid: 1, // 눈 뜬 정도 (깜빡임·표정 포함)
  smile: 0,
  browLift: 0,
  browTilt: 0,
  browArch: 0,
  blush: 0.1,
  mouth: 0,
  backSway: 0,
  sideSwayL: 0,
  sideSwayR: 0,
  fan: 0,
  shoulderL: { x: 72, y: 254 },
  shoulderR: { x: 228, y: 254 },
  elbowL: { x: 58, y: 360 },
  elbowR: { x: 242, y: 360 },
  wristL: { x: 64, y: 462 },
  wristR: { x: 236, y: 462 },
  t: 0,
})

const S = {
  yaw: new Spring(0, 50, 11),
  pitch: new Spring(0, 50, 11),
  roll: new Spring(0, 50, 11),
  gazeX: new Spring(0, 160, 20),
  gazeY: new Spring(0, 160, 20),
  eye: new Spring(1, 120, 18),
  smile: new Spring(0, 90, 16),
  browLift: new Spring(0, 90, 16),
  browTilt: new Spring(0, 90, 16),
  browArch: new Spring(0, 90, 16),
  blush: new Spring(0.1, 30, 10),
  mouth: new Spring(0, 420, 30),
  fan: new Spring(0, 70, 13),
  // 손목과 팔꿈치를 따로 따라가게 해서, 손이 먼저 가고 팔꿈치가 뒤따르는 느낌을 낸다
  lx: new Spring(64, 60, 13),
  ly: new Spring(462, 60, 13),
  rx: new Spring(236, 60, 13),
  ry: new Spring(462, 60, 13),
  lex: new Spring(58, 40, 11),
  ley: new Spring(360, 40, 11),
  rex: new Spring(242, 40, 11),
  rey: new Spring(360, 40, 11),
  backLag: new Spring(0, 14, 3.2),
  sideLagL: new Spring(0, 22, 3.6),
  sideLagR: new Spring(0, 22, 3.6),
  flip: new Spring(0, 60, 9),
}

const pointer = { x: 0, y: 0 }
const root = ref<HTMLElement>()
function onPointer(e: PointerEvent) {
  const box = root.value?.getBoundingClientRect()
  if (!box)
    return
  // 초상화의 눈 높이를 기준으로 화면 어디를 가리키는지 (-1~1)
  pointer.x = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / (window.innerWidth * 0.45)))
  pointer.y = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height * 0.34)) / (window.innerHeight * 0.5)))
}

let blinkAt = 1.5
let blinkStart = -10
let doubleBlink = false

function frame(dt: number) {
  const t = (r.t += dt)
  const gs = g.value
  const ex = expr.value

  // 고개: 몸짓 + 숨쉬듯 아주 작은 흔들림 + 상대(마우스)를 향하는 정도
  const head = gs.head ?? {}
  const look = gs.gaze ? 0 : 0.22
  // 말하는 동안은 말의 리듬에 맞춰 고개를 살짝 끄덕이고 갸웃한다
  const talk = props.speaking ? r.mouth : 0
  r.yaw = S.yaw.step((head.yaw ?? 0) + pointer.x * look + Math.sin(t * 0.37) * 0.04, dt)
  r.pitch = S.pitch.step((head.pitch ?? 0) + pointer.y * look * 0.6 + Math.sin(t * 0.29) * 0.03 + talk * 0.08, dt)
  r.roll = S.roll.step((head.roll ?? 0) + Math.sin(t * 0.51) * 1.1 + (props.speaking ? Math.sin(t * 2.3) * 1.4 : 0), dt)
  r.breath = Math.sin((t * Math.PI * 2) / 4.4)

  const gz = gs.gaze ?? { x: pointer.x, y: pointer.y }
  if (t > saccadeAt) {
    saccade.x = (rand() - 0.5) * 0.35
    saccade.y = (rand() - 0.5) * 0.2
    saccadeAt = t + 0.8 + rand() * 2.6
  }
  r.gazeX = S.gazeX.step(gz.x - r.yaw * 0.4 + saccade.x, dt)
  r.gazeY = S.gazeY.step(gz.y + saccade.y, dt)

  // 눈 깜빡임 (눈을 감은 표정일 때는 쉬어 간다)
  if (t >= blinkAt) {
    blinkStart = t
    const next = nextBlink(rand)
    blinkAt = t + (doubleBlink ? 0.28 : next.wait)
    doubleBlink = !doubleBlink && next.double
  }
  const blink = blinkCurve((t - blinkStart) / 0.16)
  r.lid = S.eye.step(ex.eyeOpen, dt) * (1 - blink)
  r.smile = S.smile.step(ex.smile, dt)
  r.browLift = S.browLift.step(ex.browLift, dt)
  r.browTilt = S.browTilt.step(ex.browTilt, dt)
  r.browArch = S.browArch.step(ex.browArch, dt)
  r.blush = S.blush.step(blushFor(ex, props.affection), dt)

  // 입: 목소리 크기를 따르고, 목소리가 없으면 말하는 동안 흉내 낸다
  let open = 0
  if (props.speaking) {
    const level = props.mouthLevel?.()
    open = typeof level === 'number' ? Math.min(1, level * 1.6) : (Math.sin(t * 17) * 0.5 + 0.5) * (0.45 + 0.4 * Math.sin(t * 4.3))
  }
  r.mouth = S.mouth.step(open, dt)

  // 팔: 손목·팔꿈치가 몸짓의 자리로 스프링처럼 옮겨 간다 (숨 쉴 때 함께 오르내린다)
  const wave = gs.waveAmp ? Math.sin(t * 8.5) * gs.waveAmp : 0
  const breathe = r.breath * 1.2
  r.shoulderL = { x: 72, y: 254 - breathe }
  r.shoulderR = { x: 228, y: 254 - breathe }
  r.wristL = { x: S.lx.step(gs.left.x - (gs.id === 'fidget' ? wave : 0), dt), y: S.ly.step(gs.left.y, dt) - breathe }
  r.wristR = { x: S.rx.step(gs.right.x + wave, dt), y: S.ry.step(gs.right.y, dt) - breathe }
  r.elbowL = { x: S.lex.step(gs.left.ex, dt), y: S.ley.step(gs.left.ey, dt) - breathe }
  r.elbowR = { x: S.rex.step(gs.right.ex + wave * 0.3, dt), y: S.rey.step(gs.right.ey, dt) - breathe }
  r.fan = S.fan.step(prop.value === 'fanOpen' ? 1 : 0, dt)

  // 머리카락: 고개가 움직인 만큼 한 박자 늦게 따라오고, 바람에 살랑인다
  const headX = r.yaw * 14 + r.roll * 0.9
  r.backSway = (headX - S.backLag.step(headX, dt)) * 1.5 + Math.sin(t * 0.8) * 1.6
  const flip = S.flip.step(gs.flipHair ? 1 : 0, dt)
  r.sideSwayL = (headX - S.sideLagL.step(headX, dt)) * 2 + Math.sin(t * 1.1 + 1) * 1.2
  r.sideSwayR = (headX - S.sideLagR.step(headX, dt)) * 2 + Math.sin(t * 1.05) * 1.2 + flip * 18

}

let raf = 0
let last = 0
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
  last = now
  frame(dt)
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  if (props.still) {
    // 미리보기: 몸짓이 다 옮겨 갈 때까지 계산만 돌린 뒤 멈춘다
    for (let i = 0; i < 240; i++)
      frame(1 / 60)
    blinkAt = Infinity
    r.lid = expr.value.eyeOpen
    return
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('pointermove', onPointer)
})

// ── 그리기 ─────────────────────────────────────────────
const num = (n: number) => Math.round(n * 100) / 100
/** 고개 전체: 목을 축으로 기울이고, 숙이거나 들면 살짝 위아래로 */
const headT = computed(() => `translate(${num(r.yaw * 3)} ${num(r.pitch * 3 - r.breath * 0.8)}) rotate(${num(r.roll)} 150 214)`)
/** 층마다 다르게 옮겨 입체감을 낸다 (앞에 있을수록 많이) */
const layer = (depth: number, pitchK = depth * 0.6) => `translate(${num(r.yaw * depth)} ${num(r.pitch * pitchK)})`
const faceT = computed(() => `${layer(2)} translate(150 0) scale(${num(1 - Math.abs(r.yaw) * 0.05)} 1) translate(-150 0)`)
const featT = computed(() => layer(7, 5))
const bangsT = computed(() => layer(9, 6))
const backT = computed(() => layer(-5, -2))
const bodyT = computed(() => `translate(0 ${num(-r.breath * 1.2)})`)

const backHairD = computed(() => backHair(r.backSway))

/** 장소의 빛이 머리카락·어깨 가장자리에 닿는 색 (림 라이트) */
const RIM: Record<Scene, string> = {
  manor: '#a9c2ff',
  garden: '#ffc49c',
  tearoom: '#ffc77e',
  hogsmeade: '#ffd9a3',
  quidditch: '#ffffff',
  library: '#ffbb70',
  london: '#ffd6a8',
}
const rim = computed(() => RIM[props.scene])

/** 홍채의 결 (동공에서 퍼져 나가는 가는 선) */
function irisStreaks(x: number, y: number) {
  let d = ''
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2
    d += `M${num(x + Math.cos(a) * 4.6)} ${num(y + Math.sin(a) * 5.4)} L${num(x + Math.cos(a) * 9.4)} ${num(y + Math.sin(a) * 10.4)} `
  }
  return d
}
const lockL = computed(() => ringlet(-1, r.sideSwayL))
const lockR = computed(() => ringlet(1, r.sideSwayR))
const clumps = bangClumps()

/** 눈: 위 눈꺼풀이 내려오는 만큼 흰자를 접는다. 아래 눈꺼풀은 웃으면 올라온다 */
function eye(cx: number, side: -1 | 1) {
  const lid = Math.max(0, Math.min(1.25, r.lid))
  const outer = { x: cx + side * 20, y: 134 }
  const inner = { x: cx - side * 16, y: 141 }
  const top = 141 - 16.5 * lid
  const bottom = 148 - r.smile * 5
  const white = `M${outer.x} ${outer.y} C${cx + side * 12} ${top - 1} ${cx - side * 7} ${top - 1.6} ${inner.x} ${inner.y} C${cx - side * 8} ${bottom + 1.8} ${cx + side * 11} ${bottom + 1.2} ${outer.x} ${outer.y} Z`
  // 위 속눈썹: 눈꼬리 쪽이 길게 올라간 날카로운 눈매 (츠리메)
  const lash = `M${outer.x + side * 5} ${outer.y - 4.6} L${outer.x} ${outer.y} C${cx + side * 12} ${top - 1} ${cx - side * 7} ${top - 1.6} ${inner.x} ${inner.y}`
  const flicks = `M${outer.x - side * 2} ${outer.y - 3.4} l${side * 4.4} ${-3.2} M${outer.x - side * 6} ${top + 1.4} l${side * 3.6} ${-3.6}`
  const crease = `M${cx + side * 16} ${top - 5} C${cx + side * 7} ${top - 9.6} ${cx - side * 7} ${top - 9.2} ${cx - side * 13} ${top - 3}`
  const lower = `M${cx + side * 15} ${bottom - 0.8} C${cx + side * 6} ${bottom + 2} ${cx - side * 4} ${bottom + 1.8} ${cx - side * 12} ${inner.y + 1}`
  const ix = cx - side * 1.2 + r.gazeX * 4.6
  const iy = 138.6 + r.gazeY * 2.6
  return { white, lash, flicks, crease, lower, ix, iy, closed: lid < 0.16 }
}
const eyeL = computed(() => eye(124, -1))
const eyeR = computed(() => eye(176, 1))
const closedShape = computed(() => expr.value.closed)

function brow(cx: number, side: -1 | 1) {
  const lift = r.browLift + (side === 1 ? r.browArch : -r.browArch * 0.3)
  const tilt = r.browTilt * (side === 1 ? 1 : -1)
  return `translate(0 ${num(-lift)}) rotate(${num(tilt)} ${cx} 114)`
}
const browLT = computed(() => brow(124, -1))
const browRT = computed(() => brow(176, 1))

const mouthShape = computed<MouthShape>(() => expr.value.mouth)
const mouth = computed(() => mouthPaths(mouthShape.value, r.mouth))

const armL = computed(() => sleeve(r.shoulderL, r.elbowL, r.wristL))
const armR = computed(() => sleeve(r.shoulderR, r.elbowR, r.wristR))
const handL = computed(() => handPaths(g.value.left.hand))
const handR = computed(() => handPaths(g.value.right.hand))
const handT = (h: { x: number, y: number, angle: number }, twist = 0, mirror = false) =>
  `translate(${num(h.x)} ${num(h.y)}) rotate(${num(h.angle - 90 + twist)})${mirror ? ' scale(-1 1)' : ''}`
const frontArm = computed(() => g.value.front ?? 'right')

/** 소품은 오른손(화면 오른쪽)에. 찻잔·꽃다발·선물은 두 손 사이 */
const between = computed(() => ({ x: (r.wristL.x + r.wristR.x) / 2, y: (r.wristL.y + r.wristR.y) / 2 }))
const fanAim = computed(() => {
  const id = g.value.id
  const pivot = armR.value.hand
  const target = id === 'fanPoint' ? { x: pivot.x + 30, y: pivot.y - 60 } : { x: 146, y: 168 }
  return { pivot, angle: Math.atan2(target.y - pivot.y, target.x - pivot.x) }
})
/** 양산: 손에서 머리 위 오른쪽으로 비스듬히 */
const parasol = computed(() => {
  const hand = armR.value.hand
  // 어깨에 걸쳐 머리 옆 뒤로 기울인다 (머리 위로 세우면 그림 밖으로 나간다)
  const top = { x: hand.x + 70, y: hand.y - 236 }
  return { hand, top, shaft: `M${num(hand.x)} ${num(hand.y + 14)} L${num(top.x)} ${num(top.y)}`, front: `M${num(hand.x)} ${num(hand.y + 14)} L${num(hand.x + (top.x - hand.x) * 0.22)} ${num(hand.y + (top.y - hand.y) * 0.22)}` }
})
const fanOpen = computed(() => fanOpenPaths(fanAim.value.pivot, fanAim.value.angle, Math.max(0.05, r.fan)))
const fanClosed = computed(() => fanClosedPath(fanAim.value.pivot, fanAim.value.angle))

// 귀걸이는 고개를 따라 흔들린다
const earringL = computed(() => `rotate(${num(-r.roll * 1.6 + r.sideSwayL * 0.8)} 100 166)`)
const earringR = computed(() => `rotate(${num(-r.roll * 1.6 + r.sideSwayR * 0.5)} 200 166)`)

function touch(id: 'pat' | 'poke') {
  if (props.interactive)
    emit('touch', id)
}
</script>

<template>
  <div ref="root" class="portrait" :class="[`mood-${mood}`, { still }]">
    <SceneBackdrop :scene="scene" :still="still" />
    <svg viewBox="0 0 300 390" role="img" :aria-label="`카리나 말포이 (${mood})`">
      <defs>
        <radialGradient id="kp-skin" cx="0.42" cy="0.36" r="0.78">
          <stop offset="0" stop-color="#fff4ec" />
          <stop offset="0.55" stop-color="#f9e3d5" />
          <stop offset="1" stop-color="#e9c4b0" />
        </radialGradient>
        <linearGradient id="kp-neck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d7a995" />
          <stop offset="0.45" stop-color="#ecc9b7" />
          <stop offset="1" stop-color="#f4dacb" />
        </linearGradient>
        <linearGradient id="kp-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fdfaf2" />
          <stop offset="0.5" stop-color="#efe6d2" />
          <stop offset="1" stop-color="#cfc2a5" />
        </linearGradient>
        <linearGradient id="kp-hair-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e4dac3" />
          <stop offset="1" stop-color="#a8997c" />
        </linearGradient>
        <linearGradient id="kp-hair-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#7e6f55" stop-opacity="0.55" />
          <stop offset="0.25" stop-color="#7e6f55" stop-opacity="0" />
          <stop offset="0.75" stop-color="#7e6f55" stop-opacity="0" />
          <stop offset="1" stop-color="#7e6f55" stop-opacity="0.6" />
        </linearGradient>
        <linearGradient :id="`${uid}-rim`" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" :stop-color="rim" stop-opacity="0.5" />
          <stop offset="0.12" :stop-color="rim" stop-opacity="0" />
          <stop offset="0.8" :stop-color="rim" stop-opacity="0" />
          <stop offset="1" :stop-color="rim" stop-opacity="0.95" />
        </linearGradient>
        <linearGradient id="kp-face-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#d79f8c" stop-opacity="0.18" />
          <stop offset="0.35" stop-color="#d79f8c" stop-opacity="0" />
          <stop offset="0.7" stop-color="#d79f8c" stop-opacity="0" />
          <stop offset="1" stop-color="#c98a78" stop-opacity="0.45" />
        </linearGradient>
        <linearGradient id="kp-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.3" stop-color="#fffdf4" stop-opacity="0.9" />
          <stop offset="0.7" stop-color="#fffdf4" stop-opacity="0.9" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="kp-curl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fffdf7" />
          <stop offset="0.45" stop-color="#ece2cc" />
          <stop offset="1" stop-color="#b9aa8a" />
        </linearGradient>
        <linearGradient id="kp-robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a3a31" />
          <stop offset="0.5" stop-color="#18221d" />
          <stop offset="1" stop-color="#0c1110" />
        </linearGradient>
        <linearGradient id="kp-sleeve" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#2c3c33" />
          <stop offset="1" stop-color="#121a16" />
        </linearGradient>
        <linearGradient id="kp-blouse" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fffdf9" />
          <stop offset="1" stop-color="#d9d2c6" />
        </linearGradient>
        <linearGradient id="kp-iris" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#36404b" />
          <stop offset="0.55" stop-color="#6c7b88" />
          <stop offset="1" stop-color="#c3d0d8" />
        </linearGradient>
        <radialGradient id="kp-emerald" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#b6ffd8" />
          <stop offset="0.35" stop-color="#2fae74" />
          <stop offset="1" stop-color="#0a3a25" />
        </radialGradient>
        <linearGradient id="kp-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.5" stop-color="#aab3b9" />
          <stop offset="1" stop-color="#eef2f4" />
        </linearGradient>
        <radialGradient id="kp-blush">
          <stop offset="0" stop-color="#f28d9c" stop-opacity="0.85" />
          <stop offset="1" stop-color="#f28d9c" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="kp-bang-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c98e7a" stop-opacity="0.45" />
          <stop offset="1" stop-color="#c98e7a" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="kp-fan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2d5c45" />
          <stop offset="1" stop-color="#101a15" />
        </linearGradient>
        <linearGradient id="kp-gloom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4b4f8a" stop-opacity="0.55" />
          <stop offset="1" stop-color="#4b4f8a" stop-opacity="0" />
        </linearGradient>
        <radialGradient id="kp-under">
          <stop offset="0" stop-color="#000" stop-opacity="0.5" />
          <stop offset="1" stop-color="#000" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 땅에 드리운 그림자 -->
      <ellipse cx="150" cy="392" rx="120" ry="18" fill="url(#kp-under)" />

      <!-- 양산 (머리 뒤) -->
      <g v-if="prop === 'parasol'" class="prop-parasol">
        <path :d="parasol.shaft" stroke="#3b2a1c" stroke-width="2.6" stroke-linecap="round" />
        <g :transform="`translate(${num(parasol.top.x)} ${num(parasol.top.y)}) rotate(26)`">
          <path d="M-96 34 C-80 -14 80 -14 96 34 Z" fill="#fbf8f1" opacity="0.95" />
          <path d="M-96 34 C-80 -14 80 -14 96 34" fill="none" stroke="#d9d1c2" stroke-width="1" />
          <path d="M0 -4 L-96 34 M0 -4 L-48 32 M0 -4 L0 30 M0 -4 L48 32 M0 -4 L96 34" stroke="#d7cfbf" stroke-width="0.9" />
          <path d="M-96 34 Q-72 46 -48 32 Q-24 44 0 30 Q24 44 48 32 Q72 46 96 34" fill="#fbf8f1" stroke="#1f5a3d" stroke-width="2" />
          <path d="M-90 40 Q-72 50 -48 38 Q-24 50 0 36 Q24 50 48 38 Q72 50 90 40" fill="none" stroke="#d9d1c2" stroke-width="1" stroke-dasharray="1.6 2.4" />
          <circle cy="-6" r="3" fill="url(#kp-silver)" />
        </g>
      </g>

      <!-- 뒷머리 -->
      <g :transform="headT">
        <g :transform="backT">
          <path :d="backHairD" fill="url(#kp-hair-back)" />
          <path :d="backHairD" fill="url(#kp-hair-edge)" />
          <path d="M96 60 C80 140 78 240 70 380 M118 40 C102 140 100 260 96 380 M182 40 C198 140 200 260 204 380 M204 60 C220 140 222 240 230 380 M80 110 C72 200 66 300 58 380 M220 110 C228 200 234 300 242 380" stroke="#9c8d70" stroke-width="1.2" fill="none" opacity="0.45" />
          <path d="M88 120 C82 200 80 280 76 360 M212 120 C218 200 220 280 224 360" stroke="#fffaf0" stroke-width="2.4" fill="none" opacity="0.35" stroke-linecap="round" />
          <path :d="backHairD" fill="none" :stroke="`url(#${uid}-rim)`" stroke-width="3.2" />
        </g>
      </g>

      <!-- 몸: 로브, 블라우스, 깃, 브로치 -->
      <g :transform="bodyT">
        <path d="M138 186 L136 232 Q150 242 164 232 L162 186 Z" fill="url(#kp-neck)" />
        <path d="M54 274 C64 252 104 240 128 236 L172 236 C196 240 236 252 246 274 C256 304 258 352 260 392 L40 392 C42 352 44 304 54 274 Z" fill="url(#kp-robe)" />
        <!-- 어깨의 빛 -->
        <path d="M62 266 C78 252 104 244 124 241" stroke="#4d6a5a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.6" />
        <path d="M238 266 C222 252 196 244 176 241" stroke="#4d6a5a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.45" />
        <!-- 로브 주름과 장소의 빛 -->
        <path d="M70 300 C76 330 78 360 76 392 M232 300 C226 330 222 360 224 392 M96 320 C100 350 100 372 98 392 M204 320 C200 350 200 372 202 392" stroke="#070b09" stroke-width="2.2" fill="none" opacity="0.55" stroke-linecap="round" />
        <path d="M84 310 C88 340 88 366 86 392 M216 310 C212 340 212 366 214 392" stroke="#3d5a4b" stroke-width="1.4" fill="none" opacity="0.5" stroke-linecap="round" />
        <path d="M54 274 C64 252 104 240 128 236 M172 236 C196 240 236 252 246 274 C256 304 258 352 260 392" fill="none" :stroke="`url(#${uid}-rim)`" stroke-width="3" />
        <!-- 블라우스 -->
        <path d="M130 236 C126 276 122 334 118 392 L182 392 C178 334 174 276 170 236 Z" fill="url(#kp-blouse)" />
        <!-- 로브 안감(초록)과 은색 테두리 -->
        <path d="M128 236 C122 280 112 340 106 392 L118 392 C122 334 126 276 130 236 Z" fill="#1f5a3d" />
        <path d="M172 236 C178 280 188 340 194 392 L182 392 C178 334 174 276 170 236 Z" fill="#1f5a3d" />
        <path d="M128 236 C122 280 112 340 106 392 M172 236 C178 280 188 340 194 392" stroke="url(#kp-silver)" stroke-width="1.6" fill="none" />
        <!-- 은실 덩굴 자수 -->
        <g stroke="#c9d2d6" stroke-width="0.9" fill="none" opacity="0.75" stroke-linecap="round">
          <path d="M124 262 q-6 4 -3 9 q4 3 6 -2 M120 292 q-6 4 -3 9 q4 3 6 -2 M115 324 q-6 4 -3 9 q4 3 6 -2 M111 356 q-6 4 -3 9 q4 3 6 -2" />
          <path d="M176 262 q6 4 3 9 q-4 3 -6 -2 M180 292 q6 4 3 9 q-4 3 -6 -2 M185 324 q6 4 3 9 q-4 3 -6 -2 M189 356 q6 4 3 9 q-4 3 -6 -2" />
        </g>
        <!-- 높은 깃 -->
        <path d="M134 206 Q150 214 166 206 L168 232 Q150 242 132 232 Z" fill="url(#kp-blouse)" stroke="#cfc6b8" stroke-width="0.8" />
        <path d="M133 230 Q150 240 167 230" stroke="#bdb3a4" stroke-width="0.8" fill="none" />
        <!-- 자보(레이스 주름) -->
        <g fill="#fbf8f2" stroke="#cbc1b2" stroke-width="0.7">
          <path d="M150 238 C138 246 132 258 138 268 C142 262 146 262 150 266 C154 262 158 262 162 268 C168 258 162 246 150 238 Z" />
          <path d="M150 258 C140 266 136 278 141 288 C145 282 147 282 150 286 C153 282 155 282 159 288 C164 278 160 266 150 258 Z" />
          <path d="M150 278 C143 286 140 296 144 304 C147 299 148 299 150 302 C152 299 153 299 156 304 C160 296 157 286 150 278 Z" />
        </g>
        <!-- 에메랄드 브로치 -->
        <ellipse cx="150" cy="240" rx="8.5" ry="9.5" fill="url(#kp-silver)" />
        <ellipse cx="150" cy="240" rx="6.2" ry="7.2" fill="url(#kp-emerald)" />
        <ellipse cx="147.8" cy="236.6" rx="1.8" ry="2.4" fill="#fff" opacity="0.8" />
        <path d="M143 247 Q150 254 157 247" stroke="url(#kp-silver)" stroke-width="1.4" fill="none" />
        <!-- 겨울: 초록·은색 줄무늬 목도리 -->
        <g v-if="look.scarf" class="scarf">
          <path d="M126 210 C126 236 174 236 174 210 L178 226 C178 250 122 250 122 226 Z" fill="#1f5a3d" stroke="#0e2a1d" stroke-width="0.8" />
          <path d="M124 220 C130 238 170 238 176 220" stroke="#c9d2d6" stroke-width="3" fill="none" />
          <path d="M132 236 C128 262 124 290 122 316 L144 318 C144 292 146 264 150 240 Z" fill="#1f5a3d" stroke="#0e2a1d" stroke-width="0.8" />
          <path d="M129 258 L148 260 M126 282 L146 284 M124 304 L145 306" stroke="#c9d2d6" stroke-width="3.4" />
          <path d="M123 316 l2 7 M128 317 l1 7 M133 317 l0 7 M138 318 l-1 7 M143 318 l-2 6" stroke="#1f5a3d" stroke-width="1.6" stroke-linecap="round" />
        </g>
      </g>

      <!-- 머리 -->
      <g :transform="headT">
        <!-- 얼굴 -->
        <g :transform="faceT">
          <path d="M98 118 C98 92 120 70 150 70 C180 70 202 92 202 118 C202 146 196 168 184 184 C174 196 160 203 150 204 C140 203 126 196 116 184 C104 168 98 146 98 118 Z" fill="url(#kp-skin)" />
          <!-- 빛은 왼쪽 위에서: 오른쪽 볼과 턱이 조금 어둡다 -->
          <path d="M98 118 C98 92 120 70 150 70 C180 70 202 92 202 118 C202 146 196 168 184 184 C174 196 160 203 150 204 C140 203 126 196 116 184 C104 168 98 146 98 118 Z" fill="url(#kp-face-shade)" />
          <!-- 턱선 그림자, 앞머리 그림자 -->
          <path d="M116 184 C126 196 140 203 150 204 C160 203 174 196 184 184 C176 198 162 208 150 208 C138 208 124 198 116 184 Z" fill="#d9a994" opacity="0.35" />
          <path d="M100 104 C120 96 180 96 200 104 L200 132 C180 120 120 120 100 132 Z" fill="url(#kp-bang-shadow)" />
          <!-- 볼 -->
          <ellipse cx="116" cy="164" rx="19" ry="10" fill="url(#kp-blush)" :opacity="num(r.blush)" />
          <ellipse cx="184" cy="164" rx="19" ry="10" fill="url(#kp-blush)" :opacity="num(r.blush)" />
          <g v-if="expr.hatch" stroke="#e0607a" stroke-width="1.1" stroke-linecap="round" opacity="0.75">
            <path d="M106 166 L110 159 M111 167 L115 160 M116 168 L120 161" />
            <path d="M180 168 L184 161 M185 167 L189 160 M190 166 L194 159" />
          </g>
          <!-- 우울 (세로줄) -->
          <g v-if="has('gloom')">
            <path d="M100 96 C120 90 180 90 200 96 L200 150 L100 150 Z" fill="url(#kp-gloom)" opacity="0.7" />
            <path d="M118 102 L118 118 M126 100 L126 122 M174 100 L174 122 M182 102 L182 118" stroke="#6a6db0" stroke-width="0.7" opacity="0.35" stroke-linecap="round" />
          </g>

          <!-- 눈썹·눈·코·입 -->
          <g :transform="featT">
            <path :transform="browLT" d="M106 116 C114 110.4 126 109.6 139 112.4" stroke="#bfa877" stroke-width="2.6" stroke-linecap="round" fill="none" />
            <path :transform="browRT" d="M194 116 C186 110.4 174 109.6 161 112.4" stroke="#bfa877" stroke-width="2.6" stroke-linecap="round" fill="none" />

            <template v-for="(e, i) in [eyeL, eyeR]" :key="i">
              <template v-if="closedShape === 'happy'">
                <path :d="i ? 'M160 142 Q177 128 195 138' : 'M105 138 Q123 128 140 142'" stroke="#2c2320" stroke-width="2.8" stroke-linecap="round" fill="none" />
              </template>
              <template v-else-if="closedShape === 'smug' || e.closed">
                <path :d="i ? 'M160 140 Q176 145 195 134' : 'M105 134 Q124 145 140 140'" stroke="#2c2320" stroke-width="2.8" stroke-linecap="round" fill="none" />
                <path :d="i ? 'M195 134 L199.6 130.4' : 'M105 134 L100.4 130.4'" stroke="#2c2320" stroke-width="2.2" stroke-linecap="round" />
              </template>
              <template v-else>
                <path :d="e.crease" stroke="#c99d8a" stroke-width="1" fill="none" opacity="0.8" />
                <clipPath :id="`${uid}-eye-${i}`"><path :d="e.white" /></clipPath>
                <path :d="e.white" fill="#fbfbfd" />
                <g :clip-path="`url(#${uid}-eye-${i})`">
                  <!-- 위 눈꺼풀 그림자 -->
                  <ellipse :cx="num(e.ix)" :cy="num(e.iy)" rx="11" ry="12" fill="url(#kp-iris)" stroke="#2b333c" stroke-width="1.1" />
                  <ellipse :cx="num(e.ix)" :cy="num(e.iy)" rx="7" ry="7.8" fill="none" stroke="#56636f" stroke-width="0.6" opacity="0.7" />
                  <path :d="irisStreaks(e.ix, e.iy)" stroke="#d6e2ea" stroke-width="0.6" opacity="0.35" />
                  <ellipse :cx="num(e.ix)" :cy="num(e.iy + 0.6)" :rx="num(4 * expr.pupil)" :ry="num(5.4 * expr.pupil)" fill="#1b2026" />
                  <ellipse :cx="num(e.ix)" :cy="num(e.iy + 6.4)" rx="6.6" ry="3" fill="#dce9f1" opacity="0.5" />
                  <!-- 위 눈꺼풀 그림자 -->
                  <path :d="e.white" fill="none" stroke="#6f7788" stroke-width="5" opacity="0.28" :transform="`translate(0 -1.6)`" />
                  <path v-if="heartEyes" :d="`M${num(e.ix - 4)} ${num(e.iy - 2.4)} c-3.6 -2.6 -4.2 -6.4 -1.6 -6.8 c1.2 -0.2 1.6 0.8 1.6 1.4 c0 -0.6 0.4 -1.6 1.6 -1.4 c2.6 0.4 2 4.2 -1.6 6.8 Z`" fill="#ffd6e4" stroke="#fff" stroke-width="0.8" />
                  <ellipse v-else :cx="num(e.ix - 4)" :cy="num(e.iy - 4.6)" rx="3.4" ry="2.9" fill="#fff" />
                  <circle :cx="num(e.ix + 4.2)" :cy="num(e.iy + 3.6)" r="1.4" fill="#fff" opacity="0.9" />
                  <path v-if="expr.sparkle" :d="`M${num(e.ix + 3)} ${num(e.iy - 6.4)} l1.1 2.6 2.6 1.1 -2.6 1.1 -1.1 2.6 -1.1 -2.6 -2.6 -1.1 2.6 -1.1 Z`" fill="#fff" />
                </g>
                <path :d="e.lash" stroke="#2c2320" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <path :d="e.flicks" stroke="#2c2320" stroke-width="1.6" stroke-linecap="round" fill="none" />
                <path :d="e.lower" stroke="#a88473" stroke-width="0.9" stroke-linecap="round" fill="none" opacity="0.8" />
              </template>
            </template>
            <!-- 눈물 -->
            <g v-if="has('tear')" class="fx-tear">
              <path d="M107 140 C104 146 103 150 106 152 C109 152 109 147 107 140 Z" fill="#cfe9ff" stroke="#8cb7dd" stroke-width="0.6" />
            </g>

            <!-- 코 -->
            <path d="M151.4 150 C150.6 155 149.8 158 148 160.4" stroke="#d6a693" stroke-width="1.1" stroke-linecap="round" fill="none" />
            <path d="M147 162 Q149.6 163.4 152.6 162.2" stroke="#c98e7c" stroke-width="1" stroke-linecap="round" fill="none" />
            <circle cx="151.6" cy="157.4" r="0.9" fill="#fff" opacity="0.8" />

            <!-- 입 -->
            <path v-if="mouth.inner" :d="mouth.inner" fill="#7a2e3b" />
            <path v-if="mouth.tongue" :d="mouth.tongue" fill="#e07d8a" />
            <path :d="mouth.line" stroke="#a9505f" stroke-width="1.7" stroke-linecap="round" fill="none" />
            <path :d="mouth.lip" stroke="#e9a3ad" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.85" />
            <ellipse v-if="!mouth.inner" cx="151.6" cy="182.4" rx="1.6" ry="0.7" fill="#fff" opacity="0.6" />
            <path d="M148.4 170.4 Q150 172 151.6 170.4" stroke="#dcab9a" stroke-width="0.7" fill="none" opacity="0.6" />
          </g>
        </g>

        <!-- 귀걸이 (에메랄드 물방울) -->
        <g :transform="earringL">
          <path d="M100 166 L100 172" stroke="url(#kp-silver)" stroke-width="1.1" />
          <path d="M100 172 C96.6 176 96.6 180 100 181.4 C103.4 180 103.4 176 100 172 Z" fill="url(#kp-emerald)" />
        </g>
        <g :transform="earringR">
          <path d="M200 166 L200 172" stroke="url(#kp-silver)" stroke-width="1.1" />
          <path d="M200 172 C196.6 176 196.6 180 200 181.4 C203.4 180 203.4 176 200 172 Z" fill="url(#kp-emerald)" />
        </g>

        <!-- 옆머리 세로 롤 -->
        <g v-for="(lock, i) in [lockL, lockR]" :key="`lock-${i}`" :transform="layer(5, 3)">
          <path :d="lock.strand" fill="url(#kp-hair)" />
          <path :d="lock.strandShade" stroke="#c9bb9a" stroke-width="1.2" fill="none" />
          <path :d="lock.outline" fill="url(#kp-curl)" stroke="#b5a582" stroke-width="0.8" stroke-linejoin="round" />
          <g v-for="(band, k) in lock.bands" :key="k">
            <path :d="band.shade" stroke="#a19073" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.55" />
            <path :d="band.shine" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.8" />
          </g>
        </g>

        <!-- 앞머리: 정수리를 덮는 머리와 이마로 흘러내린 다발들 -->
        <g :transform="bangsT">
          <path d="M70 128 C62 64 100 22 150 20 C200 22 238 64 230 128 C226 100 214 80 196 70 C176 62 124 62 104 70 C86 80 74 100 70 128 Z" fill="url(#kp-hair)" />
          <path v-for="(c, k) in clumps" :key="k" :d="c.d" fill="url(#kp-hair)" />
          <path v-for="(c, k) in clumps" :key="`i${k}`" :d="c.inner" stroke="#c9bc9b" stroke-width="1.1" fill="none" stroke-linecap="round" />
          <g stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.7">
            <path d="M88 84 l-3 12" /><path d="M112 78 l-3 14" /><path d="M140 76 l-1.6 12" /><path d="M176 78 l2 11" /><path d="M200 82 l3 12" />
          </g>
          <path d="M70 128 C62 64 100 22 150 20 C200 22 238 64 230 128" stroke="#b9aa86" stroke-width="1" fill="none" />
          <!-- 머리결 -->
          <path d="M166 24 C142 34 122 48 108 66 M166 24 C186 34 206 50 218 72 M150 24 C120 34 98 50 84 78" stroke="#dcd1b5" stroke-width="0.9" fill="none" opacity="0.8" />
          <!-- 천사의 고리 (머리 윗부분의 반짝임) -->
          <path d="M90 58 C114 46 188 46 212 58 C190 52 112 52 90 58 Z" fill="url(#kp-ring)" opacity="0.55" />
          <g stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.75">
            <path d="M100 55 l8 -3" /><path d="M118 49 l10 -2" /><path d="M172 47 l10 2" /><path d="M192 51 l8 3" />
          </g>
          <!-- 머리에 내려앉은 눈 -->
          <g v-if="look.snow" fill="#ffffff" opacity="0.9">
            <circle cx="104" cy="44" r="2.2" /><circle cx="128" cy="30" r="1.8" /><circle cx="160" cy="26" r="2.4" /><circle cx="188" cy="34" r="1.6" /><circle cx="212" cy="50" r="2" /><circle cx="84" cy="70" r="1.6" />
          </g>
          <!-- 할로윈: 리본 대신 작은 마녀 모자 -->
          <g v-if="look.witchHat" transform="translate(202 44) rotate(16)">
            <ellipse cx="0" cy="6" rx="30" ry="7" fill="#151a17" stroke="#2b332e" stroke-width="0.8" />
            <path d="M-16 5 C-12 -12 -4 -26 8 -40 C10 -30 14 -20 16 5 Z" fill="#1a201c" />
            <path d="M8 -40 C14 -42 20 -38 22 -32" stroke="#1a201c" stroke-width="4" stroke-linecap="round" fill="none" />
            <path d="M-15 0 C-6 3 8 3 16 0 L16 -5 C8 -2 -6 -2 -14 -5 Z" fill="#1f5a3d" />
            <rect x="-2" y="-5" width="6" height="6" rx="1" fill="none" stroke="url(#kp-silver)" stroke-width="1.4" />
          </g>
          <!-- 리본 장식 -->
          <g v-else transform="translate(208 54) rotate(18)">
            <path d="M0 0 C-14 -12 -24 -6 -20 4 C-17 10 -8 6 0 0 Z" fill="#163d2b" stroke="#0b2016" stroke-width="0.8" />
            <path d="M0 0 C14 -12 24 -6 20 4 C17 10 8 6 0 0 Z" fill="#1d4d36" stroke="#0b2016" stroke-width="0.8" />
            <path d="M-2 2 L-8 20 L-3 17 L0 22 L2 3 Z" fill="#163d2b" />
            <circle r="3.6" fill="url(#kp-emerald)" stroke="url(#kp-silver)" stroke-width="1" />
            <!-- 크리스마스: 호랑가시 -->
            <g v-if="look.holly" transform="translate(-6 -10)">
              <path d="M0 0 C-6 -6 -14 -4 -16 2 C-12 2 -10 6 -6 4 C-4 6 -2 4 0 0 Z" fill="#1f6b3a" />
              <path d="M0 0 C6 -6 14 -4 16 2 C12 2 10 6 6 4 C4 6 2 4 0 0 Z" fill="#287a45" />
              <circle cx="-2" cy="-2" r="2.6" fill="#c8202e" /><circle cx="2.4" cy="-3.4" r="2.4" fill="#d6303a" /><circle cx="0.6" cy="1" r="2.2" fill="#b81c28" />
            </g>
          </g>
        </g>

        <!-- 머리 주변 효과 -->
        <MoeEffects part="head" :effects="effects" :yaw="r.yaw" />
      </g>

      <!-- 빗자루 (손 뒤): 비스듬히 세워 든다 -->
      <g v-if="prop === 'broom'" class="prop-broom">
        <path :d="`M${num(armR.hand.x + 34)} 70 L${num(armR.hand.x - 14)} 410`" stroke="#4a2f19" stroke-width="8" stroke-linecap="round" />
        <path :d="`M${num(armR.hand.x + 32)} 74 L${num(armR.hand.x - 15)} 410`" stroke="#a87444" stroke-width="2.4" opacity="0.8" />
        <path :d="`M${num(armR.hand.x + 34)} 70 l1 -6`" stroke="url(#kp-silver)" stroke-width="7" stroke-linecap="round" />
        <path :d="`M${num(armR.hand.x + 6)} ${num(armR.hand.y - 22)} q-10 4 -16 -2 m16 2 q4 10 -2 16`" stroke="#2fae74" stroke-width="2.4" fill="none" stroke-linecap="round" />
      </g>
      <!-- 양산 손잡이 (손 앞을 지나는 부분) -->
      <path v-if="prop === 'parasol'" :d="parasol.front" stroke="#3b2a1c" stroke-width="2.6" stroke-linecap="round" />

      <!-- 팔과 소품 -->
      <template v-for="side in (frontArm === 'left' ? ['right', 'left'] : ['left', 'right'])" :key="side">
        <g :class="`arm arm-${side}`">
          <template v-for="a in [side === 'left' ? armL : armR]" :key="'a'">
            <path :d="a.upper" fill="url(#kp-sleeve)" />
            <path :d="a.fore" fill="url(#kp-sleeve)" />
            <path :d="a.sheen" stroke="#557565" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.5" />
            <ellipse :cx="num(a.cuff.cx)" :cy="num(a.cuff.cy)" :rx="a.cuff.rx" :ry="a.cuff.ry" :transform="`rotate(${num(a.cuff.rot)} ${num(a.cuff.cx)} ${num(a.cuff.cy)})`" fill="#1f5a3d" stroke="url(#kp-silver)" stroke-width="1.4" />
            <path :d="a.lace" stroke="#f3efe6" stroke-width="1.6" fill="none" opacity="0.9" />
            <g v-if="(side === 'left' ? handL : handR)" :transform="handT(a.hand, (side === 'left' ? g.left.twist : g.right.twist) ?? 0, side === 'left')">
              <path :d="(side === 'left' ? handL : handR)!.glove" fill="#faf8f3" stroke="#b5ad9f" stroke-width="0.9" stroke-linejoin="round" />
              <path :d="(side === 'left' ? handL : handR)!.lines" stroke="#c9c1b4" stroke-width="0.8" stroke-linecap="round" fill="none" />
            </g>
          </template>
        </g>
      </template>

      <!-- 소품 -->
      <g v-if="prop === 'fanOpen' || (r.fan > 0.06 && prop !== 'fanClosed')" class="prop-fan">
        <path :d="fanOpen.leaf" fill="url(#kp-fan)" stroke="#0d1612" stroke-width="0.8" opacity="0.96" />
        <path :d="fanOpen.band" stroke="#cdd6d2" stroke-width="3" stroke-dasharray="1.4 2.6" fill="none" opacity="0.7" />
        <path :d="fanOpen.ribs" stroke="#5f8572" stroke-width="0.7" opacity="0.8" />
        <path :d="fanOpen.scallops" stroke="#e8ece9" stroke-width="1.4" fill="none" />
        <path :d="fanOpen.handle" stroke="#0d1612" stroke-width="4" stroke-linecap="round" />
      </g>
      <g v-else-if="prop === 'fanClosed'" class="prop-fan">
        <path :d="fanClosed.body" fill="url(#kp-fan)" stroke="#0d1612" stroke-width="0.8" />
        <path :d="fanClosed.edge" stroke="#cdd6d2" stroke-width="0.8" />
        <path :d="fanClosed.tassel" stroke="#2fae74" stroke-width="2.2" stroke-linecap="round" fill="none" />
      </g>
      <g v-else-if="prop === 'teacup'" :transform="`translate(${num(between.x)} ${num(between.y - 14)})`">
        <ellipse cx="0" cy="12" rx="26" ry="7" fill="#fbfaf7" stroke="#c8a85a" stroke-width="1.4" />
        <path d="M-15 -6 C-15 8 -8 13 0 13 C8 13 15 8 15 -6 Z" fill="#fdfcf9" stroke="#bfb6a6" stroke-width="0.8" />
        <path d="M-15 -1 C-12 3 12 3 15 -1" stroke="#1f5a3d" stroke-width="2.4" fill="none" />
        <ellipse cx="0" cy="-6" rx="15" ry="4" fill="#a8652e" stroke="#c8a85a" stroke-width="1.2" />
        <path d="M15 -2 C24 -3 24 8 13 7" stroke="#fdfcf9" stroke-width="3" fill="none" />
        <g class="fx-steam-tea" stroke="#fff" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round">
          <path d="M-5 -12 C-9 -18 -1 -22 -5 -30" /><path d="M5 -12 C1 -18 9 -22 5 -30" />
        </g>
      </g>
      <g v-else-if="prop === 'bouquet'" :transform="`translate(${num(between.x)} ${num(between.y - 18)})`">
        <path d="M-14 4 L0 40 L14 4 Z" fill="#efe6d3" stroke="#c8b89a" stroke-width="0.8" />
        <path d="M-20 -6 C-22 4 -12 8 -8 0 M20 -6 C22 4 12 8 8 0" fill="#2f6b45" />
        <g fill="#fffdf8" stroke="#d8d0c2" stroke-width="0.7">
          <circle cx="-9" cy="-4" r="8" /><circle cx="8" cy="-6" r="8.5" /><circle cx="0" cy="-15" r="8" />
        </g>
        <path d="M-12 -5 Q-9 -9 -6 -4 M5 -8 Q8 -12 11 -6 M-3 -16 Q0 -20 3 -15" stroke="#e3dccd" stroke-width="1.1" fill="none" />
        <g fill="#fff"><circle cx="-18" cy="-14" r="2.4" /><circle cx="-20" cy="-8" r="2.2" /><circle cx="18" cy="-16" r="2.4" /><circle cx="20" cy="-10" r="2.2" /></g>
      </g>
      <g v-else-if="prop === 'giftbox'" :transform="`translate(${num(between.x)} ${num(between.y - 16)})`">
        <rect x="-17" y="-10" width="34" height="24" rx="2" fill="#1f5a3d" stroke="#0e2a1d" stroke-width="0.8" />
        <rect x="-19" y="-15" width="38" height="7" rx="2" fill="#24694a" stroke="#0e2a1d" stroke-width="0.8" />
        <path d="M-2.5 -15 L2.5 -15 L2.5 14 L-2.5 14 Z" fill="url(#kp-silver)" />
        <path d="M0 -15 C-10 -26 -18 -20 -10 -15 Z M0 -15 C10 -26 18 -20 10 -15 Z" fill="url(#kp-silver)" stroke="#8d969c" stroke-width="0.6" />
      </g>

      <!-- 몸 주변 효과 -->
      <MoeEffects part="body" :effects="effects" :yaw="r.yaw" />

      <!-- 누를 수 있는 곳: 머리(쓰다듬기), 볼(콕) -->
      <g v-if="interactive" class="hit">
        <ellipse cx="150" cy="48" rx="70" ry="32" @click="touch('pat')"><title>머리 쓰다듬기</title></ellipse>
        <ellipse cx="116" cy="166" rx="16" ry="12" @click="touch('poke')"><title>볼 콕</title></ellipse>
        <ellipse cx="184" cy="166" rx="16" ry="12" @click="touch('poke')"><title>볼 콕</title></ellipse>
      </g>
    </svg>
    <div class="grain" aria-hidden="true" />
  </div>
</template>

<style scoped>
.portrait {
  position: relative;
  width: 100%;
  max-width: var(--portrait-max, 300px);
  aspect-ratio: 300 / 390;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 40px rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(255 255 255 / 0.08);
  isolation: isolate;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
/* 종이 결 + 가장자리 어둡게: 그림처럼 보이게 */
.grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 35%, transparent 55%, rgb(0 0 0 / 0.45) 100%),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.45 0 0 0 0 0.4 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  mix-blend-mode: soft-light;
  opacity: 0.55;
}
.hit ellipse { fill: transparent; cursor: pointer; }
.hit ellipse:hover { fill: rgb(255 255 255 / 0.06); }
.fx-tear { animation: tear-drip 2.6s ease-in 0.5s infinite; }
.still .fx-tear { animation: none; }
@keyframes tear-drip { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(18px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fx-tear { animation: none; } }
</style>
