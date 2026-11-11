<script setup lang="ts">
// 3D 모델(VRM)을 2D 일러스트처럼 보여 준다: 장소 배경 그림 위에 투명한 캔버스로 모델을 그리고,
// 2D 초상화와 같은 연출(몸짓·만화 효과·즉각 반응·버릇·계절 차림새)을 모델의 뼈대와 화면 위 효과로 보여 준다.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene as ThreeScene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { Emotion } from '../lib/markers'
import type { Scene } from '../lib/scenes'
import type { GestureId } from '../avatar2d/gestures'
import { useDirector } from '../avatar2d/director'
import { createKarina } from '../three/karina'
import type { AvatarController } from '../three/types'
import SceneBackdrop from './portrait/SceneBackdrop.vue'
import MoeEffects from './portrait/MoeEffects.vue'

const props = withDefaults(defineProps<{
  emotion: Emotion
  speaking?: boolean
  /** 목소리 크기로 정한 입 벌림 0~1 (TTS). 없거나 null이면 speaking 동안 적당히 여닫는다 */
  mouthLevel?: () => number | null
  modelUrl?: string | null
  scene?: Scene
  affection?: number
  /** 상대의 행동(선물·다가가기). at이 바뀔 때마다 한 번 반응한다 */
  reaction?: { id: string, at: number } | null
  /** 답을 생각하는 중 (첫 글자가 오기 전) */
  thinking?: boolean
  /** 머리·볼을 눌러 상호작용할 수 있다 */
  interactive?: boolean
  /** 미리보기용 */
  fixedGesture?: GestureId
  now?: Date
}>(), { scene: 'manor', affection: 50, reaction: null })
const emit = defineEmits<{ error: [message: string], touch: [id: 'pat' | 'poke'] }>()

const container = ref<HTMLDivElement>()
const loading = ref(false)

// ── 연출 (2D 초상화와 같다) ──
const director = useDirector(() => ({
  emotion: props.emotion,
  scene: props.scene,
  affection: props.affection,
  speaking: props.speaking,
  thinking: props.thinking,
  reaction: props.reaction,
  fixedGesture: props.fixedGesture,
  now: props.now,
}))
const { effects, heartEyes } = director

let renderer: WebGLRenderer | null = null
let effect: OutlineEffect | null = null
let avatar: AvatarController | null = null
let frameId = 0
let resizeObserver: ResizeObserver | null = null
const world = new ThreeScene()
// 화각을 좁혀 원근감을 줄인다 (그림처럼 납작하게)
const camera = new PerspectiveCamera(18, 300 / 390, 0.05, 30)
const pointer = { x: 0, y: 0 }

const DEFAULT_LIGHTING = { hemisphere: 1.6, key: 2.2, rim: 0.8 }
const hemi = new HemisphereLight('#ffffff', '#4a5a50', DEFAULT_LIGHTING.hemisphere)
const key = new DirectionalLight('#fff6ea', 2.2)
key.position.set(0.8, 2.4, 2)
const rim = new DirectionalLight('#cfe8ff', 0.8)
rim.position.set(-1.5, 2, -1.5)
world.add(hemi, key, rim)

/** 장소의 빛: 주광 색, 하늘/땅 반사광, 뒤에서 오는 림 라이트 색 */
const SCENE_LIGHT: Record<Scene, { key: string, sky: string, ground: string, rim: string }> = {
  // 얼굴색이 물들지 않도록 주광은 거의 흰빛, 장소의 색은 반사광과 림 라이트로만
  manor: { key: '#fbf6f0', sky: '#eef1fb', ground: '#46524a', rim: '#a9c2ff' },
  garden: { key: '#fff6ee', sky: '#fbf1ec', ground: '#55604a', rim: '#ffc49c' },
  tearoom: { key: '#fff4ea', sky: '#fbf3ea', ground: '#5a4636', rim: '#ffc77e' },
  hogsmeade: { key: '#f6f8ff', sky: '#eef2fc', ground: '#555a74', rim: '#ffd9a3' },
  quidditch: { key: '#ffffff', sky: '#f0f6ff', ground: '#64885a', rim: '#ffffff' },
  library: { key: '#fff4e8', sky: '#faf2e8', ground: '#4e3c2c', rim: '#ffbb70' },
  london: { key: '#fdf5ee', sky: '#f2eef6', ground: '#4a4456', rim: '#ffd6a8' },
}
function applySceneLight(s: Scene) {
  const l = SCENE_LIGHT[s]
  key.color = new Color(l.key)
  hemi.color = new Color(l.sky)
  hemi.groundColor = new Color(l.ground)
  rim.color = new Color(l.rim)
  avatar?.setScene?.(s)
}

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
  camera.position.set(target.x, target.y + 0.02, target.z + Math.max(fitHeight, fitWidth))
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
    world.remove(avatar.object)
    avatar.dispose()
  }
  avatar = next
  const lighting = avatar.lighting ?? DEFAULT_LIGHTING
  hemi.intensity = lighting.hemisphere
  key.intensity = lighting.key
  rim.intensity = lighting.rim
  avatar.setEmotion(props.emotion)
  applySceneLight(props.scene)
  world.add(avatar.object)
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

