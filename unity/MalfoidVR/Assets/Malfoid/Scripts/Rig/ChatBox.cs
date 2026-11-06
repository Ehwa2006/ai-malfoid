// 화면 아래 입력칸. 유니티는 컴포넌트마다 같은 이름의 파일이 있어야 장면에 저장할 수 있어서 따로 둔다.
using UnityEngine;

namespace Malfoid
{
    /// <summary>화면 아래 입력칸 (IMGUI라 한글 입력기가 그대로 된다)</summary>
    public class ChatBox : MonoBehaviour
    {
        public KarinaController controller;
        public static bool Focused { get; private set; }

        string text = "";
        GUIStyle box;

        void OnGUI()
        {
            if (controller == null)
                return;
            if (box == null)
            {
                box = new GUIStyle(GUI.skin.textField) { fontSize = 20, font = WorldUi.Font };
            }
            var e = Event.current;
            var enter = e.type == EventType.KeyDown && (e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter);
            var width = Mathf.Min(720, Screen.width - 40);
            var rect = new Rect((Screen.width - width) / 2f, Screen.height - 56, width, 38);
            GUI.SetNextControlName("MalfoidChat");
            if (enter && GUI.GetNameOfFocusedControl() == "MalfoidChat")
            {
                if (!string.IsNullOrWhiteSpace(text) && controller.Say(text))
                    text = "";
                e.Use();
            }
            text = GUI.TextField(rect, text, 200, box);
            if (string.IsNullOrEmpty(text) && GUI.GetNameOfFocusedControl() != "MalfoidChat")
                GUI.Label(new Rect(rect.x + 10, rect.y + 8, rect.width, rect.height), controller.Busy ? "카리나가 대답하는 중…" : "카리나에게 할 말 (Enter)");
            Focused = GUI.GetNameOfFocusedControl() == "MalfoidChat";
        }
    }
}
