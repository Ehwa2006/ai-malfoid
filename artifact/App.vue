<script setup lang="ts">
// 클로드 앱 안에서 가볍게 시험해 보는 카리나 채팅.
// 대화 흐름은 앱·VR·평가와 같은 ChatSession이고, 모델만 Ollama 대신 Claude(sample)다.
// 목소리는 Claude 음성(tts), 말로 하기는 Claude 받아쓰기(dictation)를 쓴다 (안 되는 곳에서는 버튼을 숨긴다).
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import KarinaPortrait from '../src/components/portrait/KarinaPortrait.vue'
import { ChatSession, type SessionEvent, type SessionMessage, type SessionState } from '../server/chatSession'
import { STAGES, stageOf } from '../src/lib/affection'
import { GIFTS, TOUCHES, type Interaction } from '../src/lib/interactions'
import type { Emotion } from '../src/lib/markers'
import { CHARACTER_NAME, CHARACTER_TAGLINE, callName } from '../src/lib/persona'
import { toSegments } from '../src/lib/reply'
import { SCENE_INFO, type Scene } from '../src/lib/scenes'
import type { Dictation, Tts, Voice } from './claude-runtime'
import { claudeChat, isPermanent, type ModelTier, type SampleFn } from './claudeChat'

// ── 저장 (이 브라우저에만. 막혀 있어도 페이지는 돌아간다) ──
const STATE_KEY = 'karina-artifact:state'
const SETTINGS_KEY = 'karina-artifact:settings'
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  }
  catch {
    return null
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {}
}

const settings = reactive({ tier: 'quick' as ModelTier, voiceOn: false, voice: 'airy' as Voice, ...readJson<object>(SETTINGS_KEY) })
watch(settings, v => writeJson(SETTINGS_KEY, v), { deep: true })

// ── Claude 연결 ──
type Availability = 'checking' | 'ready' | 'absent' | 'blocked'
const availability = ref<Availability>(window.claude ? 'checking' : 'absent')
let sample: SampleFn | null = null
const sampleReady: Promise<void> = (async () => {
  try {
    sample = (await window.claude?.use('sample')) ?? null
  }
  catch {
    sample = null
  }
  availability.value = sample ? 'ready' : 'absent'
})()

const session: ChatSession = new ChatSession(
  { load: () => readJson<SessionState>(STATE_KEY), save: s => writeJson(STATE_KEY, s) },
  claudeChat((input, opts) => sample!(input, opts), {
    tier: () => settings.tier,
    speaker: (): string => callName(session.state.userName),
    onFailure: (code) => {
      if (isPermanent(code))
        availability.value = 'blocked'
    },
  }),
)

// ── 화면 상태 ──
const messages = shallowRef<SessionMessage[]>([])
const affection = ref(0)
const scene = ref<Scene>('manor')
const userName = ref('')
const memories = ref<string[]>([])
const emotion = ref<Emotion>('smirk')
const busy = ref(false)
const pending = ref('')
const error = ref('')
const input = ref('')
const reaction = ref<{ id: string, at: number } | null>(null)
const lastDelta = ref<{ value: number, at: number } | null>(null)
/** 대답 뒤에 붙이는 알림 (단계 변화·기억). 저장하지 않는다 */
const notices = ref<Record<number, string[]>>({})
const openThoughts = ref(new Set<number>())
let controller: AbortController | null = null

function sync() {
  const s = session.state
  messages.value = [...s.messages]
  affection.value = s.affection
  scene.value = s.scene
  userName.value = s.userName
  memories.value = s.memories.map(m => m.text)
  const last = [...s.messages].reverse().find(m => m.role === 'assistant')
  if (!busy.value)
    emotion.value = last?.emotion ?? 'smirk'
}
sync()

