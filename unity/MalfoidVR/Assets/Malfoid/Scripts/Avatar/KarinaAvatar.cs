// 카리나의 몸: 웹 앱의 VRM 연출(src/three/vrm.ts, src/avatar2d/director.ts)을 VR로 옮긴 것.
// - 몸짓(팔 IK·손목·손가락), 감정별 고개, 숨쉬기, 소품을 웹과 같은 표(Generated/PoseData.cs)로 움직인다
// - VR에서는 상대가 진짜로 곁에 있으므로: 상대를 바라보고, 옆으로 돌아가면 몸을 돌리고, 너무 가까이 오면 몸을 뒤로 뺀다
// - 손 잡기·선물 받기처럼 상대의 손이나 물건 쪽으로 손을 뻗을 수 있다 (Reach)
// 정규화 본으로 자세를 정한 뒤, VRM(Vrm10Instance, 실행 순서 11000)이 표정·시선·머리카락 흔들림을 그 위에 계산한다.
using System.Collections.Generic;
using UniVRM10;
using UnityEngine;

namespace Malfoid
{
    [DefaultExecutionOrder(100)]
    public class KarinaAvatar : MonoBehaviour
    {
        [Tooltip("상대의 머리 (VR 카메라)")]
        public Transform player;
        [Tooltip("소품들의 부모. 자식 이름이 소품 id(fanOpen, teacup…)다 (장면 만들기 메뉴가 만든다)")]
        public Transform propsRoot;
        [Tooltip("상대가 옆으로 돌아가면 몸을 돌려 마주 본다")]
        public bool turnToPlayer = true;
        [Tooltip("이 각도(도)보다 옆에 있으면 돌아선다")]
        public float turnStartAngle = 40f;
        [Tooltip("상대의 얼굴이 이보다 가까우면(미터) 몸을 뒤로 뺀다")]
        public float personalSpace = 0.38f;

        /// <summary>상대가 너무 가까이 얼굴을 들이밀었을 때 (한 번씩)</summary>
        public event System.Action TooClose;

        public string Emotion { get; private set; } = "smirk";
        public string Scene { get; set; } = "manor";
        /// <summary>목소리가 나오는 중 (고개를 살짝 끄덕이고, 버릇을 멈춘다)</summary>
        public bool Speaking { get; set; }
        /// <summary>대답을 생각하는 중</summary>
        public bool Thinking { get; set; }
        /// <summary>입 벌림 0~1 (목소리 크기)</summary>
        public float MouthLevel { get; set; }

        public string GestureId { get; private set; } = "idle";
        public GestureInfo Gesture => PoseData.Gestures.TryGetValue(GestureId, out var g) ? g : PoseData.Gestures["idle"];
        /// <summary>지금 보일 감정: 행동에 막 반응하는 중이면 그 감정</summary>
        public string Mood => reaction != null ? reaction.emotion : Emotion;
        public string Prop => reaction?.prop ?? Gesture.Prop;

        public NormalizedRig Rig => rig;
        public Vrm10Instance Vrm => vrm;
        /// <summary>두 눈 사이 (세계 좌표)</summary>
        public Vector3 EyeCenter => rig != null && head != HumanBodyBones.LastBone ? rig[head].position + rig.World(head) * headOffset : transform.position + Vector3.up * 1.45f;
        public Transform HeadBone => rig?[HumanBodyBones.Head];
        public Transform ChestBone => rig?[chest];
        public Transform HandBone(bool left) => rig?[left ? HumanBodyBones.LeftHand : HumanBodyBones.RightHand];

        class Reaction
        {
            public string gesture;
            public string emotion;
            public string prop;
            public float until;
        }

        class ArmState
        {
            public Vector3 pos;
            public float weight;
            public bool started;
            public readonly float[] curl = { 0.15f, 0.25f, 0.3f, 0.35f, 0.4f };
            public Quaternion hand = Quaternion.identity;
            /// <summary>Reach로 손을 뻗는 목표</summary>
            public Transform reach;
            public float reachUntil;
        }

