// 카리나의 얼굴: 감정별 VRM 표정(웹과 같은 가중치), 깜빡임, 몸짓이 정한 얼굴(도도하게 내리깐 눈, 웃음), 입 모양, 볼 홍조.
// 원본 모델에는 홍조 표정이 없어서, 웹 앱처럼 볼에 반투명한 분홍 그림을 붙인다.
using System.Collections.Generic;
using UniVRM10;
using UnityEngine;

namespace Malfoid
{
    [DefaultExecutionOrder(110)]
    [RequireComponent(typeof(KarinaAvatar))]
    public class KarinaFace : MonoBehaviour
    {
        [Range(0, 1)] public float blushStrength = 0.85f;
        public Color blushColor = new Color(1f, 0.45f, 0.55f, 1f);

        static readonly string[] FaceExpressions = { "happy", "angry", "sad", "relaxed", "surprised", "oh" };
        static readonly Dictionary<string, ExpressionKey> Keys = new Dictionary<string, ExpressionKey>
        {
            ["happy"] = ExpressionKey.Happy,
            ["angry"] = ExpressionKey.Angry,
            ["sad"] = ExpressionKey.Sad,
            ["relaxed"] = ExpressionKey.Relaxed,
            ["surprised"] = ExpressionKey.Surprised,
            ["oh"] = ExpressionKey.Oh,
        };

        KarinaAvatar avatar;
        readonly Dictionary<string, float> weights = new Dictionary<string, float>();
        float lid;
        float blink;
        float nextBlink = 2f;
        float blinkT = -1f;
        float mouth;
        float blush;
        float t;
        SpriteRenderer[] cheeks;

        void Start()
        {
            avatar = GetComponent<KarinaAvatar>();
            CreateBlush();
        }

        void LateUpdate()
        {
            var vrm = avatar.Vrm;
            var dt = Mathf.Min(Time.deltaTime, 0.1f);
            t += dt;
            var k = 1f - Mathf.Exp(-dt * 8f);
            var mood = avatar.Mood;
            var g = avatar.Gesture;

            // 감정 표정 + 몸짓이 정한 얼굴
            var target = PoseData.Expressions.TryGetValue(mood, out var e) ? new Dictionary<string, float>(e) : new Dictionary<string, float>();
            if (g.Closed == "happy")
                target["happy"] = 1f;
            if (g.Mouth == "o")
                target["oh"] = 0.8f;
            foreach (var name in FaceExpressions)
            {
                weights.TryGetValue(name, out var w);
                target.TryGetValue(name, out var want);
                weights[name] = Mathf.Lerp(w, want, k);
            }

            // 깜빡임 (2~6초마다)
            if (blinkT < 0 && t > nextBlink)
            {
                blinkT = 0;
                nextBlink = t + 2f + Random.value * 4f;
            }
            blink = 0;
            if (blinkT >= 0)
            {
                blinkT += dt;
                blink = Mathf.Max(0, Mathf.Sin(blinkT / 0.16f * Mathf.PI));
                if (blinkT > 0.16f)
                    blinkT = -1f;
            }
            // 도도하게 눈을 내리깐 몸짓
            lid = Mathf.Lerp(lid, g.Closed == "smug" ? 0.9f : 0f, k);

            // 입: 목소리 크기를 따라 벌리고, 웃는 몸짓이면 살짝 벌린 채로
            var laugh = g.Mouth == "laugh" ? 0.55f : 0f;
            var speech = Mathf.Min(1f, avatar.MouthLevel * 1.6f);
            mouth = Mathf.Lerp(mouth, Mathf.Max(laugh, speech), 1f - Mathf.Exp(-dt * 25f));
            // 말할 때는 '아'와 '오'를 섞어 입 모양이 단조롭지 않게
            var vowel = 0.5f + 0.5f * Mathf.Sin(t * 7.3f) * Mathf.Sin(t * 3.1f);

            if (vrm != null)
            {
                var ex = vrm.Runtime.Expression;
                foreach (var name in FaceExpressions)
                {
                    var w = weights[name];
                    if (name == "oh")
                        w = Mathf.Max(w, speech > 0.05f ? mouth * 0.35f * (1f - vowel) : 0f);
                    ex.SetWeight(Keys[name], w);
                }
                ex.SetWeight(ExpressionKey.Blink, Mathf.Max(blink, lid));
                ex.SetWeight(ExpressionKey.Aa, speech > 0.05f ? mouth * (0.65f + 0.35f * vowel) : mouth);
            }

            // 볼 홍조
            var wantBlush = Mathf.Max(PoseData.Blush.TryGetValue(mood, out var b) ? b : 0f, g.Blush);
            blush = Mathf.Lerp(blush, wantBlush, k);
            if (cheeks != null)
            {
                foreach (var c in cheeks)
                {
                    var col = blushColor;
                    col.a = blush * blushStrength;
                    c.color = col;
                    c.enabled = blush > 0.01f;
                }
            }
        }