const stage = computed(() => stageOf(affection.value))
const nextStage = computed(() => STAGES.find(s => s.min > affection.value) ?? null)
const sceneInfo = computed(() => SCENE_INFO[scene.value])
const thinking = computed(() => busy.value && !pending.value)
const canTalk = computed(() => availability.value === 'checking' || availability.value === 'ready')
const lastAssistant = computed(() => {
  const last = messages.value.at(-1)
  return last?.role === 'assistant' ? last : null
})
const choices = computed(() => (busy.value ? [] : lastAssistant.value?.suggestions ?? []))
const fresh = computed(() => !messages.value.some(m => m.role === 'user'))

// ── 대화 ──
const log = ref<HTMLElement>()
async function scrollDown(force = false) {
  await nextTick()
  const el = log.value
  if (el && (force || el.scrollHeight - el.scrollTop - el.clientHeight < 160))
    el.scrollTop = el.scrollHeight
}

function addNotice(at: number, text: string) {
  notices.value = { ...notices.value, [at]: [...(notices.value[at] ?? []), text] }
}

let lastSent: { text?: string, action?: string } | null = null
function onEvent(e: SessionEvent) {
  switch (e.type) {
    case 'turn':
      sync()
      void scrollDown(true)
      break
    case 'reaction':
      reaction.value = { id: e.id, at: Date.now() }
      emotion.value = e.emotion
      break
    case 'emotion':
      emotion.value = e.emotion
      break
    case 'scene':
      scene.value = e.scene
      break
    case 'text':
      pending.value += e.text
      void scrollDown()
      break
    case 'sentence':
      speak(e.text)
      break
    case 'done': {
      busy.value = false
      sync()
      const at = session.state.messages.at(-1)!.at
      if (e.delta)
        lastDelta.value = { value: e.delta, at: Date.now() }
      if (e.stageUp)
        addNotice(at, e.stageUp.up ? `관계가 가까워졌어요 · ${e.stageUp.from} → ${e.stageUp.to}` : `관계가 멀어졌어요 · ${e.stageUp.from} → ${e.stageUp.to}`)
      if (e.memory)
        addNotice(at, `카리나가 기억해 둬요 · ${e.memory}`)
      void scrollDown()
      break
    }
    case 'error':
      error.value = e.message
      if (lastSent?.text && !input.value.trim())
        input.value = lastSent.text
      break
  }
}

async function send(what: { text?: string, action?: string }) {
  if (busy.value || !canTalk.value)
    return false
  error.value = ''
  stopSpeech()
  if (availability.value === 'checking')
    await sampleReady
  if (availability.value !== 'ready')
    return false
  lastSent = what
  busy.value = true
  pending.value = ''
  controller = new AbortController()
  try {
    await session.say(what, onEvent, controller.signal)
  }
  catch (e) {
    error.value = (e as Error).message
  }
  finally {
    // 멈춘 경우: 대사를 다 받기 전이면 방금 한 말이 기록에서 빠지므로 입력칸에 돌려놓는다
    if (controller?.signal.aborted && what.text && session.state.messages.at(-1)?.role !== 'assistant' && !input.value.trim())
      input.value = what.text
    busy.value = false
    pending.value = ''
    controller = null
    sync()
    void scrollDown()
  }
  return true
}

function submit() {
  const text = input.value.trim()
  if (!text || busy.value || !canTalk.value)
    return
  input.value = ''
  void send({ text })
}

function choose(text: string) {
  void send({ text })
}

function stop() {
  controller?.abort()
}

