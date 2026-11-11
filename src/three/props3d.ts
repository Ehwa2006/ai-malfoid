// VRM 모델이 손에 드는 소품과 계절 장식. 모델과 어울리도록 셀 셰이딩(3단 명암) 재질에 뒷면 외곽선을 둘러 그림처럼 보이게 한다.
// 소품은 정규화된 손 본(캐릭터의 왼손)에 붙인다: 손 좌표에서 +X가 손가락 방향, -Y가 손바닥, +Z가 엄지 쪽.
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  type Object3D,
  RedFormat,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
} from 'three'
import type { Prop } from '../avatar2d/gestures'

let gradient: DataTexture | null = null
/** 3단 명암 (셀 셰이딩) */
function toonGradient(): DataTexture {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([90, 180, 255]), 3, 1, RedFormat)
    gradient.minFilter = NearestFilter
    gradient.magFilter = NearestFilter
    gradient.needsUpdate = true
  }
  return gradient
}

export function toon(color: string, opts: { map?: CanvasTexture, transparent?: boolean, side?: typeof DoubleSide } = {}): MeshToonMaterial {
  return new MeshToonMaterial({ color: new Color(color), gradientMap: toonGradient(), map: opts.map ?? null, transparent: opts.transparent ?? false, alphaTest: opts.transparent ? 0.4 : 0, ...(opts.side !== undefined ? { side: opts.side } : {}) })
}

const OUTLINE = new MeshBasicMaterial({ color: '#2a1f1a', side: BackSide })

/** 뒷면을 조금 부풀려 검은 테두리를 그린다 (2D 그림 같은 외곽선) */
function outlined(mesh: Mesh, thickness = 1.06): Group {
  const g = new Group()
  const line = new Mesh(mesh.geometry, OUTLINE)
  line.scale.setScalar(thickness)
  line.position.copy(mesh.position)
  line.rotation.copy(mesh.rotation)
  g.add(line, mesh)
  return g
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

/** 레이스 부채 무늬: 짙은 초록 바탕, 부챗살, 은색 레이스 가장자리 (구멍은 투명) */
function fanTexture(): CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    const c = 128
    ctx.translate(c, c)
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 128)
    g.addColorStop(0, '#0f1a15')
    g.addColorStop(1, '#2d5c45')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 126, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(160,200,180,0.7)'
    ctx.lineWidth = 2
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14)
      ctx.lineTo(Math.cos(a) * 120, Math.sin(a) * 120)
      ctx.stroke()
    }
    // 레이스 띠: 작은 구멍들
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(Math.cos(a) * 98, Math.sin(a) * 98, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = '#e8ece9'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(0, 0, 122, 0, Math.PI * 2)
    ctx.stroke()
  })
}

function fanOpen(): Object3D {
  const g = new Group()
  const r = 0.1
  const blade = new Mesh(new CircleGeometry(r, 32, Math.PI * 0.12, Math.PI * 0.76), new MeshBasicMaterial({ map: fanTexture(), transparent: true, alphaTest: 0.3, side: DoubleSide }))
  // 부채 테두리 (뒷면 외곽선 대신 조금 큰 검은 부채)
  const rim = new Mesh(new CircleGeometry(r * 1.03, 32, Math.PI * 0.11, Math.PI * 0.78), new MeshBasicMaterial({ color: '#16201b', side: DoubleSide }))
  rim.position.z = -0.001
  const handle = new Mesh(new CylinderGeometry(0.005, 0.005, 0.05), toon('#1a201c'))
  handle.position.y = -0.02
  g.add(rim, blade, handle)
  return g
}

function fanClosed(): Object3D {
  const body = new Mesh(new BoxGeometry(0.016, 0.15, 0.022), toon('#20382c'))
  body.position.y = 0.06
  const tassel = new Mesh(new SphereGeometry(0.008), toon('#2fae74'))
  tassel.position.y = -0.02
  const g = outlined(body, 1.15)
  g.add(tassel)
  return g
}

