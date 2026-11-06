// three-vrm의 "정규화 본"을 유니티에서 흉내 낸다.
// 웹 앱의 몸짓·쉬는 자세·손가락 수치는 정규화 본(T포즈에서 회전이 0이고 축이 세계 축과 같은 본) 기준이라,
// 모델마다 다른 실제 본의 축과 상관없이 그대로 옮겨 쓸 수 있다.
//
//   실제 본의 로컬 회전 = (부모의 T포즈 회전)⁻¹ × q × (이 본의 T포즈 회전)      (모두 모델 루트 기준)
//
// 좌표: three.js는 +x가 캐릭터의 왼쪽, 유니티는 +x가 캐릭터의 오른쪽이다(둘 다 +z가 캐릭터의 앞).
// 그래서 three.js 수치는 x를 뒤집어 옮긴다: 위치 (x, y, z) → (-x, y, z), 회전 (qx, qy, qz, qw) → (qx, -qy, -qz, qw).
using System.Collections.Generic;
using UnityEngine;

namespace Malfoid
{
    public sealed class NormalizedRig
    {
        sealed class Bone
        {
            public Transform t;
            /// <summary>T포즈일 때 모델 루트 기준 회전</summary>
            public Quaternion restRel;
            /// <summary>T포즈일 때 실제 부모의 모델 루트 기준 회전</summary>
            public Quaternion parentRestRel;
            public Quaternion restLocal;
            /// <summary>T포즈일 때 모델 루트 기준 위치</summary>
            public Vector3 restPos;
        }

        public readonly Transform Root;
        readonly Dictionary<HumanBodyBones, Bone> bones = new Dictionary<HumanBodyBones, Bone>();

        /// <param name="find">사람형 본을 찾는 함수 (Vrm10Instance.TryGetBoneTransform 또는 Animator.GetBoneTransform)</param>
        public NormalizedRig(Transform root, System.Func<HumanBodyBones, Transform> find)
        {
            Root = root;
            var inv = Quaternion.Inverse(root.rotation);
            for (var b = HumanBodyBones.Hips; b < HumanBodyBones.LastBone; b++)
            {
                var t = find(b);
                if (t == null || t.parent == null)
                    continue;
                bones[b] = new Bone
                {
                    t = t,
                    restRel = inv * t.rotation,
                    parentRestRel = inv * t.parent.rotation,
                    restLocal = t.localRotation,
                    restPos = root.InverseTransformPoint(t.position),
                };
            }
        }

        public bool Has(HumanBodyBones b) => bones.ContainsKey(b);

        public Transform this[HumanBodyBones b] => bones.TryGetValue(b, out var bone) ? bone.t : null;

        /// <summary>T포즈 자세로 되돌린다 (매 프레임 처음에: 회전이 쌓이지 않게)</summary>
        public void ResetAll()
        {
            foreach (var bone in bones.Values)
                bone.t.localRotation = bone.restLocal;
        }

        /// <summary>정규화 본의 로컬 회전 q(유니티 좌표)를 실제 본에 준다</summary>
        public void Set(HumanBodyBones b, Quaternion q)
        {
            if (bones.TryGetValue(b, out var bone))
                bone.t.localRotation = Quaternion.Inverse(bone.parentRestRel) * q * bone.restRel;
        }

        /// <summary>지금 실제 본의 자세를 정규화 본의 로컬 회전으로</summary>
        public Quaternion Get(HumanBodyBones b)
        {
            return bones.TryGetValue(b, out var bone) ? bone.parentRestRel * bone.t.localRotation * Quaternion.Inverse(bone.restRel) : Quaternion.identity;
        }

        /// <summary>정규화 본의 세계 회전 (모델 루트의 회전 포함)</summary>
        public Quaternion World(HumanBodyBones b)
        {
            return bones.TryGetValue(b, out var bone) ? bone.t.rotation * Quaternion.Inverse(bone.restRel) : Root.rotation;
        }

        /// <summary>이 본의 실제 부모가 정규화 본이었다면 가졌을 세계 회전</summary>
        public Quaternion ParentWorld(HumanBodyBones b)
        {
            return bones.TryGetValue(b, out var bone) ? bone.t.parent.rotation * Quaternion.Inverse(bone.parentRestRel) : Root.rotation;
        }

        /// <summary>T포즈에서 child 본이 parent 본에서 떨어진 정도 (정규화 본의 로컬 위치와 같다)</summary>
        public Vector3 RestOffset(HumanBodyBones child, HumanBodyBones parent)
        {
            return bones.TryGetValue(child, out var c) && bones.TryGetValue(parent, out var p) ? c.restPos - p.restPos : Vector3.zero;
        }

        /// <summary>T포즈일 때 모델 루트 기준 위치</summary>
        public Vector3 RestPosition(HumanBodyBones b) => bones.TryGetValue(b, out var bone) ? bone.restPos : Vector3.zero;

        // ── three.js 수치 옮기기 ──

        /// <summary>three.js 위치·방향 → 유니티 (x를 뒤집는다)</summary>
        public static Vector3 FromThree(Vector3 v) => new Vector3(-v.x, v.y, v.z);

        /// <summary>three.js 오일러(XYZ 순서, 라디안) → 유니티 회전</summary>
        public static Quaternion FromThreeEuler(float x, float y, float z)
        {
            return Quaternion.AngleAxis(x * Mathf.Rad2Deg, Vector3.right)
                * Quaternion.AngleAxis(-y * Mathf.Rad2Deg, Vector3.up)
                * Quaternion.AngleAxis(-z * Mathf.Rad2Deg, Vector3.forward);
        }

        public static Quaternion FromThreeEuler(Vector3 e) => FromThreeEuler(e.x, e.y, e.z);
    }
}
