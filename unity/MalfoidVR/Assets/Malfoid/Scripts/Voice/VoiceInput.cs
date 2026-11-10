// 목소리로 말 걸기: 컨트롤러의 A나 X를 누른 채 말하고 떼면 카리나에게 보낸다 (데스크톱 모드에서는 V 키).
//   1. 로컬 음성 인식 (기본): 마이크로 녹음해서 서버의 /stt(faster-whisper)로 보낸다. 인터넷이 필요 없고,
//      Quest 단독 실행에서도 된다 (PC에서 npm run start:vr). 웹 앱과 같은 서버를 쓴다.
//   2. 윈도우 받아쓰기 (로컬 음성 인식이 꺼져 있을 때, 윈도우 PC VR만): 윈도우 설정 ▸ 개인 정보 ▸ 음성에서
//      "온라인 음성 인식"을 켜야 하고, 윈도우의 음성 언어가 한국어여야 한국어로 알아듣는다.
// 말하기 시작하면 카리나의 목소리를 멈춘다 (마이크에 들어가지 않게).
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
using UnityEngine.Windows.Speech;
#endif
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace Malfoid
{
    public class VoiceInput : MonoBehaviour
    {
        public KarinaController controller;
        public PlayerRig player;
        public DialoguePanel dialogue;
        [Tooltip("녹음할 마이크 이름. 비우면 기본 마이크")]
        public string microphone = "";

        const int Rate = 16000;
        const int MaxSeconds = 30;

        /// <summary>지금 쓰는 음성 입력: "로컬 음성 인식", "윈도우 받아쓰기", 없으면 null</summary>
        public static string Mode { get; private set; }
        public static bool Available => Mode != null;

        bool serverStt;
        bool listening;
        bool busy;
        AudioClip recording;
        string Mic => string.IsNullOrEmpty(microphone) ? null : microphone;
        string Hint => player != null && player.IsVr ? "A/X를 누른 채 말하고 떼면 보내요" : "V를 누른 채 말하고 떼면 보내요";

#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
        DictationRecognizer recognizer;
        string heard = "";
        string final = "";
        float sendAt = -1f;
        static bool DictationSupported => PhraseRecognitionSystem.isSupported;
#else
        static bool DictationSupported => false;
#endif

        void Start()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            // Quest: 마이크 권한을 처음 한 번 묻는다
            if (!Permission.HasUserAuthorizedPermission(Permission.Microphone))
                Permission.RequestUserPermission(Permission.Microphone);
#endif
            UpdateMode();
            StartCoroutine(WatchServer());
        }

        /// <summary>로컬 음성 인식이 켜져 있는지 본다 (npm start가 나중에 켤 수 있어서 가끔 다시 본다)</summary>
        IEnumerator WatchServer()
        {
            var server = controller != null ? controller.server : null;
            while (server != null)
            {
                SttStatus status = null;
                yield return server.Get<SttStatus>("/stt/status", s => status = s, _ => { });
                var ready = status != null && status.server;
                if (ready != serverStt)
                {
                    serverStt = ready;
                    UpdateMode();
                }
                yield return new WaitForSeconds(ready ? 60f : status != null && status.starting ? 5f : 30f);
            }
        }

        void UpdateMode()
        {
            Mode = serverStt && Microphone.devices.Length > 0 ? "로컬 음성 인식" : DictationSupported ? "윈도우 받아쓰기" : null;
            if (Mode != null)
                dialogue?.SetHint($"{Hint} ({Mode})");
        }

        bool Held()
        {
            if (player != null && player.IsVr)
                return (player.leftHand != null && player.leftHand.Input.PrimaryHeld) || (player.rightHand != null && player.rightHand.Input.PrimaryHeld);
            return Keyboard.current != null && Keyboard.current.vKey.isPressed && !ChatBox.Focused;
        }

        void Update()
        {
            if (Mode == null || controller == null)
                return;
            var held = Held() && !controller.Busy && !busy;
            if (held && !listening)
                Begin();
            else if (!held && listening)
                End();
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            if (sendAt > 0 && Time.time > sendAt)
            {
                sendAt = -1f;
                Deliver(string.IsNullOrWhiteSpace(final) ? heard : final);
                heard = final = "";
            }
#endif
            // 녹음은 30초까지: 다 차면 유니티가 녹음을 멈춘다
            if (listening && recording != null && !Microphone.IsRecording(Mic))
                End();
        }

        void Begin()
        {
            listening = true;
            controller.voice?.Stop(); // 카리나 목소리가 마이크에 들어가지 않게
            if (Mode == "로컬 음성 인식")
            {
                recording = Microphone.Start(Mic, false, MaxSeconds, Rate);
                dialogue?.SetHint("듣는 중… 떼면 알아들어요");
                return;
            }
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            EnsureRecognizer();
            heard = final = "";
            sendAt = -1f;
            if (recognizer.Status != SpeechSystemStatus.Running)
                recognizer.Start();
            dialogue?.SetHint("듣는 중…");
#endif
        }

        void End()
        {
            listening = false;
            if (recording != null)
            {
                // 30초를 다 채워 녹음이 멈췄으면 위치가 0으로 돌아가 있으므로 녹음 전체를 쓴다
                var length = Microphone.IsRecording(Mic) ? Microphone.GetPosition(Mic) : recording.samples;
                Microphone.End(Mic);
                var clip = recording;
                recording = null;
                // 너무 짧으면(실수로 누름) 보내지 않는다
                if (length < Rate * 3 / 10)
                {
                    dialogue?.SetHint(Hint);
                    return;
                }
                var samples = new float[length * clip.channels];
                clip.GetData(samples, 0);
                StartCoroutine(Transcribe(WavDecoder.Encode(samples, samples.Length, clip.channels, clip.frequency)));
                return;
            }
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            // 떼고 나서 마지막 말이 정리될 때까지 잠깐 기다린다
            sendAt = Time.time + 0.8f;
            if (recognizer != null && recognizer.Status == SpeechSystemStatus.Running)
                recognizer.Stop();
#endif
        }

        IEnumerator Transcribe(byte[] wav)
        {
            busy = true;
            dialogue?.SetHint("알아듣는 중…");
            string text = null;
            string error = null;
            yield return controller.server.Transcribe(wav, t => text = t, e => error = e);
            busy = false;
            if (error != null)
            {
                dialogue?.SetHint($"음성 인식이 안 됐어요: {error}");
                // 서버가 꺼졌으면 다음부터 윈도우 받아쓰기로 (가능하면)
                serverStt = false;
                UpdateMode();
                yield break;
            }
            Deliver(text);
        }

        void Deliver(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                dialogue?.SetHint("잘 못 들었어요. 다시 말해 주세요");
                return;
            }
            if (controller.Say(text))
                dialogue?.SetHint(Hint);
        }

#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
        void EnsureRecognizer()
        {
            if (recognizer != null)
                return;
            recognizer = new DictationRecognizer(ConfidenceLevel.Low, DictationTopicConstraint.Dictation);
            recognizer.InitialSilenceTimeoutSeconds = 8f;
            recognizer.AutoSilenceTimeoutSeconds = 6f;
            recognizer.DictationHypothesis += t =>
            {
                heard = t;
                dialogue?.SetHint($"듣는 중: {t}");
            };
            recognizer.DictationResult += (t, confidence) =>
            {
                final = string.IsNullOrEmpty(final) ? t : $"{final} {t}";
                heard = "";
                dialogue?.SetHint($"들은 말: {final}");
            };
            recognizer.DictationError += (e, hresult) => dialogue?.SetHint($"음성 인식 오류: {e}");
        }
#endif

        void OnDestroy()
        {
            if (recording != null)
                Microphone.End(Mic);
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            if (recognizer != null)
            {
                if (recognizer.Status == SpeechSystemStatus.Running)
                    recognizer.Stop();
                recognizer.Dispose();
            }
#endif
        }
    }
}
