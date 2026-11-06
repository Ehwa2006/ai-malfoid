# Malfoid VR (Unity)

VR에서 카리나 말포이와 마주 앉아 이야기하는 유니티 앱이다. 말포이 저택 응접실에서 카리나는 바라보는 내 쪽으로 고개를 돌리고,
대답에 맞춰 부채를 펼치거나 팔짱을 끼며, 머리에서 들리는 목소리로 말한다.

카리나의 **성격·대화·기억·호감도·안전 규칙은 웹 앱과 같은 서버 코드**(저장소의 `src/lib`, `server/vrSession.ts`)를 쓴다.
유니티는 말과 행동을 서버에 보내고, 돌아오는 사건(표정·몸짓·읽을 문장·속마음·선택지)으로 연출만 한다.
그래서 카리나의 말투나 규칙을 고치면 웹과 VR에 함께 적용된다. 몸짓·표정 수치도 웹 앱의 표에서 만든다(`npm run unity:data`).

> 이 프로젝트는 유니티 에디터 없이 만들어졌다. C# 코드는 유니티 참조 어셈블리로 컴파일까지 확인했고 서버 API는 실제 모델로 시험했지만,
> 장면을 헤드셋에서 직접 돌려 본 것은 아니다. 처음 열 때 문제가 생기면 콘솔의 첫 오류를 알려 주면 된다.

## 준비물

- **Unity 6** (6000.0 LTS 이상, Built-in 렌더 파이프라인)
- VR 헤드셋 하나
  - **PC VR**: Quest(Link·Air Link), Valve Index, HTC Vive 등 — 윈도우 PC에서 유니티 ▶ Play로 바로 된다
  - **Quest 단독 실행**: Android로 빌드해서 헤드셋에 설치 (아래 참고)
  - 헤드셋이 없어도 **데스크톱 모드**(마우스·키보드)로 시험할 수 있다
- 저장소의 서버: 저장소 폴더에서 `npm start` (Ollama 모델·AI 음성까지 켠다)

## 처음 열기

1. Unity Hub ▸ **Add** ▸ 이 폴더(`unity/MalfoidVR`)를 고른다. 유니티 6 버전으로 연다.
2. 패키지를 받는 동안 기다린다. UniVRM은 OpenUPM에서 받는다(`Packages/manifest.json`).
   "새 입력 시스템(Input System)을 켤까요?"라고 물으면 **Yes** (유니티가 다시 켜진다).
3. 메뉴 **Malfoid ▸ 전부 한 번에** (또는 1 → 2 → 3 차례로)
   - **1. 모델 가져오기**: 저장소의 `public/models/malfoy-draconia.vrm`을 `Assets/Malfoid/Models`로 복사해 UniVRM 프리팹으로 가져온다
   - **2. VR 설정**: OpenXR 켜기(PC·Android), 컨트롤러 프로필(Quest·Index·Vive), 입력 방식(새것+예전 것), http 접속 허용
   - **3. VR 장면 만들기**: 응접실·카리나·플레이어·대화 판·선물 탁자를 만들어 `Assets/Malfoid/Scenes/MalfoidVR.unity`에 저장
4. 입력 방식을 바꿨다고 나오면 유니티를 껐다 켠다. Project Settings ▸ XR Plug-in Management ▸ Project Validation에 경고가 있으면 **Fix All**.

## 실행

1. 저장소 폴더에서 `npm start` (Quest 단독 실행이면 `npm run start:vr`)
2. 헤드셋을 연결하고 유니티에서 ▶ **Play**

서버 주소는 `MalfoidApp ▸ Malfoid Server ▸ Server Url` (기본 `http://127.0.0.1:5173`).
서버가 늦게 켜져도 유니티가 3초마다 다시 접속한다. 오랜만에(6시간 넘게) 찾아오면 카리나가 먼저 말을 건다.

## 조작

| | VR | 데스크톱 모드 |
|---|---|---|
| 둘러보기·걷기 | 머리를 돌리고 걷는다 · 왼쪽 스틱 걷기 · 오른쪽 스틱 45도 돌기 | 오른쪽 마우스 버튼 + 끌기 · WASD |
| 말하기 | **A/X를 누른 채 말하고 떼기** (윈도우) · 선택지 가리키고 트리거 | 화면 아래 입력칸에 쓰고 Enter · V를 누른 채 말하기 |
| 버튼 | 컨트롤러 광선으로 가리키고 트리거 | 왼쪽 클릭 |
| 정면 맞추기 | 오른손 B · 상태 판의 버튼 | — |

## 카리나에게 할 수 있는 것

손이 직접 닿는 곳으로 알아챈다. 이 밖의 곳은 만져도 아무 일도 일어나지 않는다.

| 행동 | VR | 데스크톱 | 허락하는 호감도 |
|---|---|---|---|
| 손 흔들기 | 떨어진 곳에서 손을 머리 높이로 들고 좌우로 흔든다 | — | 처음부터 |
| 볼 콕 | 손끝으로 볼을 찌른다 | 볼 클릭 | 처음부터 |
| 손 내밀기 | 카리나의 손 가까이에 손을 댄다 (그립) → **카리나가 손을 잡는다** | 손 클릭 | 40 (호기심) |
| 머리 쓰다듬기 | 정수리 위에서 손을 쓸어 준다 (손에 살짝 진동) | 머리 클릭 | 60 (호감) |
| 안아 주기 | 가까이 다가가 두 손을 등·어깨에 두른다 | — | 80 (연인) |
| 선물 | 탁자의 선물을 그립으로 집어 카리나의 가슴 앞에 내민다 → 두 손으로 받아 든다 | 선물 클릭 | 처음부터 |

