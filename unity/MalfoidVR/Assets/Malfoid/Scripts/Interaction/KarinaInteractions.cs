// VR에서 카리나에게 하는 행동을 알아챈다. 손이 어디에 얼마나 닿았는지로 판단한다:
//   머리 쓰다듬기(pat) : 손이 정수리 위에서 0.4초 넘게, 15cm 넘게 움직인다
//   볼 콕(poke)        : 손끝이 볼에 닿는다
//   손 내밀기(hand)    : 내 손을 카리나의 손 가까이에 0.6초 넘게 대거나 그 자리에서 쥔다 → 허락하면 카리나가 손을 잡는다
//   안아 주기(hug)     : 두 손이 카리나의 등·어깨 가까이에 있고 얼굴이 가깝다
//   손 흔들기(wave)    : 떨어진 곳에서 손을 머리 높이로 들고 좌우로 흔든다
//   선물               : 탁자의 선물을 집어 카리나의 가슴 앞으로 내민다
// 이 밖의 곳은 만져도 아무 일도 일어나지 않는다. 허락하지 않은 손길(호감도가 모자람)은 카리나가 쳐내거나 피한다(서버가 정한다).
// 모델의 대답을 부르지 않는 작은 반응: 너무 가까이 얼굴을 들이밀기, 오래 빤히 쳐다보기 → 당황하며 부채로 얼굴을 가린다.
using System.Collections.Generic;
using UnityEngine;

namespace Malfoid
{
    public class KarinaInteractions : MonoBehaviour
    {
        public KarinaController controller;
        public KarinaAvatar avatar;
        public PlayerRig player;
        [Tooltip("같은 행동을 다시 알아채기까지 (초)")]
        public float sameActionCooldown = 8f;
        [Tooltip("어떤 행동이든 다음 행동까지 (초)")]
        public float anyActionCooldown = 3f;

        class HandTrack
        {
            public float patTime;
            public float patMove;
            public Vector3 lastPos;
            public float handTime;
            public bool onCheek;
            public float waveWindow;
            public int waveFlips;
            public float lastLateral;
            public float giftHold;
        }

        readonly Dictionary<HandProbe, HandTrack> tracks = new Dictionary<HandProbe, HandTrack>();
        readonly Dictionary<string, float> lastAt = new Dictionary<string, float>();
        float lastAny = -99f;
        float stare;
        float stareAt = -99f;
        Transform giftSlot;

        void Start()
        {
            avatar.TooClose += () =>
            {
                if (!controller.Busy)
                    controller.LocalReaction("close");
            };
            // 받은 선물을 드는 자리 (두 손 사이)
            giftSlot = new GameObject("GiftSlot").transform;
            giftSlot.SetParent(avatar.transform, false);
        }

        bool Ready(string id)
        {
            var t = Time.time;
            if (t - lastAny < anyActionCooldown)
                return false;
            if (lastAt.TryGetValue(id, out var at) && t - at < sameActionCooldown)
                return false;
            return true;
        }

        void Fire(string id, HandProbe hand = null, Transform reach = null, Grabbable gift = null)
        {
            if (!Ready(id))
                return;
            lastAny = Time.time;
            lastAt[id] = Time.time;
            hand?.Haptic(0.35f, 0.08f);
            // 보내지 못했으면(서버에 연결 전) 받아 든 선물을 탁자로 돌려놓는다
            if (!controller.Act(id, reach, gift) && gift != null)
                gift.ReturnHome();
        }

        // ── 카리나 몸의 기준점 ──

        Vector3 HeadTop
        {
            get
            {
                var h = avatar.HeadBone;
                return h != null ? avatar.EyeCenter + avatar.Rig.World(HumanBodyBones.Head) * new Vector3(0, 0.1f, -0.03f) : avatar.transform.position + Vector3.up * 1.6f;
            }
        }

