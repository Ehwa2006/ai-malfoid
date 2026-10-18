# AI Malfoid 🐍💚

**Ollama**(로컬 LLM) + **AIRI** 스타일(감정 토큰으로 움직이는 캐릭터)을 합친 TypeScript 드레이코 말포이 데이팅 채팅.

- 🦙 **Ollama**: `/api/chat` 스트리밍으로 로컬 모델과 대화합니다. 외부 API 키가 필요 없습니다.
- 🎭 **AIRI 방식 감정 토큰**: LLM이 답변에 `<|EMOTE:smirk|>`, `<|AFFECTION:+2|>` 같은 특수 토큰을 섞어 쓰면, 스트리밍 파서가 이 토큰을 잘라내서 아바타 표정과 호감도를 바꿉니다.
- 💘 **데이팅 시뮬레이션**: 호감도(0~100)에 따라 적대 → 경계 → 호기심 → 호감 → 연인 단계로 바뀌고, 단계마다 말포이의 태도 지시가 시스템 프롬프트에 들어갑니다.
- 💾 대화, 호감도, 설정은 브라우저 localStorage에 저장됩니다.

## 실행

```bash
# 1. Ollama 설치 후 모델 받기 (한국어를 잘하는 모델 추천)
ollama pull llama3.1:8b        # 또는 qwen2.5:7b, gemma2:9b, exaone3.5:7.8b 등

# 2. 앱 실행
npm install
npm run dev                     # http://localhost:5173
```

Vite 개발 서버가 `/ollama` 요청을 `http://127.0.0.1:11434`로 넘겨주므로 CORS 설정이 필요 없습니다.
Ollama가 다른 곳에서 돌고 있다면 `OLLAMA_HOST=http://192.168.0.10:11434 npm run dev`로 실행하세요.
화면의 ⚙️ 설정에서 모델, 내 이름, temperature, 기억할 대화 수를 바꿀 수 있습니다.

## 구조

```
src/
├─ lib/
│  ├─ ollama.ts        # Ollama NDJSON 스트리밍 클라이언트, 모델 목록
│  ├─ markers.ts       # <|EMOTE:…|> / <|AFFECTION:…|> 스트리밍 파서 (토큰이 쪼개져 와도 안전)
│  ├─ affection.ts     # 호감도 단계, 범위 제한 (한 턴에 최대 ±5)
│  └─ persona.ts       # 말포이 시스템 프롬프트 (호감도 단계 반영)
├─ composables/
│  └─ useChat.ts       # 대화 상태, 스트리밍, 표정/호감도 반영, 저장
└─ components/
   ├─ MalfoyAvatar.vue  # 감정별 SVG 아바타 (깜빡임, 말할 때 입 움직임)
   ├─ AffectionMeter.vue
   ├─ MessageBubble.vue # *행동 묘사*는 기울임꼴로 표시
   └─ SettingsPanel.vue
```

## 확장 아이디어 (AIRI 쪽 기능 더 가져오기)

- **Live2D / VRM 아바타**: `MalfoyAvatar.vue`는 `emotion` prop 하나만 받으므로, AIRI의 `@proj-airi/stage-ui` 또는 `pixi-live2d-display`로 바꿔도 같은 감정 이벤트를 쓸 수 있습니다.
- **TTS 음성**: 스트리밍 텍스트를 문장 단위로 잘라 TTS에 보내고, 재생 중에 `speaking` 상태를 켭니다.
- **장기 기억**: Ollama 임베딩(`nomic-embed-text`)으로 지난 대화를 요약하고 검색합니다.

## 개발

```bash
npm test          # 마커 파서, 호감도 단위 테스트
npm run build     # 타입 체크 + 프로덕션 빌드
```

> 해리 포터 세계관을 바탕으로 한 비공식·비상업 팬 프로젝트입니다. 캐릭터는 성인(25세)으로 설정했고, 로맨스는 PG-13 수준으로 제한되어 있습니다.