        /// <summary>
        /// 두 볼에 부드러운 분홍 타원을 붙인다 (머리를 따라 움직인다).
        /// 웹 앱처럼 눈 조금 아래·바깥에서 얼굴 표면으로 광선을 쏘아 맞은 자리에 붙인다.
        /// </summary>
        void CreateBlush()
        {
            var headBone = avatar.HeadBone;
            var rig = avatar.Rig;
            if (headBone == null || rig == null || !rig.Has(HumanBodyBones.LeftEye) || !rig.Has(HumanBodyBones.RightEye))
                return;
            const int size = 64;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "KarinaBlush" };
            var pixels = new Color32[size * size];
            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    var dx = (x + 0.5f) / size * 2f - 1f;
                    var dy = (y + 0.5f) / size * 2f - 1f;
                    var a = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy));
                    pixels[y * size + x] = new Color32(255, 255, 255, (byte)(a * a * 255));
                }
            }
            tex.SetPixels32(pixels);
            tex.Apply();
            // 0.032m × 0.016m (가로로 긴 타원: 세로는 localScale로 줄인다)
            var sprite = Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), size / 0.032f);

            // 얼굴 표면을 찾으려고 지금(T포즈) 모양을 잠깐 충돌체로 굽는다
            var temp = new List<GameObject>();
            var colliders = new List<MeshCollider>();
            foreach (var smr in GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                var baked = new Mesh();
                smr.BakeMesh(baked, true);
                var go = new GameObject("BlushProbe");
                go.transform.SetPositionAndRotation(smr.transform.position, smr.transform.rotation);
                var mc = go.AddComponent<MeshCollider>();
                mc.sharedMesh = baked;
                temp.Add(go);
                colliders.Add(mc);
            }
            Physics.SyncTransforms();

            cheeks = new SpriteRenderer[2];
            for (var i = 0; i < 2; i++)
            {
                var eye = rig[i == 0 ? HumanBodyBones.LeftEye : HumanBodyBones.RightEye].position;
                var local = transform.InverseTransformPoint(eye);
                var outward = Mathf.Sign(local.x);
                var from = transform.TransformPoint(new Vector3(local.x + outward * 0.008f, local.y - 0.028f, local.z + 1f));
                var ray = new Ray(from, -transform.forward);
                var point = transform.TransformPoint(new Vector3(local.x + outward * 0.008f, local.y - 0.028f, local.z + 0.06f));
                var normal = transform.forward;
                var best = float.MaxValue;
                foreach (var mc in colliders)
                {
                    if (mc.Raycast(ray, out var hit, 2f) && hit.distance < best)
                    {
                        best = hit.distance;
                        point = hit.point;
                        normal = hit.normal;
                    }
                }
                var cheek = new GameObject(i == 0 ? "BlushLeft" : "BlushRight");
                cheek.transform.SetParent(headBone, false);
                cheek.transform.position = point + normal * 0.0015f;
                cheek.transform.rotation = Quaternion.LookRotation(-normal, transform.up);
                cheek.transform.localScale = new Vector3(1f, 0.5f, 1f);
                var sr = cheek.AddComponent<SpriteRenderer>();
                sr.sprite = sprite;
                sr.color = new Color(1, 1, 1, 0);
                sr.enabled = false;
                cheeks[i] = sr;
            }
            foreach (var go in temp)
            {
                Destroy(go.GetComponent<MeshCollider>().sharedMesh);
                Destroy(go);
            }
        }
    }
}
