// 이 저장소의 개발 서버(npm start 또는 npm run start:vr)와 이야기하는 부분.
// 카리나의 성격·안전 규칙·기억·호감도는 모두 서버(웹 앱과 같은 코드)가 정하고, 유니티는 받은 사건으로 연출만 한다.
using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Malfoid
{
    public class MalfoidServer : MonoBehaviour
    {
        [Tooltip("npm start(또는 npm run start:vr)로 띄운 서버 주소. PC VR이면 http://127.0.0.1:5173, Quest 단독이면 PC의 내부 IP")]
        public string serverUrl = "http://127.0.0.1:5173";

        string Base => serverUrl.TrimEnd('/');

        [Serializable]
        class ErrorInner { public string message; }

        [Serializable]
        class ErrorBody { public ErrorInner error; }

        static string ErrorOf(UnityWebRequest req)
        {
            var text = req.downloadHandler?.text;
            if (!string.IsNullOrEmpty(text))
            {
                try
                {
                    var body = JsonUtility.FromJson<ErrorBody>(text);
                    if (!string.IsNullOrEmpty(body?.error?.message))
                        return body.error.message;
                }
                catch (ArgumentException) { }
            }
            return string.IsNullOrEmpty(req.error) ? $"HTTP {req.responseCode}" : req.error;
        }

        static UploadHandlerRaw JsonBody(object body)
        {
            var raw = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body == null ? "{}" : JsonUtility.ToJson(body)));
            raw.contentType = "application/json";
            return raw;
        }

        public IEnumerator Get<T>(string path, Action<T> ok, Action<string> fail, int timeout = 5)
        {
            using var req = UnityWebRequest.Get(Base + path);
            req.timeout = timeout;
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke(ErrorOf(req));
                yield break;
            }
            T value;
            try
            {
                value = JsonUtility.FromJson<T>(req.downloadHandler.text);
            }
            catch (ArgumentException e)
            {
                fail?.Invoke(e.Message);
                yield break;
            }
            ok?.Invoke(value);
        }

        public IEnumerator Post<T>(string path, object body, Action<T> ok, Action<string> fail, int timeout = 10)
        {
            using var req = new UnityWebRequest(Base + path, "POST", new DownloadHandlerBuffer(), JsonBody(body));
            req.timeout = timeout;
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke(ErrorOf(req));
                yield break;
            }
            T value;
            try
            {
                value = JsonUtility.FromJson<T>(req.downloadHandler.text);
            }
            catch (ArgumentException e)
            {
                fail?.Invoke(e.Message);
                yield break;
            }
            ok?.Invoke(value);
        }

        /// <summary>
        /// 대답을 받는다 (/vr/say, /vr/greet). 사건이 한 줄씩 오는 대로 onEvent를 부른다.
        /// 서버가 거절하면(바쁨 409, 잘못된 요청 400) fail에 이유를 준다.
        /// </summary>
        public IEnumerator Stream(string path, object body, Action<VrEvent> onEvent, Action<string> fail)
        {
            var lines = new NdjsonHandler(onEvent);
            using var req = new UnityWebRequest(Base + path, "POST", lines, JsonBody(body));
            req.timeout = 0; // CPU에서 돌리는 모델은 대답이 1분 넘게 걸리기도 한다
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke(lines.ErrorText ?? (string.IsNullOrEmpty(req.error) ? $"HTTP {req.responseCode}" : req.error));
            }
        }

        /// <summary>
        /// 카리나 목소리(GPT-SoVITS, /tts/gsv)로 한 문장을 읽은 소리.
        /// 실패하면 fail(상태 코드): 4xx면 이 문장만의 문제(다른 음성으로 읽으면 된다), 그 밖에는 서버 문제.
        /// </summary>
        public IEnumerator Speech(string text, string emotion, float speed, Action<AudioClip> ok, Action<long> fail)
        {
            var body = new SpeechRequest { input = text, emotion = emotion, speed = speed };
            using var req = new UnityWebRequest(Base + "/tts/gsv", "POST", new DownloadHandlerBuffer(), JsonBody(body));
            req.timeout = 90;
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke(req.responseCode);
                yield break;
            }
            var clip = WavDecoder.ToClip(req.downloadHandler.data, "karina");
            if (clip == null)
                fail?.Invoke(0);
            else
                ok?.Invoke(clip);
        }

        /// <summary>AI 음성이 없을 때 대신 읽는 Edge 음성 (서버가 인터넷의 Microsoft Edge 읽어주기를 부른다, mp3)</summary>
        public IEnumerator EdgeSpeech(string text, Action<AudioClip> ok, Action<long> fail)
        {
            var body = new EdgeSpeechRequest { input = text };
            var audio = new DownloadHandlerAudioClip(Base + "/tts/v1/audio/speech", AudioType.MPEG);
            audio.streamAudio = false;
            audio.compressed = false;
            using var req = new UnityWebRequest(Base + "/tts/v1/audio/speech", "POST", audio, JsonBody(body));
            req.timeout = 30;
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke(req.responseCode);
                yield break;
            }
            var clip = audio.audioClip;
            if (clip == null || clip.length <= 0.01f)
                fail?.Invoke(0);
            else
                ok?.Invoke(clip);
        }

        /// <summary>
        /// 녹음(WAV)을 로컬 음성 인식(/stt, faster-whisper)으로 받아쓴다. 알아듣지 못했으면 빈 글.
        /// </summary>
        public IEnumerator Transcribe(byte[] wav, Action<string> ok, Action<string> fail)
        {
            var upload = new UploadHandlerRaw(wav) { contentType = "audio/wav" };
            using var req = new UnityWebRequest(Base + "/stt", "POST", new DownloadHandlerBuffer(), upload);
            req.timeout = 120;
            yield return req.SendWebRequest();
            if (req.result != UnityWebRequest.Result.Success)
            {
                fail?.Invoke(ErrorOf(req));
                yield break;
            }
            SttResult result;
            try
            {
                result = JsonUtility.FromJson<SttResult>(req.downloadHandler.text);
            }
            catch (ArgumentException e)
            {
                fail?.Invoke(e.Message);
                yield break;
            }
            ok?.Invoke(result?.text ?? "");
        }

        /// <summary>받는 대로 줄을 잘라 사건으로 바꾼다. UTF-8 글자가 조각 사이에 걸려도 깨지지 않게 디코더를 이어 쓴다</summary>
        class NdjsonHandler : DownloadHandlerScript
        {
            readonly Action<VrEvent> onEvent;
            readonly Decoder decoder = Encoding.UTF8.GetDecoder();
            readonly StringBuilder line = new StringBuilder();
            readonly StringBuilder all = new StringBuilder();
            char[] chars = new char[4096];

            /// <summary>오류 응답(JSON)의 메시지</summary>
            public string ErrorText { get; private set; }

            public NdjsonHandler(Action<VrEvent> onEvent) : base(new byte[4096])
            {
                this.onEvent = onEvent;
            }

            protected override bool ReceiveData(byte[] data, int dataLength)
            {
                if (data == null || dataLength <= 0)
                    return true;
                var need = decoder.GetCharCount(data, 0, dataLength);
                if (need > chars.Length)
                    chars = new char[need];
                var n = decoder.GetChars(data, 0, dataLength, chars, 0);
                for (var i = 0; i < n; i++)
                {
                    var c = chars[i];
                    if (all.Length < 2000)
                        all.Append(c);
                    if (c == '\n')
                        Flush();
                    else
                        line.Append(c);
                }
                return true;
            }

            protected override void CompleteContent()
            {
                Flush();
                // 스트림이 아니라 오류 JSON이 왔으면 메시지를 꺼내 둔다
                var text = all.ToString();
                if (text.Contains("\"error\""))
                {
                    try
                    {
                        var body = JsonUtility.FromJson<ErrorBody>(text);
                        ErrorText = body?.error?.message;
                    }
                    catch (ArgumentException) { }
                }
            }

            void Flush()
            {
                var text = line.ToString().Trim();
                line.Clear();
                if (text.Length == 0 || text[0] != '{' || text.StartsWith("{\"error\""))
                    return;
                VrEvent e;
                try
                {
                    e = JsonUtility.FromJson<VrEvent>(text);
                }
                catch (ArgumentException)
                {
                    Debug.LogWarning($"[Malfoid] 읽지 못한 사건: {text}");
                    return;
                }
                if (e != null && !string.IsNullOrEmpty(e.type))
                    onEvent?.Invoke(e);
            }
        }
    }
}