        static readonly string[] FingerNames = { "Thumb", "Index", "Middle", "Ring", "Little" };
        static readonly string[] Segments = { "Proximal", "Intermediate", "Distal" };

        Vrm10Instance vrm;
        NormalizedRig rig;
        HumanBodyBones head = HumanBodyBones.LastBone;
        HumanBodyBones chest = HumanBodyBones.LastBone;
        Vector3 headOffset;
        readonly ArmState left = new ArmState();
        readonly ArmState right = new ArmState();
        readonly HumanBodyBones[,] fingerBones = new HumanBodyBones[2 * 5, 3];
        Quaternion restUpperL, restUpperR, restLowerL, restLowerR, restHandL, restHandR;
        Vector3 headEuler, neckEuler;
        float lean;
        float time;
        Transform gaze;
        Reaction reaction;
        string baseGesture = "idle";
        float habitAt;
        float habitUntil;
        bool turning;
        float tooCloseAt = -99f;
        // 소품
        readonly Dictionary<string, Transform> props = new Dictionary<string, Transform>();
        string shownProp;
        float propScale;

        void Awake()
        {
            vrm = GetComponent<Vrm10Instance>();
            System.Func<HumanBodyBones, Transform> find;
            if (vrm != null)
                find = b => vrm.TryGetBoneTransform(b, out var t) ? t : null;
            else
            {
                var animator = GetComponent<Animator>();
                find = b => animator != null && animator.isHuman ? animator.GetBoneTransform(b) : null;
            }
            // T포즈인 지금 자세를 기준으로 삼는다 (VRM은 T포즈로 저장된다)
            rig = new NormalizedRig(transform, find);
            head = rig.Has(HumanBodyBones.Head) ? HumanBodyBones.Head : HumanBodyBones.LastBone;
            chest = rig.Has(HumanBodyBones.UpperChest) ? HumanBodyBones.UpperChest : rig.Has(HumanBodyBones.Chest) ? HumanBodyBones.Chest : HumanBodyBones.Spine;

            var headPos = rig.RestPosition(HumanBodyBones.Head);
            var eyeMid = rig.Has(HumanBodyBones.LeftEye) && rig.Has(HumanBodyBones.RightEye)
                ? (rig.RestPosition(HumanBodyBones.LeftEye) + rig.RestPosition(HumanBodyBones.RightEye)) * 0.5f
                : headPos + new Vector3(0, 0.06f, 0.06f);
            headOffset = eyeMid - headPos;

            for (var side = 0; side < 2; side++)
                for (var f = 0; f < 5; f++)
                    for (var s = 0; s < 3; s++)
                        fingerBones[side * 5 + f, s] = System.Enum.TryParse<HumanBodyBones>((side == 0 ? "Left" : "Right") + FingerNames[f] + Segments[s], out var bone) ? bone : HumanBodyBones.LastBone;

            restUpperL = Rest(HumanBodyBones.LeftUpperArm);
            restUpperR = Rest(HumanBodyBones.RightUpperArm);
            restLowerL = Rest(HumanBodyBones.LeftLowerArm);
            restLowerR = Rest(HumanBodyBones.RightLowerArm);
            restHandL = left.hand = Rest(HumanBodyBones.LeftHand);
            restHandR = right.hand = Rest(HumanBodyBones.RightHand);

            // 눈이 바라볼 점
            gaze = new GameObject("KarinaGaze").transform;
            gaze.SetParent(transform, false);
            gaze.localPosition = eyeMid + Vector3.forward * 1.2f;
            if (vrm != null)
            {
                vrm.LookAtTargetType = VRM10ObjectLookAt.LookAtTargetTypes.SpecifiedTransform;
                vrm.LookAtTarget = gaze;
            }

            if (propsRoot != null)
            {
                foreach (Transform p in propsRoot)
                {
                    props[p.name] = p;
                    p.gameObject.SetActive(false);
                }
            }
            habitAt = Time.time + 16f;
        }

