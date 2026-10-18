<script setup lang="ts">
// AIRI의 Live2D/VRM 아바타 자리를 대신하는 가벼운 SVG 아바타.
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
  <svg class="avatar" :class="{ speaking }" viewBox="0 0 220 260" role="img" :aria-label="`말포이 (${emotion})`">
    <!-- 목 & 슬리데린 로브 -->
    <path d="M60 260 Q60 205 110 200 Q160 205 160 260 Z" fill="#1b1f1d" />
    <path d="M92 200 L110 240 L128 200 Z" fill="#e8e8e8" />
    <path d="M96 205 L110 236 L124 205 L118 260 L102 260 Z" fill="#1a472a" />
    <path d="M100 222 L120 222 M101 236 L119 236" stroke="#aaaaaa" stroke-width="5" />
    <rect x="98" y="168" width="24" height="36" fill="#f1e3d6" />

    <!-- 얼굴 -->
    <ellipse cx="110" cy="115" rx="52" ry="62" fill="#f6e9dd" />

    <!-- 볼터치 -->
    <g :opacity="face.blush" class="blush">
      <ellipse cx="78" cy="135" rx="12" ry="6" fill="#f28b9b" />
      <ellipse cx="142" cy="135" rx="12" ry="6" fill="#f28b9b" />
    </g>

    <!-- 눈 -->
    <g class="eyes">
      <g :transform="`translate(83 112) scale(1 ${face.eyeScale}) translate(-83 -112)`">
        <ellipse cx="83" cy="112" rx="11" ry="7" fill="#fff" />
        <circle cx="84" cy="112" r="5" fill="#8a9aa6" />
        <circle cx="84" cy="112" r="2.2" fill="#222" />
      </g>
      <g :transform="`translate(137 112) scale(1 ${face.eyeScale}) translate(-137 -112)`">
        <ellipse cx="137" cy="112" rx="11" ry="7" fill="#fff" />
        <circle cx="136" cy="112" r="5" fill="#8a9aa6" />
        <circle cx="136" cy="112" r="2.2" fill="#222" />
      </g>
    </g>

    <!-- 눈썹 & 입 -->
    <path :d="face.browL" stroke="#cfc3a0" stroke-width="4" stroke-linecap="round" fill="none" class="morph" />
    <path :d="face.browR" stroke="#cfc3a0" stroke-width="4" stroke-linecap="round" fill="none" class="morph" />
    <path d="M110 118 Q106 132 110 136" stroke="#d9c2b0" stroke-width="2" fill="none" />
    <path :d="face.mouth" stroke="#a8646a" stroke-width="3" stroke-linecap="round" fill="none" class="morph mouth" />

    <!-- 플래티넘 블론드 머리 (올백) -->
    <path
      d="M56 108 Q50 50 110 42 Q172 46 166 108 Q160 78 140 70 Q120 62 96 68 Q70 74 56 108 Z"
      fill="#efe6c4"
    />
    <path d="M80 66 Q110 50 150 72" stroke="#d8cc9e" stroke-width="3" fill="none" />
    <path d="M70 80 Q100 58 140 64" stroke="#d8cc9e" stroke-width="2" fill="none" />
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
