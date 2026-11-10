<script setup lang="ts">
// 말로 하기 버튼. 두 가지로 쓸 수 있다:
//   누른 채 말하고 떼기 (0.4초 넘게 누르고 있으면) / 한 번 누르고 말하기 (말을 멈추면 스스로 끝, 다시 누르면 끝)
// 키보드(Enter·Space)로는 한 번 누를 때마다 시작·끝.
import { computed } from 'vue'
import type { MicState, SttEngine } from '../composables/useVoiceInput'

const props = defineProps<{
  state: MicState
  level: number
  engine: SttEngine | null
  disabled?: boolean
}>()
/** hold: 0.4초 넘게 누르고 있다 (누른 채 말하기) */
const emit = defineEmits<{ start: [], stop: [], hold: [] }>()

const HOLD_MS = 400
let downAt = 0
let holdTimer: ReturnType<typeof setTimeout> | undefined

function onPointerDown(e: PointerEvent) {
  if (props.disabled || e.button !== 0)
    return
  downAt = performance.now()
  if (props.state === 'idle')
    emit('start')
  clearTimeout(holdTimer)
  holdTimer = setTimeout(() => {
    if (downAt)
      emit('hold')
  }, HOLD_MS)
}

function onPointerUp() {
  clearTimeout(holdTimer)
  // 꾹 누르고 있었으면 떼는 순간 끝낸다. 짧게 눌렀으면 계속 듣는다 (말을 멈추면 스스로 끝난다)
  if (downAt && performance.now() - downAt > HOLD_MS && props.state === 'listening')
    emit('stop')
  downAt = 0
}

function onClick(e: MouseEvent) {
  // 마우스·터치는 pointerdown/up에서 처리했다. 키보드로 누른 것(detail 0)만 여기서
  if (e.detail !== 0 || props.disabled)
    return
  if (props.state === 'idle')
    emit('start')
  else if (props.state === 'listening')
    emit('stop')
}

/** 짧게 눌러 듣는 중에 한 번 더 누르면 끝낸다 */
function onPointerDownWhileListening(e: PointerEvent) {
  if (props.state === 'listening' && e.button === 0) {
    downAt = 0
    emit('stop')
    return true
  }
  return false
}

const label = computed(() => props.state === 'listening' ? '말하기 끝내기' : props.state === 'transcribing' ? '알아듣는 중' : '말로 하기')
const title = computed(() => {
  if (!props.engine)
    return '말로 하기 (이 브라우저에서는 쓸 수 없어요)'
  const how = props.engine === 'server' ? '로컬 음성 인식' : '브라우저 받아쓰기'
  return `말로 하기 · ${how} (누른 채 말하고 떼거나, 한 번 누르고 말하기)`
})
const ring = computed(() => `0 0 0 ${2 + Math.round(props.level * 10)}px rgb(255 120 140 / ${0.25 + props.level * 0.4})`)
</script>

<template>
  <button
    type="button"
    class="mic"
    :class="state"
    :disabled="disabled || state === 'transcribing'"
    :aria-label="label"
    :aria-pressed="state === 'listening'"
    :title="title"
    :style="state === 'listening' ? { boxShadow: ring } : undefined"
    @pointerdown="(e) => onPointerDownWhileListening(e) || onPointerDown(e)"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @click="onClick"
    @contextmenu.prevent
  >
    <span v-if="state === 'transcribing'" class="dots" aria-hidden="true">…</span>
    <span v-else aria-hidden="true">🎤</span>
  </button>
</template>

<style scoped>
.mic {
  padding: 8px 12px;
  font-size: 1.1rem;
  touch-action: none;
  user-select: none;
  transition: box-shadow 0.08s linear, background 0.15s;
}
.mic.listening {
  background: #b8324a;
  border-color: #ff8fa3;
}
.mic.transcribing .dots {
  display: inline-block;
  animation: blink 1s infinite;
}
@keyframes blink {
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .mic.transcribing .dots { animation: none; }
}
</style>
