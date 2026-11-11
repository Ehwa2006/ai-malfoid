// 초상화의 움직이는 부분을 SVG 경로로 그린다: 소매(두 마디 팔), 장갑 낀 손, 소품(부채·찻잔·꽃다발·선물 상자),
// 입 모양, 옆머리 세로 롤. 좌표계는 viewBox 300×390 (얼굴 중심 x=150, 눈 y=134, 턱 y=203).
import type { Point } from './motion'
import type { HandShape } from './gestures'
import type { MouthShape } from './expressions'

const f = (n: number) => (Math.round(n * 10) / 10).toString()
export const pt = (p: Point) => `${f(p.x)} ${f(p.y)}`
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k })
const unit = (a: Point): Point => {
  const l = Math.hypot(a.x, a.y) || 1
  return { x: a.x / l, y: a.y / l }
}
/** 왼쪽 법선 (화면 좌표에서 진행 방향의 왼쪽) */
const perp = (a: Point): Point => ({ x: -a.y, y: a.x })
export const deg = (rad: number) => (rad * 180) / Math.PI

export interface SleeveShape {
  /** 위팔 (어깨 → 팔꿈치) */
  upper: string
  /** 아래팔: 손목 쪽으로 넓어지는 종 모양 소매 */
  fore: string
  /** 소매 끝 */
  cuff: { cx: number, cy: number, rx: number, ry: number, rot: number }
  /** 소매 끝 레이스 */
  lace: string
  /** 소매 위의 빛 (팔 방향을 따라가는 밝은 줄) */
  sheen: string
  /** 손이 놓일 자리와 방향 (도, 손가락이 향하는 쪽) */
  hand: { x: number, y: number, angle: number }
}

/** 소매 끝 반지름 (넓게 퍼지는 로브 소매) */
const CUFF = 16

/** 어깨·팔꿈치·손목으로 로브 소매를 그린다 */
export function sleeve(shoulder: Point, elbow: Point, wrist: Point): SleeveShape {
  const d1 = unit(sub(elbow, shoulder))
  const n1 = perp(d1)
  const d2 = unit(sub(wrist, elbow))
  const n2 = perp(d2)
  const s1 = add(shoulder, mul(n1, 17))
  const s2 = add(shoulder, mul(n1, -17))
  const e1 = add(elbow, mul(n1, 13))
  const e2 = add(elbow, mul(n1, -13))
  const upper = `M${pt(s1)} Q${pt(add(mul(add(s1, e1), 0.5), mul(n1, 2)))} ${pt(e1)} A13 13 0 0 1 ${pt(e2)} Q${pt(add(mul(add(s2, e2), 0.5), mul(n1, -2)))} ${pt(s2)} Z`

  const w = add(wrist, mul(d2, 2))
  const f1 = add(elbow, mul(n2, 12))
  const f2 = add(elbow, mul(n2, -12))
  const w1 = add(w, mul(n2, CUFF))
  const w2 = add(w, mul(n2, -CUFF))
  const mid = mul(add(elbow, w), 0.5)
  const fore = `M${pt(f1)} Q${pt(add(mid, mul(n2, 12)))} ${pt(w1)} L${pt(w2)} Q${pt(add(mid, mul(n2, -12)))} ${pt(f2)} Z`

  // 레이스: 소매 끝을 따라 작은 반원을 잇는다
  let lace = ''
  const steps = 7
  for (let i = 0; i < steps; i++) {
    const a = add(w, mul(n2, CUFF - (2 * CUFF * i) / steps))
    const b = add(w, mul(n2, CUFF - (2 * CUFF * (i + 1)) / steps))
    lace += `${i ? '' : `M${pt(a)} `}Q${pt(add(mul(add(a, b), 0.5), mul(d2, 5)))} ${pt(b)} `
  }

  const sheen = `M${pt(add(shoulder, mul(n1, 8)))} Q${pt(add(elbow, mul(n1, 7)))} ${pt(add(elbow, mul(n2, 6)))} L${pt(add(w, mul(n2, CUFF * 0.6)))}`

  return {
    upper,
    fore,
    cuff: { cx: w.x, cy: w.y, rx: CUFF, ry: 5.4, rot: deg(Math.atan2(n2.y, n2.x)) },
    lace,
    sheen,
    hand: { x: w.x - d2.x * 3, y: w.y - d2.y * 3, angle: deg(Math.atan2(d2.y, d2.x)) },
  }
}

export interface HandPaths {
  /** 장갑 (채움) */
  glove: string
  /** 손가락 사이 선, 주름 */
  lines: string
}

