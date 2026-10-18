// 애니풍 얼굴(눈·눈썹·입·홍조)을 캔버스에 그린다. 머리 메시에 데칼로 투영된다.
// 레퍼런스: 날카롭게 올라간 눈꼬리, 초록 눈동자, 옅은 금발 눈썹.
import type { Emotion } from '../lib/markers'

export const FACE_SIZE = 512

export interface FaceState {
  emotion: Emotion
  /** 0 = 뜬 눈, 1 = 감은 눈 */
  blink: number
  /** 0 = 다문 입, 1 = 크게 벌린 입 */
  mouthOpen: number
  /** 시선 (-1 ~ 1) */
  lookX: number
  lookY: number
}

interface EmotionStyle {
  /** 눈 뜬 정도 */
  open: number
  /** 눈썹: 안쪽/바깥쪽 끝의 높이 오프셋(px, 음수 = 위로). 왼쪽/오른쪽 따로 */
  brow: { inner: number, outer: number }[]
  closedHappy?: boolean
  pupil: number
  blush: number
  mouth: 'line' | 'smirk' | 'frown' | 'wavy' | 'smile' | 'o'
  lookDown?: number
}

const STYLES: Record<Emotion, EmotionStyle> = {
  neutral: { open: 0.85, brow: [{ inner: 0, outer: -4 }, { inner: 0, outer: -4 }], pupil: 1, blush: 0, mouth: 'line' },
  smirk: { open: 0.62, brow: [{ inner: 4, outer: -2 }, { inner: -6, outer: -16 }], pupil: 1, blush: 0, mouth: 'smirk' },
  annoyed: { open: 0.55, brow: [{ inner: 12, outer: -8 }, { inner: 12, outer: -8 }], pupil: 0.9, blush: 0, mouth: 'frown' },
  flustered: { open: 0.95, brow: [{ inner: -12, outer: 4 }, { inner: -12, outer: 4 }], pupil: 0.95, blush: 0.85, mouth: 'wavy' },
  happy: { open: 1, brow: [{ inner: -6, outer: -6 }, { inner: -6, outer: -6 }], closedHappy: true, pupil: 1, blush: 0.35, mouth: 'smile' },
  sad: { open: 0.72, brow: [{ inner: -12, outer: 6 }, { inner: -12, outer: 6 }], pupil: 1, blush: 0.1, mouth: 'frown', lookDown: 0.6 },
  surprised: { open: 1.12, brow: [{ inner: -16, outer: -14 }, { inner: -16, outer: -14 }], pupil: 0.7, blush: 0.2, mouth: 'o' },
}

// 캔버스 좌표 (512px = 머리 앞쪽 0.2m)
const EYE_Y = 290
const EYE_X = 94
const EYE_W = 104
const EYE_H = 64
const BROW_Y = 222
const MOUTH_Y = 404
const LASH = '#2b1f17'

export function drawFace(ctx: CanvasRenderingContext2D, state: FaceState) {
  const s = STYLES[state.emotion]
  ctx.clearRect(0, 0, FACE_SIZE, FACE_SIZE)

  drawHairShadow(ctx)

  drawBlush(ctx, s.blush, state.emotion === 'flustered')
  drawNose(ctx)

  const open = s.open * (1 - state.blink)
  for (const side of [-1, 1] as const) {
    const cx = FACE_SIZE / 2 + side * EYE_X
    const brow = s.brow[side === -1 ? 0 : 1]
    drawBrow(ctx, cx, side, brow.inner, brow.outer)
    if (s.closedHappy && state.blink < 0.5)
      drawHappyEye(ctx, cx, side)
    else if (open < 0.08)
      drawClosedEye(ctx, cx, side)
    else
      drawEye(ctx, cx, side, open, s.pupil, state.lookX * 7, (state.lookY + (s.lookDown ?? 0)) * 6)
  }

  if (state.mouthOpen > 0.12)
    drawOpenMouth(ctx, state.mouthOpen, s.mouth)
  else
    drawMouth(ctx, s.mouth)
}

function eyePath(ctx: CanvasRenderingContext2D, cx: number, side: number, open: number) {
  // 안쪽 눈꼬리는 낮고 바깥쪽 눈꼬리는 올라간(츠리메) 아몬드형
  const inner = { x: cx - side * EYE_W / 2, y: EYE_Y + 6 }
  const outer = { x: cx + side * EYE_W / 2, y: EYE_Y - 8 }
  const top = EYE_Y - EYE_H * open * 0.95
  const bottom = EYE_Y + EYE_H * 0.5
  ctx.beginPath()
  ctx.moveTo(inner.x, inner.y)
  ctx.bezierCurveTo(inner.x + side * 14, top, outer.x - side * 26, top - 4, outer.x, outer.y)
  ctx.bezierCurveTo(outer.x - side * 14, bottom - 4, inner.x + side * 24, bottom, inner.x, inner.y)
  ctx.closePath()
  return { inner, outer, top }
}

