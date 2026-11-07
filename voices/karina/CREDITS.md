# 카리나 목소리 출처

`voices/karina/*.wav`는 **AI가 만든 목소리**입니다. 실존 인물·성우·기존 캐릭터의 목소리를 녹음하거나 복제하지 않았습니다.

- 생성 모델: [Qwen3-TTS-12Hz-1.7B-VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) (Alibaba Qwen, [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0))
  - 참고 음성 없이 글로 쓴 목소리 설명만으로 새 목소리를 만드는 모델입니다. Apache-2.0은 생성한 음성의 사용을 제한하지 않습니다.
- 만든 날: 2026-10-18, 패키지 `qwen-tts` 0.1.1, CPU(float32)
- 목소리 설명과 감정별 연기 지시·대사: [`scripts/voice-design/prompts.json`](../../scripts/voice-design/prompts.json)
  - 목소리: "20대 초반의 성인 여성, 순수혈통 귀족 가문의 자존심 강한 영애. 중저음의 매끄럽고 성숙한 목소리(절대 어리지 않게), 단정한 표준어, 차갑고 오만한 침착함에 장난스러운 조롱기"
- 만드는 법: [`scripts/voice-design/design.py`](../../scripts/voice-design/design.py)로 감정마다 시드 2·3·4로 한 번씩 만든 뒤 아래 기준으로 골라
  [`build_pack.py`](../../scripts/voice-design/build_pack.py)로 앞뒤 무음을 자르고 음량을 맞췄습니다.

| 감정 | 파일 | 고른 테이크 | 받아쓰기 오류율 | neutral과 화자 유사도 |
|---|---|---|---|---|
| 평소 | neutral.wav | 시드 2 (기준 목소리) | 3% ("영애"→"영예", 같은 발음) | 1.00 |
| 비웃음 | smirk.wav | 시드 3 | 7% (첫 웃음소리는 받아쓰지 않음) | 0.78 |
| 짜증 | annoyed.wav | 시드 2 | 0% | 0.76 |
| 당황 | flustered.wav | 시드 2 | 4% | 0.66 |
| 기쁨 | happy.wav | 시드 3 | 0% | 0.77 |
| 슬픔 | sad.wav | 시드 2 | 0% | 0.79 |
| 놀람 | surprised.wav | 시드 2 | 4% ("네가"→"내가", 같은 발음) | 0.74 |

고른 기준:
- 받아쓰기(Whisper large-v3-turbo)로 대사가 정확한지
- 기본 음높이가 성인 여성의 말소리 범위인지 (평소 목소리 중앙값 226Hz)
- GPT-SoVITS v2Pro의 화자 인식 모델(ERes2NetV2)로 잰 화자 유사도가 기준 목소리와 가까운지 (참고: 다른 사람인 Edge "선희" 음성은 0.56)
- 3~10초 길이

기준 목소리(평소)는 같은 설명으로 만든 후보 7개(설명 3가지 × 시드) 중에서 골랐습니다.
쓸 때는 AI 생성 음성이라는 점을 밝히고, 실존 인물인 척하거나 사칭·사기에 쓰지 마세요.