/** 손목을 원점, 손가락이 +y 쪽을 향하는 좌표에서 그린 흰 장갑 */
export function handPaths(shape: HandShape): HandPaths | null {
  switch (shape) {
    case 'hidden':
      return null
    case 'tips': // 소매 끝으로 손가락 끝만 빼꼼 (모에소데)
      return {
        glove: 'M-10 -2 C-11 6 -9 12 -5.5 12 C-3.2 12 -2.6 9.5 -2.4 8 C-2 12.4 2 13.4 3 9 C4 12.6 8 12.4 8.2 8 C10 10 11.4 7.6 10.6 3 L10 -2 Z',
        lines: 'M-2.4 8 L-2.6 3 M3 9 L3 4 M8.2 8 L8.4 4',
      }
    case 'open': // 손바닥을 보이며 손가락을 편다
      return {
        glove: 'M-9 -2 C-10 6 -10 10 -10.5 14 C-12 22 -13.5 27 -11 28 C-8.6 29 -7.6 24 -6.4 18.5 C-6.6 25 -6 31 -3 31 C0 31 -0.6 25 -0.4 19 C0 25 1 30 4 29.6 C7 29 6 23 5.4 18 C6.6 22 8.6 26 11 25 C13.4 24 11.6 19 10 15 C9.6 11 10.4 8 13.4 4 C16 1 13.6 -2 10.6 0 C9.6 1 9.4 -1 9 -2 Z',
        lines: 'M-6.4 18.5 L-6.6 13 M-0.4 19 L-0.6 13 M5.4 18 L5 12.6 M3 10 C5 9 7 9 9 10',
      }
    case 'hold': // 무언가를 쥔 손: 말아 쥔 네 손가락 마디와 엄지
      return {
        glove: 'M-9 -2 L-9.8 8.6 Q-10.6 12.4 -7.6 13 Q-6 16.2 -2.6 15.4 Q-0.6 17.8 2.6 16.2 Q5.2 17.6 7.4 14.8 Q10.4 13.4 10 9 L10.4 4 Q14.6 5.6 13.2 10.4 Q11.8 12.6 10 11 L9.6 -2 Z',
        lines: 'M-7.6 13 L-6.8 8.4 M-2.6 15.4 L-2.2 9.4 M2.6 16.2 L2.4 9.8 M7.4 14.8 L6.8 9.4 M10.4 4 Q11 7.4 10 11',
      }
    case 'point': // 검지만 편 손
      return {
        glove: 'M-10 -2 C-11.5 8 -10.5 14 -6.4 15.6 L-5.6 26 C-5.4 29.4 -1.4 29.4 -1.2 26 L-1.4 16.6 C2.4 17 6.6 16.6 8.4 14.6 C11.4 11.6 11.6 6 10 -2 Z',
        lines: 'M-1.4 16.6 C1 14 5 13.4 8 12 M-5.8 15.6 L-1.4 16.6',
      }
  }
}

/** 펼친 부채: 손 위치에서 aim 쪽으로 펼친다 (open: 0~1) */
export function fanOpenPaths(pivot: Point, aim: number, open: number) {
  const r = 62
  const spread = (Math.PI / 180) * 70 * open
  const at = (a: number, rr = r): Point => ({ x: pivot.x + Math.cos(a) * rr, y: pivot.y + Math.sin(a) * rr })
  const a0 = aim - spread
  const a1 = aim + spread
  const leaf = `M${pt(at(a0, 10))} L${pt(at(a0))} A${r} ${r} 0 0 1 ${pt(at(a1))} L${pt(at(a1, 10))} A10 10 0 0 0 ${pt(at(a0, 10))} Z`
  let ribs = ''
  let scallops = ''
  const n = 12
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    ribs += `M${pt(at(a, 4))} L${pt(at(a, r - 2))} `
    if (i < n) {
      const b = a0 + ((a1 - a0) * (i + 1)) / n
      scallops += `${i ? '' : `M${pt(at(a))} `}Q${pt(at((a + b) / 2, r + 6))} ${pt(at(b))} `
    }
  }
  // 레이스 무늬 띠
  const band = `M${pt(at(a0, r - 13))} A${r - 13} ${r - 13} 0 0 1 ${pt(at(a1, r - 13))}`
  return { leaf, ribs, scallops, band, handle: `M${pt(pivot)} L${pt(at(aim + Math.PI, 9))}` }
}

/** 접은 부채 */
export function fanClosedPath(pivot: Point, aim: number) {
  const d = { x: Math.cos(aim), y: Math.sin(aim) }
  const n = perp(d)
  const tip = add(pivot, mul(d, 54))
  const back = add(pivot, mul(d, -8))
  return {
    body: `M${pt(add(back, mul(n, 2.4)))} L${pt(add(tip, mul(n, 4.2)))} Q${pt(add(tip, mul(d, 3)))} ${pt(add(tip, mul(n, -4.2)))} L${pt(add(back, mul(n, -2.4)))} Z`,
    edge: `M${pt(add(back, mul(n, 0.6)))} L${pt(add(tip, mul(n, 1.4)))}`,
    tassel: `M${pt(back)} q${f(-d.x * 4 + 2)} ${f(8)} ${f(-d.x * 2)} ${f(16)}`,
  }
}