- 아직 허락하지 않은 손길은 카리나가 손을 쳐내거나 한 발 물러나며 쏘아붙인다 (서버가 정하고, 호감도는 오르지 않는다).
- 선물은 웹 앱과 같은 8가지다. 카리나가 좋아하는 것(얼그레이, 은방울꽃…)과 싫어하는 것(싸구려 사탕, 그리핀도르 목도리)이 있다.
- 모델을 부르지 않는 작은 반응: 얼굴을 너무 가까이 들이밀면 몸을 뒤로 빼며 부채로 얼굴을 가리고, 오래 빤히 쳐다보면 당황해서 꼼지락댄다.
- 옆으로 돌아가면 카리나가 몸을 돌려 마주 본다. 버릇(머리 넘기기, 찻잔 들기, 늦은 밤 하품)도 웹 앱과 같다.

성적인 말이나 행동은 웹 앱과 같은 규칙으로 카리나가 받아넘긴다(서버의 `boundaryNote`). 만질 수 있는 곳도 머리·볼·손과 안기뿐이다.

## 목소리

웹 앱과 같은 순서로 고른다: **AI 음성**(GPT-SoVITS, 감정별 목소리, `npm start`가 켠다) → 안 되면 **Edge 음성** → 그것도 안 되면 자막만.
소리는 카리나의 머리에서 나는 3D 소리라서 고개를 돌리면 방향이 바뀐다. 입 모양은 소리 크기를 따라간다.

목소리로 말 걸기는 **윈도우 받아쓰기**를 쓴다: 윈도우 설정 ▸ 개인 정보 ▸ 음성 ▸ **온라인 음성 인식 켜기**, 음성 언어 한국어.
Quest 단독 실행에서는 선택지와 (모니터 앞의) 키보드로 말한다.

## Quest 단독 실행 (Android 빌드)

1. File ▸ Build Profiles ▸ **Android** ▸ Switch Platform → Project Validation ▸ Fix All
2. 한글 글꼴: Quest에는 한글 글꼴이 없을 수 있다. Noto Sans KR 같은 `.ttf`를 `Assets/Malfoid/Fonts`에 넣고 `MalfoidApp ▸ Karina Controller ▸ Korean Font`에 끌어 놓는다.
3. PC에서 `npm run start:vr` → 출력된 `http://192.168.x.x:5173`을 `Server Url`에 넣는다. 헤드셋과 PC는 같은 와이파이, PC 방화벽에서 5173 허용.
4. Build And Run

`start:vr`은 개발 서버를 집 안 네트워크에 연다. 집·개인 네트워크에서만 쓴다.

## 구조

```
Assets/Malfoid/
  Scripts/
    Api/        MalfoidServer (HTTP·줄 단위 JSON 스트림), VrProtocol (서버와 주고받는 자료)
    Avatar/     KarinaAvatar (몸짓·IK·고개·소품·돌아서기), KarinaFace (표정·깜빡임·입·홍조),
                NormalizedRig (three-vrm 정규화 본 흉내), ArmIK (src/three/ik.ts 이식), PoseTypes
    Voice/      KarinaVoice (문장 대기열·미리 받기·3D 소리), WavDecoder, VoiceInput (윈도우 받아쓰기)
    Interaction/ KarinaInteractions (쓰다듬기·콕·손·안기·손 흔들기·선물·빤히 보기), HandProbe (VR 손), Grabbable (선물)
    UI/         DialoguePanel (대사·속마음·선택지), StatusPanel (호감도·장소·알림), VrButton, WorldUi
    Rig/        PlayerRig (VR·데스크톱), VrInput, DesktopControls, ChatBox
    App/        KarinaController (서버 사건 → 연출), SceneMood (장소에 따른 빛)
    Generated/  PoseData.cs — npm run unity:data 로 웹 앱의 표에서 만든다 (직접 고치지 않는다)
  Editor/       MalfoidSetup (메뉴: 모델 가져오기·VR 설정·장면 만들기)
```

서버 API (`server/vrApi.ts`):

| | |
|---|---|
| `GET /vr/status` | Ollama 연결·모델 |
| `GET /vr/state` | 호감도·단계·장소·최근 대화·기억·행동 목록(허락 여부) |
| `POST /vr/say` `{text}` 또는 `{action}` | 줄 단위 JSON으로 흘러나오는 대답: `turn`, `reaction`, `emotion`, `gesture`, `scene`, `text`, `sentence`, `thought`, `choices`, `done` |
| `POST /vr/greet` | 오랜만이면 먼저 인사 |
| `POST /vr/settings` `{userName}` · `POST /vr/reset` | 이름 바꾸기 · 처음부터 |
| `POST /tts/gsv` · `POST /tts/v1/audio/speech` | AI 음성 · Edge 음성 (웹 앱과 같은 경로) |

VR 대화는 웹 앱(브라우저 저장소)과 따로 `.malfoid/vr-session.json`에 저장된다.

## 크레딧

- 모델: Malfoy Draconia — HiGuys920, CC BY 4.0 (`public/models/CREDITS.md`)
- [UniVRM](https://github.com/vrm-c/UniVRM) (MIT), Unity OpenXR · Input System
