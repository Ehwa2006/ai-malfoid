<script setup lang="ts">
import { computed } from 'vue'
import type { DisplayMessage } from '../composables/useChat'
import { cleanReply } from '../lib/reply'

const props = defineProps<{ message: DisplayMessage, streaming?: boolean, canSpeak?: boolean }>()
const emit = defineEmits<{ speak: [] }>()

// *행동 묘사*를 기울임꼴로 분리한다. v-html 없이 안전하게 렌더링.
const segments = computed(() =>
  (props.message.role === 'assistant' ? cleanReply(props.message.text) : props.message.text).split(/(\*[^*]+\*)/g).filter(Boolean).map(part => ({
    action: part.length > 2 && part.startsWith('*') && part.endsWith('*'),
    text: part.startsWith('*') && part.endsWith('*') && part.length > 2 ? part.slice(1, -1) : part,
  })),
)
</script>

<template>
  <div class="row" :class="message.role">
    <div class="bubble">
      <template v-for="(seg, i) in segments" :key="i">
        <span v-if="seg.action" class="action">{{ seg.text }}</span>
        <template v-else>{{ seg.text }}</template>
      </template>
      <span v-if="streaming" class="cursor">▍</span>
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
.speak {
  background: transparent;
  padding: 4px;
  font-size: 0.9rem;
  opacity: 0.45;
}
.speak:hover { opacity: 1; }
.bubble {
  max-width: 78%;
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
.cursor { animation: blink 1s steps(1) infinite; color: var(--silver); }
@keyframes blink { 50% { opacity: 0; } }
</style>