        static Quaternion Rest(HumanBodyBones b)
        {
            return PoseData.RestPose.TryGetValue(b, out var e) ? NormalizedRig.FromThreeEuler(e) : Quaternion.identity;
        }

        // ── 바깥에서 부르는 것 ──

        public void SetEmotion(string emotion)
        {
            if (!string.IsNullOrEmpty(emotion) && PoseData.Expressions.ContainsKey(emotion))
                Emotion = emotion;
        }

        /// <summary>대답의 감정에 맞춰 서버가 고른 몸짓. 행동에 반응하는 중이면 반응이 끝난 뒤에 한다</summary>
        public void PlayGesture(string id)
        {
            if (string.IsNullOrEmpty(id) || !PoseData.Poses.ContainsKey(id))
                return;
            baseGesture = id;
            habitUntil = 0;
            habitAt = Time.time + 14f + Random.value * 12f;
            if (reaction == null)
                GestureId = id;
        }

        /// <summary>상대의 행동에 곧바로 보이는 반응 (몸짓·감정·소품을 잠깐 덮어쓴다)</summary>
        public void React(string gesture, string emotion, string prop = null, float seconds = 4.5f)
        {
            if (string.IsNullOrEmpty(gesture) || !PoseData.Poses.ContainsKey(gesture))
                gesture = GestureId;
            reaction = new Reaction { gesture = gesture, emotion = string.IsNullOrEmpty(emotion) ? Emotion : emotion, prop = string.IsNullOrEmpty(prop) ? null : prop, until = Time.time + seconds };
            GestureId = gesture;
        }

        /// <summary>한 손(또는 두 손)을 target 쪽으로 뻗는다 (손 잡기, 선물 받기)</summary>
        public void Reach(Transform target, bool leftHand, bool rightHand, float seconds)
        {
            if (leftHand)
            {
                left.reach = target;
                left.reachUntil = Time.time + seconds;
            }
            if (rightHand)
            {
                right.reach = target;
                right.reachUntil = Time.time + seconds;
            }
        }

        public void StopReach()
        {
            left.reach = right.reach = null;
        }

        // ── 매 프레임 ──

        void Update()
        {
            var t = Time.time;
            if (reaction != null && t > reaction.until)
            {
                reaction = null;
                GestureId = baseGesture;
                habitAt = t + 10f + Random.value * 10f;
            }
            if (reaction != null || Speaking || Thinking)
                return;
            // 버릇: 한동안 조용하면 혼자 머리를 넘기거나 찻잔을 드는 등 잠깐 다른 몸짓을 했다가 돌아온다
            if (habitUntil > 0 && t > habitUntil)
            {
                habitUntil = 0;
                GestureId = baseGesture;
                habitAt = t + 14f + Random.value * 14f;
            }
            else if (habitUntil <= 0 && t > habitAt)
            {
                var habit = PickHabit();
                if (habit != null)
                {
                    GestureId = habit;
                    habitUntil = t + 3.5f + Random.value * 2f;
                }
                else
                {
                    habitAt = t + 14f;
                }
            }
        }

        string PickHabit()
        {
            var hour = System.DateTime.Now.Hour;
            // 늦은 밤에는 하품이 잦다
            if ((hour >= 23 || hour < 5) && GestureId != "yawn" && Random.value < 0.5f)
                return "yawn";
            if (!PoseData.Habits.TryGetValue(Emotion, out var byScene) || !byScene.TryGetValue(Scene, out var pool))
                return null;
            var options = new List<string>();
            foreach (var id in pool)
                if (id != GestureId)
                    options.Add(id);
            return options.Count > 0 ? options[Random.Range(0, options.Count)] : null;
        }