function drawEye(ctx: CanvasRenderingContext2D, cx: number, side: number, open: number, pupil: number, lookX: number, lookY: number) {
  ctx.save()
  const { inner, outer, top } = eyePath(ctx, cx, side, open)
  ctx.fillStyle = '#fbfbfd'
  ctx.fill()
  ctx.clip()

  // 홍채 (세로로 긴 타원, 위는 진한 초록 → 아래는 연두)
  const ix = cx + side * 2 + lookX
  const iy = EYE_Y + 4 + lookY
  const g = ctx.createLinearGradient(0, iy - 26, 0, iy + 26)
  g.addColorStop(0, '#1d4a1f')
  g.addColorStop(0.55, '#4f9a2e')
  g.addColorStop(1, '#b8e35a')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(ix, iy, 21, 27, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#173a18'
  ctx.lineWidth = 3
  ctx.stroke()
  // 동공과 홍채 링
  ctx.strokeStyle = 'rgba(20,50,20,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(ix, iy + 2, 13, 17, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#0f2410'
  ctx.beginPath()
  ctx.ellipse(ix, iy + 2, 7 * pupil, 10 * pupil, 0, 0, Math.PI * 2)
  ctx.fill()
  // 하이라이트
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(ix - 7, iy - 10, 6, 8, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.8
  ctx.beginPath()
  ctx.arc(ix + 8, iy + 12, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  // 윗눈꺼풀 그림자
  const shade = ctx.createLinearGradient(0, top, 0, top + 22)
  shade.addColorStop(0, 'rgba(120,130,160,0.55)')
  shade.addColorStop(1, 'rgba(120,130,160,0)')
  ctx.fillStyle = shade
  ctx.fillRect(cx - EYE_W, top - 10, EYE_W * 2, 40)
  ctx.restore()

  // 윗속눈썹: 굵고, 바깥 눈꼬리에서 위로 날카롭게 뻗는다
  ctx.strokeStyle = LASH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(inner.x + side * 2, inner.y - 1)
  ctx.bezierCurveTo(inner.x + side * 14, top, outer.x - side * 26, top - 4, outer.x, outer.y)
  ctx.lineTo(outer.x + side * 12, outer.y - 9)
  ctx.stroke()
  // 쌍꺼풀 선
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.moveTo(inner.x + side * 18, top - 4)
  ctx.quadraticCurveTo(cx, top - 14, outer.x - side * 8, outer.y - 12)
  ctx.stroke()
  ctx.globalAlpha = 1
  // 아랫속눈썹 (바깥쪽만 살짝)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(outer.x - side * 2, outer.y + 4)
  ctx.quadraticCurveTo(cx + side * 26, EYE_Y + EYE_H * 0.45, cx, EYE_Y + EYE_H * 0.5)
  ctx.stroke()
}

function drawClosedEye(ctx: CanvasRenderingContext2D, cx: number, side: number) {
  ctx.strokeStyle = LASH
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - side * EYE_W / 2, EYE_Y + 4)
  ctx.quadraticCurveTo(cx, EYE_Y + 14, cx + side * EYE_W / 2, EYE_Y - 4)
  ctx.lineTo(cx + side * (EYE_W / 2 + 10), EYE_Y - 10)
  ctx.stroke()
}

function drawHappyEye(ctx: CanvasRenderingContext2D, cx: number, side: number) {
  ctx.strokeStyle = LASH
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - side * EYE_W / 2, EYE_Y + 10)
  ctx.quadraticCurveTo(cx, EYE_Y - 26, cx + side * EYE_W / 2, EYE_Y + 4)
  ctx.stroke()
}

function drawBrow(ctx: CanvasRenderingContext2D, cx: number, side: number, inner: number, outer: number) {
  const x0 = cx - side * 36
  const x1 = cx + side * 50
  const y0 = BROW_Y + 14 + inner
  const y1 = BROW_Y + 8 + outer
  const mx = (x0 + x1) / 2
  const my = Math.min(y0, y1) - 10
  ctx.fillStyle = '#b39a62'
  ctx.beginPath()
  ctx.moveTo(x0, y0 - 4)
  ctx.quadraticCurveTo(mx, my - 3, x1, y1)
  ctx.quadraticCurveTo(mx, my + 5, x0, y0 + 3)
  ctx.quadraticCurveTo(x0 - side * 3, y0, x0, y0 - 4)
  ctx.fill()
}

/** 앞머리가 이마에 드리우는 그림자 (애니풍) */
function drawHairShadow(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 120, 0, 220)
  g.addColorStop(0, 'rgba(200,150,140,0.32)')
  g.addColorStop(1, 'rgba(200,150,140,0.16)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(FACE_SIZE, 0)
  ctx.lineTo(FACE_SIZE, 222)
  for (let x = FACE_SIZE; x >= 0; x -= 32)
    ctx.quadraticCurveTo(x - 16, 196 + (x / FACE_SIZE) * 34, x - 32, 214 + (x / FACE_SIZE) * 20)
  ctx.closePath()
  ctx.fill()
}

function drawNose(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = 'rgba(190,130,120,0.7)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(FACE_SIZE / 2 + 3, 346)
  ctx.lineTo(FACE_SIZE / 2 - 2, 355)
  ctx.stroke()
}

function drawBlush(ctx: CanvasRenderingContext2D, amount: number, lines: boolean) {
  if (amount <= 0)
    return
  for (const side of [-1, 1]) {
    const x = FACE_SIZE / 2 + side * 120
    const y = 346
    const g = ctx.createRadialGradient(x, y, 4, x, y, 48)
    g.addColorStop(0, `rgba(245,120,140,${0.6 * amount})`)
    g.addColorStop(1, 'rgba(245,120,140,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, 50, 26, 0, 0, Math.PI * 2)
    ctx.fill()
    if (lines) {
      ctx.strokeStyle = `rgba(215,80,100,${0.8 * amount})`
      ctx.lineWidth = 3
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(x + i * 12 + 6, y - 9)
        ctx.lineTo(x + i * 12 - 4, y + 9)
        ctx.stroke()
      }
    }
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, shape: EmotionStyle['mouth']) {
  const c = FACE_SIZE / 2
  ctx.strokeStyle = '#8c4a4f'
  ctx.fillStyle = '#7a2e38'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  switch (shape) {
    case 'line':
      ctx.moveTo(c - 16, MOUTH_Y)
      ctx.quadraticCurveTo(c, MOUTH_Y + 2, c + 16, MOUTH_Y)
      ctx.stroke()
      break
    case 'smirk':
      ctx.moveTo(c - 20, MOUTH_Y + 2)
      ctx.quadraticCurveTo(c + 6, MOUTH_Y + 4, c + 24, MOUTH_Y - 9)
      ctx.stroke()
      break
    case 'frown':
      ctx.moveTo(c - 18, MOUTH_Y + 5)
      ctx.quadraticCurveTo(c, MOUTH_Y - 6, c + 18, MOUTH_Y + 5)
      ctx.stroke()
      break
    case 'wavy':
      ctx.moveTo(c - 22, MOUTH_Y)
      for (let i = 0; i < 4; i++)
        ctx.quadraticCurveTo(c - 22 + i * 11 + 5.5, MOUTH_Y + (i % 2 ? 6 : -6), c - 11 + i * 11, MOUTH_Y)
      ctx.stroke()
      break
    case 'smile':
      ctx.moveTo(c - 24, MOUTH_Y - 6)
      ctx.quadraticCurveTo(c, MOUTH_Y - 2, c + 24, MOUTH_Y - 6)
      ctx.quadraticCurveTo(c, MOUTH_Y + 26, c - 24, MOUTH_Y - 6)
      ctx.fill()
      ctx.fillStyle = '#e88a95'
      ctx.beginPath()
      ctx.ellipse(c, MOUTH_Y + 8, 10, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'o':
      ctx.ellipse(c, MOUTH_Y, 9, 12, 0, 0, Math.PI * 2)
      ctx.fill()
      break
  }
}

function drawOpenMouth(ctx: CanvasRenderingContext2D, amount: number, shape: EmotionStyle['mouth']) {
  const c = FACE_SIZE / 2
  const w = shape === 'smile' ? 24 : shape === 'smirk' ? 18 : 15
  const h = 4 + amount * 16
  const tilt = shape === 'smirk' ? -0.15 : 0
  ctx.fillStyle = '#7a2e38'
  ctx.beginPath()
  ctx.ellipse(c, MOUTH_Y + h / 3, w, h, tilt, 0, Math.PI * 2)
  ctx.fill()
  if (amount > 0.4) {
    ctx.save()
    ctx.clip()
    ctx.fillStyle = '#e88a95'
    ctx.beginPath()
    ctx.ellipse(c, MOUTH_Y + h, w * 0.7, h * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}
