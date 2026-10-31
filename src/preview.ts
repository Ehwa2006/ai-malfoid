// 개발용 미리보기 (npm run dev 후 /preview.html): 2D 초상화의 몸짓·표정·장소를 한눈에 본다.
// ?live 를 붙이면 움직이는 상태로, ?only=fanLaugh 처럼 하나만 크게 볼 수 있다.
import { createApp, h } from 'vue'
import KarinaPortrait from './components/portrait/KarinaPortrait.vue'
import { GESTURES, type GestureId } from './avatar2d/gestures'
import { EMOTIONS, type Emotion } from './lib/markers'
import { SCENES } from './lib/scenes'
import './style.css'

const q = new URLSearchParams(location.search)
const live = q.has('live')
const only = q.get('only') as GestureId | null

const MOOD: Partial<Record<GestureId, Emotion>> = {
  fanLaugh: 'smirk', fanPoint: 'smirk', hairFlip: 'smirk', armsCrossed: 'annoyed', fanHide: 'flustered', cheeks: 'flustered',
  fidget: 'flustered', coverMouth: 'surprised', teacup: 'neutral', clasp: 'happy', wave: 'happy', chin: 'neutral',
  clutch: 'sad', handsUp: 'surprised', receive: 'happy',
}

const card = (label: string, p: Record<string, unknown>) => h('figure', { style: `margin:0;--portrait-max:600px;width:${only ? '600px' : '210px'}` }, [
  h(KarinaPortrait, { still: !live, affection: 70, ...p } as unknown as InstanceType<typeof KarinaPortrait>['$props']),
  h('figcaption', { style: 'font:12px sans-serif;color:#aaa;text-align:center;padding:4px' }, label),
])

createApp({
  render: () => h('main', { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px;background:#111' }, only
    ? [card(only, { emotion: MOOD[only] ?? 'neutral', fixedGesture: only, scene: q.get('scene') ?? 'manor' })]
    : [
        ...(Object.keys(GESTURES) as GestureId[]).map((g, i) => card(`${g} · ${MOOD[g] ?? 'neutral'}`, { emotion: MOOD[g] ?? 'neutral', fixedGesture: g, scene: SCENES[i % SCENES.length] })),
        ...EMOTIONS.map(e => card(`표정 ${e}`, { emotion: e, fixedGesture: 'idle', scene: 'manor' })),
      ]),
}).mount('#app')
