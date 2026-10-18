// 절차적으로 생성하는 카리나 말포이 3D 모델 (애니풍 셀 셰이딩).
// 디자인 레퍼런스: Sketchfab "Harry Potter - Malfoy Draconia" (HiGuys920, CC BY 4.0)
//   긴 백금발 + 옆으로 넘긴 앞머리, 초록 눈, 후프 귀걸이,
//   흰 셔츠 · 초록 넥타이 · 회색 니트 조끼 · 초록 깃의 검은 로브.
// 좌표계: 바닥 y = 0, 캐릭터는 +z(카메라 쪽)를 본다. 단위는 m.
import {
  BackSide,
  DoubleSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import type { Emotion } from '../lib/markers'
import { drawFace, FACE_SIZE, type FaceState } from './faceTexture'
import { taperedTube } from './tube'
import { SOFT_SHADE, toon } from './toon'
import type { AvatarController, AvatarFrameState } from './types'

const R = 0.105 // 머리 반지름
const NECK_Y = 1.37
const HEAD_OFFSET = new Vector3(0, 0.1, 0.008) // 목 피벗 → 머리 중심

const COLORS = {
  skin: '#fbeae0',
  hair: '#f1e4b3',
  vest: '#5d6166',
  robe: '#1a1c21',
  green: '#1f5a32',
  tie: '#2f7d3c',
  shirt: '#f4f4f2',
  gold: '#c9a75a',
}

/** 구 → 애니풍 머리 모양 (갸름한 턱, 약간 세로로 긴 얼굴) */
function shapeHead(v: Vector3): Vector3 {
  const t = Math.max(0, -v.y / R)
  const front = Math.max(0, v.z / R)
  v.x *= 0.96 * (1 - 0.5 * t ** 1.2)
  v.z *= 1 - 0.14 * t
  v.y -= 0.02 * t ** 2 * front // 턱 끝을 앞아래로
  v.y += 0.01 * t * Math.max(0, -v.z / R) // 뒤통수 아래는 목 쪽으로
  v.y *= v.y > 0 ? 1.08 : 0.98
  return v
}

function shapeGeometry(geometry: BufferGeometry, fn: (v: Vector3) => Vector3) {
  const pos = geometry.attributes.position
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    fn(v.fromBufferAttribute(pos, i))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** 머리 표면 위의 점. theta: 정수리에서의 각, azimuth: 정면 0, +x 쪽이 양수 */
function onHead(theta: number, azimuth: number, lift = 0): Vector3 {
  const d = new Vector3(Math.sin(theta) * Math.sin(azimuth), Math.cos(theta), Math.sin(theta) * Math.cos(azimuth))
  return shapeHead(d.multiplyScalar(R + lift))
}

/** 머리카락 가닥의 바깥 방향: 머리 위쪽은 머리 중심에서, 아래쪽은 수평으로 */
function hairOutward(p: Vector3): Vector3 {
  return new Vector3(p.x, Math.max(p.y, 0), p.z + 0.01).normalize()
}

function strand(points: Vector3[], width: number, thickness = 0.007, tip = 0.0015) {
  return taperedTube(points, {
    width: t => tip + width * (1 - t ** 1.6) * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 2))),
    thickness: t => 0.0015 + thickness * (1 - t),
    outward: hairOutward,
    segments: 28,
    radial: 8,
  })
}

const PI = Math.PI

