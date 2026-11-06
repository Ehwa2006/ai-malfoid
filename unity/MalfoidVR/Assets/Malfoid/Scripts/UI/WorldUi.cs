// 공중에 뜬 판(월드 스페이스 UI)을 코드로 만든다. 글꼴은 한글이 되는 것을 고른다:
// MalfoidApp에 넣은 글꼴(.ttf) → 운영체제의 한글 글꼴(윈도우 맑은 고딕, 맥 애플 SD 고딕, 안드로이드 Noto Sans CJK).
using UnityEngine;
using UnityEngine.UI;

namespace Malfoid
{
    public static class WorldUi
    {
        /// <summary>판의 1픽셀이 몇 미터인지 (글자가 VR에서 또렷하도록 크게 그리고 줄인다)</summary>
        public const float MetersPerPixel = 0.001f;

        static readonly string[] KoreanFonts =
        {
            "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "AppleGothic", "Noto Sans CJK KR", "Noto Sans KR",
            "NotoSansCJK-Regular", "Source Han Sans K", "NanumGothic", "Arial Unicode MS",
        };

        static Font font;

        /// <summary>앱에서 쓸 글꼴. preferred가 있으면 그것을 쓴다</summary>
        public static Font Font
        {
            get
            {
                if (font == null)
                    font = Font.CreateDynamicFontFromOSFont(KoreanFonts, 40);
                return font;
            }
            set => font = value != null ? value : font;
        }

        public static Canvas Canvas(string name, Transform parent, Vector2 sizePx)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler));
            go.transform.SetParent(parent, false);
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rt = (RectTransform)go.transform;
            rt.sizeDelta = sizePx;
            rt.localScale = Vector3.one * MetersPerPixel;
            go.GetComponent<CanvasScaler>().dynamicPixelsPerUnit = 3f; // 글자를 더 촘촘하게 그린다
            return canvas;
        }

        public static RectTransform Rect(string name, Transform parent, Vector2 size, Vector2 anchoredPos, Vector2? pivot = null)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = pivot ?? new Vector2(0.5f, 1f);
            rt.sizeDelta = size;
            rt.anchoredPosition = anchoredPos;
            return rt;
        }

        public static Image Panel(string name, Transform parent, Vector2 size, Vector2 pos, Color color)
        {
            var rt = Rect(name, parent, size, pos);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            return img;
        }

        public static Text Label(string name, Transform parent, Vector2 size, Vector2 pos, int fontSize, Color color, TextAnchor anchor = TextAnchor.UpperLeft)
        {
            var rt = Rect(name, parent, size, pos);
            var text = rt.gameObject.AddComponent<Text>();
            text.font = Font;
            text.fontSize = fontSize;
            text.color = color;
            text.alignment = anchor;
            text.supportRichText = true;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.lineSpacing = 1.1f;
            text.raycastTarget = false;
            return text;
        }

        public static VrButton Button(string name, Transform parent, Vector2 size, Vector2 pos, string caption, int fontSize = 30)
        {
            var bg = Panel(name, parent, size, pos, new Color(0.10f, 0.16f, 0.13f, 0.88f));
            bg.gameObject.AddComponent<BoxCollider>();
            var button = bg.gameObject.AddComponent<VrButton>();
            button.background = bg;
            var label = Label("Label", bg.transform, size - new Vector2(24, 8), new Vector2(0, -4), fontSize, new Color(0.93f, 0.95f, 0.90f), TextAnchor.MiddleCenter);
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            button.label = label;
            button.Text = caption;
            button.FitCollider();
            return button;
        }

        /// <summary>판이 상대를 향하도록 좌우로만 돌린다</summary>
        public static void FaceTowards(Transform panel, Vector3 viewer, float dt, float speed = 4f)
        {
            var to = panel.position - viewer;
            to.y = 0;
            if (to.sqrMagnitude < 1e-4f)
                return;
            var want = Quaternion.LookRotation(to.normalized, Vector3.up);
            panel.rotation = Quaternion.Slerp(panel.rotation, want, 1f - Mathf.Exp(-dt * speed));
        }

        /// <summary>대사의 *행동 묘사*를 흐린 기울임꼴로</summary>
        public static string Styled(string line)
        {
            if (string.IsNullOrEmpty(line))
                return "";
            var sb = new System.Text.StringBuilder();
            var inAction = false;
            foreach (var c in Escape(line))
            {
                if (c == '*')
                {
                    sb.Append(inAction ? "</color></i>" : "<i><color=#a9b8ad>");
                    inAction = !inAction;
                    continue;
                }
                sb.Append(c);
            }
            if (inAction)
                sb.Append("</color></i>");
            return sb.ToString();
        }

        /// <summary>리치 텍스트 태그로 읽히지 않게 &lt;를 비슷한 글자로 바꾼다</summary>
        public static string Escape(string text) => string.IsNullOrEmpty(text) ? "" : text.Replace("<", "‹").Replace(">", "›");
    }
}
