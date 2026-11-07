// 외부 3D 모델 로더. AIRI와 같은 @pixiv/three-vrm을 쓴다.
// 기본 모델은 Sketchfab "Malfoy Draconia"(HiGuys920, CC BY 4.0)를 scripts/convert-draconia로 VRM 1.0으로 바꾼 것이다.
// 모델은 그대로 쓰되 2D 일러스트처럼 그리고(셀 셰이딩·화면 기준 외곽선·장소 림 라이트·머리카락 광택),
// 2D 초상화와 같은 몸짓을 팔 IK와 손가락으로 따라 하고, 소품과 계절 장식을 손·머리에 붙인다.
// VRM이 아닌 일반 .glb도 표시는 된다 (표정·몸짓 없음).
import {
  Box3,
  CanvasTexture,
  Color,
  Euler,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  type Raycaster,
  Raycaster as RaycasterImpl,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm'
import type { Emotion } from '../lib/markers'
import type { Scene } from '../lib/scenes'
import type { Prop } from '../avatar2d/gestures'
import { HEAD_POSE } from './pose'
import { armChain, type ArmChain, solveArm } from './ik'
import { type ArmTarget, FINGERS, POSES_3D } from './vrmGestures'
import { createProps, disposeObject, holly, scarf, witchHat } from './props3d'
import { mouthOpen, type AvatarController, type Direction } from './types'

/** 감정 → VRM 표준 표정 가중치 */
const EXPRESSIONS: Record<Emotion, Partial<Record<string, number>>> = {
  neutral: {},
  smirk: { relaxed: 0.75, happy: 0.1 },
  annoyed: { angry: 0.8 },
  flustered: { surprised: 0.35, sad: 0.25, happy: 0.2 },
  happy: { happy: 1 },
  sad: { sad: 0.9 },
  surprised: { surprised: 1 },
}
const FACE_EXPRESSIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'oh']

/** 원본 모델에 없는 볼 홍조. 감정별 세기 */
const BLUSH: Record<Emotion, number> = {
  neutral: 0,
  smirk: 0,
  annoyed: 0.15,
  flustered: 1,
  happy: 0.4,
  sad: 0,
  surprised: 0.25,
}

/** 장소의 빛이 머리카락·옷 가장자리에 닿는 색 (2D 초상화와 같다) */
export const SCENE_RIM: Record<Scene, string> = {
  manor: '#a9c2ff',
  garden: '#ffc49c',
  tearoom: '#ffc77e',
  hogsmeade: '#ffd9a3',
  quidditch: '#ffffff',
  library: '#ffbb70',
  london: '#ffd6a8',
}

/** T포즈 → 자연스럽게 팔을 내린 자세 (정규화된 본 기준 회전, 라디안) */
const REST_POSE: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
  leftUpperArm: [0, 0, -1.22],
  rightUpperArm: [0, 0, 1.22],
  leftLowerArm: [0, -0.35, 0],
  rightLowerArm: [0, 0.35, 0],
  leftHand: [0, 0, 0.1],
  rightHand: [0, 0, -0.1],
}

const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const
const SEGMENTS: Record<(typeof FINGER_NAMES)[number], string[]> = {
  Thumb: ['Metacarpal', 'Proximal', 'Distal'],
  Index: ['Proximal', 'Intermediate', 'Distal'],
  Middle: ['Proximal', 'Intermediate', 'Distal'],
  Ring: ['Proximal', 'Intermediate', 'Distal'],
  Little: ['Proximal', 'Intermediate', 'Distal'],
}

/**
 * 소품 자리: 손(캐릭터의 왼손, 두 손으로 드는 것은 두 손 사이)에서 [x, y, z]만큼, 세계 기준 회전 [x, y, z].
 * 손의 회전을 따르지 않고 늘 같은 방향으로 든다 (부채는 보는 사람을 향하고, 찻잔은 똑바로 선다).
 */
const PROP_POSE: Record<Exclude<Prop, null>, { at: [number, number, number], rot: [number, number, number], both?: boolean }> = {
  fanOpen: { at: [-0.01, 0.045, 0.05], rot: [0, 0, 0.55] },
  fanClosed: { at: [0.0, 0.02, 0.03], rot: [0, 0, -0.5] },
  teacup: { at: [-0.03, 0.03, 0.03], rot: [0, 0, 0], both: true },
  parasol: { at: [0.0, 0.0, 0.0], rot: [-0.35, 0, -0.42] },
  broom: { at: [0.0, 0.0, 0.0], rot: [0.1, 0, 0.1] },
  bouquet: { at: [0.0, 0.04, 0.03], rot: [0, 0, 0], both: true },
  giftbox: { at: [0.0, 0.03, 0.03], rot: [0, 0, 0], both: true },
}