function buildHair(): Group {
  const hair = new Group()
  hair.name = 'Hair'
  const material = toon(COLORS.hair, {}, true, [175, 230, 255])
  const add = (geometry: BufferGeometry, name: string) => {
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    hair.add(mesh)
  }

  // 1) 두피를 덮는 캡: 앞쪽은 이마 위에서 끝나고 옆·뒤로 갈수록 내려온다
  const cap = new SphereGeometry(R * 1.07, 64, 32, 0, 2 * PI, 0, PI)
  shapeGeometry(cap, (v) => {
    const r = v.length()
    const theta = Math.acos(MathUtils.clamp(v.y / r, -1, 1))
    const azimuth = Math.atan2(v.x, v.z)
    const front = Math.max(0, Math.cos(azimuth)) ** 2
    const maxTheta = MathUtils.lerp(0.64 * PI, 0.37 * PI, front)
    const t = (theta / PI) * maxTheta
    v.set(Math.sin(t) * Math.sin(azimuth), Math.cos(t), Math.sin(t) * Math.cos(azimuth)).multiplyScalar(r)
    return shapeHead(v).add(new Vector3(0, 0.004, -0.004))
  })
  add(cap, 'HairCap')

  // 2) 앞머리: 왼쪽(화면 기준)에서 가르마를 타고 오른쪽으로 쓸어 넘긴다
  const partAz = -0.3
  for (let i = 0; i < 9; i++) {
    const k = i / 8
    const endAz = MathUtils.lerp(-0.36, 1.0, k)
    const endTheta = MathUtils.lerp(0.43, 0.555, k ** 1.4) * PI
    const startAz = partAz + 0.03 * i
    add(strand([
      onHead(0.08 * PI, startAz, 0.004),
      onHead(0.22 * PI, MathUtils.lerp(startAz, endAz, 0.3), 0.022),
      onHead(0.36 * PI, MathUtils.lerp(startAz, endAz, 0.75), 0.02),
      onHead(endTheta - 0.04 * PI, endAz - 0.02, 0.016),
      onHead(endTheta, endAz + 0.04, 0.011),
    ], 0.026 - 0.006 * k, 0.007), `Bang${i}`)
  }
  // 가르마 왼쪽으로 떨어지는 짧은 앞머리
  for (let i = 0; i < 3; i++) {
    const az = -0.55 - i * 0.22
    add(strand([
      onHead(0.1 * PI, partAz - 0.02, 0.004),
      onHead(0.3 * PI, az + 0.12, 0.02),
      onHead(0.47 * PI, az, 0.016),
      onHead(0.56 * PI, az - 0.05, 0.012),
    ], 0.02), `BangL${i}`)
  }

  // 3) 얼굴 옆 긴 머리 (귀 앞을 지나 가슴까지)
  for (const side of [-1, 1]) {
    for (let j = 0; j < 2; j++) {
      const az = side * (1.12 + j * 0.16)
      const x = side * (0.104 + j * 0.012)
      add(strand([
        onHead(0.22 * PI, az, 0.006),
        onHead(0.45 * PI, az, 0.016),
        onHead(0.62 * PI, az + side * 0.05, 0.018),
        new Vector3(x, -0.12, 0.035 - j * 0.012),
        new Vector3(x + side * 0.006, -0.25, 0.07 - j * 0.015),
        new Vector3(x + side * 0.01, -0.36, 0.098 - j * 0.02),
        new Vector3(x + side * 0.012, -0.44, 0.1 - j * 0.02),
      ], 0.02, 0.007), `SideLock${side > 0 ? 'L' : 'R'}${j}`)
    }
  }

  // 4) 뒷머리: 정수리에서 등 중간까지 길게
  const count = 17
  for (let i = 0; i < count; i++) {
    const b = MathUtils.lerp(-1.75, 1.75, i / (count - 1))
    const az = PI + b
    const drop = (y: number, s: number) =>
      new Vector3(0.132 * Math.sin(b) * s, y, -0.085 - 0.055 * Math.cos(b) * s)
    add(strand([
      onHead(0.06 * PI, az, -0.004),
      onHead(0.35 * PI, az, 0.012),
      onHead(0.6 * PI, az, 0.02),
      drop(-0.15, 0.92),
      drop(-0.32, 1),
      drop(-0.5, 0.98),
      drop(-0.63 + 0.03 * Math.abs(Math.sin(i * 1.7)), 0.94),
    ], 0.032, 0.009, 0.004), `BackHair${i}`)
  }

  return hair
}

