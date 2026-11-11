<script setup lang="ts">
// 만화 효과 (땀방울, 분노 마크, 김, 반짝이, 하트, "오~호호"…). viewBox 300×390 초상화 좌표로 그린다.
// 2D 초상화는 머리 그룹 안에 그대로 넣고, VRM 모델은 화면에 비친 머리 위치에 맞춰 옮겨 덧씌운다.
import type { Effect } from '../../avatar2d/gestures'

const props = defineProps<{
  part: 'head' | 'body'
  effects: Set<Effect>
  /** 고개를 돌린 쪽 (-1~1). "흥!"이 반대편에 뜬다 */
  yaw: number
  /** 얼굴을 따로 그리지 않는 아바타(VRM)에는 눈물·우울 세로줄·하트 눈빛도 덧그린다 */
  withFace?: boolean
  /** 하트 눈빛 (호감도가 아주 높을 때) */
  heartEyes?: boolean
  /** 얼굴 가운데에서 눈까지 가로 거리 (초상화 좌표) */
  eyeDx?: number
}>()
const has = (e: Effect) => props.effects.has(e)
</script>

<template>
  <g v-if="part === 'head'" class="fx">
    <!-- 얼굴 위에 덧그리는 효과 (VRM처럼 얼굴을 따로 그리지 않을 때) -->
    <g v-if="withFace && has('gloom')" class="fx-gloom">
      <path d="M118 96 L118 120 M126 94 L126 126 M174 94 L174 126 M182 96 L182 120" stroke="#6a6db0" stroke-width="1.2" opacity="0.6" stroke-linecap="round" />
    </g>
    <g v-if="withFace && heartEyes" class="fx-heart-eyes" fill="#ff8fb2" stroke="#fff" stroke-width="0.8">
      <path v-for="dx in [-(eyeDx ?? 26), eyeDx ?? 26]" :key="dx" :d="`M${150 + dx - 2} 136 c-4 -3 -4.6 -7 -1.8 -7.4 c1.4 -0.2 1.8 0.9 1.8 1.6 c0 -0.7 0.4 -1.8 1.8 -1.6 c2.8 0.4 2.2 4.4 -1.8 7.4 Z`" />
    </g>
    <g v-if="withFace && has('tear')" class="fx-tear">
      <path d="M107 150 C104 156 103 160 106 162 C109 162 109 157 107 150 Z" fill="#cfe9ff" stroke="#8cb7dd" stroke-width="0.6" />
    </g>
    <g v-if="has('sweat')" class="fx-sweat"><path d="M214 92 C209 100 208 106 213 108 C218 108 218 101 214 92 Z" fill="#d6efff" stroke="#7fb2d8" stroke-width="0.8" /><path d="M212.4 100 Q211.6 103 212.6 105" stroke="#fff" stroke-width="1" fill="none" /></g>
    <g v-if="has('anger')" class="fx-anger" transform="translate(212 48)">
      <path d="M-8 -2 Q-3 -3 -2 -8 M2 -8 Q3 -3 8 -2 M8 2 Q3 3 2 8 M-2 8 Q-3 3 -8 2" stroke="#e0364f" stroke-width="2.6" stroke-linecap="round" fill="none" />
    </g>
    <g v-if="has('steam')" class="fx-steam">
      <circle cx="96" cy="40" r="7" fill="#fff" opacity="0.75" /><circle cx="104" cy="34" r="5" fill="#fff" opacity="0.7" />
      <circle cx="204" cy="34" r="6.5" fill="#fff" opacity="0.75" /><circle cx="212" cy="26" r="4.5" fill="#fff" opacity="0.65" />
    </g>
    <g v-if="has('exclaim')" class="fx-pop" transform="translate(224 40)">
      <path d="M-3 -16 L3 -16 L1.6 4 L-1.6 4 Z" fill="#ffd34d" stroke="#8a5a00" stroke-width="0.8" /><circle cy="10" r="2.6" fill="#ffd34d" stroke="#8a5a00" stroke-width="0.8" />
    </g>
    <g v-if="has('think')" class="fx-think" transform="translate(222 52)">
      <ellipse rx="20" ry="11" fill="#fff" opacity="0.92" />
      <circle cx="-8" r="2.4" fill="#5c5f66" class="d1" /><circle r="2.4" fill="#5c5f66" class="d2" /><circle cx="8" r="2.4" fill="#5c5f66" class="d3" />
      <circle cx="-16" cy="14" r="3.4" fill="#fff" opacity="0.92" /><circle cx="-22" cy="22" r="2" fill="#fff" opacity="0.92" />
    </g>
    <text v-if="has('ohoho')" class="fx-text fx-ohoho" x="206" y="70">오~호호</text>
    <text v-if="has('yawn')" class="fx-text fx-ohoho" x="206" y="82">하암~</text>
    <text v-if="has('hmph')" class="fx-text fx-hmph" :x="yaw < 0 ? 52 : 214" y="78">흥!</text>
    <g v-if="has('pat')" class="fx-pat">
      <path d="M126 4 C122 18 128 30 142 32 L176 32 C188 30 192 18 186 6 C182 0 176 2 174 8 C172 0 164 -2 160 6 C158 -2 150 -2 147 6 C144 -2 134 -2 132 8 C130 2 128 2 126 4 Z" fill="#f6dccb" stroke="#c99a84" stroke-width="1" />
      <text class="fx-text fx-small" x="196" y="22">쓰담쓰담</text>
    </g>
    <g v-if="has('poke')" class="fx-poke">
      <path d="M240 160 L198 166 C194 167 194 172 198 172 L240 170 Z" fill="#f6dccb" stroke="#c99a84" stroke-width="1" />
      <text class="fx-text fx-small" x="210" y="150">콕</text>
    </g>
  </g>
  <g v-else class="fx">
    <g v-if="has('sparkle')" class="fx-sparkle" fill="#fff7d6">
      <path d="M60 64 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z" class="s1" />
      <path d="M238 108 l1.6 4.6 4.6 1.6 -4.6 1.6 -1.6 4.6 -1.6 -4.6 -4.6 -1.6 4.6 -1.6 Z" class="s2" />
      <path d="M246 40 l1.2 3.6 3.6 1.2 -3.6 1.2 -1.2 3.6 -1.2 -3.6 -3.6 -1.2 3.6 -1.2 Z" class="s3" />
      <path d="M50 150 l1.2 3.6 3.6 1.2 -3.6 1.2 -1.2 3.6 -1.2 -3.6 -3.6 -1.2 3.6 -1.2 Z" class="s2" />
    </g>
    <g v-if="has('hearts')" class="fx-hearts" fill="#ff8fab">
      <path d="M0 4 C-6 -2 -10 2 -6 7 L0 12 L6 7 C10 2 6 -2 0 4 Z" transform="translate(56 250)" class="h1" />
      <path d="M0 4 C-6 -2 -10 2 -6 7 L0 12 L6 7 C10 2 6 -2 0 4 Z" transform="translate(242 236) scale(0.8)" class="h2" />
      <path d="M0 4 C-6 -2 -10 2 -6 7 L0 12 L6 7 C10 2 6 -2 0 4 Z" transform="translate(236 290) scale(0.6)" class="h3" />
    </g>
    <g v-if="has('flowers')" class="fx-flowers" fill="#fffdf6" stroke="#e7dfcf" stroke-width="0.5">
      <circle cx="44" cy="120" r="3" class="p1" /><circle cx="256" cy="170" r="2.6" class="p2" /><circle cx="64" cy="210" r="2.2" class="p3" /><circle cx="236" cy="80" r="2.4" class="p1" />
    </g>
  </g>