function retry() {
  if (lastSent && !busy.value) {
    if (lastSent.text && input.value.trim() === lastSent.text)
      input.value = ''
    void send(lastSent)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

function toggleThought(at: number) {
  const next = new Set(openThoughts.value)
  if (next.has(at))
    next.delete(at)
  else
    next.add(at)
  openThoughts.value = next
}

// ── 선물·다가가기 ──
const giftDialog = ref<HTMLDialogElement>()
const locked = (item: Interaction) => (item.minAffection ?? 0) > affection.value
function act(item: Interaction) {
  giftDialog.value?.close()
  if (locked(item))
    return
  void send({ action: item.id })
}
/** 초상화의 머리·볼을 눌렀을 때. 아직 허락하지 않은 손길이면 보내지 않고 피한다 (앱과 같다) */
function onPortraitTouch(id: 'pat' | 'poke') {
  const item = TOUCHES.find(t => t.id === id)
  if (!item || busy.value)
    return
  if (locked(item)) {
    reaction.value = { id: 'dodge', at: Date.now() }
    return
  }
  void send({ action: item.id })
}

// ── 목소리 (Claude 음성) ──
let tts: Tts | null = null
const ttsReady = ref(false)
const ttsState = ref<'idle' | 'starting' | 'speaking' | 'paused'>('idle')
let koVoice = false
function speak(text: string) {
  if (!tts || !ttsReady.value || !settings.voiceOn)
    return
  tts.add([{ text, voice: settings.voice, ...(koVoice ? { language: 'ko' } : {}) }]).catch((e: { code?: string }) => {
    if (e?.code === 'not_granted' || e?.code === 'unavailable')
      ttsReady.value = false
  })
}
function stopSpeech() {
  if (tts && ttsState.value !== 'idle')
    tts.stop().catch(() => {})
}

// ── 말로 하기 (Claude 받아쓰기) ──
let dictation: Dictation | null = null
const micReady = ref(false)
const micState = ref<'idle' | 'starting' | 'listening' | 'finishing'>('idle')
const interim = ref('')
const micNote = ref('')
let micKorean = true
let sendAfterMic = false
function toggleMic() {
  if (!dictation)
    return
  if (micState.value === 'idle') {
    micNote.value = ''
    stopSpeech()
    // 클릭에서 곧바로 불러야 한다 (먼저 기다리면 거절된다)
    dictation.start(micKorean ? { language: 'ko' } : {}).catch((e: { code?: string }) => {
      if (e?.code === 'not_granted') {
        micReady.value = false
      }
      else if (e?.code === 'unavailable') {
        if (micKorean) {
          micKorean = false
          micNote.value = '한국어 받아쓰기를 쓸 수 없어요. 다시 누르면 기본 언어로 들어요.'
        }
        else {
          micReady.value = false
        }
      }
      else if (e?.code === 'dismissed') {
        micNote.value = ''
      }
    })
  }
  else {
    sendAfterMic = true
    dictation.stop().catch(() => {})
  }
}

onMounted(() => {
  void scrollDown(true)
  const claude = window.claude
  if (!claude)
    return
  claude.use('tts').then(async (t) => {
    if (!t)
      return
    tts = t
    ttsReady.value = true
    t.onState(({ state, reason }) => {
      ttsState.value = state
      if (reason === 'not_granted' || reason === 'unavailable')
        ttsReady.value = false
    })
    koVoice = (await t.languages?.().catch(() => undefined))?.includes('ko') ?? false
  }).catch(() => {})
  claude.use('dictation').then((d) => {
    if (!d)
      return
    dictation = d
    micReady.value = true
    d.onPartial(({ text }) => { interim.value = text })
    d.onFinal(({ text }) => {
      interim.value = ''
      const t = text.trim()
      if (t)
        input.value = input.value.trim() ? `${input.value.trim()} ${t}` : t
    })
    d.onState(({ state, reason }) => {
      micState.value = state
      if (state !== 'idle')
        return
      interim.value = ''
      if (reason === 'unavailable')
        micReady.value = false
      // 버튼으로 멈췄으면 알아들은 말을 바로 보낸다 (앱의 기본값과 같다)
      if (sendAfterMic && reason === 'stopped')
        submit()
      sendAfterMic = false
    })
  }).catch(() => {})
})

// ── 설정 ──
const settingsDialog = ref<HTMLDialogElement>()
const nameDraft = ref('')
const confirmReset = ref(false)
function openSettings() {
  nameDraft.value = userName.value
  confirmReset.value = false
  settingsDialog.value?.showModal()
}
function saveName() {
  const clean = nameDraft.value.trim()
  if (clean && clean !== userName.value) {
    session.setUserName(clean)
    sync()
  }
}
function resetAll() {
  if (busy.value)
    return
  session.reset()
  notices.value = {}
  openThoughts.value = new Set()
  error.value = ''
  lastDelta.value = null
  sync()
  confirmReset.value = false
  settingsDialog.value?.close()
  void scrollDown(true)
}

const VOICES: { id: Voice, label: string }[] = [
  { id: 'airy', label: '맑은 목소리' },
  { id: 'glassy', label: '또렷한 목소리' },
  { id: 'buttery', label: '부드러운 목소리' },
  { id: 'rounded', label: '둥근 목소리' },
]
</script>

<template>
  <div class="app">
    <aside class="side">
      <div class="portrait-wrap">
        <KarinaPortrait
          :emotion="emotion"
          :speaking="ttsState === 'speaking'"
          :scene="scene"
          :affection="affection"
          :reaction="reaction"
          :thinking="thinking"
          interactive
          @touch="onPortraitTouch"
        />
      </div>
      <div class="status">
        <div class="name-row">
          <h1>{{ CHARACTER_NAME }}</h1>
          <span class="stage-pill">{{ stage.name }}</span>
        </div>
        <p class="tagline">
          {{ CHARACTER_TAGLINE }}
        </p>
        <div class="meter-row">
          <div class="meter" role="meter" aria-label="호감도" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="affection">
            <div class="fill" :style="{ width: `${affection}%` }" />
            <span v-for="s in STAGES.slice(1)" :key="s.min" class="tick" :style="{ left: `${s.min}%` }" />
          </div>
          <span class="meter-num">{{ affection }}</span>
          <span v-if="lastDelta" :key="lastDelta.at" class="delta-pop" :class="lastDelta.value > 0 ? 'up' : 'down'">{{ lastDelta.value > 0 ? `+${lastDelta.value}` : lastDelta.value }}</span>
        </div>
        <p class="meta">
          <span>{{ sceneInfo.label }}</span>
          <span v-if="nextStage" class="dim"> · {{ nextStage.min }}부터 {{ nextStage.name }}</span>
        </p>
        <div class="tools">
          <button type="button" class="tool" :disabled="busy || !canTalk" @click="giftDialog?.showModal()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Zm-1-4h18v4H3V7Zm9 0v14M12 7c-1.5-3-5-3.5-5-1.2C7 7 9.5 7 12 7Zm0 0c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
            선물·다가가기
          </button>
          <button v-if="ttsReady" type="button" class="tool" :class="{ on: settings.voiceOn }" :aria-pressed="settings.voiceOn" @click="settings.voiceOn = !settings.voiceOn; if (!settings.voiceOn) stopSpeech()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path v-if="settings.voiceOn" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><path v-else d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
            {{ settings.voiceOn ? '읽어 주기 켬' : '읽어 주기 끔' }}
          </button>
          <button type="button" class="tool" @click="openSettings">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
            설정
          </button>
        </div>
      </div>
    </aside>

    <main class="chat">
      <div ref="log" class="log" aria-live="polite">
        <p v-if="availability === 'absent'" class="banner">
          이 페이지는 Claude 앱(claude.ai)에서 열어야 카리나가 대답해요.
        </p>
        <p v-else-if="availability === 'blocked'" class="banner">
          이 화면에서는 Claude를 쓸 수 없어서 카리나가 대답하지 못해요. 페이지 권한에서 Claude 사용을 허락하면 다시 쓸 수 있어요.
        </p>
        <p v-else-if="fresh" class="intro">
          Claude가 카리나를 연기해요. 처음 말을 보낼 때 Claude 사용을 허락할지 물어봐요. 대화는 이 브라우저에만 저장돼요.
        </p>

        <template v-for="m in messages" :key="m.at + m.role">
          <div class="msg" :class="m.role">
            <div class="bubble">
              <template v-for="(seg, i) in toSegments(m.text)" :key="i">
                <span v-if="seg.kind === 'action'" class="act">{{ seg.text }}</span>
                <span v-else class="say">{{ seg.text }}</span>
              </template>
            </div>
            <div v-if="m.role === 'assistant' && (m.thought || m.affectionDelta)" class="under">
              <span v-if="m.affectionDelta" class="delta" :class="m.affectionDelta > 0 ? 'up' : 'down'">호감도 {{ m.affectionDelta > 0 ? `+${m.affectionDelta}` : m.affectionDelta }}</span>
              <button v-if="m.thought" type="button" class="thought-btn" :aria-expanded="openThoughts.has(m.at)" @click="toggleThought(m.at)">
                {{ openThoughts.has(m.at) ? '속마음 닫기' : '속마음 엿보기' }}
              </button>
            </div>
            <p v-if="m.thought && openThoughts.has(m.at)" class="thought">
              {{ m.thought }}
            </p>
          </div>
          <p v-for="(n, i) in notices[m.at] ?? []" :key="`n${m.at}${i}`" class="notice">
            {{ n }}
          </p>
        </template>

        <div v-if="busy" class="msg assistant">
          <div class="bubble" :class="{ waiting: !pending }">
            <template v-if="pending">
              <template v-for="(seg, i) in toSegments(pending)" :key="i">
                <span v-if="seg.kind === 'action'" class="act">{{ seg.text }}</span>
                <span v-else class="say">{{ seg.text }}</span>
              </template>
            </template>
            <span v-else class="dots" aria-label="카리나가 생각하는 중"><i /><i /><i /></span>
          </div>
        </div>
      </div>

      <div class="dock">
        <p v-if="error" class="error" role="alert">
          <span>{{ error }}</span>
          <button v-if="canTalk && lastSent" type="button" class="link" @click="retry">
            다시 보내기
          </button>
        </p>
        <p v-else-if="micNote" class="hint">
          {{ micNote }}
        </p>
        <p v-else-if="micState !== 'idle'" class="hint live">
          {{ interim || (micState === 'listening' ? '듣는 중… 다 말했으면 마이크를 다시 눌러요' : '마이크를 켜는 중…') }}
        </p>
        <div v-if="choices.length && canTalk" class="choices">
          <button v-for="c in choices" :key="c" type="button" class="chip" @click="choose(c)">
            {{ c }}
          </button>
        </div>
        <form class="composer" @submit.prevent="submit">
          <button
            v-if="micReady"
            type="button"
            class="icon-btn mic"
            :class="{ live: micState !== 'idle' }"
            :aria-label="micState === 'idle' ? '말로 하기' : '말하기 끝내기'"
            :disabled="!canTalk || busy"
            @click="toggleMic"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
          <textarea
            v-model="input"
            rows="1"
            maxlength="500"
            :placeholder="canTalk ? `${callName(userName)}(으)로 말 걸기… *행동*은 별표로` : '여기서는 대화할 수 없어요'"
            :disabled="!canTalk"
            aria-label="카리나에게 할 말"
            @keydown="onKeydown"
          />
          <button v-if="busy" type="button" class="icon-btn send" aria-label="대답 멈추기" @click="stop">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
          </button>
          <button v-else-if="ttsState !== 'idle'" type="button" class="icon-btn send" aria-label="읽기 멈추기" @click="stopSpeech">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
          </button>
          <button v-else type="submit" class="icon-btn send" aria-label="보내기" :disabled="!canTalk || !input.trim()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </form>
      </div>
    </main>

    <dialog ref="giftDialog" class="sheet" aria-labelledby="gift-title" @click.self="giftDialog?.close()">
      <div class="sheet-body">
        <div class="sheet-head">
          <h2 id="gift-title">
            선물·다가가기
          </h2>
          <button type="button" class="link" @click="giftDialog?.close()">
            닫기
          </button>
        </div>
        <h3>선물</h3>
        <div class="grid">
          <button v-for="g in GIFTS" :key="g.id" type="button" class="item" :disabled="locked(g)" @click="act(g)">
            <span class="item-icon" aria-hidden="true">{{ g.icon }}</span>
            <span>{{ g.label }}</span>
            <small v-if="locked(g)">호감도 {{ g.minAffection }}부터</small>
          </button>
        </div>
        <h3>다가가기</h3>
        <div class="grid">
          <button v-for="t in TOUCHES" :key="t.id" type="button" class="item" :disabled="locked(t)" @click="act(t)">
            <span class="item-icon" aria-hidden="true">{{ t.icon }}</span>
            <span>{{ t.label }}</span>
            <small v-if="locked(t)">호감도 {{ t.minAffection }}부터</small>
          </button>
        </div>
        <p class="hint">
          초상화의 머리나 볼을 눌러도 돼요.
        </p>
      </div>
    </dialog>

    <dialog ref="settingsDialog" class="sheet" aria-labelledby="settings-title" @click.self="settingsDialog?.close()">
      <div class="sheet-body">
        <div class="sheet-head">
          <h2 id="settings-title">
            설정
          </h2>
          <button type="button" class="link" @click="settingsDialog?.close()">
            닫기
          </button>
        </div>

        <label class="field">
          <span>내 이름</span>
          <span class="row">
            <input v-model="nameDraft" maxlength="20" @keydown.enter.prevent="saveName">
            <button type="button" class="small-btn" :disabled="!nameDraft.trim() || nameDraft.trim() === userName" @click="saveName">바꾸기</button>
          </span>
          <small>"해리"나 "포터"면 원작의 관계(학창시절 앙숙)로, 다른 이름이면 새로 알게 된 사람으로 대해요.</small>
        </label>

        <fieldset class="field">
          <legend>대답 속도</legend>
          <label class="radio"><input v-model="settings.tier" type="radio" value="quick"> 빠르게 <small>(바로 대답해요)</small></label>
          <label class="radio"><input v-model="settings.tier" type="radio" value="default"> 꼼꼼하게 <small>(생각한 뒤 대답해서 느려요)</small></label>
        </fieldset>

        <fieldset v-if="ttsReady" class="field">
          <legend>읽어 주기</legend>
          <label class="radio"><input v-model="settings.voiceOn" type="checkbox"> 카리나의 말을 소리 내어 읽기</label>
          <select v-model="settings.voice" :disabled="!settings.voiceOn" aria-label="목소리">
            <option v-for="v in VOICES" :key="v.id" :value="v.id">
              {{ v.label }}
            </option>
          </select>
          <small>Claude 음성이에요. 앱의 카리나 목소리(GPT-SoVITS)와는 달라요.</small>
        </fieldset>

        <div class="field">
          <span>카리나가 기억하는 것</span>
          <ul v-if="memories.length" class="memories">
            <li v-for="(m, i) in memories" :key="i">
              {{ m }}
            </li>
          </ul>
          <small v-else>아직 없어요. 좋아하는 것, 일정, 고민을 말해 보세요.</small>
        </div>

        <div class="field">
          <span>처음부터</span>
          <small>호감도 20, 첫 만남으로 돌아가요. 대화와 기억이 지워져요.</small>
          <span class="row">
            <button v-if="!confirmReset" type="button" class="small-btn" :disabled="busy" @click="confirmReset = true">처음부터 다시</button>
            <template v-else>
              <button type="button" class="small-btn danger" @click="resetAll">지우고 처음부터</button>
              <button type="button" class="small-btn" @click="confirmReset = false">그대로 두기</button>
            </template>
          </span>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.app {
  height: 100dvh;
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
  gap: 20px;
}

/* ── 왼쪽: 초상화와 상태 ── */
.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  min-height: 0;
}
.portrait-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  --portrait-max: 300px;
}
/* 밝은 화면에서는 초상화 그림자를 옅게 */
.portrait-wrap :deep(.portrait) { box-shadow: 0 10px 28px rgb(20 30 25 / 0.22), inset 0 0 0 1px rgb(255 255 255 / 0.08); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .portrait-wrap :deep(.portrait) { box-shadow: 0 18px 40px rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(255 255 255 / 0.08); }
}
:root[data-theme="dark"] .portrait-wrap :deep(.portrait) { box-shadow: 0 18px 40px rgb(0 0 0 / 0.5), inset 0 0 0 1px rgb(255 255 255 / 0.08); }
.status { width: 100%; max-width: 300px; }
.name-row { display: flex; align-items: center; gap: 10px; }
h1 {
  margin: 0;
  font: 700 22px/1.3 "Noto Serif KR", serif;
  letter-spacing: -0.01em;
}
.stage-pill {
  font-size: 12.5px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}
