<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { actionMessage, GIFTS, type Interaction, TOUCHES } from '../lib/interactions'

const props = defineProps<{ affection: number, disabled?: boolean }>()
const emit = defineEmits<{ act: [text: string], close: [] }>()

const visible = (items: Interaction[]) => items.map(item => ({ item, locked: (item.minAffection ?? 0) > props.affection }))
const gifts = computed(() => visible(GIFTS))
const touches = computed(() => visible(TOUCHES))

function pick(item: Interaction) {
  emit('act', actionMessage(item))
  emit('close')
}

// 열리면 첫 항목으로 초점을 옮기고, Esc로 닫는다
const root = ref<HTMLElement>()
onMounted(() => {
  root.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <div ref="root" class="tray" role="dialog" aria-label="선물하기·다가가기">
    <section>
      <h3>🎁 선물하기</h3>
      <div class="grid">
        <button
          v-for="{ item, locked } in gifts"
          :key="item.id"
          class="item"
          :disabled="disabled || locked"
          :title="locked ? `호감도 ${item.minAffection}부터` : item.action"
          :aria-label="locked ? `${item.label} (호감도 ${item.minAffection}부터)` : item.label"
          @click="pick(item)"
        >
          <span class="icon" aria-hidden="true">{{ locked ? '🔒' : item.icon }}</span>
          <span>{{ item.label }}</span>
          <small v-if="locked" class="need" aria-hidden="true">♥{{ item.minAffection }}</small>
        </button>
      </div>
    </section>
    <section>
      <h3>🤲 다가가기</h3>
      <div class="grid">
        <button
          v-for="{ item, locked } in touches"
          :key="item.id"
          class="item"
          :disabled="disabled || locked"
          :title="locked ? `호감도 ${item.minAffection}부터` : item.action"
          :aria-label="locked ? `${item.label} (호감도 ${item.minAffection}부터)` : item.label"
          @click="pick(item)"
        >
          <span class="icon" aria-hidden="true">{{ locked ? '🔒' : item.icon }}</span>
          <span>{{ item.label }}</span>
          <small v-if="locked" class="need" aria-hidden="true">♥{{ item.minAffection }}</small>
        </button>
      </div>
    </section>
    <p class="hint">카리나에게는 좋아하는 것과 싫어하는 것이 있어요.</p>
  </div>
</template>

<style scoped>
.tray {
  padding: 12px;
  border-radius: 14px;
  background: var(--panel);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.45);
}
h3 { margin: 0 0 8px; font-size: 0.85rem; color: var(--text-dim); font-weight: 600; }
section + section { margin-top: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  font-size: 0.82rem;
  text-align: left;
  background: rgb(255 255 255 / 0.05);
  border: 1px solid rgb(255 255 255 / 0.08);
}
.item:not(:disabled):hover { background: rgb(42 157 92 / 0.2); border-color: rgb(42 157 92 / 0.5); }
.icon { font-size: 1rem; }
.need { margin-left: auto; font-size: 0.7rem; color: var(--text-dim); }
.hint { margin: 10px 0 0; font-size: 0.72rem; color: var(--text-dim); }
</style>