// ── 만화 효과를 머리 위치에 맞춰 띄운다 (2D 초상화의 머리 좌표 → 화면) ──
const fxHead = ref('translate(0 0)')
/** "흥!"은 고개를 돌린 반대편에 */
const yaw = computed(() => director.gesture.value.head?.yaw ?? 0)
const project = new Vector3()
function placeEffects() {
  const anchor = avatar?.headAnchor?.()
  if (!anchor)
    return
  const toBox = (v: Vector3) => {
    project.copy(v).project(camera)
    return { x: ((project.x + 1) / 2) * 300, y: ((1 - project.y) / 2) * 390 }
  }
  const c = toBox(anchor.center)
  const s = toBox(anchor.side)
  // 2D 초상화에서 얼굴 가운데는 (150, 138), 얼굴 반 폭은 52
  const scale = Math.hypot(s.x - c.x, s.y - c.y) / 52
  fxHead.value = `translate(${(c.x - 150 * scale).toFixed(1)} ${(c.y - 138 * scale).toFixed(1)}) scale(${scale.toFixed(3)})`
}

let last = performance.now()
function loop(now: number) {
  frameId = requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  avatar?.update(dt, {
    speaking: !!props.speaking,
    mouth: props.mouthLevel?.() ?? null,
    lookX: pointer.x,
    lookY: pointer.y,
    direction: {
      gesture: director.gesture.value,
      mood: director.mood.value,
      prop: director.prop.value,
      look: director.look.value,
      heartEyes: director.heartEyes.value,
    },
  })
  placeEffects()
  if (renderer && effect) {
    // OutlineEffect는 autoClear 기본값이 없어 직접 지워야 이전 프레임이 남지 않는다
    renderer.clear()
    if (avatar?.outlineEffect === false)
      renderer.render(world, camera)
    else
      effect.render(world, camera)
  }
}

// 모델의 머리를 누르면 쓰다듬기, 볼을 누르면 콕
const raycaster = new Raycaster()
function onClick(e: MouseEvent) {
  if (!props.interactive || !avatar?.pick || !container.value)
    return
  const rect = container.value.getBoundingClientRect()
  raycaster.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera)
  const part = avatar.pick(raycaster)
  if (part)
    emit('touch', part === 'head' ? 'pat' : 'poke')
}

onMounted(async () => {
  renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  container.value!.prepend(renderer.domElement)
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
watch(() => props.scene, s => applySceneLight(s))

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
const label = computed(() => `카리나 말포이 (${director.mood.value})`)
</script>

<template>
  <div class="card">
    <SceneBackdrop :scene="scene" />
    <div ref="container" class="avatar3d" :class="{ interactive }" :aria-label="label" role="img" @click="onClick">
      <svg class="fx-layer" viewBox="0 0 300 390" aria-hidden="true">
        <g :transform="fxHead">
          <MoeEffects part="head" :effects="effects" :yaw="yaw" with-face :heart-eyes="heartEyes" :eye-dx="18" />
        </g>
        <MoeEffects part="body" :effects="effects" :yaw="yaw" />
      </svg>
      <p v-if="loading" class="loading">모델 불러오는 중…</p>
    </div>
    <div class="grain" aria-hidden="true" />
  </div>
</template>

<style scoped>
.card {
  position: relative;
  width: 100%;
  max-width: var(--portrait-max, 300px);
  aspect-ratio: 300 / 390;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 40px rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(255 255 255 / 0.08);
  isolation: isolate;
}
.avatar3d {
  position: absolute;
  inset: 0;
}
.avatar3d.interactive { cursor: pointer; }
.avatar3d :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
  /* 살짝 진하고 따뜻하게: 셀 애니메이션 채색처럼 */
  filter: saturate(1.08) contrast(1.04);
}
.fx-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
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
  opacity: 0.5;
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