function teacup(): Object3D {
  const g = new Group()
  const profile = [new Vector2(0.0, 0), new Vector2(0.024, 0.002), new Vector2(0.034, 0.02), new Vector2(0.04, 0.045), new Vector2(0.038, 0.045)]
  const cup = new Mesh(new LatheGeometry(profile, 24), toon('#fbfaf5', { side: DoubleSide }))
  const band = new Mesh(new CylinderGeometry(0.0395, 0.036, 0.008, 24, 1, true), toon('#1f5a3d', { side: DoubleSide }))
  band.position.y = 0.032
  const tea = new Mesh(new CircleGeometry(0.035, 24), toon('#9a5a28'))
  tea.rotation.x = -Math.PI / 2
  tea.position.y = 0.04
  const handle = new Mesh(new TorusGeometry(0.014, 0.004, 8, 16, Math.PI * 1.3), toon('#fbfaf5'))
  handle.position.set(0.042, 0.024, 0)
  handle.rotation.z = -Math.PI * 0.65
  const saucer = new Mesh(new CylinderGeometry(0.065, 0.05, 0.007, 32), toon('#fbfaf5'))
  saucer.position.y = -0.004
  const rimGold = new Mesh(new TorusGeometry(0.064, 0.0025, 6, 32), toon('#c8a85a'))
  rimGold.rotation.x = Math.PI / 2
  g.add(outlined(cup, 1.05), band, tea, handle, outlined(saucer, 1.04), rimGold)
  return g
}

/** 레이스 양산: 손에서 머리 위 뒤쪽으로 기울어진 긴 손잡이 끝에 레이스 덮개 */
function parasol(): Object3D {
  const g = new Group()
  // 손에서 어깨 위로 비스듬히: 덮개가 머리 옆 뒤쪽에 걸리도록 손잡이를 짧게
  const shaft = new Mesh(new CylinderGeometry(0.006, 0.006, 0.42), toon('#3b2a1c'))
  shaft.position.y = 0.18
  const lace = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = '#fbf8f1'
    ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = '#1f5a3d'
    ctx.fillRect(0, 54, 256, 10)
    ctx.strokeStyle = '#d9d1c2'
    for (let i = 0; i < 16; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 16 + 8, 0)
      ctx.lineTo(i * 16 + 8, 54)
      ctx.stroke()
    }
  })
  const canopy = new Mesh(new ConeGeometry(0.3, 0.12, 16, 1, true), toon('#ffffff', { map: lace, side: DoubleSide }))
  canopy.position.y = 0.42
  const tip = new Mesh(new SphereGeometry(0.01), toon('#c9d2d6'))
  tip.position.y = 0.49
  g.add(shaft, canopy, tip)
  return g
}

function broom(): Object3D {
  const g = new Group()
  const handle = new Mesh(new CylinderGeometry(0.011, 0.013, 1.25), toon('#6b4424'))
  handle.position.y = 0.1
  const bristles = new Mesh(new ConeGeometry(0.06, 0.32, 12), toon('#c9a96a'))
  bristles.position.y = -0.66
  bristles.rotation.x = Math.PI
  const ring = new Mesh(new TorusGeometry(0.015, 0.004, 6, 16), toon('#c9d2d6'))
  ring.rotation.x = Math.PI / 2
  ring.position.y = -0.48
  g.add(outlined(handle, 1.25), bristles, ring)
  return g
}

function bouquet(): Object3D {
  const g = new Group()
  const wrap = new Mesh(new ConeGeometry(0.05, 0.16, 12, 1, true), toon('#efe6d3', { side: DoubleSide }))
  wrap.rotation.x = Math.PI
  wrap.position.y = -0.02
  g.add(wrap)
  const spots: [number, number, number][] = [[0, 0.07, 0], [-0.035, 0.06, 0.01], [0.035, 0.06, 0.01], [0, 0.065, 0.035], [-0.02, 0.08, -0.02], [0.02, 0.085, -0.015]]
  for (const [x, y, z] of spots) {
    const rose = new Mesh(new SphereGeometry(0.022, 12, 8), toon('#fffdf8'))
    rose.position.set(x, y, z)
    g.add(rose)
  }
  for (const s of [-1, 1]) {
    const leaf = new Mesh(new SphereGeometry(0.02, 8, 6), toon('#2f6b45'))
    leaf.scale.set(1.6, 0.5, 0.8)
    leaf.position.set(s * 0.055, 0.04, 0)
    g.add(leaf)
  }
  return g
}