export interface MouthPaths {
  /** 입술 선 */
  line: string
  /** 벌린 입 안 */
  inner: string | null
  /** 혀 */
  tongue: string | null
  /** 아랫입술 윤기 */
  lip: string
}

/** 입 모양 (중심 150,178). open은 말할 때 벌어진 정도 (0~1) */
export function mouthPaths(shape: MouthShape, open: number): MouthPaths {
  const o = Math.max(0, Math.min(1, open))
  const lip = 'M145.4 182.6 Q150 184.4 154.6 182.6'
  if (shape === 'o' || (shape !== 'laugh' && o > 0.08)) {
    // 말하거나 놀라서 벌린 입: 모양마다 입꼬리를 다르게
    const w = shape === 'o' ? 4.6 : shape === 'smile' ? 8 : shape === 'smirk' ? 7 : 6.4
    const lift = shape === 'smile' ? -2 : shape === 'smirk' ? -1 : shape === 'frown' || shape === 'pout' ? 1.4 : 0
    const h = shape === 'o' ? 5 + o * 4 : 1.6 + o * 7.5
    const top = 177.4
    const L = { x: 150 - w, y: top + lift }
    const R = { x: 150 + w, y: top + (shape === 'smirk' ? lift - 1.6 : lift) }
    const inner = `M${pt(L)} Q150 ${f(top - 1.4)} ${pt(R)} Q${f(150 + w * 0.7)} ${f(top + h)} 150 ${f(top + h + 0.6)} Q${f(150 - w * 0.7)} ${f(top + h)} ${pt(L)} Z`
    return {
      line: `M${pt(L)} Q150 ${f(top - 1.4)} ${pt(R)}`,
      inner,
      tongue: h > 4 ? `M${f(150 - w * 0.55)} ${f(top + h * 0.8)} Q150 ${f(top + h * 0.45)} ${f(150 + w * 0.55)} ${f(top + h * 0.8)} Q150 ${f(top + h + 0.4)} ${f(150 - w * 0.55)} ${f(top + h * 0.8)} Z` : null,
      lip: `M${f(150 - w * 0.5)} ${f(top + h + 3)} Q150 ${f(top + h + 4.2)} ${f(150 + w * 0.5)} ${f(top + h + 3)}`,
    }
  }
  switch (shape) {
    case 'laugh': {
      const h = 9 + o * 3
      return {
        line: 'M140.6 175.6 Q150 177.4 159.4 175.6',
        inner: `M140.6 175.6 Q150 177.4 159.4 175.6 Q157.6 ${f(176 + h)} 150 ${f(177 + h)} Q142.4 ${f(176 + h)} 140.6 175.6 Z`,
        tongue: `M144.6 ${f(176 + h * 0.75)} Q150 ${f(176 + h * 0.4)} 155.4 ${f(176 + h * 0.75)} Q150 ${f(177.4 + h)} 144.6 ${f(176 + h * 0.75)} Z`,
        lip,
      }
    }
    case 'smile':
      return { line: 'M140.4 175.8 Q150 183.4 159.6 175.8', inner: null, tongue: null, lip }
    case 'smirk':
      return { line: 'M141.6 179 Q149 181.2 156.6 177.6 Q159.4 176 161 173.4', inner: null, tongue: null, lip }
    case 'pout':
      return { line: 'M143.6 179.6 Q146.6 177 150 177.6 Q153.4 177 156.4 179.6', inner: null, tongue: null, lip: 'M145.6 182.4 Q150 185.4 154.4 182.4' }
    case 'frown':
      return { line: 'M142 180.6 Q150 175.4 158 180.6', inner: null, tongue: null, lip }
    case 'wavy':
      return { line: 'M140.6 179 Q142.8 176.4 145.2 178.8 Q147.6 181.2 150 178.8 Q152.4 176.4 154.8 178.8 Q157.2 181.2 159.4 178.6', inner: null, tongue: null, lip }
    default:
      return { line: 'M142 178.4 Q150 180 158 178.4', inner: null, tongue: null, lip }
  }
}

/**
 * 옆머리 세로 롤(드릴): 관자놀이에서 내려온 머리 다발이 어깨 앞에서 나선으로 감긴다.
 * 중심선을 따라 폭을 사인 모양으로 부풀려 감긴 마디를 만들고, 마디마다 비스듬한 그림자·빛을 넣는다.
 * side: -1 화면 왼쪽, +1 오른쪽. sway: 흔들림 (끝으로 갈수록 크게)
 */
