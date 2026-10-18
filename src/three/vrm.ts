// 외부 3D 모델 로더. AIRI와 같은 @pixiv/three-vrm을 쓴다.
// 기본 모델은 Sketchfab "Malfoy Draconia"(HiGuys920, CC BY 4.0)를 scripts/convert-draconia로 VRM 1.0으로 바꾼 것이다.
// VRM이 아닌 일반 .glb도 표시는 된다 (표정 없음).
import { Box3, CanvasTexture, MathUtils, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Raycaster, SRGBColorSpace, Vector3, type Material } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm'
import type { Emotion } from '../lib/markers'
import { HEAD_POSE } from './pose'
import type { AvatarController } from './types'

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
const EMOTION_EXPRESSIONS = ['happy', 'angry', 'sad', 'relaxed', 'surprised']

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

/** T포즈 → 자연스럽게 팔을 내린 자세 (정규화된 본 기준 회전, 라디안) */
const REST_POSE: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
  leftUpperArm: [0, 0, -1.22],
  rightUpperArm: [0, 0, 1.22],
  leftLowerArm: [0, -0.35, 0],
  rightLowerArm: [0, 0.35, 0],
  leftHand: [0, 0, 0.1],
  rightHand: [0, 0, -0.1],
}

export async function loadModel(url: string): Promise<AvatarController> {
  const loader = new GLTFLoader()
  loader.register(parser => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  const vrm = gltf.userData.vrm as VRM | undefined
  return vrm ? vrmController(vrm) : glbController(gltf.scene)
}

function vrmController(vrm: VRM): AvatarController {
  VRMUtils.removeUnnecessaryVertices(vrm.scene)
  VRMUtils.combineSkeletons(vrm.scene)
  VRMUtils.rotateVRM0(vrm)
  vrm.scene.traverse(o => (o.frustumCulled = false))

  const humanoid = vrm.humanoid
  for (const [bone, [x, y, z]] of Object.entries(REST_POSE))
    humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName)?.rotation.set(x, y, z)
  vrm.update(0)
  // 스프링 본(머리카락·치마)을 내린 팔 자세 기준으로 다시 맞춘다
  vrm.springBoneManager?.setInitState()

  const head = humanoid.getNormalizedBoneNode('head')
  const chest = humanoid.getNormalizedBoneNode('chest') ?? humanoid.getNormalizedBoneNode('spine')
  const headPos = new Vector3()
  humanoid.getRawBoneNode('head')?.getWorldPosition(headPos)

  const blush = createBlush(vrm)

  // 시선: 머리 앞쪽의 점을 포인터에 따라 움직인다
  const lookTarget = new Object3D()
  vrm.scene.add(lookTarget)
  if (vrm.lookAt) {
    vrm.lookAt.target = lookTarget
    vrm.lookAt.autoUpdate = true
  }

  let emotion: Emotion = 'smirk'
  const weights: Record<string, number> = {}
  let time = 0
  let nextBlink = 2
  let blinkT = -1

  return {
    object: vrm.scene,
    frame: { target: new Vector3(0, headPos.y + 0.03, 0), height: 0.42 },
    // MToon 재질에 맞춘 조명 (간이 모델보다 환경광을 조금 줄인다)
    lighting: { hemisphere: 1.4, key: 2.2, rim: 0.5 },
    setEmotion(e) {
      emotion = e
    },
    update(dt, state) {
      time += dt
      const k = 1 - Math.exp(-dt * 8)

      const em = vrm.expressionManager
      if (em) {
        const target = EXPRESSIONS[emotion]
        for (const name of EMOTION_EXPRESSIONS) {
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
        // 눈을 감는 표정(웃음 등)과 겹치면 표정의 overrideBlink가 깜빡임을 줄인다
        em.setValue('blink', blink)
        em.setValue('aa', state.speaking ? MathUtils.clamp(0.55 + 0.4 * Math.sin(time * 17) + 0.2 * Math.sin(time * 29), 0, 1) : 0)
      }

      blush.setAmount(MathUtils.lerp(blush.amount, BLUSH[emotion], k))

      lookTarget.position.set(state.lookX * 0.8, headPos.y + 0.05 - state.lookY * 0.5, 1.2)

      if (head) {
        const pose = HEAD_POSE[emotion]
        const hk = 1 - Math.exp(-dt * 5)
        head.rotation.x += (pose.x + state.lookY * 0.12 + Math.sin(time * 0.9) * 0.015 - head.rotation.x) * hk
        head.rotation.y += (pose.y + state.lookX * 0.3 - head.rotation.y) * hk
        head.rotation.z += (pose.z + Math.sin(time * 0.7) * 0.02 - head.rotation.z) * hk
      }
      if (chest)
        chest.rotation.x = Math.sin(time * 1.8) * 0.012
      vrm.update(dt)
    },
    dispose() {
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
  const raycaster = new Raycaster()
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