export async function loadModel(url: string): Promise<AvatarController> {
  const loader = new GLTFLoader()
  loader.register(parser => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  const vrm = gltf.userData.vrm as VRM | undefined
  return vrm ? vrmController(vrm) : glbController(gltf.scene)
}

interface MToonLike extends Material {
  isMToonMaterial: true
  shadeColorFactor: Color
  shadingToonyFactor: number
  shadingShiftFactor: number
  giEqualizationFactor: number
  parametricRimColorFactor: Color
  parametricRimFresnelPowerFactor: number
  parametricRimLiftFactor: number
  rimLightingMixFactor: number
  outlineWidthMode: string
  outlineWidthFactor: number
  outlineColorFactor: Color
  outlineLightingMixFactor: number
  matcapFactor: Color
  matcapTexture: CanvasTexture | null
  isOutline: boolean
}

/** 머리카락 광택: 위쪽에 밝은 띠가 있는 matcap (애니메이션 그림의 "천사의 고리") */
function hairSheen(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 128, 128)
  const g = ctx.createLinearGradient(0, 18, 0, 54)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,250,235,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(64, 40, 50, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

/** 모델의 MToon 재질을 2D 일러스트처럼 다듬는다 */
function stylize(vrm: VRM) {
  const mtoons: MToonLike[] = []
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh)
      return
    for (const m of ([] as Material[]).concat(mesh.material)) {
      if ((m as MToonLike).isMToonMaterial && !mtoons.includes(m as MToonLike))
        mtoons.push(m as MToonLike)
    }
  })
  const sheen = hairSheen()
  for (const m of mtoons) {
    const face = /face/i.test(m.name)
    const hair = /hair/i.test(m.name)
    // 또렷한 두 단계 명암, 주변광은 고르게 (그림처럼 평평하게)
    m.shadingToonyFactor = 0.96
    m.giEqualizationFactor = 0.85
    if (face) {
      // 얼굴은 그림자를 따뜻한 분홍빛으로, 거의 생기지 않게
      m.shadeColorFactor.set('#f2cfc6')
      m.shadingShiftFactor = 0.75
    }
    else {
      // 옷·머리카락 그림자는 살짝 차가운 보랏빛 (애니메이션 채색)
      m.shadeColorFactor.set(hair ? '#c9b8c6' : '#a99fb8')
      m.shadingShiftFactor = 0.05
    }
    m.parametricRimFresnelPowerFactor = 4.5
    m.parametricRimLiftFactor = 0.0
    m.rimLightingMixFactor = 0.5
    if (!face) {
      // 화면 기준 외곽선: 가까이서도 멀리서도 같은 굵기의 선화
      m.outlineWidthMode = 'screenCoordinates'
      m.outlineWidthFactor = 0.0032
      m.outlineColorFactor.set('#2a2026')
      m.outlineLightingMixFactor = 0.35
    }
    if (hair && !m.isOutline) {
      m.matcapTexture = sheen
      m.matcapFactor.setScalar(0.32)
    }
    m.needsUpdate = true
  }
  return {
    setRim(color: string) {
      for (const m of mtoons) {
        if (!m.isOutline)
          m.parametricRimColorFactor.set(color).multiplyScalar(/face/i.test(m.name) ? 0.1 : 0.22)
      }
    },
  }
}