.tagline { margin: 2px 0 10px; font-size: 12.5px; color: var(--text-dim); }
.meter-row { display: flex; align-items: center; gap: 10px; position: relative; }
.meter {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #8aa49a, var(--accent));
  transition: width 0.6s ease;
}
.tick { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--bg); opacity: 0.7; }
.meter-num { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 2ch; text-align: right; }
.delta-pop {
  position: absolute;
  right: 0;
  top: -22px;
  font-size: 13px;
  font-weight: 700;
  animation: pop 2.2s ease forwards;
}
.delta-pop.up { color: var(--up); }
.delta-pop.down { color: var(--down); }
@keyframes pop { 0% { opacity: 0; transform: translateY(6px); } 15% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
.meta { margin: 6px 0 12px; font-size: 13px; }
.dim { color: var(--text-dim); }
.tools { display: flex; flex-wrap: wrap; gap: 8px; }
.tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 13.5px;
  box-shadow: var(--shadow);
}
.tool:hover:not(:disabled) { border-color: var(--accent); }
.tool:disabled { opacity: 0.5; }
.tool.on { color: var(--accent); border-color: var(--accent); }
.tool svg { width: 17px; height: 17px; }

/* ── 오른쪽: 대화 ── */
.chat { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.log {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
}
.banner, .intro {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13.5px;
}
.banner { background: color-mix(in srgb, var(--down) 14%, transparent); }
.intro { background: var(--accent-soft); color: var(--text); }
.msg { display: flex; flex-direction: column; max-width: min(88%, 560px); }
.msg.assistant { align-self: flex-start; }
.msg.user { align-self: flex-end; align-items: flex-end; }
.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  background: var(--bubble-k);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  white-space: pre-wrap;
}
.msg.assistant .bubble { border-top-left-radius: 6px; }
.msg.user .bubble { background: var(--bubble-u); border-top-right-radius: 6px; }
.act { color: var(--text-dim); font-style: italic; }
.act::before { content: "("; }
.act::after { content: ") "; }
.say + .act::before { content: " ("; }
.waiting { padding: 12px 16px; }
.dots { display: inline-flex; gap: 5px; }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--text-dim); animation: blink 1.2s infinite ease-in-out; }
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
.under { display: flex; align-items: center; gap: 10px; margin: 5px 4px 0; font-size: 12.5px; }
.delta { font-weight: 600; }
.delta.up { color: var(--up); }
.delta.down { color: var(--down); }
.thought-btn { border: 0; background: none; padding: 0; color: var(--thought-ink); text-decoration: underline dotted; text-underline-offset: 3px; }
.thought {
  margin: 6px 0 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--thought);
  color: var(--thought-ink);
  font-size: 13.5px;
  border: 1px dashed color-mix(in srgb, var(--thought-ink) 35%, transparent);
}
.notice {
  align-self: center;
  margin: 0;
  font-size: 12.5px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 4px 12px;
  border-radius: 999px;
  text-align: center;
}

