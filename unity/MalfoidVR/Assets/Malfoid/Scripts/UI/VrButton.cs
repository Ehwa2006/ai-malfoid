// 공중에 뜬 판의 버튼. VR에서는 컨트롤러 광선으로 가리키고 트리거로, 데스크톱에서는 마우스로 누른다.
using System;
using UnityEngine;
using UnityEngine.UI;

namespace Malfoid
{
    [RequireComponent(typeof(BoxCollider))]
    public class VrButton : MonoBehaviour
    {
        public Image background;
        public Text label;
        public Color normal = new Color(0.10f, 0.16f, 0.13f, 0.88f);
        public Color hover = new Color(0.20f, 0.36f, 0.27f, 0.95f);

        public event Action Clicked;

        public string Text
        {
            get => label != null ? label.text : "";
            set
            {
                if (label != null)
                    label.text = value;
            }
        }

        public void SetHover(bool on)
        {
            if (background != null)
                background.color = on ? hover : normal;
        }

        public void Click()
        {
            if (gameObject.activeInHierarchy)
                Clicked?.Invoke();
        }

        /// <summary>버튼 판 크기에 맞춰 누를 수 있는 자리(충돌체)를 잡는다</summary>
        public void FitCollider()
        {
            var rt = transform as RectTransform;
            var box = GetComponent<BoxCollider>();
            box.isTrigger = true;
            if (rt != null)
            {
                box.size = new Vector3(rt.rect.width, rt.rect.height, 4f);
                box.center = new Vector3((0.5f - rt.pivot.x) * rt.rect.width, (0.5f - rt.pivot.y) * rt.rect.height, 0);
            }
        }
    }
}
