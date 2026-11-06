// 손으로 집을 수 있는 물건 (선물). 물리로 굴러다니지 않고, 놓으면 제자리(탁자 위)로 스르륵 돌아간다.
// 카리나에게 건네면(KarinaInteractions) 카리나가 받아 가고, 대답이 끝난 뒤 다시 탁자에 놓인다.
using UnityEngine;
using UnityEngine.UI;

namespace Malfoid
{
    public class Grabbable : MonoBehaviour
    {
        [Tooltip("선물이면 행동 id (tea, lily, chocolate, broom, book, brooch, candy, scarf)")]
        public string giftId;
        [Tooltip("손을 가까이 대면 보이는 이름")]
        public string label;

        public bool IsHeld => Holder != null;
        public HandProbe Holder { get; private set; }
        /// <summary>카리나가 받아 간 상태 (탁자로 돌아가지 않는다)</summary>
        public bool Given { get; private set; }

        Transform homeParent;
        Vector3 homePos;
        Quaternion homeRot;
        bool returning;
        Transform nameTag;
        Camera view;

        void Awake()
        {
            homeParent = transform.parent;
            homePos = transform.localPosition;
            homeRot = transform.localRotation;
        }

        void Start()
        {
            // 이름표 (탁자 위에 놓여 있을 때만 보인다). 운영체제 글꼴은 장면에 저장할 수 없어서 켤 때 만든다
            if (string.IsNullOrEmpty(label))
                return;
            var canvas = WorldUi.Canvas("Tag", null, new Vector2(260, 46));
            canvas.transform.SetParent(homeParent, false);
            canvas.transform.localScale = Vector3.one * 0.0006f;
            var text = WorldUi.Label("Text", canvas.transform, new Vector2(260, 46), Vector2.zero, 26, new Color(0.95f, 0.9f, 0.75f), TextAnchor.MiddleCenter);
            text.text = label;
            nameTag = canvas.transform;
            nameTag.position = transform.position + Vector3.up * 0.13f;
        }

        public void Grab(HandProbe hand)
        {
            Holder = hand;
            returning = false;
            Given = false;
            transform.SetParent(hand.transform, true);
        }

        public void Release(Vector3 velocity)
        {
            Holder = null;
            transform.SetParent(homeParent, true);
            if (!Given)
                returning = true;
        }

        /// <summary>카리나가 받아 간다: 손에서 빼고 target(카리나의 손 사이)에 붙인다</summary>
        public void GiveTo(Transform target)
        {
            Holder?.Drop();
            Holder = null;
            Given = true;
            returning = false;
            transform.SetParent(target, true);
        }

        /// <summary>탁자로 돌려놓는다</summary>
        public void ReturnHome(bool instant = false)
        {
            if (Holder != null)
                return;
            Given = false;
            transform.SetParent(homeParent, true);
            gameObject.SetActive(true);
            if (instant)
            {
                transform.localPosition = homePos;
                transform.localRotation = homeRot;
                transform.localScale = Vector3.one;
                returning = false;
            }
            else
            {
                returning = true;
            }
        }

        void Update()
        {
            if (nameTag != null)
            {
                var home = homeParent != null ? homeParent.TransformPoint(homePos) : homePos;
                nameTag.gameObject.SetActive(!IsHeld && !Given && (transform.position - home).sqrMagnitude < 0.01f);
                if (view == null)
                    view = Camera.main;
                if (view != null && nameTag.gameObject.activeSelf)
                {
                    nameTag.position = home + Vector3.up * 0.13f;
                    WorldUi.FaceTowards(nameTag, view.transform.position, Time.deltaTime, 10f);
                }
            }
            if (Given && transform.parent != null && transform.parent != homeParent)
            {
                // 카리나의 손 사이로 끌려 들어간다
                transform.localPosition = Vector3.Lerp(transform.localPosition, Vector3.zero, 1f - Mathf.Exp(-Time.deltaTime * 8f));
                transform.localScale = Vector3.Lerp(transform.localScale, Vector3.one * 0.85f, 1f - Mathf.Exp(-Time.deltaTime * 6f));
                return;
            }
            if (!returning)
                return;
            var k = 1f - Mathf.Exp(-Time.deltaTime * 6f);
            transform.localPosition = Vector3.Lerp(transform.localPosition, homePos, k);
            transform.localRotation = Quaternion.Slerp(transform.localRotation, homeRot, k);
            transform.localScale = Vector3.Lerp(transform.localScale, Vector3.one, k);
            if ((transform.localPosition - homePos).sqrMagnitude < 1e-6f)
                returning = false;
        }
    }
}
