// 카리나의 목소리. 서버가 보내는 "읽을 문장"을 차례로 받아 소리로 바꿔(미리 한두 문장씩 받아 둔다) 머리에서 들리게 튼다.
// 웹 앱(src/composables/useTts.ts)과 같은 순서로 음성을 고른다:
//   AI 음성(GPT-SoVITS, 감정별 목소리) → 안 되면 Edge 음성 → 그것도 안 되면 자막만
// 4xx(이 문장만 못 읽음)는 그 문장만 Edge로 읽고 AI 음성을 계속 쓰고, 서버가 꺼진 것이면 Edge로 바꾼 뒤 가끔 다시 확인한다.
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Malfoid
{
    [RequireComponent(typeof(AudioSource))]
    public class KarinaVoice : MonoBehaviour
    {
        public MalfoidServer server;
        [Range(0.6f, 1.6f)] public float speed = 1f;
        public bool useAiVoice = true;
        public bool useEdgeVoice = true;

        /// <summary>지금 소리 크기 (입 모양용, 0~1)</summary>
        public float Level { get; private set; }
        public bool IsSpeaking => source.isPlaying || queue.Count > 0 || fetching > 0;
        /// <summary>마지막으로 쓴 음성: "AI 음성", "Edge 음성", "자막만"</summary>
        public string Engine { get; private set; } = "AI 음성";

        class Line
        {
            public string text;
            public string emotion;
            public AudioClip clip;
            /// <summary>소리를 받으러 보냈다</summary>
            public bool requested;
            public int epoch;
        }

        AudioSource source;
        readonly Queue<Line> queue = new Queue<Line>();
        readonly float[] samples = new float[256];
        int fetching;
        int epoch;
        bool gsvDown;
        float gsvRetryAt;
        const int Prefetch = 2;

        void Awake()
        {
            source = GetComponent<AudioSource>();
            source.playOnAwake = false;
            source.spatialBlend = 1f; // 머리에서 들린다 (VR에서 고개를 돌리면 소리 방향도 바뀐다)
            source.rolloffMode = AudioRolloffMode.Logarithmic;
            source.minDistance = 0.6f;
            source.maxDistance = 12f;
            source.dopplerLevel = 0f;
        }

        /// <summary>읽을 문장 하나를 줄 세운다</summary>
        public void Enqueue(string text, string emotion)
        {
            if (string.IsNullOrWhiteSpace(text))
                return;
            queue.Enqueue(new Line { text = text, emotion = emotion, epoch = epoch });
            FillPrefetch();
        }

        /// <summary>읽던 것을 멈추고 줄을 비운다 (새 대답이 시작될 때)</summary>
        public void Stop()
        {
            epoch++;
            queue.Clear();
            source.Stop();
            Level = 0;
        }

        void FillPrefetch()
        {
            var started = 0;
            foreach (var line in queue)
            {
                if (started >= Prefetch)
                    break;
                if (line.clip == null && !line.requested && fetching < Prefetch)
                {
                    line.requested = true; // Fetch가 끝나면 clip이 채워진다
                    StartCoroutine(Fetch(line));
                    started++;
                }
            }
        }

        IEnumerator Fetch(Line line)
        {
            fetching++;
            AudioClip clip = null;
            var aiFailedForLine = false;
            if (useAiVoice && server != null && (!gsvDown || Time.time > gsvRetryAt))
            {
                long status = -1;
                yield return server.Speech(line.text, line.emotion, speed, c => clip = c, code => status = code);
                if (clip != null)
                {
                    gsvDown = false;
                    Engine = "AI 음성";
                }
                else if (status >= 400 && status < 500)
                {
                    aiFailedForLine = true; // 이 문장만의 문제
                }
                else
                {
                    gsvDown = true; // 서버가 꺼졌거나 아직 켜지는 중: 잠시 Edge로 읽다가 다시 해 본다
                    gsvRetryAt = Time.time + 30f;
                }
            }
            if (clip == null && useEdgeVoice && server != null && line.epoch == epoch)
            {
                yield return server.EdgeSpeech(line.text, c => clip = c, _ => { });
                if (clip != null && !aiFailedForLine)
                    Engine = "Edge 음성";
            }
            if (clip == null)
                Engine = "자막만";
            line.clip = clip;
            fetching--;
            if (line.epoch == epoch)
            {
                // 이 문장을 읽을 수 없었으면 빈 줄로 남겨 다음 문장으로 넘어간다
                if (clip == null)
                    line.text = null;
                FillPrefetch();
            }
        }

        void Update()
        {
            if (!source.isPlaying && queue.Count > 0)
            {
                var next = queue.Peek();
                if (next.clip != null)
                {
                    queue.Dequeue();
                    source.clip = next.clip;
                    source.Play();
                    FillPrefetch();
                }
                else if (next.text == null)
                {
                    queue.Dequeue(); // 못 읽은 문장은 건너뛴다
                    FillPrefetch();
                }
            }
            // 입 모양: 지금 나오는 소리의 크기(RMS)
            var level = 0f;
            if (source.isPlaying)
            {
                source.GetOutputData(samples, 0);
                var sum = 0f;
                foreach (var s in samples)
                    sum += s * s;
                level = Mathf.Clamp01(Mathf.Sqrt(sum / samples.Length) * 6f);
            }
            Level = Mathf.Lerp(Level, level, 1f - Mathf.Exp(-Time.deltaTime * 30f));
        }
    }
}