function vestTexture(yMin: number, yMax: number): CanvasTexture {
  const W = 1024
  const H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const py = (y: number) => ((yMax - y) / (yMax - yMin)) * H

  // 회색 니트 + 세로 골지
  ctx.fillStyle = COLORS.vest
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 2
  for (let x = 0; x < W; x += 9) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  // 밑단 초록·은색 줄무늬
  const hem = py(yMin + 0.035)
  ctx.fillStyle = '#4f5358'
  ctx.fillRect(0, hem, W, H - hem)
  ctx.fillStyle = COLORS.green
  ctx.fillRect(0, hem + 6, W, 8)
  ctx.fillStyle = '#c8c8c8'
  ctx.fillRect(0, hem + 16, W, 3)

  // 브이넥 안쪽: 흰 셔츠 + 넥타이 (앞면 = u 0.5)
  const cx = W / 2
  const apex = py(1.1)
  const v = new Path2D()
  v.moveTo(cx - 100, 0)
  v.lineTo(cx + 100, 0)
  v.lineTo(cx, apex)
  v.closePath()
  ctx.fillStyle = COLORS.shirt
  ctx.fill(v)
  ctx.save()
  ctx.clip(v)
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  ctx.fillRect(cx - 2, 0, 4, apex)
  ctx.beginPath()
  ctx.moveTo(cx - 13, 18)
  ctx.lineTo(cx + 13, 18)
  ctx.lineTo(cx + 22, apex - 10)
  ctx.lineTo(cx, apex + 14)
  ctx.lineTo(cx - 22, apex - 10)
  ctx.closePath()
  ctx.fillStyle = COLORS.tie
  ctx.fill()
  ctx.clip()
  ctx.strokeStyle = '#c9c9c9'
  ctx.lineWidth = 5
  for (let y = 10; y < apex + 40; y += 30) {
    ctx.beginPath()
    ctx.moveTo(cx - 40, y)
    ctx.lineTo(cx + 40, y + 34)
    ctx.stroke()
  }
  ctx.restore()

  // 브이넥 테두리 (초록 + 은색)
  ctx.lineJoin = 'miter'
  ctx.strokeStyle = COLORS.green
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(cx - 108, -4)
  ctx.lineTo(cx, apex + 8)
  ctx.lineTo(cx + 108, -4)
  ctx.stroke()
  ctx.strokeStyle = '#c8c8c8'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 122, -4)
  ctx.lineTo(cx, apex + 22)
  ctx.lineTo(cx + 122, -4)
  ctx.stroke()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** 단면이 타원인 회전체. 앞면이 u = 0.5, v는 높이에 비례하도록 UV를 다시 잡는다. */
function lathe(profile: [number, number][], zScale: number, phiStart = PI, phiLength = 2 * PI) {
  const geometry = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 64, phiStart, phiLength)
  const yMin = profile[0][1]
  const yMax = profile[profile.length - 1][1]
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < pos.count; i++)
    uv.setY(i, (pos.getY(i) - yMin) / (yMax - yMin))
  geometry.scale(1, 1, zScale)
  geometry.computeVertexNormals()
  return geometry
}

const TORSO: [number, number][] = [
  [0, 0.84], [0.125, 0.845], [0.13, 0.9], [0.118, 0.98], [0.122, 1.05], [0.136, 1.12],
  [0.145, 1.18], [0.15, 1.235], [0.14, 1.275], [0.105, 1.305], [0.06, 1.325], [0.034, 1.338],
]

