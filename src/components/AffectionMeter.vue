<script setup lang="ts">
import { computed } from 'vue'
import type { Stage } from '../lib/affection'

const props = defineProps<{ value: number, stage: Stage, lastDelta: number | null }>()

const deltaLabel = computed(() => {
  if (props.lastDelta === null || props.lastDelta === 0)
    return ''
  return props.lastDelta > 0 ? `+${props.lastDelta}` : `${props.lastDelta}`
})
</script>

<template>
  <div class="meter">
    <div class="label">
      <span>💚 호감도 · <strong>{{ stage.name }}</strong></span>
      <span>
        {{ value }}/100
        <Transition name="pop">
          <em v-if="deltaLabel" :key="deltaLabel + value" :class="{ down: (lastDelta ?? 0) < 0 }">{{ deltaLabel }}</em>
        </Transition>
      </span>
    </div>
    <div class="track">
      <div class="fill" :style="{ width: `${value}%` }" />
    </div>
  </div>
</template>

<style scoped>
.meter { width: 100%; }
.label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-bottom: 6px;
  color: var(--text-dim);
}
.label strong { color: var(--silver); }
em {
  font-style: normal;
  margin-left: 6px;
  color: #6fe3a0;
  font-weight: 700;
}
em.down { color: #ff7b7b; }
.track {
  height: 10px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.08);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, #1a472a, #2a9d5c, #c0c0c0);
  transition: width 0.6s ease;
}
.pop-enter-active { transition: all 0.3s ease; }
.pop-enter-from { opacity: 0; transform: translateY(6px); }
</style>
