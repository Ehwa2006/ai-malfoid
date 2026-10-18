<script setup lang="ts">
// AIRI의 Live2D/VRM 아바타 자리를 대신하는 가벼운 SVG 아바타 (TS 말포이).
// emotion prop만 맞춰주면 나중에 Live2D 모델로 교체할 수 있다.
import { computed } from 'vue'
import type { Emotion } from '../lib/markers'

const props = defineProps<{ emotion: Emotion, speaking?: boolean }>()

interface Face {
  browL: string
  browR: string
  mouth: string
  blush: number
  eyeScale: number
}

const FACES: Record<Emotion, Face> = {
  neutral: { browL: 'M70 92 L96 90', browR: 'M124 90 L150 92', mouth: 'M98 150 Q110 153 122 150', blush: 0, eyeScale: 1 },
  smirk: { browL: 'M70 90 L96 92', browR: 'M124 86 L150 90', mouth: 'M98 151 Q114 152 126 144', blush: 0, eyeScale: 0.8 },
  annoyed: { browL: 'M70 86 L96 95', browR: 'M124 95 L150 86', mouth: 'M98 152 Q110 147 122 152', blush: 0, eyeScale: 0.7 },
  flustered: { browL: 'M70 90 L96 86', browR: 'M124 86 L150 90', mouth: 'M100 151 Q105 147 110 151 Q115 155 120 151', blush: 0.75, eyeScale: 1 },
  happy: { browL: 'M70 88 Q83 84 96 88', browR: 'M124 88 Q137 84 150 88', mouth: 'M96 146 Q110 160 124 146', blush: 0.3, eyeScale: 0.9 },
  sad: { browL: 'M70 92 L96 86', browR: 'M124 86 L150 92', mouth: 'M98 154 Q110 146 122 154', blush: 0, eyeScale: 0.9 },
  surprised: { browL: 'M70 84 Q83 78 96 84', browR: 'M124 84 Q137 78 150 84', mouth: 'M104 150 Q110 160 116 150 Q110 144 104 150', blush: 0.2, eyeScale: 1.25 },
}

const face = computed(() => FACES[props.emotion] ?? FACES.neutral)
</script>

<template>
  <svg class="avatar" :class="{ speaking }" viewBox="0 0 220 260" role="img" :aria-label="`TS 말포이 (${emotion})`">
    <!-- 뒷머리 (긴 플래티넘 블론드) -->
    <path
      d="M52 110 Q44 40 110 36 Q176 40 168 110 L176 210 Q150 226 140 200 L80 200 Q70 226 44 210 Z"
      fill="#e9dfb8"
    />

    <!-- 목 & 슬리데린 로브 -->
    <path d="M58 260 Q58 208 110 202 Q162 208 162 260 Z" fill="#1b1f1d" />
    <path d="M94 202 L110 236 L126 202 Z" fill="#e8e8e8" />
    <path d="M98 207 L110 232 L122 207 L117 260 L103 260 Z" fill="#1a472a" />
    <path d="M102 222 L118 222 M102 236 L118 236" stroke="#aaaaaa" stroke-width="5" />
    <rect x="100" y="166" width="20" height="38" fill="#f1e3d6" />

    <!-- 얼굴 (조금 더 갸름하게) -->
    <path d="M62 108 Q62 60 110 58 Q158 60 158 108 Q158 160 110 178 Q62 160 62 108 Z" fill="#f6e9dd" />

    <!-- 볼터치 -->
    <g :opacity="face.blush" class="blush">
      <ellipse cx="80" cy="134" rx="11" ry="6" fill="#f28b9b" />
      <ellipse cx="140" cy="134" rx="11" ry="6" fill="#f28b9b" />
    </g>

    <!-- 눈 (속눈썹 포함) -->
    <g class="eyes">
      <g :transform="`translate(85 112) scale(1 ${face.eyeScale}) translate(-85 -112)`">
        <ellipse cx="85" cy="112" rx="11" ry="8" fill="#fff" />
        <circle cx="86" cy="112" r="5.5" fill="#8a9aa6" />
        <circle cx="86" cy="112" r="2.4" fill="#222" />
        <circle cx="88" cy="110" r="1.3" fill="#fff" />
        <path d="M73 110 Q85 101 97 108 M73 110 L69 106 M76 106 L73 101" stroke="#3a3328" stroke-width="2.2" stroke-linecap="round" fill="none" />
      </g>
      <g :transform="`translate(135 112) scale(1 ${face.eyeScale}) translate(-135 -112)`">
        <ellipse cx="135" cy="112" rx="11" ry="8" fill="#fff" />
        <circle cx="134" cy="112" r="5.5" fill="#8a9aa6" />
        <circle cx="134" cy="112" r="2.4" fill="#222" />
        <circle cx="136" cy="110" r="1.3" fill="#fff" />
        <path d="M123 108 Q135 101 147 110 M147 110 L151 106 M144 106 L147 101" stroke="#3a3328" stroke-width="2.2" stroke-linecap="round" fill="none" />
      </g>
    </g>

    <!-- 눈썹 & 입 -->
    <path :d="face.browL" stroke="#cfc3a0" stroke-width="3" stroke-linecap="round" fill="none" class="morph" />
    <path :d="face.browR" stroke="#cfc3a0" stroke-width="3" stroke-linecap="round" fill="none" class="morph" />
    <path d="M110 120 Q107 130 110 133" stroke="#dcc6b4" stroke-width="1.6" fill="none" />
    <path :d="face.mouth" stroke="#c9677a" stroke-width="3.2" stroke-linecap="round" fill="none" class="morph mouth" />

    <!-- 앞머리 (옆으로 넘긴 스타일) -->
    <path
      d="M56 116 Q50 46 112 42 Q170 44 164 112 Q160 80 142 66 Q120 86 76 82 Q62 92 56 116 Z"
      fill="#efe6c4"
    />
    <path d="M78 80 Q112 70 140 66" stroke="#d8cc9e" stroke-width="2.5" fill="none" />
    <path d="M62 100 Q58 150 66 196 M158 100 Q162 150 154 196" stroke="#d8cc9e" stroke-width="2" fill="none" />
  </svg>
</template>

<style scoped>
.avatar {
  width: 100%;
  max-width: 260px;
  filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.45));
  animation: breathe 4s ease-in-out infinite;
}
.morph {
  transition: d 0.35s ease;
}
.blush {
  transition: opacity 0.4s ease;
}
.eyes {
  transform-origin: 110px 112px;
  animation: blink 5s infinite;
}
.speaking .mouth {
  animation: talk 0.25s ease-in-out infinite alternate;
  transform-origin: 110px 150px;
}
@keyframes breathe {
  50% { transform: translateY(-3px); }
}
@keyframes blink {
  0%, 96%, 100% { transform: scaleY(1); }
  98% { transform: scaleY(0.1); }
}
@keyframes talk {
  to { transform: scaleY(1.6); }
}
</style>
