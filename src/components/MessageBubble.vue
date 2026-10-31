<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { DisplayMessage } from '../composables/useChat'
import { cleanReply } from '../lib/reply'

const props = defineProps<{
  message: DisplayMessage
  streaming?: boolean
  canSpeak?: boolean
  /** 속마음을 엿볼 수 있는지 (호감도가 오르면 열린다) */
  thoughtUnlocked?: boolean
  /** 속마음이 열리는 호감도 */
  thoughtUnlockAt?: number
}>()
const emit = defineEmits<{ speak: [] }>()

// *행동 묘사*를 기울임꼴로 분리한다. v-html 없이 안전하게 렌더링.
const segments = computed(() =>
  (props.message.role === 'assistant' ? cleanReply(props.message.text) : props.message.text).split(/(\*[^*]+\*)/g).filter(Boolean).map(part => ({
    action: part.length > 2 && part.startsWith('*') && part.endsWith('*'),
    text: part.startsWith('*') && part.endsWith('*') && part.length > 2 ? part.slice(1, -1) : part,
  })),
)

const showThought = ref(false)
const thoughtEl = ref<HTMLElement>()
async function toggleThought() {
  showThought.value = !showThought.value
  if (showThought.value) {
    await nextTick()
    thoughtEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}
const hasThought = computed(() => props.message.role === 'assistant' && !!props.message.thought && !props.streaming)
</script>

<template>
  <div class="row" :class="message.role">
    <div class="col">
      <p v-if="message.greeting" class="tag">💌 먼저 말을 걸어왔어요</p>
      <div class="bubble">
        <template v-for="(seg, i) in segments" :key="i">
          <span v-if="seg.action" class="action">{{ seg.text }}</span>
          <template v-else>{{ seg.text }}</template>
        </template>
        <span v-if="streaming" class="cursor">▍</span>
      </div>
      <template v-if="hasThought">
        <button
          v-if="thoughtUnlocked"
          class="thought-toggle"
          :aria-expanded="showThought"
          @click="toggleThought"
        >
          💭 {{ showThought ? '속마음 감추기' : '속마음 엿보기' }}
        </button>
        <span v-else class="thought-locked" :title="`호감도 ${thoughtUnlockAt}부터 속마음을 엿볼 수 있어요`">🔒 속마음 · 호감도 {{ thoughtUnlockAt }}</span>
        <Transition name="fade">
          <p v-if="showThought && thoughtUnlocked" ref="thoughtEl" class="thought">{{ message.thought }}</p>
        </Transition>
      </template>
    </div>
    <button
      v-if="canSpeak && message.role === 'assistant' && message.text"
      class="speak"
      title="다시 듣기"
      aria-label="다시 듣기"
      @click="emit('speak')"
    >
      🔊
    </button>
  </div>
</template>

<style scoped>
.row { display: flex; align-items: flex-end; gap: 4px; margin: 10px 0; }
.row.user { justify-content: flex-end; }
.col { display: flex; flex-direction: column; align-items: flex-start; max-width: 78%; min-width: 0; }
.user .col { align-items: flex-end; }
.speak {
  background: transparent;
  padding: 4px;
  font-size: 0.9rem;
  opacity: 0.45;
}
.speak:hover { opacity: 1; }
.bubble {
  max-width: 100%;
  padding: 10px 14px;
  border-radius: 16px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.assistant .bubble {
  background: var(--bubble-draco);
  border: 1px solid rgb(192 192 192 / 0.15);
  border-bottom-left-radius: 4px;
}
.user .bubble {
  background: var(--bubble-user);
  border-bottom-right-radius: 4px;
}
.action {
  font-style: italic;
  color: var(--text-dim);
}
.tag { margin: 0 0 4px 4px; font-size: 0.75rem; color: #e8c8d4; }
.thought-toggle {
  margin: 4px 0 0 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  background: transparent;
  color: #c9b6e4;
  border: 1px dashed rgb(201 182 228 / 0.35);
  border-radius: 999px;
}
.thought-toggle:hover { background: rgb(201 182 228 / 0.08); }
.thought-locked { margin: 4px 0 0 6px; font-size: 0.72rem; color: var(--text-dim); }
.thought {
  margin: 6px 0 0 4px;
  padding: 8px 12px;
  max-width: 100%;
  border-radius: 14px;
  background: rgb(120 90 170 / 0.16);
  border: 1px solid rgb(201 182 228 / 0.2);
  color: #ddd0ef;
  font-size: 0.88rem;
  font-style: italic;
  line-height: 1.5;
}
.thought::before { content: '(속마음) '; opacity: 0.6; font-style: normal; font-size: 0.78rem; }
.cursor { animation: blink 1s steps(1) infinite; color: var(--silver); }
@keyframes blink { 50% { opacity: 0; } }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s, transform 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