function giftbox(): Object3D {
  const g = new Group()
  const box = new Mesh(new BoxGeometry(0.11, 0.075, 0.085), toon('#1f5a3d'))
  const ribbon1 = new Mesh(new BoxGeometry(0.114, 0.079, 0.016), toon('#d8dde0'))
  const ribbon2 = new Mesh(new BoxGeometry(0.016, 0.079, 0.089), toon('#d8dde0'))
  const bow = new Mesh(new TorusGeometry(0.014, 0.005, 6, 12), toon('#d8dde0'))
  bow.position.y = 0.045
  g.add(outlined(box, 1.04), ribbon1, ribbon2, bow)
  return g
}

const MAKERS: Record<Exclude<Prop, null>, () => Object3D> = { fanOpen, fanClosed, teacup, parasol, broom, bouquet, giftbox }

/** 손에 붙일 소품을 만든다 (이미 만든 것은 다시 쓴다) */
export function createProps(): Record<Exclude<Prop, null>, Object3D> {
  const out = {} as Record<Exclude<Prop, null>, Object3D>
  for (const [name, make] of Object.entries(MAKERS)) {
    const o = make()
    o.name = `prop:${name}`
    o.visible = false
    o.traverse(c => (c.frustumCulled = false))
    out[name as Exclude<Prop, null>] = o
  }
  return out
}

/** 작은 마녀 모자 (할로윈) */
export function witchHat(): Object3D {
  const g = new Group()
  const brim = new Mesh(new CylinderGeometry(0.085, 0.085, 0.006, 32), toon('#151a17'))
  const cone = new Mesh(new ConeGeometry(0.05, 0.14, 24), toon('#1a201c'))
  cone.position.y = 0.07
  cone.rotation.z = -0.25
  const band = new Mesh(new CylinderGeometry(0.048, 0.051, 0.016, 24, 1, true), toon('#1f5a3d', { side: DoubleSide }))
  band.position.y = 0.012
  g.add(outlined(brim, 1.03), outlined(cone, 1.05), band)
  return g
}

/** 초록·은색 줄무늬 목도리 (겨울) */
export function scarf(): Object3D {
  const stripes = canvasTexture(256, 32, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#c9d2d6' : '#1f5a3d'
      ctx.fillRect(i * 32, 0, 32, 32)
    }
  })
  const g = new Group()
  // 목을 감는 고리: 목보다 조금 크고 얇게, 옷깃 위에 얹히게
  const ring = new Mesh(new TorusGeometry(0.058, 0.017, 10, 32), toon('#ffffff', { map: stripes }))
  ring.rotation.x = Math.PI / 2 - 0.25
  const end = new Mesh(new BoxGeometry(0.045, 0.13, 0.012), toon('#ffffff', { map: stripes }))
  end.position.set(0.035, -0.07, 0.06)
  end.rotation.set(-0.2, 0, 0.15)
  g.add(ring, end)
  return g
}

/** 호랑가시 장식 (크리스마스) */
export function holly(): Object3D {
  const g = new Group()
  for (const s of [-1, 1]) {
    const leaf = new Mesh(new SphereGeometry(0.018, 8, 6), toon('#1f6b3a'))
    leaf.scale.set(1.8, 0.6, 0.4)
    leaf.position.set(s * 0.02, 0, 0)
    leaf.rotation.z = s * 0.4
    g.add(leaf)
  }
  for (const [x, y] of [[-0.006, 0.008], [0.007, 0.01], [0, -0.002]]) {
    const berry = new Mesh(new SphereGeometry(0.008, 8, 6), toon('#c8202e'))
    berry.position.set(x, y, 0.008)
    g.add(berry)
  }
  return g
}

export function disposeObject(o: Object3D): void {
  o.traverse((c) => {
    const m = c as Mesh
    if (!m.isMesh)
      return
    m.geometry.dispose()
    for (const mat of ([] as Material[]).concat(m.material)) {
      if (mat !== OUTLINE)
        mat.dispose()
    }
  })
}
