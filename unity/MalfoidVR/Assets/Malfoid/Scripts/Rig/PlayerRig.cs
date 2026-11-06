// 플레이어: VR 헤드셋이 켜져 있으면 머리·두 손을 따라가고, 없으면 마우스·키보드로 움직이는 데스크톱 모드가 된다.
// VR: 왼쪽 스틱 걷기, 오른쪽 스틱 좌우로 45도씩 돌기, 오른손 B 정면 다시 맞추기.
// 데스크톱: 오른쪽 마우스 버튼을 누른 채 둘러보기, WASD 걷기, 왼쪽 클릭 누르기·만지기·선물 건네기 (DesktopControls).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR;

namespace Malfoid
{
    [DefaultExecutionOrder(-50)]
    public class PlayerRig : MonoBehaviour
    {
        public Transform cameraOffset;
        public Camera head;
        public HandProbe leftHand;
        public HandProbe rightHand;
        public DesktopControls desktop;
        [Tooltip("걷는 빠르기 (m/s)")]
        public float moveSpeed = 1.2f;
        public float snapTurn = 45f;
        [Tooltip("헤드셋이 바닥 높이를 모를 때 쓸 눈높이")]
        public float seatedEyeHeight = 1.55f;

        public bool IsVr { get; private set; }
        public Transform Head => head.transform;

        bool turnReady = true;

        void Start()
        {
            IsVr = XRSettings.isDeviceActive;
            if (IsVr)
            {
                // 바닥 기준으로 추적한다 (키가 실제 키가 된다). 안 되는 기기면 앉은 눈높이만큼 올린다
                var floor = false;
                var subsystems = new List<XRInputSubsystem>();
                SubsystemManager.GetSubsystems(subsystems);
                foreach (var s in subsystems)
                    floor |= s.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor);
                cameraOffset.localPosition = floor ? Vector3.zero : new Vector3(0, seatedEyeHeight, 0);
            }
            else
            {
                // 데스크톱: 헤드셋 대신 눈높이에 카메라를 두고 손은 숨긴다
                foreach (var driver in GetComponentsInChildren<TrackedPoseDriver>())
                    driver.enabled = false;
                cameraOffset.localPosition = Vector3.zero;
                head.transform.localPosition = new Vector3(0, seatedEyeHeight + 0.05f, 0);
                head.transform.localRotation = Quaternion.identity;
                leftHand.gameObject.SetActive(false);
                rightHand.gameObject.SetActive(false);
            }
            if (desktop != null)
                desktop.enabled = !IsVr;
        }

        void Update()
        {
            if (!IsVr)
                return;
            // 걷기: 왼쪽 스틱, 바라보는 방향 기준
            var move = leftHand.Input.StickValue;
            if (move.sqrMagnitude > 0.04f)
            {
                var fwd = head.transform.forward;
                fwd.y = 0;
                fwd.Normalize();
                var right = new Vector3(fwd.z, 0, -fwd.x);
                transform.position += (fwd * move.y + right * move.x) * (moveSpeed * Time.deltaTime);
            }
            // 돌기: 오른쪽 스틱을 좌우로 한 번 밀 때마다 45도 (머리를 축으로)
            var turn = rightHand.Input.StickValue.x;
            if (turnReady && Mathf.Abs(turn) > 0.7f)
            {
                turnReady = false;
                transform.RotateAround(head.transform.position, Vector3.up, Mathf.Sign(turn) * snapTurn);
            }
            else if (Mathf.Abs(turn) < 0.3f)
            {
                turnReady = true;
            }
            // 정면 다시 맞추기: 오른손 B
            if (rightHand.Input.SecondaryDown)
                Recenter();
        }

        /// <summary>카리나를 정면으로 마주 보게 서는 자리로 돌아간다</summary>
        public void Recenter()
        {
            var f = head.transform.forward;
            f.y = 0;
            if (f.sqrMagnitude > 1e-4f)
                transform.RotateAround(head.transform.position, Vector3.up, Vector3.SignedAngle(f, Vector3.forward, Vector3.up));
            var h = head.transform.position;
            transform.position += new Vector3(-h.x, 0, -h.z);
        }
    }
}
