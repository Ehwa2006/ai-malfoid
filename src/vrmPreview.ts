// 개발용 미리보기 (npm run dev 후 /vrm-preview.html): VRM 모델의 몸짓·표정·장소·차림새를 하나씩 바꿔 본다.
// 주소 뒤에 ?g=fanLaugh&e=smirk&scene=garden&aff=95&date=2026-10-31T21:00 처럼 붙이거나,
// 개발자 도구에서 __pose('cheeks', 'flustered', 'hogsmeade')를 부른다.
import { createApp, h, reactive } from 'vue'
import Avatar3D from './components/Avatar3D.vue'
import type { GestureId } from './avatar2d/gestures'
import type { Emotion } from './lib/markers'
import type { Scene } from './lib/scenes'
import './style.css'

const q = new URLSearchParams(location.search)
const state = reactive({
  gesture: (q.get('g') ?? 'idle') as GestureId,
  emotion: (q.get('e') ?? 'neutral') as Emotion,
  scene: (q.get('scene') ?? 'manor') as Scene,
  affection: Number(q.get('aff') ?? 70),
  now: q.get('date') ? new Date(q.get('date')!) : undefined,
})

declare global {
  interface Window { __pose: (g: GestureId, e?: Emotion, scene?: Scene, date?: string) => void }
}
window.__pose = (g, e, scene, date) => {
  state.gesture = g
  if (e)
    state.emotion = e
  if (scene)
    state.scene = scene
  state.now = date ? new Date(date) : undefined
}

createApp({
  render: () => h('main', { style: 'padding:12px;background:#111;--portrait-max:600px;width:600px' }, [
    h(Avatar3D, {
      emotion: state.emotion,
      scene: state.scene,
      affection: state.affection,
      fixedGesture: state.gesture,
      now: state.now,
      modelUrl: `${import.meta.env.BASE_URL}models/malfoy-draconia.vrm`,
    } as unknown as InstanceType<typeof Avatar3D>['$props']),
  ]),
}).mount('#app')
