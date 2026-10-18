<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listModels, pickModel } from '../lib/ollama'
import { DEFAULT_MODEL_URL, type Settings } from '../composables/useChat'

const settings = defineModel<Settings>({ required: true })
const emit = defineEmits<{ 'reset': [], 'close': [], 'model-file': [file: File], 'export-glb': [] }>()

const models = ref<string[]>([])
const status = ref('')

async function refresh() {
  status.value = '모델 목록을 불러오는 중…'
  try {
    models.value = await listModels(settings.value.baseUrl.replace(/\/+$/, ''))
    status.value = models.value.length
      ? `✅ Ollama 연결됨 (모델 ${models.value.length}개)`
      : '⚠️ 설치된 모델이 없어요. `ollama pull exaone3.5:7.8b` 를 실행해 주세요.'
    settings.value.model = pickModel(models.value, settings.value.model)
  }
  catch (e) {
    status.value = `❌ ${(e as Error).message}`
  }
}

function onModelFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file)
    emit('model-file', file)
}

function confirmReset() {
  if (confirm('대화와 호감도를 모두 초기화할까요?'))
    emit('reset')
}

onMounted(refresh)
</script>

<template>
  <div class="panel">
    <header>
      <h2>설정</h2>
      <button class="ghost" @click="emit('close')">✕</button>
    </header>

    <label>
      내 이름 (말포이가 부를 이름)
      <input v-model="settings.userName" maxlength="20">
    </label>

    <label>
      Ollama 주소
      <div class="inline">
        <input v-model="settings.baseUrl" placeholder="/ollama 또는 http://localhost:11434">
        <button @click="refresh">연결 확인</button>
      </div>
    </label>
    <p class="status">{{ status }}</p>

    <label>
      모델
      <select v-if="models.length" v-model="settings.model">
        <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
      </select>
      <input v-else v-model="settings.model">
    </label>

    <label>
      창의성 (temperature): {{ settings.temperature.toFixed(1) }}
      <input v-model.number="settings.temperature" type="range" min="0" max="1.5" step="0.1">
    </label>

    <label>
      기억할 최근 대화 수: {{ settings.historyLimit }}
      <input v-model.number="settings.historyLimit" type="range" min="4" max="60" step="2">
    </label>

    <label>
      아바타
      <select v-model="settings.avatarMode">
        <option value="vrm">3D 원본 모델 (Malfoy Draconia, VRM)</option>
        <option value="procedural">3D 간이 모델 (코드로 생성, 가벼움)</option>
        <option value="2d">2D (가장 가벼운 SVG)</option>
      </select>
    </label>

    <template v-if="settings.avatarMode === 'vrm'">
      <label>
        다른 VRM 모델 주소 (.vrm / .glb, 비우면 기본 모델)
        <input v-model.trim="settings.modelUrl" :placeholder="DEFAULT_MODEL_URL">
      </label>
      <label>
        또는 내 컴퓨터의 모델 파일 열기 (이번 접속에서만 유지)
        <input type="file" accept=".vrm,.glb,.gltf" @change="onModelFile">
      </label>
    </template>
    <button v-if="settings.avatarMode === 'procedural'" class="ghost" @click="emit('export-glb')">간이 3D 모델을 .glb로 내보내기</button>

    <button class="danger" @click="confirmReset">대화 & 호감도 초기화</button>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-size: 1.1rem; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: var(--text-dim); }
.inline { display: flex; gap: 6px; }
.inline input { flex: 1; min-width: 0; }
.status { margin: -6px 0 0; font-size: 0.8rem; color: var(--text-dim); }
.danger { background: #5a1d1d; }
</style>
