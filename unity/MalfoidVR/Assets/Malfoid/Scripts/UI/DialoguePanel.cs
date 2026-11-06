// 카리나 옆에 뜨는 대화 판: 내가 한 말, 카리나의 대사(행동 묘사는 흐리게), 속마음, 이어서 할 말(선택지).
// 선택지는 컨트롤러 광선으로 가리키고 트리거로 고른다.
using System;
using UnityEngine;
using UnityEngine.UI;

namespace Malfoid
{
    public class DialoguePanel : MonoBehaviour
    {
        public Transform viewer;
        [Tooltip("판을 띄울 기준 (카리나). 카리나의 오른쪽 어깨 옆에 뜬다")]
        public Transform anchor;
        public Vector3 offset = new Vector3(0.62f, 1.28f, -0.05f);

        public event Action<string> ChoicePicked;

        Text userLine;
        Text replyLine;
        Text thoughtLine;
        Text hintLine;
        VrButton[] choices;
        string reply = "";
        string thought = "";
        string[] pendingChoices;
        float thoughtAt = -1f;
        bool thinking;

        void Awake()
        {
            var canvas = WorldUi.Canvas("DialogueCanvas", transform, new Vector2(760, 700));
            var bg = WorldUi.Panel("Background", canvas.transform, new Vector2(760, 700), Vector2.zero, new Color(0.04f, 0.07f, 0.06f, 0.78f));
            userLine = WorldUi.Label("User", bg.transform, new Vector2(700, 60), new Vector2(0, -20), 24, new Color(0.72f, 0.78f, 0.74f));
            WorldUi.Label("Name", bg.transform, new Vector2(700, 40), new Vector2(0, -86), 26, new Color(0.62f, 0.86f, 0.70f)).text = "카리나 말포이";
            replyLine = WorldUi.Label("Reply", bg.transform, new Vector2(700, 270), new Vector2(0, -128), 31, new Color(0.96f, 0.96f, 0.93f));
            replyLine.resizeTextForBestFit = true;
            replyLine.resizeTextMinSize = 20;
            replyLine.resizeTextMaxSize = 31;
            replyLine.verticalOverflow = VerticalWrapMode.Truncate;
            thoughtLine = WorldUi.Label("Thought", bg.transform, new Vector2(700, 80), new Vector2(0, -404), 23, new Color(1f, 0.72f, 0.82f));
            thoughtLine.resizeTextForBestFit = true;
            thoughtLine.resizeTextMinSize = 16;
            thoughtLine.resizeTextMaxSize = 23;
            thoughtLine.verticalOverflow = VerticalWrapMode.Truncate;
            choices = new VrButton[3];
            for (var i = 0; i < 3; i++)
            {
                var index = i;
                choices[i] = WorldUi.Button($"Choice{i}", bg.transform, new Vector2(700, 52), new Vector2(0, -494 - i * 60), "", 24);
                choices[i].Clicked += () => Pick(index);
                choices[i].gameObject.SetActive(false);
            }
            hintLine = WorldUi.Label("Hint", bg.transform, new Vector2(700, 30), new Vector2(0, -668), 19, new Color(0.6f, 0.66f, 0.62f), TextAnchor.MiddleCenter);
        }

        void Pick(int i)
        {
            if (pendingChoices == null || i >= pendingChoices.Length)
                return;
            var text = pendingChoices[i];
            ChoicePicked?.Invoke(text);
        }

        public void SetHint(string text) => hintLine.text = text;

        /// <summary>새 대답을 기다리기 시작한다 (내가 한 말을 위에 보인다)</summary>
        public void BeginTurn(string userText, string userName)
        {
            userLine.text = string.IsNullOrEmpty(userText) ? "" : $"{WorldUi.Escape(userName)}: {WorldUi.Styled(userText)}";
            reply = "";
            thought = "";
            thinking = true;
            thoughtAt = -1f;
            HideChoices();
            Refresh();
        }

        public void AppendReply(string text)
        {
            thinking = false;
            reply += text;
            Refresh();
        }

        /// <summary>대답 전체를 한 번에 (처음 켰을 때 지난 대답을 보일 때)</summary>
        public void ShowReply(string text, string thoughtText)
        {
            thinking = false;
            reply = text ?? "";
            thought = thoughtText ?? "";
            thoughtAt = string.IsNullOrEmpty(thought) ? -1f : 0f;
            Refresh();
        }

        /// <summary>속마음은 대사를 다 읽을 즈음에 살며시 보인다</summary>
        public void SetThought(string text, float delay = 1.5f)
        {
            thought = text ?? "";
            thoughtAt = Time.time + delay;
        }

        public void ShowChoices(string[] items)
        {
            pendingChoices = items;
            for (var i = 0; i < choices.Length; i++)
            {
                var on = items != null && i < items.Length && !string.IsNullOrEmpty(items[i]);
                choices[i].gameObject.SetActive(on);
                if (on)
                    choices[i].Text = WorldUi.Escape(items[i]);
            }
        }

        public void HideChoices()
        {
            pendingChoices = null;
            foreach (var c in choices)
                c.gameObject.SetActive(false);
        }

        public void ShowError(string message)
        {
            thinking = false;
            reply = $"<color=#ff9a8a>{WorldUi.Escape(message)}</color>";
            Refresh();
        }

        void Refresh()
        {
            replyLine.text = thinking ? "<color=#8fa596>…</color>" : reply.StartsWith("<color=") ? reply : WorldUi.Styled(reply);
        }

        void Update()
        {
            if (thinking)
            {
                // 생각하는 중: 점이 하나씩 늘어난다
                var dots = new string('…', 1 + (int)(Time.time * 2f) % 3);
                replyLine.text = $"<color=#8fa596>{dots}</color>";
            }
            var showThought = thoughtAt >= 0 && Time.time >= thoughtAt && !string.IsNullOrEmpty(thought);
            thoughtLine.text = showThought ? $"<i>(속마음) {WorldUi.Escape(thought)}</i>" : "";

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