export function ringlet(side: -1 | 1, sway: number) {
  const X = (v: number) => 150 + side * (v - 150)
  // 관자놀이에서 내려오는 다발 (얼굴 옆)
  const strand = `M${f(X(104))} 96 C${f(X(94))} 140 ${f(X(92))} 180 ${f(X(95) + sway * 0.15)} 214 L${f(X(114) + sway * 0.15)} 214 C${f(X(108))} 182 ${f(X(106))} 146 ${f(X(114))} 100 Z`
  const strandShade = `M${f(X(108))} 108 C${f(X(100))} 146 ${f(X(99))} 180 ${f(X(103) + sway * 0.15)} 212`
  // 드릴: 위(214)에서 아래(338)로, 중심선은 흔들림만큼 휜다
  const top = 212
  const len = 126
  const twists = 4.5
  const center = (t: number) => ({
    x: X(106) + sway * (0.15 + 0.85 * t * t) + side * 2 * t,
    y: top + len * t,
  })
  const width = (t: number) => (15 - 8 * t) * (1 + 0.16 * Math.sin(t * twists * Math.PI * 2 - Math.PI / 2))
  const N = 36
  const left: Point[] = []
  const right: Point[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const c = center(t)
    const w = width(t)
    left.push({ x: c.x - w, y: c.y })
    right.push({ x: c.x + w, y: c.y })
  }
  const end = center(1)
  const outline = `M${left.map(pt).join(' L')} Q${f(end.x)} ${f(end.y + 10)} ${right.reverse().map(pt).join(' L')} Z`
  // 마디마다 비스듬한 그림자(아래쪽)와 빛(위쪽)
  const bands: { shade: string, shine: string }[] = []
  for (let k = 0; k < Math.floor(twists); k++) {
    const t0 = (k + 0.62) / twists
    const t1 = Math.min(1, t0 + 0.09)
    const a = center(t0)
    const b = center(t1)
    const wa = width(t0)
    const wb = width(t1)
    bands.push({
      shade: `M${f(a.x - wa * side)} ${f(a.y)} Q${f((a.x + b.x) / 2)} ${f((a.y + b.y) / 2 + 4)} ${f(b.x + wb * side)} ${f(b.y)}`,
      shine: `M${f(a.x - wa * 0.7 * side)} ${f(a.y - len * 0.07)} Q${f((a.x + b.x) / 2)} ${f(a.y - len * 0.07 + 6)} ${f(b.x + wb * 0.5 * side)} ${f(b.y - len * 0.08)}`,
    })
  }
  return { strand, strandShade, outline, bands }
}

/** 앞머리 다발: [밑동 왼쪽 x, 밑동 오른쪽 x, 끝 x, 끝 y, 휨] (가르마는 오른쪽, 왼쪽으로 쓸어 넘김) */
const BANGS: [number, number, number, number, number][] = [
  [74, 106, 72, 150, -8],
  [204, 232, 230, 146, 8],
  [186, 216, 212, 118, 6],
  [164, 194, 184, 106, 4],
  [94, 134, 94, 118, -10],
  [146, 172, 150, 121, -4],
  [122, 158, 124, 113, -8],
]

export function bangClumps(): { d: string, inner: string }[] {
  return BANGS.map(([a, b, tx, ty, bend]) => {
    const y = 58
    const mid = (a + b) / 2
    return {
      d: `M${a} ${y} C${f(a + bend)} ${f(y + (ty - y) * 0.45)} ${f(tx - 6 + bend * 0.4)} ${f(ty - 14)} ${tx} ${ty} C${f(tx + 4 + bend * 0.2)} ${f(ty - 18)} ${f(b + bend * 0.6)} ${f(y + (ty - y) * 0.4)} ${b} ${y} Z`,
      inner: `M${f(mid)} ${y + 4} C${f(mid + bend * 0.8)} ${f(y + (ty - y) * 0.5)} ${f(tx + bend * 0.2)} ${f(ty - 22)} ${f(tx + 0.5)} ${f(ty - 6)}`,
    }
  })
}

/** 등 뒤로 늘어진 긴 머리. sway가 클수록 끝이 옆으로 흔들린다 */
export function backHair(sway: number) {
  return `M150 18 C96 18 66 54 64 106 C61 168 60 232 52 290 C47 330 ${f(40 + sway * 0.6)} 360 ${f(50 + sway)} 392 L${f(250 + sway)} 392 C${f(260 + sway * 0.6)} 360 253 330 248 290 C240 232 239 168 236 106 C234 54 204 18 150 18 Z`
}
