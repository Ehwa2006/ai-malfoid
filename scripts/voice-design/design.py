# 카리나 목소리 만들기: Qwen3-TTS VoiceDesign(Apache-2.0)에 글로 쓴 설명만 주어 새 목소리를 만든다.
# 실존 인물·성우·기존 캐릭터의 목소리를 복제하지 않는다.
#
#   pip install qwen-tts
#   huggingface-cli download Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign --local-dir VoiceDesign
#   python design.py VoiceDesign takes 2 3 4          # 감정마다 시드 2·3·4로 한 번씩
#
# prompts.json의 "voice"(목소리 설명) 뒤에 감정별 "style"(연기 지시)을 붙여 감정별 대사를 읽힌다.
# 테이크 중 발음이 정확하고 neutral과 같은 사람처럼 들리는 것을 골라 build_pack.py로 보이스 팩을 만든다.
# CPU로도 되지만 테이크 하나에 1~3분 걸린다.
import json, os, sys, time

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

model_dir, out_dir, *seeds = sys.argv[1:]
prompts = json.load(open(os.path.join(os.path.dirname(__file__), "prompts.json"), encoding="utf-8"))
os.makedirs(out_dir, exist_ok=True)
device = "cuda:0" if torch.cuda.is_available() else "cpu"
model = Qwen3TTSModel.from_pretrained(model_dir, device_map=device, dtype=torch.bfloat16 if device != "cpu" else torch.float32)

for emotion, line in prompts["emotions"].items():
    instruct = f"{prompts['voice']} {line['style']}".strip()
    for seed in map(int, seeds or ["2"]):
        torch.manual_seed(seed)
        t = time.time()
        wavs, sr = model.generate_voice_design(text=line["text"], language=prompts["language"], instruct=instruct)
        path = os.path.join(out_dir, f"{emotion}-s{seed}.wav")
        sf.write(path, wavs[0], sr)
        print(f"{path}: {len(wavs[0]) / sr:.1f}s ({time.time() - t:.0f}s)", flush=True)
