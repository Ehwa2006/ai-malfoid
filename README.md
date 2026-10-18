# AI Malfoid 🐍💚

**Ollama**(로컬 LLM) + **AIRI** 스타일(감정 신호로 움직이는 캐릭터)을 합친 TypeScript **TS 말포이** 데이팅 채팅.

> 캐릭터 설정은 노벨피아 웹소설 [『악역영애 말포이』](https://novelpia.com/novel/3291)(고속도루 作)의 **카리나 말포이**를 바탕으로 했습니다.
> 순수혈통 말포이가의 영애이자 콧대 높은 "악역영애"이지만, 속은 여리고 소중한 사람에겐 목숨까지 거는 순애파입니다.
> 원작은 호그와트 재학 중의 이야기지만, 데이팅 채팅이라 전쟁이 끝나고 몇 년 뒤 23세가 된 시점으로 옮겼습니다.
>
> - 설정에서 내 이름을 **해리/포터**로 하면 원작의 해리로서 대화하고(학창시절 추억 반영), 다른 이름이면 새로 알게 된 사람으로 대합니다.
> - 페르소나는 `src/lib/persona.ts`에서 고칠 수 있습니다.

- 🦙 **Ollama**: `/api/chat` 스트리밍으로 로컬 모델과 대화합니다. 외부 API 키가 필요 없습니다.
- 🎭 **AIRI 방식 감정 신호**: LLM이 대사와 함께 표정(`emotion`)과 호감도 변화(`affection`)를 내면, 아바타 표정과 호감도가 바뀝니다.
  Ollama 구조화 출력(JSON 스키마)으로 디코딩을 제한해서 작은 모델도 빠뜨리지 않습니다. 감정이 먼저 정해져 표정이 바뀌고, 대사는 흘러나오는 대로 화면에 보입니다.
  형식을 지원하지 않는 모델이 `<|EMOTE:smirk|>` 같은 예전 토큰 형식으로 답해도 처리합니다.
- 💘 **데이팅 시뮬레이션**: 호감도(0~100)에 따라 적대 → 경계 → 호기심 → 호감 → 연인 단계로 바뀌고, 단계마다 말포이의 태도 지시가 시스템 프롬프트에 들어갑니다.
- 🧍 **3D 아바타 (VRM)**: AIRI와 같은 `@pixiv/three-vrm`으로 Malfoy Draconia VRM 모델을 띄웁니다. 감정 신호에 맞춰 표정·고개 자세·볼 홍조가 바뀌고, 말할 때 립싱크를 하고, 마우스를 따라 보며, 머리카락과 치마가 흔들립니다.
- 🔊 **목소리 (AI 음성)**: 카리나 전용 AI 목소리(GPT-SoVITS)로 대사를 읽습니다. 비웃을 때·당황할 때·짜증 날 때마다 감정별 참고 음성으로 말투가 바뀝니다. 답변이 흘러나오는 동안 문장이 끝날 때마다 바로 읽고, *행동 묘사*는 읽지 않으며, 아바타 입이 실제 목소리 크기를 따라 움직입니다.
- 💾 대화, 호감도, 설정은 브라우저 localStorage에 저장됩니다.

## 실행

준비물: [Node.js](https://nodejs.org) 20.19 이상, [Ollama](https://ollama.com/download)

```bash
git clone https://github.com/Ehwa2006/ai-malfoid.git
cd ai-malfoid
npm start
```

`npm start`가 알아서 하는 일:

1. Ollama가 꺼져 있으면 켭니다. 설치돼 있지 않으면 설치 방법을 알려 줍니다.
2. 모델이 하나도 없으면 기본 모델 `exaone3.5:7.8b`(약 4.8GB)를 받습니다. 처음 한 번만 받습니다.
3. 패키지를 설치하고 앱을 띄운 뒤 브라우저를 엽니다.

직접 하고 싶다면:

```bash
ollama pull exaone3.5:7.8b      # 또는 qwen2.5:7b 등. 설정한 모델이 없으면 설치된 모델로 자동 전환
npm install
npm run dev                     # http://localhost:5173
```

Vite 개발 서버가 `/ollama` 요청을 `http://127.0.0.1:11434`로 넘겨주므로 CORS 설정이 필요 없습니다.
Ollama가 다른 곳에서 돌고 있다면 `OLLAMA_HOST=http://192.168.0.10:11434 npm run dev`로 실행하세요.
화면의 ⚙️ 설정에서 모델, 내 이름, temperature, 기억할 대화 수를 바꿀 수 있습니다.

**모델 참고** (CPU 4코어, GPU 없이 같은 대화 4턴을 실제로 주고받은 결과)

| 모델 | 감정·호감도 | 대화 품질 | 답변 시간 (CPU) |
|---|---|---|---|
| **exaone3.5:7.8b** (기본값) | 매번 나옴 | 가장 자연스러움. 행동 묘사도 한국어로 풍부함. 답이 조금 긴 편 | 약 50~100초 |
| qwen2.5:7b | 매번 나옴 | 캐릭터를 잘 유지함. 행동 묘사에 영어·이모지 토큰이 섞이는데 앱이 걸러서 보여줌 | 약 20~30초 |
| qwen2.5:3b | 매번 나옴 | 캐릭터는 유지하지만 문장이 가끔 어색하고 한자가 섞임 | 약 30~40초 |
| qwen2.5:1.5b | 매번 나옴 | 같은 말 반복, 존댓말 섞임, 캐릭터 붕괴 | 약 6~16초 |

GPU가 있으면 7B도 몇 초 안에 답합니다. 첫 답변은 모델을 메모리에 올리느라 더 오래 걸립니다.
EXAONE 3.5는 LG AI연구원의 비상업 라이선스 모델이라 개인·비상업 용도로 쓰세요.

## 목소리 (TTS)

⚙️ 설정의 **목소리 (TTS)**에서 켜고 끄고 고를 수 있습니다. 기본으로 켜져 있습니다.

| 음성 엔진 | 특징 |
|---|---|
| **AI 음성 (GPT-SoVITS)** (기본) | 카리나 전용 목소리. 내 컴퓨터에서 도는 음성 복제 모델이 감정별 참고 음성을 듣고 같은 목소리·말투로 읽습니다. 아래 [AI 음성](#ai-음성-gpt-sovits) 설치가 필요하고, 없거나 꺼져 있으면 Edge 음성으로 대신 읽습니다. |
| Edge 신경망 음성 | `npm start`/`npm run dev` 서버에 내장되어 설치할 게 없습니다. 한국어 여성 "선희", 남성 "인준"·"현수"를 쓸 수 있습니다. 인터넷이 필요합니다. Microsoft Edge의 "소리 내어 읽기" 서비스를 비공식적으로 쓰는 것이라 개인 용도로만 쓰세요. |
| 브라우저 내장 음성 | 인터넷 없이 됩니다. 윈도우·맥에 깔린 한국어 음성을 쓰며, 음질은 컴퓨터마다 다릅니다. Edge 음성도 실패하면 자동으로 이쪽으로 바뀝니다. |
| OpenAI 호환 서버 | `…/v1/audio/speech`를 지원하는 서버(OpenAI API, 로컬 TTS 서버 등)의 주소·모델·목소리·API 키를 넣어 씁니다. |

빠르기와 음 높이를 조절하고 **미리 듣기**로 확인할 수 있습니다. 메시지 옆 🔊 버튼으로 다시 듣고(그 메시지의 감정 목소리로), **중지** 버튼으로 멈춥니다.
`vite build`로 만든 정적 파일만 올려서 쓰면 내장 음성 서버(AI 음성 연결, Edge 음성)가 없으므로 브라우저 음성이나 OpenAI 호환 서버를 쓰세요.

### AI 음성 (GPT-SoVITS)

카리나 목소리는 실존 인물이나 성우, 기존 캐릭터의 목소리를 따라 한 것이 아닙니다.
음성 디자인 모델 [Qwen3-TTS VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign)(Apache-2.0)에
"23세 성인 여성, 오랜 귀족 가문의 영애, 우아한 메조소프라노, 도도하고 자신만만하며 은근히 놀리는 말투"라는 설명만 주어 새로 만든 **AI 생성 음성**입니다.
같은 목소리로 감정 7가지(평소·비웃음·짜증·당황·기쁨·슬픔·놀람)를 연기한 짧은 참고 음성이 `voices/karina/`에 들어 있고,
[GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)(MIT)가 답변의 감정에 맞는 참고 음성을 골라 그 목소리·말투로 새 문장을 읽습니다.

**설치 (Windows, 한 번만)**

```powershell
npm.cmd run voice:install
```

이 명령이 하는 일:

1. 그래픽카드에 맞는 [GPT-SoVITS 윈도우 통합 패키지](https://huggingface.co/lj1995/GPT-SoVITS-windows-package/tree/main)를 다운로드 폴더에 받습니다.
   - 보통은 `GPT-SoVITS-v2pro-20250604.7z`(약 8.2GB)입니다.
   - RTX 50 시리즈면 `GPT-SoVITS-v2pro-20250604-nvidia50.7z`(약 8.8GB)를 받습니다.
   - Python과 모델이 모두 들어 있어 따로 설치할 것이 없습니다.
   - 인터넷이 끊기거나 창을 닫아도 다시 실행하면 받은 곳부터 이어 받습니다.
2. 받은 파일이 손상되지 않았는지 SHA-256으로 확인합니다.
3. 홈 폴더(`C:\Users\<이름>`)에 압축을 풀고(약 14GB), 다 풀리면 압축 파일은 지웁니다.
   - 7-Zip이 있으면 7-Zip으로 풉니다. 없으면 윈도우 11의 내장 `tar`를 쓰고, 그것도 안 되면 winget으로 7-Zip을 설치합니다.
   - 디스크 여유 공간(약 24GB)과 경로 길이를 미리 확인합니다.
   - 홈 폴더 경로에 한글이 있으면 GPT-SoVITS가 한국어 발음을 분석하지 못하므로 `C:\`에 풉니다.
   - 압축을 풀다 멈췄으면 다시 실행할 때 처음부터 다시 풉니다.

C 드라이브 공간이 모자라면 다른 드라이브에 설치할 수 있습니다. npm에 옵션을 넘기려면 앞에 `--`를 붙여야 합니다.

```powershell
npm.cmd run voice:install -- --dir D:\AI
```

이렇게 다른 곳에 설치하면 그 위치를 기억해 두어 `npm.cmd start`가 찾아 씁니다. 압축 파일도 그 드라이브에 받습니다.

설치가 끝나면 평소처럼 `npm.cmd start`를 실행하세요. GPT-SoVITS 폴더를 찾아 AI 음성 서버를 자동으로 켭니다(NVIDIA GPU가 있으면 GPU, 없으면 CPU).
서버가 모델을 올리는 처음 30초쯤은 Edge 음성으로 읽고, 준비되면 다음 답변부터 AI 음성으로 읽습니다.

직접 받고 싶다면 위 링크에서 같은 파일을 받아 [7-Zip](https://www.7-zip.org)으로 홈 폴더, 다운로드, `C:\` 중 한 곳에 푸세요.
폴더 경로에 한글이 있으면(OneDrive의 "바탕 화면" 등) 한국어 발음을 분석하지 못하니 영문 경로에 두세요.

직접 다른 곳에 풀었다면 폴더를 알려 주세요: `setx GPT_SOVITS_DIR D:\GPT-SoVITS-v2pro-20250604`를 실행하고 새 PowerShell 창에서 `npm.cmd start`.
직접 켜려면 GPT-SoVITS 폴더에서 `runtime\python.exe -X utf8 api_v2.py -a 127.0.0.1 -p 9880 -c GPT_SoVITS/configs/tts_infer_karina.yaml`
(`tts_infer_karina.yaml`은 `npm start`가 [scripts/gpt-sovits/karina.yaml](scripts/gpt-sovits/karina.yaml)을 복사해 둔 것입니다).
다른 컴퓨터에서 돌린다면 `GPT_SOVITS_URL=http://192.168.0.10:9880`으로 주소를 바꿉니다.
⚙️ 설정의 목소리 칸에서 서버와 보이스 팩 상태를 확인할 수 있습니다.
서버가 켜지지 않으면 GPT-SoVITS 폴더의 `karina-api.log`에서 원인을 볼 수 있습니다.

속도는 NVIDIA GPU에서 문장당 1초 안팎, CPU만으로는 문장당 10초쯤 걸립니다. 앞 문장을 읽는 동안 다음 문장을 미리 만들어 둡니다.

**보이스 팩 바꾸기**: `voices/<이름>/voice.json`에 감정별 참고 음성(3~10초 wav)과 그 대사를 적고 `MALFOID_VOICE_PACK=voices/<이름>/voice.json`으로 실행합니다.
없는 감정은 `neutral`을 씁니다. 직접 녹음했거나 쓸 권리가 있는 **성인** 목소리만 쓰고, 실존 인물의 목소리를 허락 없이 복제하지 마세요.

## 3D 모델

### 기본 모델: Malfoy Draconia (VRM)

[Sketchfab의 "Harry Potter - Malfoy Draconia"](https://sketchfab.com/3d-models/harry-potter-malfoy-draconia-3d-model-dl-49a0f6d87e7b4079a6a6a5b15768e627)
(작가 **HiGuys920**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))를 VRM 1.0으로 변환해
`public/models/malfoy-draconia.vrm`(7.6MB)에 넣었습니다. 출처와 변경 사항은 `public/models/CREDITS.md`에 있고, 앱 화면에도 크레딧이 표시됩니다.

변환하면서 한 일:

- **휴머노이드 리깅**: 원본 리그(Hips·Spine·Chest·팔·다리·손가락 54개 본)를 VRM 휴머노이드 본에 연결했습니다.
- **표정**: 원본에는 셰이프키가 없어서, 얼굴 본(눈꺼풀·눈썹·입술·턱)을 움직인 포즈를 셰이프키로 구웠습니다.
  happy, angry, sad, relaxed, surprised, blink(양쪽·한쪽), aa·ih·ou·ee·oh 립싱크 13종이 VRM 표정에 연결됩니다.
- **시선**: 눈 본이 마우스를 따라 움직입니다.
- **스프링 본**: 머리카락 14가닥과 치마 8가닥이 흔들립니다. 머리·목·가슴·팔·엉덩이·허벅지에 충돌 판정이 있습니다.
- **재질**: MToon(애니풍 셀 셰이딩)으로 바꿨습니다. 텍스처는 4096px에서 2048px 이하로 줄였습니다.

앱에서는 감정 신호에 따라 VRM 표정과 고개 자세가 바뀝니다. 당황·웃음일 때는 볼 홍조가 생기고, 답장이 나오는 동안 립싱크를 하고, 팔을 내린 자세로 숨을 쉽니다.

#### 다시 변환하기

`scripts/convert-draconia/`에 변환 스크립트가 있습니다. 화면 없는 Blender(bpy 5.2.2)와 [VRM Add-on for Blender](https://github.com/saturday06/VRM-Addon-for-Blender) v4.10.2를 씁니다.

1. 원본 zip을 내려받습니다. Sketchfab(로그인 필요)이나 작가의 [Patreon 무료 공개 글](https://www.patreon.com/higuys920/posts/harry-potter-3d-172401876)에서 받을 수 있습니다.
2. 아래처럼 실행합니다. 처음 실행할 때 `scripts/convert-draconia/.cache/`에 Blender와 애드온을 받습니다.

```bash
scripts/convert-draconia/convert.sh "Harry Potter Series - Malfoy Draconia Female (3D Model).zip"
```

표정 포즈는 `expressions.py`, 스프링 본은 `springs.py`, 재질은 `convert.py`에서 고칠 수 있습니다.

### 다른 모델 쓰기

⚙️ 설정의 **아바타**에서 고를 수 있습니다.

- **3D 원본 모델 (VRM)**: 기본값입니다. 다른 VRM 주소를 입력하거나 내 컴퓨터의 `.vrm`/`.glb` 파일을 열 수 있습니다.
  VRM이면 표준 표정 이름으로 감정이 연결되고, 일반 `.glb`는 표시만 됩니다.
- **3D 간이 모델**: `src/three/karina.ts`가 코드로 만드는 가벼운 셀 셰이딩 모델입니다. VRM을 불러오지 못할 때도 이 모델로 바뀝니다. `.glb`로 내보낼 수 있습니다.
- **2D**: 가장 가벼운 SVG 아바타입니다.

## 구조

```
src/
├─ lib/
│  ├─ ollama.ts        # Ollama NDJSON 스트리밍 클라이언트, 모델 목록
│  ├─ reply.ts         # 구조화 출력(JSON) 스키마와 스트리밍 파서: 감정·호감도·대사
│  ├─ markers.ts       # 예전 <|EMOTE:…|> / <|AFFECTION:…|> 토큰 파서 (인사말, 형식 미지원 모델용)
│  ├─ affection.ts     # 호감도 단계, 범위 제한 (한 턴에 최대 ±5)
│  └─ persona.ts       # 말포이 시스템 프롬프트 (호감도 단계 반영)
├─ composables/
│  ├─ useChat.ts       # 대화 상태, 스트리밍, 표정/호감도 반영, 저장
│  └─ useTts.ts        # 목소리: 문장 단위로 바로 읽기, 감정별 AI 음성, 실패 시 Edge → 브라우저 음성으로 전환
├─ tts/
│  ├─ chunker.ts       # 흘러나오는 대사를 문장으로 자르기 (행동 묘사 제외)
│  └─ engines.ts       # HTTP(AI 음성·Edge·OpenAI 호환) / 브라우저 음성 재생, 음량으로 립싱크
├─ three/
│  ├─ vrm.ts           # VRM 로더: 감정 → VRM 표정, 고개 자세, 시선, 립싱크, 볼 홍조
│  ├─ pose.ts          # 감정별 고개 자세 (VRM·간이 모델 공용)
│  ├─ karina.ts        # 간이 3D 모델 (코드로 생성)
│  ├─ faceTexture.ts   # 애니풍 얼굴 캔버스 (표정 7종, 깜빡임, 립싱크)
│  ├─ tube.ts          # 머리카락·팔용 가변 굵기 튜브
│  └─ toon.ts          # 셀 셰이딩 재질
└─ components/
   ├─ Avatar3D.vue      # three.js 장면, 카메라, 조명, 외곽선, .glb 내보내기
   ├─ MalfoyAvatar.vue  # 2D SVG 아바타 (설정에서 선택)
   ├─ AffectionMeter.vue
   ├─ MessageBubble.vue # *행동 묘사*는 기울임꼴로 표시
   └─ SettingsPanel.vue
public/models/
├─ malfoy-draconia.vrm # 기본 3D 모델 (HiGuys920, CC BY 4.0 → VRM 1.0 변환)
└─ CREDITS.md
scripts/convert-draconia/  # FBX → VRM 변환 (Blender + VRM Add-on, 화면 없이 실행)
voices/karina/             # 카리나 보이스 팩: 감정별 참고 음성 7개 + voice.json (AI 생성 음성, CREDITS.md)
scripts/start.mjs          # npm start: Ollama 확인·모델 받기·AI 음성 서버 켜기·앱 실행
scripts/gpt-sovits/        # GPT-SoVITS 설치(npm run voice:install)·설치 폴더 찾기·서버 설정
server/gptSovits.ts        # 개발 서버에 붙는 AI 음성 연결 (/tts/gsv → GPT-SoVITS api_v2, 감정별 참고 음성 선택)
server/edgeTts.ts          # 개발 서버에 붙는 Edge 신경망 음성 엔드포인트 (/tts/v1/audio/speech)
```

## 확장 아이디어 (AIRI 쪽 기능 더 가져오기)

- **Live2D 아바타**: 아바타 컴포넌트는 `emotion`과 `speaking`만 받으므로, `pixi-live2d-display`를 쓰는 Live2D 컴포넌트를 같은 방식으로 추가할 수 있습니다.
- **장기 기억**: Ollama 임베딩(`nomic-embed-text`)으로 지난 대화를 요약하고 검색합니다.

## 개발

```bash
npm test          # 답변 파서, 마커 파서, 호감도, 페르소나 단위 테스트
npm run build     # 타입 체크 + 프로덕션 빌드
```

> 3D 모델: "Harry Potter - Malfoy Draconia (3D Model)" by HiGuys920, CC BY 4.0 (https://sketchfab.com/3d-models/harry-potter-malfoy-draconia-3d-model-dl-49a0f6d87e7b4079a6a6a5b15768e627). VRM 1.0으로 변환하면서 표정·스프링 본·재질을 바꿨습니다 (`public/models/CREDITS.md`).
>
> 해리 포터 세계관과 『악역영애 말포이』를 바탕으로 한 비공식·비상업 팬 프로젝트입니다. 캐릭터는 성인(23세)으로 설정했고, 로맨스는 PG-13 수준으로 제한되어 있습니다.
