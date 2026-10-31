<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { DEFAULT_MODEL_URL, useChat } from './composables/useChat'
import { useTts } from './composables/useTts'
import { callName, CHARACTER_NAME, CHARACTER_TAGLINE } from './lib/persona'
import { SCENE_INFO } from './lib/scenes'
import MalfoyAvatar from './components/MalfoyAvatar.vue'
import AffectionMeter from './components/AffectionMeter.vue'
import MessageBubble from './components/MessageBubble.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ActionTray from './components/ActionTray.vue'
import MemoryPanel from './components/MemoryPanel.vue'

// three.js는 용량이 커서 채팅 화면이 먼저 뜨도록 나중에 불러온다
const Avatar3D = defineAsyncComponent(() => import('./components/Avatar3D.vue'))

const {
  settings,
  messages,
  affection,
  stage,
  emotion,
  scene,
  memories,
  diary,
  isStreaming,
  isWritingDiary,
  error,
  lastDelta,
  stageChange,
  newMemory,
  diaryError,
  send,
  stop,
  reset,
  onReply,
  writeDiary,
  forgetMemory,
  deleteDiary,
} = useChat()

/** 속마음은 호감도가 이만큼 오르면 엿볼 수 있다 */
const THOUGHT_UNLOCK = 40
const sceneInfo = computed(() => SCENE_INFO[scene.value])
const showTray = ref(false)
const showMemory = ref(false)
/** 마지막 답변의 선택지 (답변이 끝난 뒤에만) */
const choices = computed(() => {
  const last = messages.value.at(-1)
  return settings.value.showChoices && !isStreaming.value && last?.role === 'assistant' ? last.suggestions ?? [] : []
})

// 단계가 바뀌거나 새로 기억하면 잠깐 알린다 (한 답변에서 둘 다 생기면 차례로)
interface Toast { id: number, text: string, kind: 'up' | 'down' | 'memory' }
const toasts = ref<Toast[]>([])
const toast = computed(() => toasts.value[0] ?? null)
let toastSeq = 0
function showToast(text: string, kind: Toast['kind']) {
  toasts.value.push({ id: ++toastSeq, text, kind })
  if (toasts.value.length === 1)
    scheduleNextToast()
}
function scheduleNextToast() {
  setTimeout(() => {
    toasts.value.shift()
    if (toasts.value.length)
      scheduleNextToast()
  }, 3500)
}
watch(stageChange, (c) => {
  if (c)
    showToast(c.up ? `💘 관계가 가까워졌어요 · ${c.from} → ${c.to}` : `💔 조금 멀어졌어요 · ${c.from} → ${c.to}`, c.up ? 'up' : 'down')
})
watch(newMemory, (m) => {
  if (m)
    showToast(`📔 카리나가 기억했어요 · ${m.text}`, 'memory')
})

// 카리나의 대사를 소리 내어 읽는다. 켜져 있으면 입 모양도 목소리를 따라 움직인다.
const tts = useTts(settings, emotion)
onReply(tts)
const speaking = computed(() => settings.value.tts.enabled ? tts.speaking.value : isStreaming.value)
const mouthLevel = computed(() => settings.value.tts.enabled ? tts.level : undefined)

function stopAll() {
  stop()
  tts.stop()
}

function resetAll() {
  tts.stop()
  reset()
}

const input = ref('')
const showSettings = ref(false)
const scroller = ref<HTMLElement>()
const avatar3d = ref<{ exportGlb: () => Promise<void> }>()
const localModelUrl = ref<string | null>(null)
/** null이면 코드로 만든 간이 3D 모델 */
const modelUrl = computed(() => {
  if (settings.value.avatarMode !== 'vrm')
    return null
  return localModelUrl.value ?? (settings.value.modelUrl || DEFAULT_MODEL_URL)
})
const usingDefaultModel = computed(() => modelUrl.value === DEFAULT_MODEL_URL)

function onModelFile(file: File) {
  if (localModelUrl.value)
    URL.revokeObjectURL(localModelUrl.value)
  localModelUrl.value = URL.createObjectURL(file)
}

async function sendText(text: string) {
  if (isStreaming.value)
    return
  showTray.value = false
  tts.unlock() // 보내기(사용자 입력) 순간에 소리 재생을 허락받아 둔다
  await send(text)
}

async function submit() {
  // 답변을 받는 중에는 보내지 않는다 (입력한 글도 지우지 않는다)
  const text = input.value
  if (isStreaming.value || !text.trim())
    return
  input.value = ''
  await sendText(text)
}