        void LateUpdate()
        {
            if (rig == null)
                return;
            var dt = Mathf.Min(Time.deltaTime, 0.1f);
            time += dt;
            rig.ResetAll();
            TurnToPlayer(dt);
            PoseBody(dt);
            PoseHead(dt);
            PoseArm(dt, true);
            PoseArm(dt, false);
            ShowProps(dt);
        }

        Vector3 PlayerHead => player != null ? player.position : transform.position + transform.forward * 1.2f + Vector3.up * 1.55f;

        void TurnToPlayer(float dt)
        {
            if (!turnToPlayer || player == null)
                return;
            var to = PlayerHead - transform.position;
            to.y = 0;
            if (to.sqrMagnitude < 0.01f)
                return;
            var angle = Vector3.SignedAngle(transform.forward, to, Vector3.up);
            if (Mathf.Abs(angle) > turnStartAngle)
                turning = true;
            if (!turning)
                return;
            if (Mathf.Abs(angle) < 4f)
            {
                turning = false;
                return;
            }
            // 처음엔 천천히, 돌다가 다시 천천히
            var step = Mathf.Sign(angle) * Mathf.Min(Mathf.Abs(angle), Mathf.Lerp(30f, 110f, Mathf.Clamp01(Mathf.Abs(angle) / 60f)) * dt);
            transform.Rotate(0, step, 0, Space.World);
        }

        void PoseBody(float dt)
        {
            // 상대가 얼굴을 너무 가까이 들이밀면 몸을 뒤로 뺀다
            var close = player != null && Vector3.Distance(PlayerHead, EyeCenter) < personalSpace;
            lean = Mathf.Lerp(lean, close ? -0.16f : 0f, 1f - Mathf.Exp(-dt * 6f));
            if (close && Time.time - tooCloseAt > 12f)
            {
                tooCloseAt = Time.time;
                TooClose?.Invoke();
            }
            // 숨쉬기 (가슴이 살짝 오르내린다)
            rig.Set(HumanBodyBones.Spine, NormalizedRig.FromThreeEuler(lean * 0.6f, 0, 0));
            rig.Set(chest, NormalizedRig.FromThreeEuler(Mathf.Sin(time * 1.8f) * 0.012f + lean * 0.4f, 0, 0));
        }

        void PoseHead(float dt)
        {
            if (head == HumanBodyBones.LastBone)
                return;
            var mood = Mood;
            var pose = PoseData.HeadPose.TryGetValue(mood, out var hp) ? hp : Vector3.zero;
            var g = Gesture;
            // 2D 몸짓의 고개(화면 기준)를 모델 기준 회전으로 옮긴다 (웹과 같은 비율)
            var yaw = g.Yaw * 0.5f;
            var pitch = g.Pitch * 0.35f;
            var roll = -g.Roll * Mathf.Deg2Rad;
            var talk = Speaking ? Mathf.Sin(time * 2.3f) * 0.03f : 0f;

            // 상대를 본다 (three.js 기준 각도: y+는 캐릭터의 왼쪽, x+는 숙이기)
            float lookYaw = 0, lookPitch = 0;
            var eye = EyeCenter;
            if (!g.HasGaze && player != null)
            {
                var dir = NormalizedRig.FromThree(Quaternion.Inverse(transform.rotation) * (PlayerHead - eye));
                var flat = new Vector2(dir.x, dir.z).magnitude;
                lookYaw = Mathf.Clamp(Mathf.Atan2(dir.x, dir.z), -1.2f, 1.2f);
                lookPitch = Mathf.Clamp(-Mathf.Atan2(dir.y, Mathf.Max(0.05f, flat)), -0.6f, 0.6f);
            }
            var target = new Vector3(
                pose.x + pitch + lookPitch * 0.55f + Mathf.Sin(time * 0.9f) * 0.015f,
                pose.y + yaw + lookYaw * 0.55f,
                pose.z + roll + talk + Mathf.Sin(time * 0.7f) * 0.02f);
            var k = 1f - Mathf.Exp(-dt * 5f);
            headEuler = Vector3.Lerp(headEuler, target, k);
            // 목이 고개 돌림의 일부를 나눠 맡는다
            var neckTarget = new Vector3(lookPitch * 0.25f, lookYaw * 0.3f, 0);
            neckEuler = Vector3.Lerp(neckEuler, neckTarget, k);
            rig.Set(HumanBodyBones.Neck, NormalizedRig.FromThreeEuler(neckEuler));
            rig.Set(head, NormalizedRig.FromThreeEuler(headEuler));

            // 눈: 몸짓이 정한 시선이 있으면 그쪽(딴 데 보기), 없으면 상대의 눈
            if (g.HasGaze)
            {
                var local = new Vector3(g.Gaze.x * 0.8f, (eye.y - transform.position.y) + 0.05f - g.Gaze.y * 0.5f, 1.2f);
                gaze.position = transform.TransformPoint(NormalizedRig.FromThree(local));
            }
            else
            {
                gaze.position = PlayerHead;
            }
        }