function buildBody(): Group {
  const body = new Group()
  body.name = 'Body'

  const torso = new Mesh(lathe(TORSO, 0.62), toon('#ffffff', { map: vestTexture(0.84, 1.338) }))
  torso.name = 'Vest'
  body.add(torso)

  // 로브: 앞이 열린 회전체. 바깥은 검정, 안감은 초록.
  const gap = 0.6
  const robeProfile: [number, number][] = TORSO.slice(1, -1).map(([r, y]) => [r + 0.016, y])
  robeProfile.push([0.075, 1.33])
  const robeGeometry = lathe(robeProfile, 0.64, gap, 2 * PI - gap * 2)
  const robe = new Mesh(robeGeometry, toon(COLORS.robe))
  robe.name = 'Robe'
  const lining = new Mesh(robeGeometry, toon(COLORS.green, { side: BackSide }, false))
  lining.name = 'RobeLining'
  body.add(robe, lining)

  // 로브 앞섶의 초록 깃
  for (const side of [-1, 1]) {
    const phi = side * gap
    const pts = robeProfile.filter(([, y]) => y > 0.86).map(([r, y]) =>
      new Vector3(Math.sin(phi) * (r + 0.002), y, Math.cos(phi) * (r + 0.002) * 0.64))
    const lapel = taperedTube(pts, {
      width: t => 0.01 + 0.006 * Math.sin(PI * t),
      thickness: () => 0.004,
      outward: p => new Vector3(p.x, 0, p.z).normalize(),
      segments: 32,
    })
    const mesh = new Mesh(lapel, toon(COLORS.green))
    mesh.name = `Lapel${side > 0 ? 'L' : 'R'}`
    body.add(mesh)
  }

  // 목, 셔츠 깃, 넥타이 매듭
  const neck = new Mesh(new CylinderGeometry(0.029, 0.033, 0.14, 24), toon('#efd8cc', {}, true, SOFT_SHADE))
  neck.name = 'Neck'
  neck.position.set(0, NECK_Y, 0)
  neck.scale.z = 0.9
  body.add(neck)

  const collarBand = new Mesh(new CylinderGeometry(0.036, 0.04, 0.026, 32, 1, true), toon(COLORS.shirt, { side: DoubleSide }))
  collarBand.name = 'CollarBand'
  collarBand.position.set(0, 1.336, 0)
  collarBand.scale.z = 0.92
  body.add(collarBand)

  const wing = new Shape([new Vector2(0, 0), new Vector2(0.034, 0.004), new Vector2(0.008, -0.03)])
  const wingGeometry = new ExtrudeGeometry(wing, { depth: 0.002, bevelEnabled: false })
  for (const side of [-1, 1]) {
    const mesh = new Mesh(wingGeometry, toon(COLORS.shirt))
    mesh.name = `Collar${side > 0 ? 'L' : 'R'}`
    mesh.position.set(side * 0.004, 1.336, 0.034)
    mesh.scale.x = side
    mesh.rotation.set(-0.5, side * 0.35, 0)
    body.add(mesh)
  }

  const knot = new Mesh(new BoxGeometry(0.02, 0.02, 0.012), toon(COLORS.tie))
  knot.name = 'TieKnot'
  knot.position.set(0, 1.322, 0.036)
  knot.rotation.x = -0.3
  body.add(knot)

  body.add(buildArms())
  return body
}

