// 서버(server/vrApi.ts, server/vrSession.ts)와 주고받는 데이터. JsonUtility로 읽고 쓴다.
// 서버가 보내는 사건은 한 줄에 하나씩 오는 JSON(NDJSON)이고, type에 따라 쓰는 칸이 다르다.
using System;

namespace Malfoid
{
    [Serializable]
    public class StageChange
    {
        public string from;
        public string to;
        public bool up;
    }

    /// <summary>서버에서 흘러나오는 사건 하나 (server/vrSession.ts의 VrEvent)</summary>
    [Serializable]
    public class VrEvent
    {
        /// <summary>turn, reaction, emotion, gesture, scene, text, sentence, thought, choices, done, error</summary>
        public string type;
        public string user;
        public string id;
        public string gesture;
        public string emotion;
        public string prop;
        public string scene;
        public string text;
        public string[] items;
        public int affection;
        public int delta;
        public string stage;
        public StageChange stageUp;
        public string memory;
        public string message;

        /// <summary>단계가 바뀌었는지 (JsonUtility는 null을 빈 객체로 읽는다)</summary>
        public bool HasStageChange => stageUp != null && !string.IsNullOrEmpty(stageUp.to);
    }

    [Serializable]
    public class ChatLine
    {
        public string role;
        public string text;
        public string emotion;
        public string thought;
    }

    [Serializable]
    public class ActionInfo
    {
        public string id;
        public string kind;
        public string label;
        public int minAffection;
        public bool unlocked;
    }

    /// <summary>GET /vr/state</summary>
    [Serializable]
    public class SessionSnapshot
    {
        public string userName;
        public int affection;
        public string stage;
        public string scene;
        public string emotion;
        public string[] choices;
        public ChatLine[] messages;
        public string[] memories;
        public ActionInfo[] actions;
        public bool busy;
    }

    /// <summary>GET /vr/status</summary>
    [Serializable]
    public class ServerStatus
    {
        public bool ok;
        public bool ollama;
        public string model;
        public bool busy;
    }

    /// <summary>GET /tts/gsv/status</summary>
    [Serializable]
    public class VoiceStatus
    {
        public bool server;
        public string url;
    }

    /// <summary>GET /stt/status (음성 입력: 로컬 음성 인식)</summary>
    [Serializable]
    public class SttStatus
    {
        public bool server;
        public bool starting;
        public string url;
        public string device;
    }

    /// <summary>POST /stt 의 대답</summary>
    [Serializable]
    public class SttResult
    {
        public string text;
        public float seconds;
        public float took;
    }

    [Serializable]
    public class SayRequest
    {
        public string text;
        public string action;
    }

    [Serializable]
    public class SettingsRequest
    {
        public string userName;
    }

    [Serializable]
    public class SpeechRequest
    {
        public string input;
        public string emotion;
        public float speed = 1f;
    }

    [Serializable]
    public class EdgeSpeechRequest
    {
        public string input;
        public string voice = "ko-KR-SunHiNeural";
        public float speed = 1.05f;
        public float pitch = 6f;
    }
}
