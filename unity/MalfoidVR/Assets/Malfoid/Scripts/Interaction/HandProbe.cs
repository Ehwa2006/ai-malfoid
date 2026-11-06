// VR 손 하나: 카리나의 머리·볼·손에 닿는 손(작은 구 충돌체), 물건 잡기(그립), 버튼 누르기(트리거 광선), 진동.
using UnityEngine;
using UnityEngine.XR;

namespace Malfoid
{
    [RequireComponent(typeof(SphereCollider), typeof(Rigidbody))]
    public class HandProbe : MonoBehaviour
    {
        public bool isLeft;
        [Tooltip("버튼을 가리키는 광선 (없으면 만든다)")]
        public LineRenderer ray;
        public float rayLength = 4f;
        public float grabRadius = 0.12f;

        public HandInput Input { get; private set; }
        /// <summary>손의 속도 (m/s, 세계 좌표)</summary>
        public Vector3 Velocity { get; private set; }
        public Grabbable Held { get; private set; }
        public bool Gripping => Input != null && Input.GripHeld;

        Vector3 last;
        VrButton hover;

        void Awake()
        {
            Input = new HandInput(isLeft);
            var col = GetComponent<SphereCollider>();
            col.isTrigger = true;
            col.radius = 0.045f;
            var body = GetComponent<Rigidbody>();
            body.isKinematic = true;
            body.useGravity = false;
            if (ray == null)
            {
                ray = gameObject.AddComponent<LineRenderer>();
                ray.widthMultiplier = 0.004f;
                ray.positionCount = 2;
                ray.material = new Material(Shader.Find("Sprites/Default"));
                ray.startColor = new Color(0.75f, 0.95f, 0.8f, 0.9f);
                ray.endColor = new Color(0.75f, 0.95f, 0.8f, 0f);
            }
            ray.enabled = false;
        }

        void OnEnable()
        {
            Input?.Enable();
            last = transform.position;
        }

        void OnDisable()
        {
            Input?.Disable();
            Release();
        }

        void Update()
        {
            var dt = Mathf.Max(Time.deltaTime, 1e-4f);
            Velocity = Vector3.Lerp(Velocity, (transform.position - last) / dt, 1f - Mathf.Exp(-dt * 20f));
            last = transform.position;

            // 잡기·놓기
            if (Input.Grip.WasPressedThisFrame())
                TryGrab();
            else if (Input.Grip.WasReleasedThisFrame())
                Release();

            // 버튼 가리키기: 컨트롤러 앞쪽 광선
            Pointer(out var origin, out var dir);
            hover?.SetHover(false);
            hover = null;
            if (Held == null && Physics.Raycast(origin, dir, out var hit, rayLength, ~0, QueryTriggerInteraction.Collide) && hit.collider.TryGetComponent(out VrButton button))
            {
                hover = button;
                hover.SetHover(true);
                ray.enabled = true;
                ray.SetPosition(0, origin);
                ray.SetPosition(1, hit.point);
                if (Input.TriggerDown)
                {
                    button.Click();
                    Haptic(0.3f, 0.05f);
                }
            }
            else
            {
                ray.enabled = false;
            }
        }

        /// <summary>가리키는 광선의 시작점과 방향 (세계 좌표)</summary>
        public void Pointer(out Vector3 origin, out Vector3 direction)
        {
            var parent = transform.parent;
            var p = Input.PointerPosition.ReadValue<Vector3>();
            var r = Input.PointerRotation.ReadValue<Quaternion>();
            // 가리키기 자세가 없는 기기면(값이 0) 손 자세를 쓰고 조금 아래로 숙인다
            if (parent != null && r != default && (r.x != 0 || r.y != 0 || r.z != 0 || r.w != 0))
            {
                origin = parent.TransformPoint(p);
                direction = parent.rotation * r * Vector3.forward;
            }
            else
            {
                origin = transform.position;
                direction = transform.rotation * Quaternion.Euler(35f, 0, 0) * Vector3.forward;
            }
        }

        void TryGrab()
        {
            Grabbable best = null;
            var bestDist = grabRadius;
            foreach (var c in Physics.OverlapSphere(transform.position, grabRadius, ~0, QueryTriggerInteraction.Collide))
            {
                var g = c.GetComponentInParent<Grabbable>();
                if (g == null || g.IsHeld)
                    continue;
                var d = Vector3.Distance(c.ClosestPoint(transform.position), transform.position);
                if (d <= bestDist)
                {
                    best = g;
                    bestDist = d;
                }
            }
            if (best == null)
                return;
            Held = best;
            best.Grab(this);
            Haptic(0.25f, 0.04f);
        }

        public void Release()
        {
            if (Held == null)
                return;
            var g = Held;
            Held = null;
            g.Release(Velocity);
        }

        /// <summary>손에 쥔 물건을 놓지 않고 빼앗는다 (카리나가 선물을 받아 갈 때)</summary>
        public void Drop()
        {
            Held = null;
        }

        public void Haptic(float amplitude, float seconds)
        {
            var device = InputDevices.GetDeviceAtXRNode(isLeft ? XRNode.LeftHand : XRNode.RightHand);
            if (device.isValid)
                device.SendHapticImpulse(0, amplitude, seconds);
        }
    }
}