/** 팔짱 낀 팔 — 도도한 말포이가의 기본 자세 */
function buildArms(): Group {
  const arms = new Group()
  arms.name = 'Arms'
  const sleeve = toon(COLORS.robe)
  const radius = (t: number) => 0.044 - 0.01 * Math.sin(PI * Math.min(1, t * 1.6)) + 0.006 * t

  const right = [
    new Vector3(-0.135, 1.235, -0.005), new Vector3(-0.185, 1.16, 0.0), new Vector3(-0.198, 1.06, 0.06),
    new Vector3(-0.1, 1.035, 0.14), new Vector3(0.07, 1.045, 0.145),
  ]
  const left = [
    new Vector3(0.135, 1.235, -0.005), new Vector3(0.185, 1.16, 0.0), new Vector3(0.198, 1.07, 0.065),
    new Vector3(0.1, 1.095, 0.175), new Vector3(-0.1, 1.105, 0.175),
  ]
  for (const [name, pts] of [['ArmR', right], ['ArmL', left]] as const) {
    const mesh = new Mesh(taperedTube(pts, { width: radius, thickness: radius, segments: 40, radial: 14 }), sleeve)
    mesh.name = name
    arms.add(mesh)
    // 소매 끝: 초록 단 + 안쪽을 막는 어두운 원판
    const end = pts[pts.length - 1]
    const dir = end.clone().sub(pts[pts.length - 2]).normalize()
    const cuff = new Mesh(new TorusGeometry(radius(1), 0.005, 8, 24), toon(COLORS.green))
    cuff.position.copy(end)
    cuff.lookAt(end.clone().add(dir))
    cuff.name = `${name}Cuff`
    const cap = new Mesh(new CircleGeometry(radius(1), 24), new MeshBasicMaterial({ color: '#0b0c0e', side: DoubleSide }))
    cap.material.userData.outlineParameters = { visible: false }
    cap.position.copy(end).addScaledVector(dir, -0.01)
    cap.lookAt(end.clone().add(dir))
    cap.name = `${name}CuffInner`
    arms.add(cuff, cap)
  }
  return arms
}

