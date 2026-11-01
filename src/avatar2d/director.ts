// 아바타 연출: 대답의 감정·장소·호감도·상대의 행동을 보고 지금 할 몸짓, 보일 감정, 띄울 효과, 손에 든 소품,
// 계절 차림새를 정한다. 2D 초상화와 VRM 모델이 같은 연출을 쓴다 (그리는 방법만 다르다).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Emotion } from '../lib/markers'
import type { Scene } from '../lib/scenes'
import { EMOTION_EFFECTS, type Effect, gesture, type GestureId, pickGesture, pickHabit, type Prop, reactionFor } from './gestures'
import { seeded } from './motion'
import { lookFor } from './season'

export interface DirectorInput {
  emotion: Emotion
  scene: Scene
  affection: number
  speaking?: boolean
  thinking?: boolean
  /** 상대의 행동(선물·다가가기). at이 바뀔 때마다 한 번 반응한다 */
  reaction?: { id: string, at: number } | null
  /** 미리보기: 몸짓을 고정한다 */
  fixedGesture?: GestureId
  /** 미리보기: 날짜·시간 */
  now?: Date
  /** 미리보기: 같은 결과가 나오도록 (버릇·시계를 멈춘다) */
  still?: boolean
}

/** 행동에 반응하는 시간 (ms) */
const REACT_MS = 4500

export function useDirector(input: () => DirectorInput) {
  const opts = () => input()
  const rand = opts().still ? seeded(7) : Math.random
  const nowSec = () => performance.now() / 1000

  const gestureId = ref<GestureId>(opts().fixedGesture ?? 'idle')
  /** 행동에 반응하는 동안 덮어쓰는 효과·소품·감정 */
  const reacting = ref<{ effects: Effect[], prop?: Prop, emotion: Emotion, until: number } | null>(null)

  // 날짜·시간에 따른 차림새 (1분마다 다시 본다)
  const clock = ref(new Date())
  const look = computed(() => lookFor(opts().now ?? clock.value, opts().scene))

  // 버릇: 한동안 조용하면 혼자 머리를 넘기거나 찻잔을 드는 등 잠깐 다른 몸짓을 했다가 돌아온다
  let baseGesture: GestureId = gestureId.value
  let habitAt = nowSec() + 16
  let habitUntil = 0

  /** 대답의 감정에 맞는 몸짓으로 바꾼다. 행동에 반응하는 중이면 반응이 끝난 뒤에 */
  function followEmotion() {
    const o = opts()
    if (o.fixedGesture || reacting.value)
      return
    gestureId.value = pickGesture(o.emotion, o.scene, gestureId.value, rand)
    baseGesture = gestureId.value
    habitUntil = 0
    habitAt = nowSec() + 14 + rand() * 12
  }

  /** 주기적으로 불러 반응이 끝났는지, 버릇을 시작하거나 끝낼 때인지 본다 */
  function tick() {
    const o = opts()
    const t = nowSec()
    if (reacting.value && performance.now() > reacting.value.until) {
      reacting.value = null
      followEmotion()
      return
    }
    if (o.fixedGesture || reacting.value || o.speaking || o.thinking)
      return
    if (habitUntil && t > habitUntil) {
      habitUntil = 0
      gestureId.value = baseGesture
      habitAt = t + 14 + rand() * 14
    }
    else if (!habitUntil && t > habitAt) {
      const habit = pickHabit(o.emotion, o.scene, gestureId.value, rand, look.value.sleepy)
      if (habit) {
        gestureId.value = habit
        habitUntil = t + 3.5 + rand() * 2
      }
      else {
        habitAt = t + 14
      }
    }
  }

  watch(() => opts().emotion, followEmotion)
  watch(() => opts().fixedGesture, (g) => {
    if (g)
      gestureId.value = g
  })
  watch(() => opts().reaction?.at, () => {
    const id = opts().reaction?.id
    const r = id ? reactionFor(id) : null
    if (!r)
      return
    gestureId.value = r.gesture
    reacting.value = { effects: r.effects, prop: r.prop, emotion: r.emotion, until: performance.now() + REACT_MS }
  })

  let timer = 0
  let clockTimer = 0
  onMounted(() => {
    if (opts().still)
      return
    timer = window.setInterval(tick, 250)
    clockTimer = window.setInterval(() => { clock.value = new Date() }, 60_000)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    clearInterval(clockTimer)
  })

  const current = computed(() => gesture(gestureId.value))
  /** 지금 보일 감정: 행동에 막 반응하는 중이면 그 감정, 아니면 대답의 감정 */
  const mood = computed<Emotion>(() => reacting.value?.emotion ?? opts().emotion)
  const prop = computed<Prop>(() => reacting.value?.prop ?? current.value.prop ?? null)
  const effects = computed(() => {
    const o = opts()
    const set = new Set<Effect>([...EMOTION_EFFECTS[mood.value], ...(current.value.effects ?? []), ...(reacting.value?.effects ?? [])])
    if (o.thinking)
      set.add('think')
    if (mood.value === 'happy' && o.affection >= 60)
      set.add('hearts')
    return set
  })
  /** 호감도가 아주 높을 때 기쁘거나 설레면 눈 속 빛이 하트가 된다 */
  const heartEyes = computed(() => opts().affection >= 90 && (mood.value === 'happy' || mood.value === 'flustered'))

  return { gestureId, gesture: current, mood, prop, effects, look, heartEyes, rand }
}