function vrmController(vrm: VRM): AvatarController {
  VRMUtils.removeUnnecessaryVertices(vrm.scene)
  VRMUtils.combineSkeletons(vrm.scene)
  VRMUtils.rotateVRM0(vrm)
  vrm.scene.traverse(o => (o.frustumCulled = false))

  const humanoid = vrm.humanoid
  const node = (name: VRMHumanBoneName) => humanoid.getNormalizedBoneNode(name)
  const restQ = new Map<Object3D, Quaternion>()
  for (const [bone, [x, y, z]] of Object.entries(REST_POSE)) {
    const n = node(bone as VRMHumanBoneName)
    if (n) {
      n.rotation.set(x, y, z)
      restQ.set(n, n.quaternion.clone())
    }
  }
  vrm.update(0)
  // 스프링 본(머리카락·치마)을 내린 팔 자세 기준으로 다시 맞춘다
  vrm.springBoneManager?.setInitState()

  const style = stylize(vrm)
  const head = node('head')
  const neck = node('neck')
  const chest = node('upperChest') ?? node('chest') ?? node('spine')
  const headPos = new Vector3()
  humanoid.getRawBoneNode('head')?.getWorldPosition(headPos)
  const eyeL = humanoid.getRawBoneNode('leftEye')
  const eyeR = humanoid.getRawBoneNode('rightEye')
  const eyeMid = new Vector3()
  if (eyeL && eyeR)
    eyeMid.addVectors(eyeL.getWorldPosition(new Vector3()), eyeR.getWorldPosition(new Vector3())).multiplyScalar(0.5)
  else
    eyeMid.copy(headPos).add(new Vector3(0, 0.06, 0.06))
  const chestPos = chest ? chest.getWorldPosition(new Vector3()) : headPos.clone().add(new Vector3(0, -0.25, 0))

  const blush = createBlush(vrm)

  // 시선: 머리 앞쪽의 점을 포인터에 따라 움직인다
  const lookTarget = new Object3D()
  vrm.scene.add(lookTarget)
  if (vrm.lookAt) {
    vrm.lookAt.target = lookTarget
    vrm.lookAt.autoUpdate = true
  }

  // ── 팔·손가락 ──
  const chains: Partial<Record<'left' | 'right', ArmChain>> = {}
  for (const side of ['left', 'right'] as const) {
    const u = node(`${side}UpperArm`)
    const l = node(`${side}LowerArm`)
    const h = node(`${side}Hand`)
    if (u && l && h)
      chains[side] = armChain(u, l, h, side)
  }
  const fingers: Record<'left' | 'right', Object3D[][]> = { left: [], right: [] }
  for (const side of ['left', 'right'] as const) {
    fingers[side] = FINGER_NAMES.map(f => SEGMENTS[f].map(seg => node(`${side}${f}${seg}` as VRMHumanBoneName)).filter((n): n is Object3D => !!n))
  }
  const arm = {
    left: { pos: new Vector3(), weight: 0, curl: [0.15, 0.25, 0.3, 0.35, 0.4], started: false },
    right: { pos: new Vector3(), weight: 0, curl: [0.15, 0.25, 0.3, 0.35, 0.4], started: false },
  }

  // ── 소품·계절 장식 ──
  const props = createProps()
  for (const obj of Object.values(props))
    vrm.scene.add(obj)
  let propScale = 0
  let shownProp: Prop = null
  const hat = witchHat()
  const hollyPin = holly()
  const scarfObj = scarf()
  const headOffset = eyeMid.clone().sub(head ? head.getWorldPosition(new Vector3()) : headPos)
  if (head) {
    // 작은 장식 모자처럼 머리 옆(캐릭터의 왼쪽, 화면 오른쪽)에 비스듬히 꽂는다 (정수리에 얹으면 그림 밖으로 나간다)
    hat.position.set(0.07, headOffset.y + 0.075, headOffset.z + 0.0)
    hat.rotation.set(0.15, 0, -0.85)
    hat.scale.setScalar(0.85)
    hollyPin.position.set(0.075, headOffset.y + 0.075, headOffset.z + 0.01)
    head.add(hat, hollyPin)
  }
  if (neck) {
    scarfObj.position.set(0, -0.035, 0.012)
    neck.add(scarfObj)
  }
  hat.visible = hollyPin.visible = scarfObj.visible = false

  let emotion: Emotion = 'smirk'
  const weights: Record<string, number> = {}
  let time = 0
  let nextBlink = 2
  let blinkT = -1
  const tmpV = new Vector3()
  const tmpQ = new Quaternion()
  const anchorQ = new Quaternion()

  /** 몸짓 목표(기준점 + 캐릭터 좌표 오프셋)를 세계 좌표로 */
  function targetWorld(t: ArmTarget, out: Vector3): Vector3 {
    const anchor = t.anchor === 'head' ? head : chest
    if (!anchor)
      return out.set(0, 0, 0)
    anchor.updateWorldMatrix(true, false)
    anchor.getWorldQuaternion(anchorQ)
    const base = t.anchor === 'head' ? tmpV.copy(headOffset).applyQuaternion(anchorQ).add(anchor.getWorldPosition(new Vector3())) : anchor.getWorldPosition(tmpV)
    return out.set(...t.at).applyQuaternion(anchorQ).add(base)
  }

  function poseArms(dir: Direction | undefined, dt: number) {
    const pose = dir ? POSES_3D[dir.gesture.id] : {}
    const k = 1 - Math.exp(-dt * 6)
    for (const side of ['left', 'right'] as const) {
      const chain = chains[side]
      if (!chain)
        continue
      const st = arm[side]
      const target = pose[side]
      const restU = restQ.get(chain.upper)!
      const restL = restQ.get(chain.lower)!
      st.weight += ((target ? 1 : 0) - st.weight) * k
      if (target) {
        const want = targetWorld(target, new Vector3())
        // 처음 움직일 때는 지금 손 위치에서 출발해 목표로 옮겨 간다
        if (!st.started) {
          chain.hand.getWorldPosition(st.pos)
          st.started = true
        }
        // 손을 흔드는 몸짓
        if (dir?.gesture.waveAmp)
          want.x += Math.sin(time * 8.5) * dir.gesture.waveAmp * 0.0025
        st.pos.lerp(want, k)
      }
      if (st.weight < 0.002) {
        chain.upper.quaternion.copy(restU)
        chain.lower.quaternion.copy(restL)
        st.started = false
      }
      else {
        const t = target ?? pose[side]
        const pole = t ? tmpV.set(...t.pole) : tmpV.set(side === 'left' ? 1 : -1, -1, 0)
        solveArm(chain, st.pos, pole)
        // 쉬는 자세와 섞어서 몸짓이 바뀔 때 팔이 부드럽게 오간다
        chain.upper.quaternion.copy(tmpQ.copy(restU).slerp(chain.upper.quaternion, st.weight))
        chain.lower.quaternion.copy(tmpQ.copy(restL).slerp(chain.lower.quaternion, st.weight))
      }
      // 손목 회전
      const rest = REST_POSE[`${side}Hand`] ?? [0, 0, 0]
      const hr = target?.hand ?? rest
      const wave = dir?.gesture.waveAmp && target ? Math.sin(time * 8.5) * 0.25 : 0
      const handQ = tmpQ.setFromEuler(new Euler(hr[0], hr[1], hr[2] + wave))
      chain.hand.quaternion.slerp(handQ, k)
      // 손가락
      const curl = FINGERS[target?.fingers ?? 'relaxed']
      const sign = side === 'left' ? -1 : 1
      fingers[side].forEach((segs, f) => {
        st.curl[f] += (curl[f] - st.curl[f]) * k
        const c = st.curl[f]
        segs.forEach((n, i) => {
          if (f === 0) // 엄지는 손바닥 쪽으로 감싼다
            n.rotation.set(0, -sign * c * 0.5, sign * c * (i ? 0.6 : 0.2))
          else
            n.rotation.set(0, 0, sign * c * (i === 0 ? 1.2 : 1.35))
        })
      })
    }
  }

  function showProps(dir: Direction | undefined, dt: number) {
    const want = dir?.prop ?? null
    // 소품이 바뀌면 작아졌다가 새 소품으로 커진다
    if (want !== shownProp) {
      propScale = Math.max(0, propScale - dt * 6)
      if (propScale === 0) {
        if (shownProp)
          props[shownProp].visible = false
        shownProp = want
        if (shownProp)
          props[shownProp].visible = true
      }
    }
    else if (shownProp) {
      propScale = Math.min(1, propScale + dt * 4)
    }
    if (shownProp) {
      const obj = props[shownProp]
      const pose = PROP_POSE[shownProp]
      const l = chains.left?.hand.getWorldPosition(new Vector3())
      const r = chains.right?.hand.getWorldPosition(new Vector3())
      if (l) {
        obj.position.copy(pose.both && r ? l.add(r).multiplyScalar(0.5) : l).add(new Vector3(...pose.at))
        obj.rotation.set(...pose.rot)
      }
      obj.scale.setScalar(Math.max(0.001, propScale))
    }
    const look = dir?.look
    hat.visible = !!look?.witchHat
    hollyPin.visible = !!look?.holly
    scarfObj.visible = !!look?.scarf
  }

  return {
    object: vrm.scene,
    // 얼굴을 중심으로 머리 위부터 가슴 위까지 (손이 얼굴·쇄골 앞에 오는 몸짓이 보이도록)
    frame: { target: new Vector3(0, (eyeMid.y + 0.16 + chestPos.y - 0.06) / 2, 0), height: eyeMid.y + 0.16 - (chestPos.y - 0.06) },
    lighting: { hemisphere: 1.25, key: 2.3, rim: 0.7 },
    // MToon이 외곽선을 직접 그리므로 OutlineEffect를 또 씌우지 않는다 (이중 외곽선, 두 번 렌더링)
    outlineEffect: false,
    setEmotion(e) {
      emotion = e
    },
    setScene(scene) {
      style.setRim(SCENE_RIM[scene])
    },
    headAnchor() {
      if (!head)
        return null
      head.updateWorldMatrix(true, false)
      const q = head.getWorldQuaternion(new Quaternion())
      const center = headOffset.clone().applyQuaternion(q).add(head.getWorldPosition(new Vector3()))
      const side = new Vector3(0.065, 0, 0).applyQuaternion(q).add(center)
      return { center, side }
    },
    pick(ray: Raycaster) {
      const hit = ray.intersectObject(vrm.scene, true).find(h => (h.object as Mesh).isMesh && !h.object.name.startsWith('prop:'))
      if (!hit || !head)
        return null
      const local = head.worldToLocal(hit.point.clone()).sub(headOffset)
      if (local.length() > 0.2)
        return null
      // 눈보다 위는 머리, 눈 아래 얼굴 앞쪽 양옆은 볼
      if (local.y > 0.02)
        return 'head'
      if (local.y < 0 && local.y > -0.07 && Math.abs(local.x) > 0.02 && local.z > 0)
        return 'cheek'
      return local.y > -0.02 ? 'head' : null
    },
    update(dt, state) {
      time += dt
      const dir = state.direction
      const mood = dir?.mood ?? emotion
      const face = dir?.gesture.face
      const k = 1 - Math.exp(-dt * 8)

      const em = vrm.expressionManager
      if (em) {
        const target: Record<string, number> = { ...EXPRESSIONS[mood] } as Record<string, number>
        // 몸짓이 정한 얼굴: 도도하게 감은 눈, 웃으며 감은 눈, 놀라 벌린 입
        if (face?.closed === 'happy')
          target.happy = 1
        if (face?.mouth === 'o')
          target.oh = 0.8
        for (const name of FACE_EXPRESSIONS) {
          weights[name] = MathUtils.lerp(weights[name] ?? 0, target[name] ?? 0, k)
          em.setValue(name, weights[name])
        }
        if (blinkT < 0 && time > nextBlink) {
          blinkT = 0
          nextBlink = time + 2 + Math.random() * 4
        }
        let blink = 0
        if (blinkT >= 0) {
          blinkT += dt
          blink = Math.max(0, Math.sin((blinkT / 0.16) * Math.PI))
          if (blinkT > 0.16)
            blinkT = -1
        }
        // 도도하게 눈을 내리깐 몸짓, 늦은 밤의 졸린 눈
        const lid = face?.closed === 'smug' ? 0.9 : dir?.look.sleepy && mood === 'neutral' ? 0.35 : 0
        weights.lid = MathUtils.lerp(weights.lid ?? 0, lid, k)
        // 눈을 감는 표정(웃음 등)과 겹치면 표정의 overrideBlink가 깜빡임을 줄인다
        em.setValue('blink', Math.max(blink, weights.lid))
        const laugh = face?.mouth === 'laugh' ? 0.55 : 0
        em.setValue('aa', Math.max(laugh, mouthOpen(state, time)))
      }

      blush.setAmount(MathUtils.lerp(blush.amount, Math.max(BLUSH[mood], (face?.blush ?? 0)), k))

      // 몸짓이 정한 시선이 있으면 그쪽을, 없으면 상대(마우스)를 본다
      const gaze = dir?.gesture.gaze
      const gx = gaze ? gaze.x : state.lookX
      const gy = gaze ? gaze.y : state.lookY
      lookTarget.position.set(gx * 0.8, headPos.y + 0.05 - gy * 0.5, 1.2)

      if (head) {
        const pose = HEAD_POSE[mood]
        const gh = dir?.gesture.head
        // 2D 몸짓의 고개(화면 기준)를 모델 기준 회전으로 옮긴다
        const yaw = (gh?.yaw ?? 0) * 0.5
        const pitch = (gh?.pitch ?? 0) * 0.35
        const roll = -((gh?.roll ?? 0) * Math.PI) / 180
        const talk = state.speaking ? Math.sin(time * 2.3) * 0.03 : 0
        const hk = 1 - Math.exp(-dt * 5)
        head.rotation.x += (pose.x + pitch + state.lookY * 0.12 + Math.sin(time * 0.9) * 0.015 - head.rotation.x) * hk
        head.rotation.y += (pose.y + yaw + state.lookX * 0.3 - head.rotation.y) * hk
        head.rotation.z += (pose.z + roll + talk + Math.sin(time * 0.7) * 0.02 - head.rotation.z) * hk
      }
      if (chest)
        chest.rotation.x = Math.sin(time * 1.8) * 0.012

      poseArms(dir, dt)
      showProps(dir, dt)
      vrm.update(dt)
    },
    dispose() {
      for (const o of [...Object.values(props), hat, hollyPin, scarfObj])
        disposeObject(o)
      VRMUtils.deepDispose(vrm.scene)
    },
  }
}

