<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { DEFAULT_MODEL_URL, useChat } from './composables/useChat'
import { useTts } from './composables/useTts'
import { CHARACTER_NAME, CHARACTER_TAGLINE } from './lib/persona'
import MalfoyAvatar from './components/MalfoyAvatar.vue'
import AffectionMeter from './components/AffectionMeter.vue'
import MessageBubble from './components/MessageBubble.vue'
import SettingsPanel from './components/SettingsPanel.vue'

// three.js는 용량이 커서 채팅 화면이 먼저 뜨도록 나중에 불러온다
const Avatar3D = defineAsyncComponent(() => import('./components/Avatar3D.vue'))

const { settings, messages, affection, stage, emotion, isStreaming, error, lastDelta, send, stop, reset, onReply } = useChat()

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

async function submit() {
  const text = input.value
  input.value = ''
  tts.unlock() // 보내기(사용자 입력) 순간에 소리 재생을 허락받아 둔다
  await send(text)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

watch(() => messages.value.map(m => m.text.length).join(), async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}, { immediate: true })
</script>

<template>
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
      <AffectionMeter :value="affection" :stage="stage" :last-delta="lastDelta" />
      <button class="ghost settings-btn" @click="showSettings = !showSettings">⚙️ 설정</button>
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
          @speak="tts.say(m.text, m.emotion)"
        />
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
  display: flex;
  gap: 8px;
  padding: 14px 24px 20px;
}
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
  .messages, .notice {
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
.composer { padding-left: 16px; padding-right: 16px; }
}
</style>
