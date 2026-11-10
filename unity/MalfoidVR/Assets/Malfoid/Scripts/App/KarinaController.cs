// 카리나와의 대화를 이끄는 곳. 말(선택지·음성 입력·키보드)이나 행동(손길·선물)을 서버에 보내고,
// 흘러나오는 사건으로 표정·몸짓·목소리·자막·호감도를 바꾼다.
//
//   reaction  → 바로 반응하는 몸짓 (모델의 답이 오기 전에)       emotion → 표정
//   gesture   → 대답에 맞는 몸짓                               scene   → 장소 (조명)
//   text      → 자막                                         sentence → 목소리로 읽기
//   thought   → 속마음                                        choices → 이어서 할 말
//   done      → 호감도·단계·기억                               error   → 알림
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Malfoid
{
    public class KarinaController : MonoBehaviour
    {
        public MalfoidServer server;
        public KarinaAvatar avatar;
        public KarinaVoice voice;
        public DialoguePanel dialogue;
        public StatusPanel status;
        public SceneMood mood;
        public PlayerRig rig;
        [Tooltip("한글 글꼴 (.ttf). 비우면 운영체제의 한글 글꼴을 쓴다. Quest 단독 실행이면 넣어 두는 게 좋다")]
        public Font koreanFont;

        public bool Busy { get; private set; }
        public int Affection { get; private set; } = 20;
        public string UserName { get; private set; } = "포터";
        public string Stage { get; private set; } = "경계";

        readonly Dictionary<string, ActionInfo> actions = new Dictionary<string, ActionInfo>();
        string emotion = "smirk";
        bool connected;
        string model = "";
        Grabbable pendingGift;
        string shownEngine;

        /// <summary>대답이 끝났을 때 (선물을 탁자로 돌려놓는 등)</summary>
        public event System.Action TurnFinished;

        void Awake()
        {
            if (koreanFont != null)
                WorldUi.Font = koreanFont;
        }

        void Start()
        {
            if (dialogue != null)
                dialogue.ChoicePicked += text => Say(text);
            if (status != null)
            {
                status.ResetRequested += ResetConversation;
                status.RecenterRequested += () => rig?.Recenter();
            }
            StartCoroutine(Boot());
        }

        IEnumerator Boot()
        {
            status?.SetSystem("서버에 연결하는 중…");
            // 서버가 켜질 때까지 기다린다 (npm start와 유니티를 동시에 켰을 때)
            while (!connected)
            {
                yield return server.Get<ServerStatus>("/vr/status", s =>
                {
                    connected = true;
                    model = s.ollama ? s.model : "Ollama 꺼짐";
                }, err => status?.SetSystem($"서버에 연결하지 못했어요 ({server.serverUrl})\nnpm start 를 켜 주세요"));
                if (!connected)
                    yield return new WaitForSeconds(3f);
            }
            yield return RefreshState(true);
            yield return CheckVoice();
            // 오랜만에 왔으면 카리나가 먼저 말을 건다
            yield return Run("/vr/greet", null, null);
        }

        IEnumerator RefreshState(bool showLast)
        {
            yield return server.Get<SessionSnapshot>("/vr/state", s =>
            {
                Affection = s.affection;
                UserName = string.IsNullOrEmpty(s.userName) ? UserName : s.userName;
                Stage = s.stage;
                actions.Clear();
                if (s.actions != null)
                    foreach (var a in s.actions)
                        actions[a.id] = a;
                status?.SetAffection(s.affection, s.stage);
                status?.SetScene(s.scene);
                mood?.SetScene(s.scene);
                avatar.Scene = s.scene;
                avatar.SetEmotion(s.emotion);
                emotion = s.emotion;
                if (showLast && s.messages != null && s.messages.Length > 0)
                {
                    var last = s.messages[s.messages.Length - 1];
                    if (last.role == "assistant")
                        dialogue?.ShowReply(last.text, last.thought);
                    dialogue?.ShowChoices(s.choices);
                }
            }, err => status?.SetSystem($"상태를 읽지 못했어요: {err}"));
        }

        IEnumerator CheckVoice()
        {
            var gsv = false;
            yield return server.Get<VoiceStatus>("/tts/gsv/status", v => gsv = v.server, _ => { });
            UpdateSystemLine(gsv ? "AI 음성" : "Edge 음성 (AI 음성이 켜지면 바뀌어요)");
        }

        void UpdateSystemLine(string voiceName)
        {
            var input = VoiceInput.Available ? $"A/X를 누른 채 말하기 ({VoiceInput.Mode})" : "선택지를 고르거나 키보드로";
            status?.SetSystem($"모델: {model}\n음성: {voiceName} · {input}");
        }

        /// <summary>말을 건다. 대답하는 중이면 false</summary>
        public bool Say(string text)
        {
            if (Busy || string.IsNullOrWhiteSpace(text) || !connected)
                return false;
            StartCoroutine(Run("/vr/say", new SayRequest { text = text.Trim() }, text.Trim()));
            return true;
        }

        public bool IsUnlocked(string actionId) => !actions.TryGetValue(actionId, out var a) || a.unlocked;

        public string LabelOf(string actionId) => actions.TryGetValue(actionId, out var a) ? a.label : actionId;

        /// <summary>
        /// 행동(손길·선물). 대답하는 중이면 서버에 보내지 않고 몸짓으로만 반응한다.
        /// </summary>
        /// <param name="reach">카리나가 손을 뻗을 곳 (손 잡기: 상대의 손, 선물: 선물)</param>
        public bool Act(string actionId, Transform reach = null, Grabbable gift = null)
        {
            if (!connected)
                return false;
            if (Busy)
            {
                LocalReaction(actionId);
                return false;
            }
            var unlocked = IsUnlocked(actionId);
            if (reach != null && unlocked)
            {
                var both = gift != null;
                avatar.Reach(reach, both, true, gift != null ? 2.2f : 5f);
            }
            pendingGift = gift;
            StartCoroutine(Run("/vr/say", new SayRequest { action = actionId }, null));
            return true;
        }

        /// <summary>대답하는 중에 닿았을 때 (서버에 보내지 않는다): 웹 앱의 reactionFor와 같은 몸짓</summary>
        public void LocalReaction(string actionId)
        {
            switch (actionId)
            {
                case "poke": avatar.React("coverMouth", "flustered", null, 2.5f); break;
                case "pat": avatar.React(IsUnlocked("pat") ? "clasp" : "armsCrossed", IsUnlocked("pat") ? "flustered" : "annoyed", null, 2.5f); break;
                case "hand": avatar.React("fidget", "flustered", null, 2.5f); break;
                case "hug": avatar.React(IsUnlocked("hug") ? "cheeks" : "armsCrossed", IsUnlocked("hug") ? "flustered" : "annoyed", null, 2.5f); break;
                case "wave": avatar.React("wave", "smirk", null, 2.5f); break;
                case "close": avatar.React("fanHide", "flustered", null, 3f); break;
                case "stare": avatar.React("fidget", "flustered", null, 3f); break;
            }
        }

        public void ResetConversation()
        {
            if (Busy)
                return;
            StartCoroutine(server.Post<SessionSnapshot>("/vr/reset", null, s =>
            {
                voice.Stop();
                dialogue?.BeginTurn("", UserName);
                StartCoroutine(RefreshState(true));
                status?.Toast("처음부터 다시 시작해요");
            }, err => status?.Toast($"초기화하지 못했어요: {err}")));
        }

        IEnumerator Run(string path, SayRequest body, string userText)
        {
            Busy = true;
            avatar.Thinking = true;
            var greeting = path == "/vr/greet";
            if (!greeting)
            {
                voice.Stop();
                dialogue?.BeginTurn(userText ?? (body != null && !string.IsNullOrEmpty(body.action) ? $"*{LabelOf(body.action)}*" : ""), UserName);
            }
            var started = false;
            yield return server.Stream(path, body, e =>
            {
                if (greeting && !started)
                {
                    // 인사할 때가 아니면 서버는 아무것도 보내지 않는다
                    started = true;
                    voice.Stop();
                    dialogue?.BeginTurn("", UserName);
                }
                OnEvent(e);
            }, err =>
            {
                dialogue?.ShowError(err);
            });
            avatar.Thinking = false;
            Busy = false;
            if (pendingGift != null)
            {
                pendingGift.ReturnHome();
                pendingGift = null;
            }
            TurnFinished?.Invoke();
        }

        void OnEvent(VrEvent e)
        {
            switch (e.type)
            {
                case "reaction":
                    // 건넨 선물을 직접 받아 들고 있으면 소품(꽃다발·선물 상자)은 따로 꺼내지 않는다
                    avatar.React(e.gesture, e.emotion, pendingGift != null ? null : e.prop);
                    break;
                case "emotion":
                    emotion = e.emotion;
                    avatar.SetEmotion(e.emotion);
                    avatar.Thinking = false;
                    break;
                case "gesture":
                    avatar.PlayGesture(e.gesture);
                    break;
                case "scene":
                    avatar.Scene = e.scene;
                    mood?.SetScene(e.scene);
                    status?.SetScene(e.scene);
                    break;
                case "text":
                    dialogue?.AppendReply(e.text);
                    break;
                case "sentence":
                    voice.Enqueue(e.text, string.IsNullOrEmpty(e.emotion) ? emotion : e.emotion);
                    break;
                case "thought":
                    dialogue?.SetThought(e.text);
                    break;
                case "choices":
                    dialogue?.ShowChoices(e.items);
                    break;
                case "done":
                    Affection = e.affection;
                    Stage = e.stage;
                    status?.SetAffection(e.affection, e.stage, e.delta);
                    if (e.HasStageChange)
                        status?.Toast(e.stageUp.up ? $"♥ 가까워졌어요: {e.stageUp.from} → {e.stageUp.to}" : $"멀어졌어요: {e.stageUp.from} → {e.stageUp.to}", 8f);
                    else if (!string.IsNullOrEmpty(e.memory))
                        status?.Toast($"카리나가 기억했어요: {e.memory}");
                    // 단계가 바뀌면 할 수 있는 손길도 바뀐다
                    StartCoroutine(RefreshState(false));
                    break;
                case "error":
                    dialogue?.ShowError(e.message);
                    break;
            }
        }

        void Update()
        {
            avatar.Speaking = voice.IsSpeaking;
            avatar.MouthLevel = voice.Level;
            // 실제로 읽은 음성이 바뀌면(AI 음성이 늦게 켜짐, 서버가 꺼짐) 상태 판도 바꾼다
            if (connected && voice.Engine != shownEngine && voice.IsSpeaking)
            {
                shownEngine = voice.Engine;
                UpdateSystemLine(shownEngine);
            }
        }
    }
}