        Vector3 Cheek(bool left)
        {
            var q = avatar.Rig.World(HumanBodyBones.Head);
            // 유니티 좌표: 캐릭터의 왼쪽이 -x
            return avatar.EyeCenter + q * new Vector3(left ? -0.042f : 0.042f, -0.035f, 0.055f);
        }

        Vector3 Chest => avatar.ChestBone != null ? avatar.ChestBone.position : avatar.transform.position + Vector3.up * 1.2f;

        void Update()
        {
            if (avatar == null || avatar.Rig == null || player == null || !player.IsVr)
                return;
            var dt = Time.deltaTime;
            Stare(dt);
            var both = 0;
            foreach (var hand in new[] { player.leftHand, player.rightHand })
            {
                if (hand == null || !hand.isActiveAndEnabled)
                    continue;
                if (!tracks.TryGetValue(hand, out var tr))
                    tracks[hand] = tr = new HandTrack { lastPos = hand.transform.position };
                var p = hand.transform.position;
                var moved = (p - tr.lastPos).magnitude;
                tr.lastPos = p;

                if (hand.Held != null)
                {
                    Gift(hand, tr, dt);
                    continue;
                }
                tr.giftHold = 0;

                // 머리 쓰다듬기
                if (Vector3.Distance(p, HeadTop) < 0.13f)
                {
                    tr.patTime += dt;
                    tr.patMove += moved;
                    if (moved > 0.002f && Time.frameCount % 8 == 0)
                        hand.Haptic(0.08f, 0.02f); // 머리카락을 쓰다듬는 느낌
                    if (tr.patTime > 0.4f && tr.patMove > 0.15f)
                    {
                        Fire("pat", hand);
                        tr.patTime = tr.patMove = 0;
                    }
                }
                else
                {
                    tr.patTime = Mathf.Max(0, tr.patTime - dt * 2f);
                    tr.patMove = Mathf.Max(0, tr.patMove - dt * 0.3f);
                }

                // 볼 콕 (닿는 순간 한 번)
                var onCheek = Vector3.Distance(p, Cheek(true)) < 0.045f || Vector3.Distance(p, Cheek(false)) < 0.045f;
                if (onCheek && !tr.onCheek)
                    Fire("poke", hand);
                tr.onCheek = onCheek;

                // 손 내밀기
                var nearHand = false;
                foreach (var left in new[] { true, false })
                {
                    var hb = avatar.HandBone(left);
                    if (hb != null && Vector3.Distance(p, hb.position) < 0.1f)
                        nearHand = true;
                }
                tr.handTime = nearHand ? tr.handTime + dt : 0;
                if (nearHand && (tr.handTime > 0.6f || hand.Input.Grip.WasPressedThisFrame()))
                {
                    Fire("hand", hand, hand.transform);
                    tr.handTime = 0;
                }

                // 안아 주기 (두 손 모두 몸 가까이)
                if (Vector3.Distance(p, Chest) < 0.34f)
                    both++;

                // 손 흔들기: 떨어진 곳에서 머리 높이로 손을 들고 좌우로
                var headPos = player.Head.position;
                var raised = p.y > headPos.y - 0.18f && Vector3.Distance(new Vector3(p.x, 0, p.z), new Vector3(avatar.transform.position.x, 0, avatar.transform.position.z)) > 0.6f;
                var lateral = Vector3.Dot(hand.Velocity, player.Head.right);
                if (raised && Mathf.Abs(lateral) > 0.35f)
                {
                    if (Mathf.Sign(lateral) != Mathf.Sign(tr.lastLateral))
                    {
                        tr.waveFlips++;
                        tr.waveWindow = 1.4f;
                    }
                    tr.lastLateral = lateral;
                }
                tr.waveWindow -= dt;
                if (tr.waveWindow <= 0)
                    tr.waveFlips = 0;
                if (tr.waveFlips >= 3)
                {
                    Fire("wave", hand);
                    tr.waveFlips = 0;
                }
            }
            if (both >= 2 && Vector3.Distance(player.Head.position, avatar.EyeCenter) < 0.5f)
                Fire("hug", player.rightHand);
        }