.dock { padding: 8px 0 max(16px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px; }
.error, .hint { margin: 0; font-size: 13px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.error { color: var(--down); }
.hint { color: var(--text-dim); }
.hint.live { color: var(--accent); }
.link { border: 0; background: none; padding: 0; color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--surface);
  font-size: 13.5px;
  text-align: left;
}
.chip:hover { background: var(--accent-soft); }
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}
.composer:focus-within { border-color: var(--accent); }
textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 0;
  background: none;
  padding: 8px 6px;
  max-height: 140px;
  field-sizing: content;
  outline: none;
}
.icon-btn {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 0;
  display: grid;
  place-items: center;
  background: var(--surface-2);
}
.icon-btn svg { width: 20px; height: 20px; }
.icon-btn.send { background: var(--accent); color: var(--accent-ink); }
.icon-btn:disabled { opacity: 0.45; }
.icon-btn.mic.live { background: var(--down); color: #fff; animation: breathe 1.6s infinite ease-in-out; }
@keyframes breathe { 50% { opacity: 0.7; } }

/* ── 시트 (선물·설정) ── */
.sheet {
  width: min(520px, calc(100vw - 32px));
  max-height: min(80dvh, 720px);
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.3);
  overflow: auto;
  overscroll-behavior: contain;
}
.sheet::backdrop { background: rgb(0 0 0 / 0.45); }
.sheet-body { padding: 18px 20px 20px; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
h2 { margin: 0; font-size: 17px; }
h3 { margin: 14px 0 8px; font-size: 13.5px; color: var(--text-dim); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 8px; }
.item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg);
  font-size: 13.5px;
  text-align: left;
}
.item:hover:not(:disabled) { border-color: var(--accent); }
.item:disabled { opacity: 0.5; }
.item small { color: var(--text-dim); font-size: 11.5px; }
.item-icon { font-size: 20px; line-height: 1.2; }
.field { display: flex; flex-direction: column; gap: 6px; margin: 16px 0 0; padding: 0; border: 0; font-size: 14px; }
.field > span:first-child, legend { font-weight: 600; padding: 0; margin-bottom: 2px; }
.field small { color: var(--text-dim); font-size: 12.5px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.field input:not([type]), .field select {
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--bg);
  min-width: 0;
}
.field input:not([type]) { flex: 1; }
.radio { display: flex; align-items: center; gap: 8px; }
.radio input { accent-color: var(--accent); }
.small-btn { padding: 7px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); font-size: 13.5px; }
.small-btn:disabled { opacity: 0.5; }
.small-btn.danger { background: var(--down); color: #fff; border-color: transparent; }
.memories { margin: 0; padding-left: 18px; font-size: 13.5px; }

/* ── 좁은 화면: 위에 작은 초상화와 상태, 아래에 대화 ── */
@media (max-width: 760px) {
  .app {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding-top: 12px;
  }
  .side {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding-bottom: 0;
    overflow: visible;
  }
  .portrait-wrap { width: auto; flex: none; --portrait-max: min(116px, 18dvh); }
  .portrait-wrap :deep(.portrait) { width: min(116px, 18dvh); }
  .status { min-width: 0; }
  h1 { font-size: 18px; }
  .tagline { display: none; }
  .meta { margin: 4px 0 8px; font-size: 12.5px; }
  .tools { gap: 6px; }
  .tool { padding: 5px 9px; font-size: 12.5px; box-shadow: none; }
  .tool svg { width: 15px; height: 15px; }
  .msg { max-width: 92%; }
}
@media (prefers-reduced-motion: reduce) {
  .fill, .log { transition: none; scroll-behavior: auto; }
  .dots i, .icon-btn.mic.live, .delta-pop { animation: none; }
}
</style>
