<script setup lang="ts">
// 초상화 뒤의 장소 그림. 심도처럼 흐리게 그리고, 장소마다 눈·꽃잎·먼지·빗방울이 떠다닌다.
// 장소에 맞는 빛(따뜻한 촛불, 차가운 달빛…)을 인물 위에 살짝 덧씌운다.
import type { Scene } from '../../lib/scenes'

defineProps<{ scene: Scene, still?: boolean }>()

// 떠다니는 것들의 자리 (고정값이라 매번 같은 모습)
const SPOTS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: -((i * 1.7) % 9),
  dur: 7 + ((i * 3) % 6),
  size: 2 + ((i * 7) % 4),
}))
</script>

<template>
  <div class="backdrop" :class="[scene, { still }]" aria-hidden="true">
    <svg viewBox="0 0 300 390" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="bd-glow">
          <stop offset="0" stop-color="#fff2c8" stop-opacity="0.95" />
          <stop offset="1" stop-color="#ffcf7a" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="bd-moon">
          <stop offset="0" stop-color="#e6f0ff" stop-opacity="0.9" />
          <stop offset="1" stop-color="#9fb8e0" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 저택 응접실: 짙은 초록 벽, 달빛 드는 아치 창, 커튼, 샹들리에 -->
      <g v-if="scene === 'manor'">
        <rect width="300" height="390" fill="#14251c" />
        <rect y="250" width="300" height="140" fill="#0f1c15" />
        <path d="M0 250 H300" stroke="#3b5a46" stroke-width="3" />
        <g fill="none" stroke="#2c4536" stroke-width="2"><rect x="14" y="270" width="80" height="100" /><rect x="206" y="270" width="80" height="100" /></g>
        <path d="M180 220 V70 Q220 20 260 70 V220 Z" fill="#2b3f5e" />
        <path d="M180 220 V70 Q220 20 260 70 V220 Z" fill="url(#bd-moon)" opacity="0.7" />
        <path d="M220 40 V220 M180 120 H260" stroke="#16221c" stroke-width="4" />
        <path d="M160 0 C176 60 170 160 182 250 L150 250 C150 160 156 60 150 0 Z" fill="#163b28" />
        <path d="M290 0 C276 60 282 160 268 250 L300 250 V0 Z" fill="#163b28" />
        <rect x="30" y="70" width="70" height="90" rx="4" fill="#2a2216" stroke="#a88a4a" stroke-width="3" />
        <circle cx="90" cy="22" r="40" fill="url(#bd-glow)" opacity="0.8" />
        <circle cx="70" cy="30" r="10" fill="#ffe7a8" opacity="0.6" /><circle cx="110" cy="26" r="8" fill="#ffe7a8" opacity="0.5" />
      </g>

      <!-- 정원: 해 질 녘 하늘, 생울타리, 하얀 장미 -->
      <g v-else-if="scene === 'garden'">
        <linearGradient id="bd-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a6aa8" /><stop offset="0.55" stop-color="#e8a98f" /><stop offset="1" stop-color="#f6d7a8" /></linearGradient>
        <rect width="300" height="390" fill="url(#bd-dusk)" />
        <path d="M0 200 Q40 170 90 190 T190 180 T300 190 V390 H0 Z" fill="#3c5c3f" />
        <path d="M120 186 V120 L150 96 L180 120 V186 Z" fill="#5b5a6e" opacity="0.6" />
        <path d="M0 240 Q60 210 120 236 T240 228 T300 236 V390 H0 Z" fill="#24402a" />
        <g fill="#fffaf0" opacity="0.85"><circle cx="30" cy="250" r="9" /><circle cx="56" cy="262" r="7" /><circle cx="250" cy="248" r="10" /><circle cx="276" cy="266" r="7" /><circle cx="210" cy="270" r="6" /><circle cx="90" cy="276" r="6" /></g>
        <circle cx="236" cy="90" r="30" fill="url(#bd-glow)" opacity="0.6" />
      </g>

      <!-- 런던의 찻집: 따뜻한 나무, 비 내리는 창, 찻잔 선반, 등불 -->
      <g v-else-if="scene === 'tearoom'">
        <rect width="300" height="390" fill="#3a2618" />
        <rect x="20" y="40" width="120" height="170" rx="6" fill="#4b5d70" />
        <path d="M80 40 V210 M20 125 H140" stroke="#2a1a10" stroke-width="5" />
        <rect x="20" y="40" width="120" height="170" rx="6" fill="none" stroke="#2a1a10" stroke-width="6" />
        <g fill="#cfe0f0" opacity="0.5"><circle cx="40" cy="70" r="2" /><circle cx="110" cy="90" r="2.5" /><circle cx="60" cy="160" r="2" /><circle cx="120" cy="180" r="1.8" /></g>
        <rect x="170" y="80" width="130" height="8" fill="#5e3d22" /><rect x="170" y="150" width="130" height="8" fill="#5e3d22" />
        <g fill="#efe8dc"><path d="M186 66 h18 v6 q-9 8 -18 0 Z" /><path d="M222 66 h18 v6 q-9 8 -18 0 Z" /><path d="M258 66 h18 v6 q-9 8 -18 0 Z" /><path d="M196 136 h18 v6 q-9 8 -18 0 Z" /><path d="M240 136 h18 v6 q-9 8 -18 0 Z" /></g>
        <rect y="270" width="300" height="120" fill="#2a1a10" />
        <circle cx="230" cy="20" r="48" fill="url(#bd-glow)" />
        <circle cx="60" cy="300" r="30" fill="url(#bd-glow)" opacity="0.4" />
      </g>

      <!-- 호그스미드: 눈 덮인 지붕, 불 켜진 창 -->
      <g v-else-if="scene === 'hogsmeade'">
        <linearGradient id="bd-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151d3a" /><stop offset="1" stop-color="#3a4870" /></linearGradient>
        <rect width="300" height="390" fill="url(#bd-night)" />
        <path d="M0 230 L30 180 L60 230 Z M50 240 L95 170 L140 240 Z M170 236 L210 176 L250 236 Z M230 240 L270 190 L300 225 V240 Z" fill="#e8eef8" />
        <rect x="0" y="228" width="300" height="162" fill="#2b2f45" />
        <g fill="#ffcf75"><rect x="20" y="250" width="14" height="18" /><rect x="74" y="246" width="16" height="20" /><rect x="190" y="248" width="14" height="18" /><rect x="250" y="252" width="14" height="18" /></g>
        <g fill="url(#bd-glow)" opacity="0.6"><circle cx="27" cy="259" r="22" /><circle cx="82" cy="256" r="24" /><circle cx="197" cy="257" r="22" /><circle cx="257" cy="261" r="22" /></g>
        <rect y="330" width="300" height="60" fill="#dfe7f3" />
      </g>

      <!-- 퀴디치 경기장: 파란 하늘, 관중석 탑, 초록·은색 깃발 -->
      <g v-else-if="scene === 'quidditch'">
        <linearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e9bd0" /><stop offset="1" stop-color="#cfe6f3" /></linearGradient>
        <rect width="300" height="390" fill="url(#bd-sky)" />
        <g fill="#fff" opacity="0.8"><ellipse cx="60" cy="60" rx="40" ry="12" /><ellipse cx="220" cy="90" rx="50" ry="14" /></g>
        <g fill="#6b5a46"><rect x="10" y="150" width="34" height="170" /><rect x="90" y="170" width="30" height="150" /><rect x="190" y="160" width="32" height="160" /><rect x="256" y="150" width="34" height="170" /></g>
        <g><path d="M10 150 L27 120 L44 150 Z" fill="#1f6b45" /><path d="M90 170 L105 140 L120 170 Z" fill="#c7ccd0" /><path d="M190 160 L206 130 L222 160 Z" fill="#1f6b45" /><path d="M256 150 L273 120 L290 150 Z" fill="#c7ccd0" /></g>
        <g fill="#1f6b45"><rect x="14" y="160" width="26" height="40" /><rect x="260" y="160" width="26" height="40" /></g>
        <path d="M150 120 V40 M144 40 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0" stroke="#d8b960" stroke-width="3" fill="none" />
        <rect y="320" width="300" height="70" fill="#5f8f4a" />
      </g>

      <!-- 저택 서재: 책장, 촛불 -->
      <g v-else-if="scene === 'library'">
        <rect width="300" height="390" fill="#24170e" />
        <g v-for="row in 4" :key="row">
          <rect x="0" :y="row * 70 - 30" width="300" height="6" fill="#4a2f1a" />
          <g v-for="b in 16" :key="b">
            <rect :x="b * 18 - 14" :y="row * 70 - 80" width="14" :height="44 + ((b * row * 7) % 8)" :fill="['#5a2121', '#1f4a33', '#2c3550', '#6b5530', '#3b2a1e'][(b + row) % 5]" opacity="0.9" />
          </g>
        </g>
        <circle cx="70" cy="200" r="40" fill="url(#bd-glow)" opacity="0.8" />
        <circle cx="250" cy="120" r="30" fill="url(#bd-glow)" opacity="0.6" />
      </g>

      <!-- 런던 거리: 안개 낀 저녁, 가로등, 시계탑 -->
      <g v-else>
        <linearGradient id="bd-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3450" /><stop offset="1" stop-color="#a39bb0" /></linearGradient>
        <rect width="300" height="390" fill="url(#bd-fog)" />
        <path d="M200 260 V80 L212 60 L224 80 V260 Z" fill="#4b4560" /><circle cx="212" cy="100" r="7" fill="#f2e2b0" opacity="0.8" />
        <path d="M0 260 V150 H40 V120 H80 V170 H120 V140 H160 V260 Z M230 260 V160 H270 V130 H300 V260 Z" fill="#2c2738" />
        <g fill="#ffd98c"><rect x="10" y="170" width="8" height="10" /><rect x="50" y="140" width="8" height="10" /><rect x="96" y="190" width="8" height="10" /><rect x="244" y="180" width="8" height="10" /></g>
        <rect y="258" width="300" height="132" fill="#2a2633" />
        <path d="M60 260 V170 M240 262 V176" stroke="#1c1924" stroke-width="3" />
        <circle cx="60" cy="166" r="30" fill="url(#bd-glow)" /><circle cx="240" cy="172" r="26" fill="url(#bd-glow)" />
      </g>
    </svg>

    <!-- 떠다니는 것들 -->
    <div class="particles">
      <i v-for="(p, i) in SPOTS" :key="i" :style="{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: `${p.size}px`, height: `${p.size}px` }" />
    </div>
    <!-- 장소의 빛 -->
    <div class="light" />
  </div>