        void Gift(HandProbe hand, HandTrack tr, float dt)
        {
            var g = hand.Held;
            if (string.IsNullOrEmpty(g.giftId))
                return;
            // 가슴 앞으로 내밀고 잠깐 기다리면 받아 간다
            if (Vector3.Distance(g.transform.position, Chest + avatar.transform.forward * 0.15f) < 0.35f)
            {
                tr.giftHold += dt;
                if (tr.giftHold > 0.6f && !controller.Busy && Ready(g.giftId))
                {
                    tr.giftHold = 0;
                    // 두 손 사이에 받아 든다
                    var l = avatar.HandBone(true);
                    var r = avatar.HandBone(false);
                    giftSlot.position = l != null && r != null ? (l.position + r.position) * 0.5f : Chest + avatar.transform.forward * 0.25f;
                    hand.Haptic(0.4f, 0.1f);
                    g.GiveTo(giftSlot);
                    Fire(g.giftId, hand, giftSlot, g);
                }
            }
            else
            {
                tr.giftHold = 0;
            }
        }

        void LateUpdate()
        {
            // 받은 선물은 카리나의 두 손 사이를 따라간다
            if (giftSlot == null || avatar.Rig == null)
                return;
            var l = avatar.HandBone(true);
            var r = avatar.HandBone(false);
            if (l != null && r != null)
                giftSlot.position = (l.position + r.position) * 0.5f + avatar.transform.forward * 0.03f;
        }

        /// <summary>오래 빤히 쳐다보면 당황한다 (모델을 부르지 않는 작은 반응)</summary>
        void Stare(float dt)
        {
            var headT = player.Head;
            var to = avatar.EyeCenter - headT.position;
            var looking = to.magnitude < 1.6f && Vector3.Angle(headT.forward, to) < 8f;
            stare = looking && !controller.Busy && !avatar.Speaking ? stare + dt : 0;
            if (stare > 5f && Time.time - stareAt > 25f)
            {
                stareAt = Time.time;
                stare = 0;
                controller.LocalReaction("stare");
            }
        }

        /// <summary>데스크톱 모드: 마우스로 누른 곳이 카리나의 어디인지 (머리·볼·손). 아니면 null</summary>
        public string Pick(Ray ray)
        {
            if (avatar == null || avatar.Rig == null)
                return null;
            string best = null;
            var bestT = float.MaxValue;
            void Test(string id, Vector3 center, float radius)
            {
                var t = Vector3.Dot(center - ray.origin, ray.direction);
                if (t < 0)
                    return;
                var d = Vector3.Distance(ray.origin + ray.direction * t, center);
                if (d < radius && t < bestT)
                {
                    best = id;
                    bestT = t;
                }
            }
            Test("pat", HeadTop, 0.12f);
            Test("poke", Cheek(true), 0.045f);
            Test("poke", Cheek(false), 0.045f);
            var lh = avatar.HandBone(true);
            var rh = avatar.HandBone(false);
            if (lh != null)
                Test("hand", lh.position, 0.09f);
            if (rh != null)
                Test("hand", rh.position, 0.09f);
            return best;
        }

        /// <summary>데스크톱 모드: 선물을 눌러서 건넨다</summary>
        public void GiveFromDesk(Grabbable g)
        {
            if (g == null || string.IsNullOrEmpty(g.giftId) || controller.Busy || !Ready(g.giftId))
                return;
            var l = avatar.HandBone(true);
            var r = avatar.HandBone(false);
            giftSlot.position = l != null && r != null ? (l.position + r.position) * 0.5f : Chest + avatar.transform.forward * 0.25f;
            g.GiveTo(giftSlot);
            Fire(g.giftId, null, giftSlot, g);
        }

        public void TouchFromDesk(string id, Transform reach = null)
        {
            if (!string.IsNullOrEmpty(id))
                Fire(id, null, reach);
        }
    }
}
