// 헤드셋 없이 시험하는 데스크톱 모드: 오른쪽 마우스 버튼을 누른 채 둘러보기, WASD 걷기,
// 왼쪽 클릭으로 버튼 누르기·카리나의 머리(쓰다듬기)·볼(콕)·손(손 내밀기)·탁자의 선물(건네기).
// 키보드로 말하기: 아래 입력칸에 쓰고 Enter (한글 입력기 그대로 된다). VR 중에도 모니터 앞의 사람이 쓸 수 있다.
using UnityEngine;
using UnityEngine.InputSystem;

namespace Malfoid
{
    public class DesktopControls : MonoBehaviour
    {
        public Camera view;
        public Transform body;
        public KarinaController controller;
        public KarinaInteractions interactions;
        public float lookSpeed = 0.12f;
        public float moveSpeed = 1.4f;

        float yaw;
        float pitch;
        VrButton hover;

        void OnEnable()
        {
            if (view != null)
            {
                yaw = view.transform.eulerAngles.y;
                pitch = 0;
            }
        }

        void Update()
        {
            var mouse = Mouse.current;
            var keys = Keyboard.current;
            if (mouse == null || keys == null || view == null || ChatBox.Focused)
                return;
            var dt = Time.deltaTime;
            if (mouse.rightButton.isPressed)
            {
                var d = mouse.delta.ReadValue();
                yaw += d.x * lookSpeed;
                pitch = Mathf.Clamp(pitch - d.y * lookSpeed, -70f, 70f);
            }
            view.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
            if (body != null)
            {
                body.rotation = Quaternion.Euler(0, yaw, 0);
                var move = Vector2.zero;
                if (keys.wKey.isPressed) move.y += 1;
                if (keys.sKey.isPressed) move.y -= 1;
                if (keys.dKey.isPressed) move.x += 1;
                if (keys.aKey.isPressed) move.x -= 1;
                if (move != Vector2.zero)
                    body.position += (body.forward * move.y + body.right * move.x).normalized * (moveSpeed * dt);
            }

            var ray = view.ScreenPointToRay(mouse.position.ReadValue());
            hover?.SetHover(false);
            hover = null;
            Physics.Raycast(ray, out var hit, 10f, ~0, QueryTriggerInteraction.Collide);
            if (hit.collider != null && hit.collider.TryGetComponent(out VrButton button))
            {
                hover = button;
                hover.SetHover(true);
            }
            if (!mouse.leftButton.wasPressedThisFrame)
                return;
            if (hover != null)
            {
                hover.Click();
                return;
            }
            var gift = hit.collider != null ? hit.collider.GetComponentInParent<Grabbable>() : null;
            if (gift != null)
            {
                interactions.GiveFromDesk(gift);
                return;
            }
            var touch = interactions.Pick(ray);
            if (touch != null)
                interactions.TouchFromDesk(touch, touch == "hand" ? view.transform : null);
        }
    }
}