function buildHead(): { skull: Group, faceCanvas: HTMLCanvasElement, faceTexture: CanvasTexture } {
  const skull = new Group()
  skull.name = 'Skull'

  const head = new Mesh(shapeGeometry(new SphereGeometry(R, 64, 48), shapeHead), toon(COLORS.skin, {}, true, SOFT_SHADE))
  head.name = 'Head'
  skull.add(head)

  // 얼굴 데칼 (머리가 원점에 있을 때 투영해야 로컬 좌표와 일치한다)
  head.updateMatrixWorld(true)
  const faceCanvas = document.createElement('canvas')
  faceCanvas.width = FACE_SIZE
  faceCanvas.height = FACE_SIZE
  const faceTexture = new CanvasTexture(faceCanvas)
  faceTexture.colorSpace = SRGBColorSpace
  faceTexture.anisotropy = 4
  const faceMaterial = new MeshBasicMaterial({
    map: faceTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
  faceMaterial.userData.outlineParameters = { visible: false }
  const faceGeometry = new DecalGeometry(head, new Vector3(0, -0.005, 0.06), new Euler(), new Vector3(0.2, 0.2, 0.2))
  // 피부 표면에서 살짝 띄워 고개를 돌렸을 때 z-파이팅으로 줄무늬가 생기지 않게 한다
  const fp = faceGeometry.attributes.position
  const fn = faceGeometry.attributes.normal
  for (let i = 0; i < fp.count; i++)
    fp.setXYZ(i, fp.getX(i) + fn.getX(i) * 0.0006, fp.getY(i) + fn.getY(i) * 0.0006, fp.getZ(i) + fn.getZ(i) * 0.0006)
  const face = new Mesh(faceGeometry, faceMaterial)
  face.name = 'Face'
  skull.add(face)

  // 귀와 후프 귀걸이
  for (const side of [-1, 1]) {
    const ear = new Mesh(new SphereGeometry(1, 16, 12), toon(COLORS.skin, {}, true, SOFT_SHADE))
    ear.name = `Ear${side > 0 ? 'L' : 'R'}`
    ear.scale.set(0.01, 0.022, 0.015)
    ear.position.set(side * 0.094, -0.018, -0.006)
    skull.add(ear)
    const hoop = new Mesh(new TorusGeometry(0.014, 0.0018, 8, 32), toon(COLORS.gold, {}, false))
    hoop.name = `Earring${side > 0 ? 'L' : 'R'}`
    hoop.position.set(side * 0.099, -0.05, -0.004)
    hoop.rotation.y = PI / 2
    skull.add(hoop)
  }

  skull.add(buildHair())
  return { skull, faceCanvas, faceTexture }
}

interface Pose { x: number, y: number, z: number }

const HEAD_POSE: Record<Emotion, Pose> = {
  neutral: { x: 0, y: 0, z: 0 },
  smirk: { x: -0.09, y: -0.12, z: 0.07 },
  annoyed: { x: -0.06, y: 0.32, z: -0.05 },
  flustered: { x: 0.16, y: -0.22, z: 0.06 },
  happy: { x: -0.03, y: 0, z: 0.1 },
  sad: { x: 0.2, y: 0.05, z: -0.04 },
  surprised: { x: -0.1, y: 0, z: 0 },
}

export function createKarina(): AvatarController {
  const root = new Group()
  root.name = 'KarinaMalfoy'
  const body = buildBody()
  root.add(body)

  const neckPivot = new Group()
  neckPivot.name = 'NeckPivot'
  neckPivot.position.set(0, NECK_Y, 0)
  const { skull, faceCanvas, faceTexture } = buildHead()
  skull.position.copy(HEAD_OFFSET)
  neckPivot.add(skull)
  root.add(neckPivot)

  const ctx = faceCanvas.getContext('2d')!
  const face: FaceState = { emotion: 'smirk', blink: 0, mouthOpen: 0, lookX: 0, lookY: 0 }
  let faceKey = ''
  const redraw = () => {
    const key = `${face.emotion}|${face.blink.toFixed(1)}|${face.mouthOpen.toFixed(1)}|${face.lookX.toFixed(1)}|${face.lookY.toFixed(1)}`
    if (key === faceKey)
      return
    faceKey = key
    drawFace(ctx, face)
    faceTexture.needsUpdate = true
  }
  redraw()

  let time = 0
  let nextBlink = 2
  let blinkT = -1

  return {
    object: root,
    frame: { target: new Vector3(0, 1.33, 0), height: 0.62 },
    setEmotion(emotion) {
      face.emotion = emotion
    },
    update(dt, state: AvatarFrameState) {
      time += dt

      // 깜빡임
      if (blinkT < 0 && time > nextBlink) {
        blinkT = 0
        nextBlink = time + 2 + Math.random() * 4
      }
      if (blinkT >= 0) {
        blinkT += dt
        face.blink = Math.max(0, Math.sin((blinkT / 0.16) * PI))
        if (blinkT > 0.16) {
          blinkT = -1
          face.blink = 0
        }
      }

      // 립싱크 (텍스트 스트리밍 중에는 입을 움직인다)
      face.mouthOpen = state.speaking
        ? MathUtils.clamp(0.45 + 0.35 * Math.sin(time * 17) + 0.25 * Math.sin(time * 29), 0, 1)
        : 0
      face.lookX = MathUtils.clamp(state.lookX, -1, 1)
      face.lookY = MathUtils.clamp(-state.lookY, -1, 1)
      redraw()

      // 머리 자세: 감정 + 포인터 따라보기 + 숨쉬기 흔들림
      const pose = HEAD_POSE[face.emotion]
      const k = 1 - Math.exp(-dt * 5)
      neckPivot.rotation.x += (pose.x - state.lookY * 0.12 + Math.sin(time * 0.9) * 0.015 - neckPivot.rotation.x) * k
      neckPivot.rotation.y += (pose.y + state.lookX * 0.3 - neckPivot.rotation.y) * k
      neckPivot.rotation.z += (pose.z + Math.sin(time * 0.7) * 0.02 - neckPivot.rotation.z) * k

      const breath = Math.sin(time * 1.8)
      body.scale.set(1 + breath * 0.004, 1 + breath * 0.006, 1 + breath * 0.008)
      neckPivot.position.y = NECK_Y + breath * 0.002
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose()
          const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material]
          materials.forEach((m) => {
            (m as Material & { map?: { dispose: () => void } }).map?.dispose()
            m.dispose()
          })
        }
      })
    },
  }
}