</template>

<style scoped>
.fx-text {
  font-family: 'Nanum Myeongjo', 'Batang', serif;
  font-weight: 800;
  font-style: italic;
  font-size: 15px;
  fill: #fff6d8;
  stroke: #3a2a10;
  stroke-width: 2.4;
  paint-order: stroke;
}
.fx-small { font-size: 11px; }
.fx-hmph { fill: #ffd1d1; stroke: #5a1620; }

/* 효과는 나타날 때 톡 튀어나오고, 몇 가지는 계속 살랑인다 */
.fx > g, .fx > text { animation: pop 0.35s cubic-bezier(0.3, 1.6, 0.5, 1) both; transform-box: fill-box; transform-origin: center; }
.fx-sweat { animation: pop 0.35s both, slide 2.4s ease-in 0.4s infinite !important; }
.fx-anger { animation: pop 0.35s both, throb 0.9s ease-in-out infinite !important; }
.fx-steam circle { animation: rise 1.8s ease-out infinite; transform-box: fill-box; }
.fx-steam circle:nth-child(2n) { animation-delay: 0.6s; }
.fx-think .d1, .fx-think .d2, .fx-think .d3 { animation: dot 1.2s ease-in-out infinite; }
.fx-think .d2 { animation-delay: 0.2s; }
.fx-think .d3 { animation-delay: 0.4s; }
.fx-ohoho { animation: pop 0.35s both, bob 1.1s ease-in-out infinite !important; }
.fx-pat { animation: pat 0.7s ease-in-out infinite !important; }
.fx-poke { animation: poke 0.8s ease-in-out 2 !important; }
.fx-sparkle path { animation: twinkle 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.fx-sparkle .s2 { animation-delay: 0.5s; }
.fx-sparkle .s3 { animation-delay: 1s; }
.fx-hearts path { animation: float 3s ease-in infinite; transform-box: fill-box; }
.fx-hearts .h2 { animation-delay: 1s; }
.fx-hearts .h3 { animation-delay: 2s; }
.fx-flowers circle { animation: drift 5s linear infinite; transform-box: fill-box; }
.fx-flowers .p2 { animation-delay: 1.6s; }
.fx-flowers .p3 { animation-delay: 3.2s; }
.fx-steam-tea path { animation: rise 2.4s ease-out infinite; transform-box: fill-box; }
.fx-tear { animation: pop 0.35s both, drip 2.6s ease-in 0.5s infinite; }
.still.fx *, .still.fx, .still .fx * { animation: none !important; }

@keyframes pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
@keyframes slide { 0% { transform: translateY(0); opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(10px); opacity: 0; } }
@keyframes throb { 50% { transform: scale(1.18); } }
@keyframes rise { from { transform: translateY(4px); opacity: 0.9; } to { transform: translateY(-14px); opacity: 0; } }
@keyframes dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
@keyframes bob { 50% { transform: translateY(-4px) rotate(-3deg); } }
@keyframes pat { 50% { transform: translateY(6px); } }
@keyframes poke { 50% { transform: translateX(-6px); } }
@keyframes twinkle { 0%, 100% { opacity: 0.2; transform: scale(0.6); } 50% { opacity: 1; transform: scale(1.1); } }
@keyframes float { from { transform: translateY(0); opacity: 0; } 20% { opacity: 1; } to { transform: translateY(-60px); opacity: 0; } }
@keyframes drift { from { transform: translate(0, -10px) rotate(0); opacity: 0; } 20% { opacity: 1; } to { transform: translate(12px, 70px) rotate(180deg); opacity: 0; } }
@keyframes drip { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(18px); opacity: 0; } }
.fx-tear { animation: pop 0.35s both, drip 2.6s ease-in 0.5s infinite; }
@media (prefers-reduced-motion: reduce) {
  .fx *, .fx { animation: none !important; }
}
</style>
