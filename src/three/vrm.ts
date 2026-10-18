// 외부 3D 모델 로더. AIRI와 같은 @pixiv/three-vrm을 쓴다.
// Sketchfab 모델(.pmx/.fbx/.blend)은 Blender의 VRM Add-on으로 .vrm으로 바꾸면 표정까지 연결된다.
// VRM이 아닌 일반 .glb도 표시는 된다 (표정 없음).
import { Box3, Group, MathUtils, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import type { Emotion } from '../lib/markers'
import type { AvatarController } from './types'

/** 감정 → VRM 표준 표정 가중치 */
const EXPRESSIONS: Record<Emotion, Partial<Record<string, number>>> = {
  neutral: {},
  smirk: { relaxed: 0.5, happy: 0.15 },
  annoyed: { angry: 0.7 },
  flustered: { happy: 0.3, surprised: 0.35 },
  happy: { happy: 0.9 },
  sad: { sad: 0.8 },
  surprised: { surprised: 0.9 },
}
const EXPRESSION_NAMES = ['happy', 'angry', 'sad', 'relaxed', 'surprised']

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
  // T포즈 → 팔을 내린 자세
  humanoid.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.2)
  humanoid.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.2)
  humanoid.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, -0.3, 0)
  humanoid.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0.3, 0)
  vrm.update(0)

  const head = humanoid.getNormalizedBoneNode('head')
  const neck = humanoid.getNormalizedBoneNode('neck')
  const spine = humanoid.getNormalizedBoneNode('chest') ?? humanoid.getNormalizedBoneNode('spine')
  const headPos = new Vector3()
  vrm.humanoid.getRawBoneNode('head')?.getWorldPosition(headPos)

  let emotion: Emotion = 'smirk'
  const weights: Record<string, number> = {}
  let time = 0
  let nextBlink = 2
  let blinkT = -1

  return {
    object: vrm.scene,
    frame: { target: new Vector3(0, headPos.y - 0.14, 0), height: 0.72 },
    setEmotion(e) {
      emotion = e
    },
    update(dt, state) {
      time += dt
      const em = vrm.expressionManager
      if (em) {
        const target = EXPRESSIONS[emotion]
        const k = 1 - Math.exp(-dt * 8)
        for (const name of EXPRESSION_NAMES) {
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
        em.setValue('blink', emotion === 'happy' ? 0 : blink)
        em.setValue('aa', state.speaking ? MathUtils.clamp(0.4 + 0.4 * Math.sin(time * 17) + 0.2 * Math.sin(time * 29), 0, 1) : 0)
      }
      if (head) {
        head.rotation.y = MathUtils.lerp(head.rotation.y, state.lookX * 0.35, 0.1)
        head.rotation.x = MathUtils.lerp(head.rotation.x, state.lookY * 0.15, 0.1)
      }
      if (neck)
        neck.rotation.z = Math.sin(time * 0.7) * 0.03
      if (spine)
        spine.rotation.x = Math.sin(time * 1.8) * 0.01
      vrm.update(dt)
    },
    dispose() {
      VRMUtils.deepDispose(vrm.scene)
    },
  }
}

function glbController(scene: Group): AvatarController {
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
      scene.traverse((o) => {
        const mesh = o as { geometry?: { dispose: () => void } }
        mesh.geometry?.dispose()
      })
    },
  }
}
