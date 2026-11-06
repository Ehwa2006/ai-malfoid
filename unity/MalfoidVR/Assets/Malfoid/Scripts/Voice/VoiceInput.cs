// 목소리로 말 걸기 (윈도우 PC VR): 컨트롤러의 A나 X를 누른 채 말하고 떼면 카리나에게 보낸다.
// 윈도우 받아쓰기(DictationRecognizer)를 쓴다. 윈도우 설정 ▸ 개인 정보 ▸ 음성에서 "온라인 음성 인식"을 켜야 하고,
// 윈도우의 음성 언어가 한국어여야 한국어로 알아듣는다. 데스크톱 모드에서는 V 키를 누른 채 말한다.
// 다른 기기(Quest 단독 실행 등)에서는 선택지와 키보드로 말한다.
using UnityEngine;
using UnityEngine.InputSystem;
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
using UnityEngine.Windows.Speech;
#endif

namespace Malfoid
{
    public class VoiceInput : MonoBehaviour
    {
        public KarinaController controller;
        public PlayerRig player;
        public DialoguePanel dialogue;

        public static bool Available =>
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            PhraseRecognitionSystem.isSupported;
#else
            false;
#endif

#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
        DictationRecognizer recognizer;
        string heard = "";
        string final = "";
        bool listening;
        float sendAt = -1f;

        void Start()
        {
            if (!Available)
            {
                enabled = false;
                return;
            }
            recognizer = new DictationRecognizer(ConfidenceLevel.Low, DictationTopicConstraint.Dictation);
            recognizer.InitialSilenceTimeoutSeconds = 8f;
            recognizer.AutoSilenceTimeoutSeconds = 6f;
            recognizer.DictationHypothesis += text =>
            {
                heard = text;
                dialogue?.SetHint($"듣는 중: {text}");
            };
            recognizer.DictationResult += (text, confidence) =>
            {
                final = string.IsNullOrEmpty(final) ? text : $"{final} {text}";
                heard = "";
                dialogue?.SetHint($"들은 말: {final}");
            };
            recognizer.DictationError += (error, hresult) => dialogue?.SetHint($"음성 인식 오류: {error}");
            dialogue?.SetHint("A/X를 누른 채 말하고 떼면 보내요");
        }

        bool Held()
        {
            if (player != null && player.IsVr)
                return (player.leftHand != null && player.leftHand.Input.PrimaryHeld) || (player.rightHand != null && player.rightHand.Input.PrimaryHeld);
            return Keyboard.current != null && Keyboard.current.vKey.isPressed && !ChatBox.Focused;
        }

        void Update()
        {
            if (recognizer == null)
                return;
            var held = Held() && !controller.Busy;
            if (held && !listening)
            {
                listening = true;
                heard = final = "";
                sendAt = -1f;
                if (recognizer.Status != SpeechSystemStatus.Running)
                    recognizer.Start();
                dialogue?.SetHint("듣는 중…");
            }
            else if (!held && listening)
            {
                listening = false;
                // 떼고 나서 마지막 말이 정리될 때까지 잠깐 기다린다
                sendAt = Time.time + 0.8f;
                if (recognizer.Status == SpeechSystemStatus.Running)
                    recognizer.Stop();
            }
            if (sendAt > 0 && Time.time > sendAt)
            {
                sendAt = -1f;
                var text = string.IsNullOrWhiteSpace(final) ? heard : final;
                if (!string.IsNullOrWhiteSpace(text) && controller.Say(text))
                    dialogue?.SetHint("A/X를 누른 채 말하고 떼면 보내요");
                else if (string.IsNullOrWhiteSpace(text))
                    dialogue?.SetHint("잘 못 들었어요. 다시 말해 주세요");
                heard = final = "";
            }
        }

        void OnDestroy()
        {
            if (recognizer != null)
            {
                if (recognizer.Status == SpeechSystemStatus.Running)
                    recognizer.Stop();
                recognizer.Dispose();
            }
        }
#endif
    }
}
