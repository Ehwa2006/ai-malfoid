<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { DiaryEntry } from '../lib/diary'
import type { Memory } from '../lib/memory'

defineProps<{ memories: Memory[], diary: DiaryEntry[], writing: boolean, busy: boolean, name: string, error?: string | null }>()
const emit = defineEmits<{ forget: [id: string], write: [], deleteDiary: [id: string], close: [] }>()

const tab = ref<'memory' | 'diary'>('memory')

// 모달: 열리면 안으로 초점을 옮기고, Tab은 안에서만 돌고, Esc로 닫히며, 닫히면 원래 자리로 초점을 돌려준다
const panel = ref<HTMLElement>()
let opener: HTMLElement | null = null
onMounted(() => {
  opener = document.activeElement as HTMLElement | null
  panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
  // 누른 버튼이 잠기면(일기 쓰는 중) 초점이 창 밖으로 빠지므로 문서 전체에서 받는다
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  opener?.focus?.()
})
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !panel.value)
    return
  const items = [...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, textarea, [tabindex]:not([tabindex="-1"])')]
  if (!items.length)
    return
  const [first, last] = [items[0], items[items.length - 1]]
  if (!panel.value.contains(document.activeElement)) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  }
  else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  }
  else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

const fmt = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div ref="panel" class="panel" role="dialog" aria-modal="true" aria-label="카리나의 기억과 일기">
      <header>
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'memory'" :class="{ on: tab === 'memory' }" @click="tab = 'memory'">
            📔 기억 <small>{{ memories.length }}</small>
          </button>
          <button role="tab" :aria-selected="tab === 'diary'" :class="{ on: tab === 'diary' }" @click="tab = 'diary'">
            🔏 비밀 일기 <small>{{ diary.length }}</small>
          </button>
        </div>
        <button class="ghost close" aria-label="닫기" @click="emit('close')">✕</button>
      </header>

      <section v-if="tab === 'memory'" class="body">
        <p class="lead">카리나가 {{ name }}에 대해 기억하는 것들이에요. 대화하다 보면 자연스럽게 꺼내요. 틀린 건 지워 주세요.</p>
        <p v-if="!memories.length" class="empty">아직 기억한 게 없어요. 좋아하는 것, 일정, 약속 같은 걸 이야기해 보세요.</p>
        <ul v-else class="memories">
          <li v-for="m in [...memories].reverse()" :key="m.id">
            <span class="text">{{ m.text }}</span>
            <time>{{ fmt(m.at) }}</time>
            <button class="ghost forget" title="잊게 하기" aria-label="잊게 하기" @click="emit('forget', m.id)">✕</button>
          </li>
        </ul>
      </section>

      <section v-else class="body">
        <p class="lead">아무에게도 보여 주지 않는 카리나의 비밀 일기예요. 오늘 나눈 대화를 떠올리며 써요.</p>
        <button class="write" :disabled="writing || busy" @click="emit('write')">
          {{ writing ? '✒️ 일기 쓰는 중…' : '✒️ 오늘의 일기 쓰게 하기' }}
        </button>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="!diary.length && !writing" class="empty">아직 일기가 없어요.</p>
        <article v-for="d in [...diary].reverse()" :key="d.id" class="entry">
          <h4>{{ d.title }} <small>· {{ d.stage }}</small></h4>
          <p>{{ d.text }}</p>
          <footer>
            <time>{{ fmt(d.at) }}</time>
            <button class="ghost" aria-label="일기 지우기" @click="emit('deleteDiary', d.id)">지우기</button>
          </footer>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.55);
}
.panel {
  width: min(560px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--panel);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 20px 48px rgb(0 0 0 / 0.5);
}
header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 0; }
.tabs { display: flex; gap: 6px; }
.tabs button { background: transparent; color: var(--text-dim); padding: 6px 12px; border-radius: 999px; }
.tabs button.on { background: rgb(42 157 92 / 0.2); color: var(--text); }
.tabs small { opacity: 0.6; margin-left: 2px; }
.close { padding: 4px 10px; }
.body { overflow-y: auto; padding: 12px 16px 16px; }
.lead { margin: 0 0 10px; font-size: 0.82rem; color: var(--text-dim); }
.empty { color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 20px 0; }
.memories { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.memories li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.04);
}
.memories .text { font-size: 0.9rem; }
.memories time, .entry time { font-size: 0.7rem; color: var(--text-dim); }
.forget { padding: 2px 6px; }
.write { width: 100%; margin-bottom: 12px; }
.entry {
  margin-bottom: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f4ecd8;
  color: #3b2f22;
  font-family: 'Nanum Myeongjo', 'Batang', serif;
}
.entry h4 { margin: 0 0 6px; font-size: 0.95rem; }
.entry h4 small { font-weight: normal; color: #5e5040; }
.entry p { margin: 0; line-height: 1.7; white-space: pre-wrap; font-size: 0.9rem; }
.entry footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.entry footer time { color: #5e5040; }
.entry footer button { color: #5e5040; padding: 2px 6px; }
.error { margin: 0 0 12px; padding: 8px 10px; border-radius: 8px; font-size: 0.82rem; background: rgb(150 40 40 / 0.25); color: #f0c8c8; }
</style>
