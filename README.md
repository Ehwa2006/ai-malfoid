# AI Malfoid 🐍💚

**Ollama**(로컬 LLM) + **AIRI** 스타일(감정 토큰으로 움직이는 캐릭터)을 합친 TypeScript **TS 말포이** 데이팅 채팅.

> 캐릭터 설정은 노벨피아 웹소설 [『악역영애 말포이』](https://novelpia.com/novel/3291)(고속도루 作)의 **카리나 말포이**를 바탕으로 했습니다.
> 순수혈통 말포이가의 영애이자 콧대 높은 "악역영애"이지만, 속은 여리고 소중한 사람에겐 목숨까지 거는 순애파입니다.
> 원작은 호그와트 재학 중의 이야기지만, 데이팅 채팅이라 전쟁이 끝나고 몇 년 뒤 23세가 된 시점으로 옮겼습니다.
>
> - 설정에서 내 이름을 **해리/포터**로 하면 원작의 해리로서 대화하고(학창시절 추억 반영), 다른 이름이면 새로 알게 된 사람으로 대합니다.
> - 페르소나는 `src/lib/persona.ts`에서 고칠 수 있습니다.

- 🦙 **Ollama**: `/api/chat` 스트리밍으로 로컬 모델과 대화합니다. 외부 API 키가 필요 없습니다.
- 🎭 **AIRI 방식 감정 토큰**: LLM이 답변에 `<|EMOTE:smirk|>`, `<|AFFECTION:+2|>` 같은 특수 토큰을 섞어 쓰면, 스트리밍 파서가 이 토큰을 잘라내서 아바타 표정과 호감도를 바꿉니다.
- 💘 **데이팅 시뮬레이션**: 호감도(0~100)에 따라 적대 → 경계 → 호기심 → 호감 → 연인 단계로 바뀌고, 단계마다 말포이의 태도 지시가 시스템 프롬프트에 들어갑니다.
- 🧍 **3D 아바타**: three.js로 직접 만든 애니풍 카리나 말포이 3D 모델이 감정 토큰에 맞춰 표정·고개 자세를 바꾸고, 말할 때 입을 움직이고, 마우스를 따라 봅니다. AIRI처럼 **VRM** 모델로 바꿔 끼울 수도 있습니다.
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

## 3D 모델

### 기본 모델 (직접 제작)

`src/three/karina.ts`가 코드로 모델을 만듭니다. 외부 파일이 필요 없습니다.
디자인은 Sketchfab의 [Harry Potter - Malfoy Draconia](https://sketchfab.com/3d-models/harry-potter-malfoy-draconia-3d-model-dl-49a0f6d87e7b4079a6a6a5b15768e627)(HiGuys920, CC BY 4.0)를 참고했습니다.
그래서 옆으로 넘긴 앞머리에 긴 백금발, 초록 눈, 후프 귀걸이를 하고 있고, 흰 셔츠·초록 넥타이·회색 니트 조끼·초록 깃의 검은 로브를 입고 팔짱을 끼고 있습니다.

- **셀 셰이딩**: `MeshToonMaterial`과 `OutlineEffect`로 애니풍 외곽선을 그립니다.
- **얼굴**: 캔버스에 그린 눈·눈썹·입·홍조를 머리에 데칼로 투영합니다. 표정 7종, 눈 깜빡임, 립싱크, 시선 이동을 지원합니다.
- **머리카락**: 굵기가 변하는 튜브 가닥 약 40개로 만들었습니다.
- **내보내기**: ⚙️ 설정의 **"카리나 3D 모델을 .glb로 내보내기"**를 누르면 Blender 등에서 열 수 있는 `.glb` 파일이 저장됩니다.

### 외부 모델 (VRM / GLB)

⚙️ 설정에서 모델 주소를 입력하거나(예: `public/models/karina.vrm` → `/models/karina.vrm`), 내 컴퓨터의 파일을 바로 열 수 있습니다.
`.vrm` 파일은 표준 표정(happy, angry, sad, relaxed, surprised, blink, aa)이 감정 토큰과 연결됩니다. 일반 `.glb` 파일은 표시만 됩니다.

Sketchfab 원본 모델(.pmx/.fbx/.blend)을 쓰려면 이렇게 변환하세요.

1. Sketchfab에 로그인한 뒤 모델을 내려받습니다. 라이선스는 CC BY 4.0이므로 **작가 HiGuys920 표기가 필요합니다.**
2. Blender에 [VRM Add-on for Blender](https://vrm-addon-for-blender.info/)를 설치합니다. `.pmx` 파일이라면 [MMD Tools](https://github.com/MMD-Blender/blender_mmd_tools)도 설치합니다.
3. 모델을 불러온 뒤 VRM 휴머노이드 본을 지정하고, 셰이프키를 VRM 표정(happy, angry, sad, relaxed, surprised, blink, aa)에 연결합니다.
4. `.vrm`으로 내보내서 `public/models/`에 넣고, 설정에서 `/models/파일이름.vrm`을 입력합니다.

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
├─ three/
│  ├─ karina.ts        # 절차적 카리나 말포이 3D 모델 (머리, 머리카락, 교복, 팔짱)
│  ├─ faceTexture.ts   # 애니풍 얼굴 캔버스 (표정 7종, 깜빡임, 립싱크)
│  ├─ tube.ts          # 머리카락·팔용 가변 굵기 튜브
│  ├─ toon.ts          # 셀 셰이딩 재질
│  └─ vrm.ts           # VRM/GLB 로더, 감정 → VRM 표정 연결
└─ components/
   ├─ Avatar3D.vue      # three.js 장면, 카메라, 외곽선, .glb 내보내기
   ├─ MalfoyAvatar.vue  # 2D SVG 아바타 (설정에서 선택)
   ├─ AffectionMeter.vue
   ├─ MessageBubble.vue # *행동 묘사*는 기울임꼴로 표시
   └─ SettingsPanel.vue
```

## 확장 아이디어 (AIRI 쪽 기능 더 가져오기)

- **Live2D 아바타**: 아바타 컴포넌트는 `emotion`과 `speaking`만 받으므로, `pixi-live2d-display`를 쓰는 Live2D 컴포넌트를 같은 방식으로 추가할 수 있습니다.
- **TTS 음성**: 스트리밍 텍스트를 문장 단위로 잘라 TTS에 보내고, 재생 중에 `speaking` 상태를 켭니다.
- **장기 기억**: Ollama 임베딩(`nomic-embed-text`)으로 지난 대화를 요약하고 검색합니다.

## 개발

```bash
npm test          # 마커 파서, 호감도 단위 테스트
npm run build     # 타입 체크 + 프로덕션 빌드
```

> 3D 디자인 참고: "Harry Potter - Malfoy Draconia" by HiGuys920, CC BY 4.0 (https://sketchfab.com/3d-models/harry-potter-malfoy-draconia-3d-model-dl-49a0f6d87e7b4079a6a6a5b15768e627). 기본 3D 모델은 이 모델의 파일을 쓰지 않고 코드로 새로 만들었습니다.
>
> 해리 포터 세계관과 『악역영애 말포이』를 바탕으로 한 비공식·비상업 팬 프로젝트입니다. 캐릭터는 성인(23세)으로 설정했고, 로맨스는 PG-13 수준으로 제한되어 있습니다.
