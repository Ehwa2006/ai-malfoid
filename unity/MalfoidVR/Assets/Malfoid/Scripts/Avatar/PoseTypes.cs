// 생성된 표(Generated/PoseData.cs)가 쓰는 자료형. 수치는 three.js 좌표 그대로다.
using UnityEngine;

namespace Malfoid
{
    public enum Anchor { Head, Chest }

    /// <summary>한 팔의 몸짓 목표 (src/three/vrmGestures.ts의 ArmTarget)</summary>
    public sealed class ArmTarget
    {
        public readonly Anchor Anchor;
        /// <summary>기준점(두 눈 사이 또는 가슴 본)에서 손목까지</summary>
        public readonly Vector3 At;
        /// <summary>팔꿈치가 향할 방향</summary>
        public readonly Vector3 Pole;
        /// <summary>손목 회전 (오일러 XYZ, 라디안)</summary>
        public readonly Vector3 Hand;
        public readonly string Fingers;

        public ArmTarget(Anchor anchor, Vector3 at, Vector3 pole, Vector3 hand, string fingers)
        {
            Anchor = anchor;
            At = at;
            Pole = pole;
            Hand = hand;
            Fingers = fingers;
        }
    }

    public sealed class ArmPose
    {
        /// <summary>캐릭터의 왼팔</summary>
        public readonly ArmTarget Left;
        /// <summary>캐릭터의 오른팔</summary>
        public readonly ArmTarget Right;

        public ArmPose(ArmTarget left, ArmTarget right)
        {
            Left = left;
            Right = right;
        }
    }

    /// <summary>몸짓의 고개·시선·얼굴 (src/avatar2d/gestures.ts의 Gesture 중 3D에 쓰는 것)</summary>
    public sealed class GestureInfo
    {
        public readonly string Id;
        /// <summary>고개: 좌우(-1~1, +는 화면 오른쪽 = 캐릭터의 왼쪽), 위아래(+는 숙임), 기울기(도)</summary>
        public readonly float Yaw, Pitch, Roll;
        public readonly bool HasGaze;
        /// <summary>시선 (-1~1): x+는 화면 오른쪽, y+는 아래</summary>
        public readonly Vector2 Gaze;
        /// <summary>눈 감기: "happy"(웃으며), "smug"(도도하게 내리깔기), 없으면 null</summary>
        public readonly string Closed;
        /// <summary>입: "o", "laugh", 없으면 null</summary>
        public readonly string Mouth;
        public readonly float Blush;
        public readonly float WaveAmp;
        public readonly string Prop;

        public GestureInfo(string id, float yaw, float pitch, float roll, bool hasGaze, Vector2 gaze, string closed, string mouth, float blush, float waveAmp, string prop)
        {
            Id = id;
            Yaw = yaw;
            Pitch = pitch;
            Roll = roll;
            HasGaze = hasGaze;
            Gaze = gaze;
            Closed = closed;
            Mouth = mouth;
            Blush = blush;
            WaveAmp = waveAmp;
            Prop = prop;
        }
    }

    /// <summary>소품을 드는 자리 (src/three/vrm.ts의 PROP_POSE)</summary>
    public sealed class PropPose
    {
        public readonly Vector3 At;
        public readonly Vector3 Rot;
        public readonly bool Both;

        public PropPose(Vector3 at, Vector3 rot, bool both)
        {
            At = at;
            Rot = rot;
            Both = both;
        }
    }
}
