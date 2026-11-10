# 음성 입력(받아쓰기) 서버: faster-whisper로 한국어 말소리를 글로 바꾼다.
# npm start가 GPT-SoVITS 통합 패키지의 Python으로 켠다 (그 패키지에 faster-whisper가 들어 있다).
# 앱(웹·유니티)은 개발 서버의 /stt로 보내고, 개발 서버(server/stt.ts)가 여기로 넘긴다.
#
#   GET  /health                  {"ok": true, "ready": bool, "model": ..., "device": ...}
#   POST /transcribe?lang=ko      본문 = 녹음 파일(webm·ogg·wav·mp3 무엇이든) → {"text": ..., "seconds": ..., "took": ..., "speech": ...}
#
# 표준 라이브러리만 쓴다 (통합 패키지에 없는 것을 깔지 않게).
import argparse
import io
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

MAX_BYTES = 20 * 1024 * 1024
MAX_SECONDS = 60
# 이름을 올바른 글자로 받아쓰게 돕는 앞 문맥. 카리나 목소리 20문장으로 비교했을 때 "휘르츠" → "퀴디치"처럼 이름을 바로잡고,
# 문장부호(물음표 등)도 남겼다 (hotwords는 이름은 고쳤지만 부호를 거의 지웠다: 20문장 중 4개만 부호가 남음)
PROMPT = "카리나 말포이와 포터의 대화. 호그와트, 퀴디치, 슬리데린, 얼그레이."


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def pick_device(wanted):
    """cuda(그래픽카드)를 쓸 수 있으면 cuda, 아니면 cpu"""
    if wanted in ("cpu", "cuda"):
        return wanted
    try:
        import ctranslate2

        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def resolve_model(name, models_dir):
    """모델 폴더. 경로면 그대로, 이름이면 models_dir 안에서 찾고 없으면 받는다 (처음 한 번)"""
    if os.path.isdir(name):
        return name
    target = os.path.join(models_dir, f"faster-whisper-{name}")
    if os.path.isfile(os.path.join(target, "model.bin")):
        return target
    from faster_whisper.utils import download_model

    log(f"음성 인식 모델({name})을 처음 한 번 받아요 → {target}")
    os.makedirs(target, exist_ok=True)
    return download_model(name, output_dir=target)


class Recognizer:
    def __init__(self, args):
        self.args = args
        self.model = None
        self.device = None
        self.error = None
        self.lock = threading.Lock()
        self.vad = True

    def load(self):
        from faster_whisper import WhisperModel

        path = resolve_model(self.args.model, self.args.models_dir)
        device = pick_device(self.args.device)
        # 그래픽카드에서는 메모리를 적게 쓰는 int8_float16, CPU에서는 int8
        for dev, compute in ([("cuda", "int8_float16"), ("cpu", "int8")] if device == "cuda" else [("cpu", "int8")]):
            try:
                model = WhisperModel(path, device=dev, compute_type=compute, cpu_threads=self.args.threads)
                # 한 번 돌려 봐야 cuda 라이브러리 문제(cuDNN 등)가 드러난다
                import numpy as np

                list(model.transcribe(np.zeros(16000, dtype=np.float32), language="ko", beam_size=1)[0])
                self.model, self.device = model, dev
                log(f"MALFOID_STT_READY model={self.args.model} device={dev} compute={compute}")
                return
            except Exception as e:  # cuda가 안 되면 cpu로
                log(f"{dev}에서 모델을 올리지 못했어요: {e}")
        self.error = "모델을 올리지 못했어요"

    def transcribe(self, data, lang):
        from faster_whisper import decode_audio

        audio = decode_audio(io.BytesIO(data), sampling_rate=16000)
        seconds = len(audio) / 16000
        if seconds > MAX_SECONDS:
            audio = audio[: MAX_SECONDS * 16000]
        options = dict(
            language=lang,
            beam_size=5 if self.device == "cuda" else 2,
            condition_on_previous_text=False,
            initial_prompt=PROMPT,
        )
        with self.lock:
            started = time.time()
            try:
                segments, info = self.model.transcribe(audio, vad_filter=self.vad, **options)
                segments = list(segments)
            except Exception as e:
                # 통합 패키지에 VAD(onnxruntime)가 없으면 VAD 없이
                if not self.vad:
                    raise
                log(f"VAD 없이 받아써요: {e}")
                self.vad = False
                segments, info = self.model.transcribe(audio, vad_filter=False, **options)
                segments = list(segments)
            took = time.time() - started
        text = "".join(s.text for s in segments).strip()
        # 말소리로 볼 만한 구간이 있었는지 (침묵·잡음에서 지어낸 문장을 앱이 거를 때 쓴다)
        speech = max((1 - s.no_speech_prob for s in segments), default=0.0)
        return {"text": text, "seconds": round(seconds, 2), "took": round(took, 2), "speech": round(speech, 3)}


def make_handler(rec):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def send(self, status, body):
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if urlparse(self.path).path != "/health":
                return self.send(404, {"error": "not found"})
            self.send(200, {"ok": True, "ready": rec.model is not None, "model": rec.args.model, "device": rec.device, "error": rec.error})

        def do_POST(self):
            url = urlparse(self.path)
            if url.path != "/transcribe":
                return self.send(404, {"error": "not found"})
            if rec.model is None:
                return self.send(503, {"error": rec.error or "음성 인식 모델을 올리는 중이에요"})
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BYTES:
                return self.send(400, {"error": "녹음이 비었거나 너무 커요"})
            data = self.rfile.read(length)
            lang = (parse_qs(url.query).get("lang") or ["ko"])[0]
            try:
                result = rec.transcribe(data, lang)
            except Exception as e:
                log("받아쓰기 실패:", e)
                return self.send(422, {"error": f"녹음을 읽지 못했어요: {e}"})
            log(f"{result['seconds']}초 → {result['took']}초: {result['text']}")
            self.send(200, result)

    return Handler


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=9881)
    p.add_argument("--model", default=os.environ.get("MALFOID_STT_MODEL", "large-v3-turbo"))
    p.add_argument("--models-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
    p.add_argument("--device", default=os.environ.get("MALFOID_STT_DEVICE", "auto"), choices=["auto", "cpu", "cuda"])
    p.add_argument("--threads", type=int, default=max(1, min(8, (os.cpu_count() or 4))))
    args = p.parse_args()
    rec = Recognizer(args)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(rec))
    # 모델을 올리는 동안에도 /health에 답한다 (npm start가 지켜본다)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log(f"음성 입력 서버 http://{args.host}:{args.port} (모델 {args.model})")
    rec.load()
    if rec.model is None:
        sys.exit(1)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
