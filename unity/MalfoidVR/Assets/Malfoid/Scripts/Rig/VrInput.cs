// VR 컨트롤러 입력 (Input System). 어떤 헤드셋이든 OpenXR이 붙여 주는 "용도(usage)" 이름으로 읽는다:
// 그립(GripButton), 트리거(TriggerButton), A/X(PrimaryButton), B/Y(SecondaryButton), 스틱(Primary2DAxis).
using UnityEngine;
using UnityEngine.InputSystem;

namespace Malfoid
{
    public sealed class HandInput
    {
        public readonly InputAction Position;
        public readonly InputAction Rotation;
        /// <summary>가리키기용 자세 (컨트롤러 앞쪽으로 뻗는 광선). 없는 기기면 손 자세를 쓴다</summary>
        public readonly InputAction PointerPosition;
        public readonly InputAction PointerRotation;
        public readonly InputAction Grip;
        public readonly InputAction Trigger;
        public readonly InputAction Primary;
        public readonly InputAction Secondary;
        public readonly InputAction Stick;

        public HandInput(bool left)
        {
            var hand = left ? "{LeftHand}" : "{RightHand}";
            InputAction Make(string name, InputActionType type, string control, string expected = null) =>
                new InputAction($"{(left ? "Left" : "Right")}{name}", type, $"<XRController>{hand}/{control}", expectedControlType: expected);
            Position = Make("Position", InputActionType.Value, "devicePosition", "Vector3");
            Rotation = Make("Rotation", InputActionType.Value, "deviceRotation", "Quaternion");
            PointerPosition = Make("PointerPosition", InputActionType.Value, "pointerPosition", "Vector3");
            PointerRotation = Make("PointerRotation", InputActionType.Value, "pointerRotation", "Quaternion");
            Grip = Make("Grip", InputActionType.Button, "{GripButton}");
            Trigger = Make("Trigger", InputActionType.Button, "{TriggerButton}");
            Primary = Make("Primary", InputActionType.Button, "{PrimaryButton}");
            Secondary = Make("Secondary", InputActionType.Button, "{SecondaryButton}");
            Stick = Make("Stick", InputActionType.Value, "{Primary2DAxis}", "Vector2");
        }

        public void Enable()
        {
            foreach (var a in All)
                a.Enable();
        }

        public void Disable()
        {
            foreach (var a in All)
                a.Disable();
        }

        InputAction[] All => new[] { Position, Rotation, PointerPosition, PointerRotation, Grip, Trigger, Primary, Secondary, Stick };

        public bool GripHeld => Grip.IsPressed();
        public bool TriggerDown => Trigger.WasPressedThisFrame();
        public bool PrimaryHeld => Primary.IsPressed();
        public bool PrimaryDown => Primary.WasPressedThisFrame();
        public bool PrimaryUp => Primary.WasReleasedThisFrame();
        public bool SecondaryDown => Secondary.WasPressedThisFrame();
        public Vector2 StickValue => Stick.ReadValue<Vector2>();
    }
}
