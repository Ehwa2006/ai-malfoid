# 고른 테이크로 보이스 팩(voices/<이름>)을 만든다: 앞뒤 무음을 자르고, 음량을 맞추고, 3~10초인지 확인한다.
#   python build_pack.py ../../voices/karina takes/neutral-s2.wav takes/smirk-s3.wav ...
# 파일 이름의 감정(앞부분)으로 voice.json의 refs를 채운다. 대사는 prompts.json에서 가져온다.
import json, os, sys

import librosa
import numpy as np
import soundfile as sf

out_dir, *takes = sys.argv[1:]
prompts = json.load(open(os.path.join(os.path.dirname(__file__), "prompts.json"), encoding="utf-8"))
pack_file = os.path.join(out_dir, "voice.json")
pack = json.load(open(pack_file, encoding="utf-8")) if os.path.exists(pack_file) else {"name": os.path.basename(out_dir), "lang": "ko", "refs": {}}

for take in takes:
    emotion = os.path.basename(take).split("-")[0]
    y, sr = librosa.load(take, sr=None, mono=True)
    y, _ = librosa.effects.trim(y, top_db=40)
    y = np.concatenate([np.zeros(int(sr * 0.15)), y, np.zeros(int(sr * 0.25))])  # 짧은 여백
    loud = y[np.abs(y) > 0.01]
    y = y * min(0.95 / np.max(np.abs(y)), 0.12 / np.sqrt(np.mean(loud ** 2)))  # 음량을 비슷하게, 클리핑 없이
    duration = len(y) / sr
    if not 3 <= duration <= 10:
        sys.exit(f"{take}: {duration:.1f}초. GPT-SoVITS 참고 음성은 3~10초여야 해요")
    sf.write(os.path.join(out_dir, f"{emotion}.wav"), y.astype(np.float32), sr, subtype="PCM_16")
    pack["refs"][emotion] = {"file": f"{emotion}.wav", "text": prompts["emotions"][emotion]["text"]}
    print(f"{emotion}: {duration:.1f}s ← {take}")

with open(pack_file, "w", encoding="utf-8") as f:
    f.write(json.dumps(pack, ensure_ascii=False, indent=2) + "\n")
