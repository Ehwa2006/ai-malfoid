// 작은 상태 판: 호감도와 단계, 장소, 음성·서버 상태, 알림(단계가 바뀜, 새로 기억함), 처음부터·정면 맞추기 버튼.
using System;
using UnityEngine;
using UnityEngine.UI;

namespace Malfoid
{
    public class StatusPanel : MonoBehaviour
    {
        public Transform viewer;
        public Transform anchor;
        public Vector3 offset = new Vector3(-0.66f, 1.35f, -0.05f);

        public event Action ResetRequested;
        public event Action RecenterRequested;

        Text heart;
        Text place;
        Text system;
        Text toast;
        VrButton reset;
        float toastUntil;
        float resetArmedUntil;

        void Awake()
        {
            var canvas = WorldUi.Canvas("StatusCanvas", transform, new Vector2(420, 380));
            var bg = WorldUi.Panel("Background", canvas.transform, new Vector2(420, 380), Vector2.zero, new Color(0.04f, 0.07f, 0.06f, 0.72f));
            heart = WorldUi.Label("Heart", bg.transform, new Vector2(380, 50), new Vector2(0, -18), 32, new Color(1f, 0.62f, 0.72f));
            place = WorldUi.Label("Place", bg.transform, new Vector2(380, 40), new Vector2(0, -72), 22, new Color(0.85f, 0.88f, 0.82f));
            system = WorldUi.Label("System", bg.transform, new Vector2(380, 70), new Vector2(0, -112), 18, new Color(0.62f, 0.68f, 0.64f));
            toast = WorldUi.Label("Toast", bg.transform, new Vector2(380, 80), new Vector2(0, -186), 21, new Color(1f, 0.9f, 0.6f));
            reset = WorldUi.Button("Reset", bg.transform, new Vector2(180, 52), new Vector2(-96, -300), "처음부터", 22);
            reset.Clicked += OnReset;
            var recenter = WorldUi.Button("Recenter", bg.transform, new Vector2(180, 52), new Vector2(96, -300), "정면 맞추기", 22);
            recenter.Clicked += () => RecenterRequested?.Invoke();
        }

        void OnReset()
        {
            // 실수로 누르지 않게 두 번 눌러야 한다
            if (Time.time < resetArmedUntil)
            {
                resetArmedUntil = 0;
                reset.Text = "처음부터";
                ResetRequested?.Invoke();
            }
            else
            {
                resetArmedUntil = Time.time + 3f;
                reset.Text = "한 번 더 누르면 초기화";
            }
        }

        public void SetAffection(int affection, string stage, int delta = 0)
        {
            var d = delta > 0 ? $" <color=#9fe0a8>+{delta}</color>" : delta < 0 ? $" <color=#ff9a8a>{delta}</color>" : "";
            heart.text = $"♥ {affection}{d}  <size=24>{WorldUi.Escape(stage)}</size>";
        }

        public void SetScene(string scene)
        {
            place.text = PoseData.SceneLabels.TryGetValue(scene ?? "", out var label) ? label : scene;
        }

        public void SetSystem(string text) => system.text = text;

        public void Toast(string text, float seconds = 6f)
        {
            toast.text = WorldUi.Escape(text);
            toastUntil = Time.time + seconds;
        }

        void Update()
        {
            if (toastUntil > 0 && Time.time > toastUntil)
            {
                toast.text = "";
                toastUntil = 0;
            }
            if (resetArmedUntil > 0 && Time.time > resetArmedUntil)
            {
                resetArmedUntil = 0;
                reset.Text = "처음부터";
            }
            if (anchor != null)
            {
                var want = anchor.TransformPoint(offset);
                transform.position = Vector3.Lerp(transform.position, want, 1f - Mathf.Exp(-Time.deltaTime * 3f));
            }
            if (viewer != null)
                WorldUi.FaceTowards(transform, viewer.position, Time.deltaTime);
        }
    }
}