/** 양 볼에 반투명 홍조(빗금 포함)를 붙인다. 눈 본 위치를 기준으로 자리를 잡는다. */
function createBlush(vrm: VRM) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 32, 2, 64, 32, 60)
  g.addColorStop(0, 'rgba(240,110,130,0.75)')
  g.addColorStop(1, 'rgba(240,110,130,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(64, 32, 62, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(205,70,95,0.8)'
  ctx.lineWidth = 3
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(64 + i * 14 + 6, 22)
    ctx.lineTo(64 + i * 14 - 6, 42)
    ctx.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 })
  const head = vrm.humanoid.getRawBoneNode('head')
  const meshes: Mesh[] = []
  vrm.scene.updateMatrixWorld(true)
  // 얼굴 재질을 쓰는 메시만 대상으로, 정면에서 볼 위치로 광선을 쏴서 피부 표면을 찾는다
  const faceMeshes: Mesh[] = []
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh
    const materials = mesh.isMesh ? ([] as Material[]).concat(mesh.material) : []
    if (materials.some(m => /face/i.test(m.name)))
      faceMeshes.push(mesh)
  })
  const raycaster = new RaycasterImpl()
  for (const eyeName of ['leftEye', 'rightEye'] as const) {
    const eye = vrm.humanoid.getRawBoneNode(eyeName)
    if (!head || !eye)
      continue
    const eyePos = eye.getWorldPosition(new Vector3())
    const outward = Math.sign(eyePos.x) || 1
    const x = eyePos.x + outward * 0.008
    const y = eyePos.y - 0.028
    raycaster.set(new Vector3(x, y, eyePos.z + 1), new Vector3(0, 0, -1))
    const hit = raycaster.intersectObjects(faceMeshes, false)[0]
    if (!hit)
      continue
    const mesh = new Mesh(new PlaneGeometry(0.032, 0.016), material)
    const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? new Vector3(0, 0, 1)
    mesh.position.copy(hit.point).addScaledVector(normal, 0.0015)
    mesh.lookAt(mesh.position.clone().add(normal))
    mesh.renderOrder = 10
    mesh.visible = false
    vrm.scene.add(mesh)
    head.attach(mesh) // 머리를 따라 움직이도록 머리 본의 자식으로 옮긴다
    meshes.push(mesh)
  }
  return {
    amount: 0,
    setAmount(value: number) {
      this.amount = value
      material.opacity = value
      for (const m of meshes)
        m.visible = value > 0.01
    },
  }
}

function glbController(scene: Object3D): AvatarController {
  const box = new Box3().setFromObject(scene)
  const size = box.getSize(new Vector3())
  const top = box.max.y
  let time = 0
  const baseY = scene.position.y
  return {
    object: scene,
    frame: { target: new Vector3((box.min.x + box.max.x) / 2, top - size.y * 0.22, 0), height: size.y * 0.45 },
    setEmotion() {},
    update(dt) {
      time += dt
      scene.position.y = baseY + Math.sin(time * 1.8) * size.y * 0.002
    },
    dispose() {
      VRMUtils.deepDispose(scene)
    },
  }
}