        Vector3 AnchorWorld(ArmTarget t, out Quaternion q)
        {
            var bone = t.Anchor == Anchor.Head ? head : chest;
            if (bone == HumanBodyBones.LastBone || !rig.Has(bone))
            {
                q = transform.rotation;
                return transform.position;
            }
            q = rig.World(bone);
            var basePos = rig[bone].position;
            return t.Anchor == Anchor.Head ? basePos + q * headOffset : basePos;
        }

        void PoseArm(float dt, bool isLeft)
        {
            var upper = isLeft ? HumanBodyBones.LeftUpperArm : HumanBodyBones.RightUpperArm;
            var lower = isLeft ? HumanBodyBones.LeftLowerArm : HumanBodyBones.RightLowerArm;
            var hand = isLeft ? HumanBodyBones.LeftHand : HumanBodyBones.RightHand;
            if (!rig.Has(upper) || !rig.Has(lower) || !rig.Has(hand))
                return;
            var st = isLeft ? left : right;
            var restU = isLeft ? restUpperL : restUpperR;
            var restL = isLeft ? restLowerL : restLowerR;
            var restH = isLeft ? restHandL : restHandR;
            var pose = PoseData.Poses.TryGetValue(GestureId, out var p) ? p : null;
            var target = pose == null ? null : isLeft ? pose.Left : pose.Right;
            var k = 1f - Mathf.Exp(-dt * 6f);

            Vector3? want = null;
            Vector3 pole;
            Quaternion handQ;
            string fingers;
            if (st.reach != null && Time.time < st.reachUntil)
            {
                // 손 잡기·선물 받기: 상대의 손(물건)을 향해 손을 뻗는다. 팔이 닿는 데까지만
                var shoulder = rig[upper].position;
                var to = st.reach.position - shoulder;
                var reachLen = (rig.RestOffset(lower, upper).magnitude + rig.RestOffset(hand, lower).magnitude) * 0.97f;
                want = shoulder + Vector3.ClampMagnitude(to, reachLen);
                pole = transform.rotation * NormalizedRig.FromThree(new Vector3(isLeft ? 1f : -1f, -1f, -0.2f));
                handQ = NormalizedRig.FromThreeEuler(0, isLeft ? 0.5f : -0.5f, isLeft ? 0.3f : -0.3f);
                fingers = "soft";
            }
            else
            {
                st.reach = null;
                if (target != null)
                {
                    var anchor = AnchorWorld(target, out var q);
                    var w = anchor + q * NormalizedRig.FromThree(target.At);
                    // 손을 흔드는 몸짓
                    var amp = Gesture.WaveAmp;
                    if (amp > 0)
                        w += transform.rotation * NormalizedRig.FromThree(new Vector3(Mathf.Sin(time * 8.5f) * amp * 0.0025f, 0, 0));
                    want = w;
                    pole = transform.rotation * NormalizedRig.FromThree(target.Pole);
                    var wave = amp > 0 ? Mathf.Sin(time * 8.5f) * 0.25f : 0f;
                    handQ = NormalizedRig.FromThreeEuler(target.Hand.x, target.Hand.y, target.Hand.z + wave);
                    fingers = target.Fingers;
                }
                else
                {
                    pole = transform.rotation * NormalizedRig.FromThree(new Vector3(isLeft ? 1f : -1f, -1f, 0));
                    handQ = restH;
                    fingers = "relaxed";
                }
            }

            st.weight = Mathf.Lerp(st.weight, want.HasValue ? 1f : 0f, k);
            if (want.HasValue)
            {
                // 처음 움직일 때는 지금 손 위치에서 출발해 목표로 옮겨 간다
                if (!st.started)
                {
                    rig.Set(upper, restU);
                    rig.Set(lower, restL);
                    st.pos = rig[hand].position;
                    st.started = true;
                }
                st.pos = Vector3.Lerp(st.pos, want.Value, k);
            }
            if (st.weight < 0.002f)
            {
                rig.Set(upper, restU);
                rig.Set(lower, restL);
                st.started = false;
            }
            else
            {
                ArmIK.Solve(rig, upper, lower, hand, isLeft, st.pos, pole, out var upperQ, out var lowerQ);
                // 쉬는 자세와 섞어서 몸짓이 바뀔 때 팔이 부드럽게 오간다
                rig.Set(upper, Quaternion.Slerp(restU, upperQ, st.weight));
                rig.Set(lower, Quaternion.Slerp(restL, lowerQ, st.weight));
            }
            // 손목
            st.hand = Quaternion.Slerp(st.hand, handQ, k);
            rig.Set(hand, st.hand);
            // 손가락
            var curl = PoseData.Fingers.TryGetValue(fingers ?? "relaxed", out var c) ? c : PoseData.Fingers["relaxed"];
            var sign = isLeft ? -1f : 1f;
            for (var f = 0; f < 5; f++)
            {
                st.curl[f] = Mathf.Lerp(st.curl[f], curl[f], k);
                var amount = st.curl[f];
                for (var s = 0; s < 3; s++)
                {
                    var bone = fingerBones[(isLeft ? 0 : 5) + f, s];
                    if (bone == HumanBodyBones.LastBone)
                        continue;
                    var e = f == 0
                        // 엄지는 손바닥 쪽으로 감싼다
                        ? new Vector3(0, -sign * amount * 0.5f, sign * amount * (s > 0 ? 0.6f : 0.2f))
                        : new Vector3(0, 0, sign * amount * (s == 0 ? 1.2f : 1.35f));
                    rig.Set(bone, NormalizedRig.FromThreeEuler(e));
                }
            }
        }

        void ShowProps(float dt)
        {
            var want = Prop;
            if (want != null && !props.ContainsKey(want))
                want = null;
            // 소품이 바뀌면 작아졌다가 새 소품으로 커진다
            if (want != shownProp)
            {
                propScale = Mathf.Max(0, propScale - dt * 6f);
                if (propScale <= 0)
                {
                    if (shownProp != null)
                        props[shownProp].gameObject.SetActive(false);
                    shownProp = want;
                    if (shownProp != null)
                        props[shownProp].gameObject.SetActive(true);
                }
            }
            else if (shownProp != null)
            {
                propScale = Mathf.Min(1, propScale + dt * 4f);
            }
            if (shownProp == null || !PoseData.Props.TryGetValue(shownProp, out var pose))
                return;
            var obj = props[shownProp];
            var l = HandBone(true);
            var r = HandBone(false);
            if (l == null)
                return;
            var at = pose.Both && r != null ? (l.position + r.position) * 0.5f : l.position;
            obj.position = at + transform.rotation * NormalizedRig.FromThree(pose.At);
            obj.rotation = transform.rotation * NormalizedRig.FromThreeEuler(pose.Rot);
            obj.localScale = Vector3.one * Mathf.Max(0.001f, propScale);
        }
    }
}
