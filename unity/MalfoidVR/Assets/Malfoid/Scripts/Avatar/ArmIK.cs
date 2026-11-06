// 두 마디 팔 IK (src/three/ik.ts를 그대로 옮긴 것). 정규화 본 기준으로 푼다.
// - 팔꿈치는 경첩이다: 아래팔을 Y축으로 굽혀 앞으로 접는다 (유니티 좌표에서 왼팔은 +, 오른팔은 -).
// - 위팔은 손이 목표 방향을 향하도록 돌리고, 그 축을 중심으로 비틀어 팔꿈치가 pole 쪽을 보게 한다.
using UnityEngine;

namespace Malfoid
{
    public static class ArmIK
    {
        /// <summary>손목이 어깨에서 d만큼 떨어지려면 팔꿈치를 얼마나 굽혀야 하는지 (라디안)</summary>
        public static float ElbowBend(float a, float b, float d)
        {
            var dd = Mathf.Min(a + b - 1e-4f, Mathf.Max(Mathf.Abs(a - b) + 1e-4f, d));
            var cos = (a * a + b * b - dd * dd) / (2f * a * b);
            return Mathf.PI - Mathf.Acos(Mathf.Clamp(cos, -1f, 1f));
        }

        /// <summary>
        /// target(세계 좌표)에 손목이 오게 하는 위팔·아래팔의 정규화 로컬 회전.
        /// </summary>
        /// <param name="pole">팔꿈치가 향할 방향 (세계 좌표 방향)</param>
        public static void Solve(NormalizedRig rig, HumanBodyBones upper, HumanBodyBones lower, HumanBodyBones hand, bool left,
            Vector3 target, Vector3 pole, out Quaternion upperQ, out Quaternion lowerQ)
        {
            var s = rig[upper].position;
            var toTarget = target - s;
            var a = rig.RestOffset(lower, upper);
            var b = rig.RestOffset(hand, lower);

            // 1) 팔꿈치 굽히기 (경첩)
            var bend = ElbowBend(a.magnitude, b.magnitude, toTarget.magnitude);
            lowerQ = Quaternion.AngleAxis((left ? bend : -bend) * Mathf.Rad2Deg, Vector3.up);

            // 2) 위팔 좌표계에서 본 손목 위치: 팔꿈치까지 + 굽힌 아래팔
            var v = a + lowerQ * b;

            // 3) 부모(어깨) 좌표계로 목표 방향과 pole을 옮긴다
            var parentInv = Quaternion.Inverse(rig.ParentWorld(upper));
            var tDir = (parentInv * toTarget).normalized;
            var pDir = (parentInv * pole).normalized;

            var q1 = Quaternion.FromToRotation(v.normalized, tDir);
            // 4) 손목 방향을 축으로 비틀어 팔꿈치가 pole 쪽을 보게 한다
            var e1 = q1 * a;
            var e1p = e1 - tDir * Vector3.Dot(e1, tDir);
            var pp = pDir - tDir * Vector3.Dot(pDir, tDir);
            var twist = 0f;
            if (e1p.sqrMagnitude > 1e-10f && pp.sqrMagnitude > 1e-10f)
                twist = Mathf.Atan2(Vector3.Dot(tDir, Vector3.Cross(e1p, pp)), Vector3.Dot(e1p, pp));
            upperQ = Quaternion.AngleAxis(twist * Mathf.Rad2Deg, tDir) * q1;
        }
    }
}