</template>

<style scoped>
.backdrop { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
svg { position: absolute; inset: -8px; width: calc(100% + 16px); height: calc(100% + 16px); filter: blur(2.2px) saturate(0.92); }
.particles { position: absolute; inset: 0; pointer-events: none; }
.particles i { position: absolute; top: -10px; border-radius: 50%; background: #fff; opacity: 0; animation: fall linear infinite; }
.light { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: soft-light; }

.manor .light { background: radial-gradient(90% 70% at 80% 20%, rgb(150 180 255 / 0.5), transparent 70%); }
.manor .particles i { display: none; }
.garden .light { background: radial-gradient(90% 70% at 80% 25%, rgb(255 190 140 / 0.55), transparent 70%); }
.garden .particles i { background: #fffaf0; border-radius: 60% 0; animation-name: petal; }
.tearoom .light { background: radial-gradient(90% 70% at 75% 5%, rgb(255 190 110 / 0.6), transparent 70%); }
.tearoom .particles i { width: 1px !important; height: 9px !important; border-radius: 1px; background: #b8cbe0; opacity: 0.5; animation-name: rain; animation-duration: 1.4s !important; }
.tearoom .particles i:nth-child(n + 8) { display: none; }
.hogsmeade .light { background: radial-gradient(90% 70% at 50% 80%, rgb(255 200 120 / 0.35), transparent 70%); }
.quidditch .light { background: linear-gradient(rgb(255 255 255 / 0.25), transparent); }
.quidditch .particles i { display: none; }
.library .light { background: radial-gradient(80% 60% at 20% 55%, rgb(255 180 90 / 0.55), transparent 70%); }
.library .particles i { background: #ffe3a6; animation-name: dust; }
.london .light { background: linear-gradient(transparent, rgb(255 210 150 / 0.3)); }
.london .particles i { display: none; }

.still .particles i { animation-play-state: paused; opacity: 0.7; top: 30%; }

@keyframes fall { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.9; } 100% { transform: translate(-20px, 420px); opacity: 0.6; } }
@keyframes petal { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 10% { opacity: 0.9; } 100% { transform: translate(40px, 420px) rotate(540deg); opacity: 0.5; } }
@keyframes rain { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 0.5; } 100% { transform: translate(-6px, 420px); opacity: 0.4; } }
@keyframes dust { 0% { transform: translate(0, 140px); opacity: 0; } 30% { opacity: 0.7; } 100% { transform: translate(20px, 60px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .particles { display: none; } }
</style>
