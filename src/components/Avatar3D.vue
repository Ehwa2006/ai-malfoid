<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { Emotion } from '../lib/markers'
import { createKarina } from '../three/karina'
import type { AvatarController } from '../three/types'

const props = defineProps<{
  emotion: Emotion
  speaking?: boolean
  /** 목소리 크기로 정한 입 벌림 0~1 (TTS). 없거나 null이면 speaking 동안 적당히 여닫는다 */
  mouthLevel?: () => number | null
  modelUrl?: string | null
}>()
const emit = defineEmits<{ error: [message: string] }>()

const container = ref<HTMLDivElement>()
const loading = ref(false)

let renderer: WebGLRenderer | null = null
let effect: OutlineEffect | null = null
let avatar: AvatarController | null = null
let frameId = 0
let resizeObserver: ResizeObserver | null = null
const scene = new Scene()
const camera = new PerspectiveCamera(26, 1, 0.05, 20)
const pointer = { x: 0, y: 0 }

const DEFAULT_LIGHTING = { hemisphere: 1.6, key: 2.2, rim: 0.8 }
const hemi = new HemisphereLight('#ffffff', '#4a5a50', DEFAULT_LIGHTING.hemisphere)
const key = new DirectionalLight('#fff6ea', 2.2)
key.position.set(0.8, 2.4, 2)
const rim = new DirectionalLight('#cfe8ff', 0.8)
rim.position.set(-1.5, 2, -1.5)
scene.add(hemi, key, rim)

function frameCamera() {
  if (!avatar || !container.value)
    return
  const { clientWidth: w, clientHeight: h } = container.value
  camera.aspect = w / Math.max(h, 1)
  const { target, height } = avatar.frame
  const halfFov = (camera.fov * Math.PI) / 360
  // 세로 높이를 기준으로 맞추되, 화면이 좁으면 가로 폭도 확보한다
  const fitHeight = height / 2 / Math.tan(halfFov)
  const fitWidth = (height * 0.75) / 2 / Math.tan(halfFov) / camera.aspect
  camera.position.set(target.x, target.y + 0.04, target.z + Math.max(fitHeight, fitWidth))
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  renderer?.setSize(w, h, false)
}

// 불러오는 도중 모델이 바뀌거나 컴포넌트가 사라지면, 늦게 끝난 이전 로드 결과는 버린다
let loadSeq = 0
let unmounted = false

async function setAvatar(url: string | null | undefined) {
  const seq = ++loadSeq
  loading.value = true
  let next: AvatarController
  try {
    next = url ? await (await import('../three/vrm')).loadModel(url) : createKarina()
  }
  catch (e) {
    if (seq !== loadSeq || unmounted)
      return
    emit('error', `3D 모델을 불러오지 못했어요: ${(e as Error).message}`)
    next = createKarina()
  }
  if (seq !== loadSeq || unmounted) {
    next.dispose()
    return
  }
  loading.value = false
  if (avatar) {
    scene.remove(avatar.object)
    avatar.dispose()
  }
  avatar = next
  const lighting = avatar.lighting ?? DEFAULT_LIGHTING
  hemi.intensity = lighting.hemisphere
  key.intensity = lighting.key
  rim.intensity = lighting.rim
  avatar.setEmotion(props.emotion)
  scene.add(avatar.object)
  frameCamera()
}

function onPointerMove(e: PointerEvent) {
  const rect = container.value?.getBoundingClientRect()
  if (!rect)
    return
  // 아바타 기준 위치로 정규화 (화면 반대편까지 가면 ±1)
  pointer.x = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2)))
  pointer.y = Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height * 0.3)) / (window.innerHeight / 2)))
}

let last = performance.now()
function loop(now: number) {
  frameId = requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  avatar?.update(dt, { speaking: !!props.speaking, mouth: props.mouthLevel?.() ?? null, lookX: pointer.x, lookY: pointer.y })
  if (renderer && effect) {
    // OutlineEffect는 autoClear 기본값이 없어 직접 지워야 이전 프레임이 남지 않는다
    renderer.clear()
    if (avatar?.outlineEffect === false)
      renderer.render(scene, camera)
    else
      effect.render(scene, camera)
  }
}

onMounted(async () => {
  renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SRGBColorSpace
  container.value!.appendChild(renderer.domElement)
  effect = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.16, 0.12, 0.1] })

  resizeObserver = new ResizeObserver(frameCamera)
  resizeObserver.observe(container.value!)
  window.addEventListener('pointermove', onPointerMove)

  await setAvatar(props.modelUrl)
  frameId = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  unmounted = true
  cancelAnimationFrame(frameId)
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  avatar?.dispose()
  renderer?.dispose()
})

watch(() => props.emotion, e => avatar?.setEmotion(e))
watch(() => props.modelUrl, url => setAvatar(url))

/** 현재 장면의 캐릭터를 .glb 파일로 내려받는다 (Blender 등에서 열 수 있다). */
async function exportGlb() {
  if (!avatar || props.modelUrl)
    return
  const result = await new GLTFExporter().parseAsync(avatar.object, { binary: true })
  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'karina-malfoy.glb'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

defineExpose({ exportGlb })
</script>

<template>
  <div ref="container" class="avatar3d" :aria-label="`카리나 말포이 3D (${emotion})`" role="img">
    <p v-if="loading" class="loading">모델 불러오는 중…</p>
  </div>
</template>

<style scoped>
.avatar3d {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  max-width: 300px;
}
.avatar3d :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--text-dim);
  font-size: 0.85rem;
}
</style>