// 선물 상자: 바깥을 누르면 닫히고, 키보드로 닫으면 🎁 버튼으로 돌아온다
const trayWrap = ref<HTMLElement>()
const trayBtn = ref<HTMLButtonElement>()
function closeTray(refocus: boolean) {
  showTray.value = false
  if (refocus)
    void nextTick(() => trayBtn.value?.focus())
}
function onOutsidePointer(e: PointerEvent) {
  if (showTray.value && trayWrap.value && !trayWrap.value.contains(e.target as Node))
    closeTray(false)
}
document.addEventListener('pointerdown', onOutsidePointer)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

watch(() => messages.value.map(m => m.text.length).join() + choices.value.length, async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}, { immediate: true })
</script>

<template>
  <div class="sky" :style="{ background: sceneInfo.sky }" aria-hidden="true" />
  <!-- 화면 읽기 프로그램이 알림을 놓치지 않도록 알림 영역은 늘 그 자리에 둔다 -->
  <div class="toast-region" role="status" aria-live="polite">
    <Transition name="toast">
      <p v-if="toast" :key="toast.id" class="toast" :class="toast.kind">{{ toast.text }}</p>
    </Transition>
  </div>
  <div class="layout">
    <aside class="stage">
      <Avatar3D
        v-if="settings.avatarMode !== '2d'"
        ref="avatar3d"
        :emotion="emotion"
        :speaking="speaking"
        :mouth-level="mouthLevel"
        :model-url="modelUrl"
        @error="error = $event"
      />
      <MalfoyAvatar v-else :emotion="emotion" :speaking="speaking" />
      <p v-if="usingDefaultModel" class="credit">
        3D 모델: <a href="https://sketchfab.com/3d-models/harry-potter-malfoy-draconia-3d-model-dl-49a0f6d87e7b4079a6a6a5b15768e627" target="_blank" rel="noopener">"Malfoy Draconia" by HiGuys920</a>
        · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · VRM 변환
      </p>
      <h1>{{ CHARACTER_NAME }}</h1>
      <p class="sub">{{ CHARACTER_TAGLINE }}</p>
      <p class="scene" :title="`지금 있는 곳: ${sceneInfo.label}`">📍 {{ sceneInfo.icon }} {{ sceneInfo.label }}</p>
      <AffectionMeter :value="affection" :stage="stage" :last-delta="lastDelta" />
      <div class="side-buttons">
        <button class="ghost" @click="showMemory = true">📔 기억 · 일기</button>
        <button class="ghost settings-btn" @click="showSettings = !showSettings">⚙️ 설정</button>
      </div>
      <SettingsPanel
        v-if="showSettings"
        v-model="settings"
        :voices="tts.voices.value"
        :gsv-status="tts.gsvStatus.value"
        @refresh-gsv="tts.refreshGsv()"
        class="settings"
        @preview-voice="tts.preview()"
        @reset="resetAll(); showSettings = false"
        @close="showSettings = false"
        @model-file="onModelFile"
        @export-glb="avatar3d?.exportGlb()"
      />
    </aside>

    <main class="chat">
      <div ref="scroller" class="messages">
        <MessageBubble
          v-for="(m, i) in messages"
          :key="m.id"
          :message="m"
          :streaming="isStreaming && i === messages.length - 1 && m.role === 'assistant'"
          :can-speak="settings.tts.enabled && !(isStreaming && i === messages.length - 1)"
          :thought-unlocked="affection >= THOUGHT_UNLOCK"
          :thought-unlock-at="THOUGHT_UNLOCK"
          @speak="tts.say(m.text, m.emotion)"
        />
      </div>

      <div v-if="choices.length" class="choices" aria-label="이렇게 말해 볼까요?">
        <button v-for="c in choices" :key="c" class="choice" @click="sendText(c)">{{ c }}</button>
      </div>

      <p v-if="error" class="error">
        {{ error }}<br>
        <small>Ollama가 실행 중인지(<code>ollama serve</code>), 모델이 설치됐는지 설정에서 확인해 주세요.</small>
      </p>

      <p v-if="settings.tts.enabled && tts.error.value" class="notice">
        🔈 {{ tts.error.value }}
        <button class="ghost" @click="tts.error.value = null">닫기</button>
      </p>

      <form class="composer" @submit.prevent="submit">
        <div ref="trayWrap" class="tray-wrap">
          <button
            ref="trayBtn"
            type="button"
            class="ghost tray-btn"
            :aria-expanded="showTray"
            aria-controls="action-tray"
            title="선물하기 · 다가가기"
            aria-label="선물하기 · 다가가기"
            @click="showTray = !showTray"
          >
            🎁
          </button>
          <ActionTray
            v-if="showTray"
            id="action-tray"
            class="tray"
            :affection="affection"
            :disabled="isStreaming"
            @act="sendText"
            @close="closeTray(true)"
          />
        </div>
        <textarea
          v-model="input"
          rows="1"
          :placeholder="`${settings.userName}(으)로서 말포이에게 말을 걸어보세요…`"
          @keydown="onKeydown"
        />
        <button v-if="isStreaming || tts.speaking.value" type="button" @click="stopAll">중지</button>
        <button v-else type="submit" :disabled="!input.trim()">보내기</button>
      </form>
    </main>
  </div>
  <MemoryPanel
    v-if="showMemory"
    :memories="memories"
    :diary="diary"
    :writing="isWritingDiary"
    :busy="isStreaming"
    :error="diaryError"
    :name="callName(settings.userName)"
    @forget="forgetMemory"
    @delete-diary="deleteDiary"
    @write="writeDiary"
    @close="showMemory = false"
  />
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
  max-width: 1100px;
  margin: 0 auto;
}
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 20px;
  border-right: 1px solid rgb(255 255 255 / 0.06);
  overflow-y: auto;
}
h1 { margin: 8px 0 0; font-size: 1.3rem; letter-spacing: 0.04em; }
.sky {
  position: fixed;
  inset: 0;
  z-index: -1;
  transition: background 1.2s ease;
}
.scene {
  margin: -8px 0 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--text-dim);
  background: rgb(255 255 255 / 0.05);
}
.side-buttons { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.toast {
  position: fixed;
  top: 14px;
  left: 16px;
  right: 16px;
  z-index: 30;
  /* 왼쪽 50%에서 시작하면 폭이 화면 절반으로 줄어든다. 양옆을 잡고 가운데 맞춤 */
  width: fit-content;
  max-width: 520px;
  margin: 0 auto;
  padding: 10px 16px;
  font-size: 0.85rem;
  background: #1d3226;
  border: 1px solid rgb(42 157 92 / 0.5);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
  border-radius: 16px;
  white-space: normal;
  text-align: center;
  line-height: 1.45;
}
.toast.up { background: #3a1f2c; border-color: rgb(232 120 160 / 0.6); }
.toast.down { background: #2a2a2a; border-color: rgb(160 160 160 / 0.4); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 24px 4px;
}
.choice {
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
  padding: 6px 12px;
  font-size: 0.85rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.05);
  border: 1px solid rgb(42 157 92 / 0.45);
  color: var(--text);
}
.choice:hover { background: rgb(42 157 92 / 0.2); }
.sub { margin: 0 0 12px; color: var(--text-dim); font-size: 0.85rem; }
.credit {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-dim);
  text-align: center;
}
.credit a { color: inherit; }
.settings-btn { margin-top: 8px; }
.settings {
  width: 100%;
  padding: 16px;
  background: var(--panel);
  border-radius: 14px;
}
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
.error {
  margin: 0 24px 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #3a1a1a;
  color: #ffb4b4;
  font-size: 0.9rem;
}
.notice {
  margin: 0 24px 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #2a2a1a;
  color: #e8dfa8;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.notice button { margin-left: auto; padding: 2px 8px; }
.composer {
  position: relative;
  display: flex;
  gap: 8px;
  padding: 14px 24px 20px;
}
.tray {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: calc(100% - 6px);
  z-index: 10;
}
.tray-wrap { display: flex; }
.tray-btn { padding: 8px 10px; font-size: 1.1rem; }
.composer textarea {
  flex: 1;
  resize: none;
  min-height: 44px;
  max-height: 140px;
}

@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .stage {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    border-right: none;
    border-bottom: 1px solid rgb(255 255 255 / 0.06);
    padding: 12px 16px;
    max-height: 45vh;
  }
  .stage :deep(.avatar) { max-width: 90px; }
  .stage :deep(.avatar3d) { max-width: 120px; }
  h1, .sub { display: none; }
  .messages, .composer, .choices { padding-left: 16px; padding-right: 16px; }
  .tray { left: 16px; right: 16px; }
  .scene { margin: 0; }
  .notice, .error { margin-left: 16px; margin-right: 16px; }
}
</style>
