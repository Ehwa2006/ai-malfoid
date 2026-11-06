// GPT-SoVITS가 돌려주는 WAV(16비트 PCM, 보통 32kHz 모노)를 AudioClip으로 바꾼다.
// UnityWebRequest의 오디오 다운로더는 POST 응답이나 길이가 비어 있는 머리글을 잘 못 읽어서 직접 읽는다.
using UnityEngine;

namespace Malfoid
{
    public static class WavDecoder
    {
        static string Tag(byte[] b, int at) => at + 4 <= b.Length ? System.Text.Encoding.ASCII.GetString(b, at, 4) : "";
        static int I32(byte[] b, int at) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);
        static int I16(byte[] b, int at) => (short)(b[at] | (b[at + 1] << 8));

        /// <summary>WAV 바이트를 AudioClip으로. 읽을 수 없으면 null</summary>
        public static AudioClip ToClip(byte[] wav, string name)
        {
            if (wav == null || wav.Length < 44 || Tag(wav, 0) != "RIFF" || Tag(wav, 8) != "WAVE")
                return null;
            int channels = 1, rate = 0, bits = 16, format = 1;
            var at = 12;
            while (at + 8 <= wav.Length)
            {
                var id = Tag(wav, at);
                var size = I32(wav, at + 4);
                var body = at + 8;
                if (id == "fmt ")
                {
                    format = I16(wav, body);
                    channels = Mathf.Max(1, I16(wav, body + 2));
                    rate = I32(wav, body + 4);
                    bits = I16(wav, body + 14);
                }
                else if (id == "data")
                {
                    // 스트리밍으로 만든 WAV는 data 크기가 0이거나 너무 클 수 있어 실제 남은 길이로 자른다
                    var length = size <= 0 || body + size > wav.Length ? wav.Length - body : size;
                    return Build(wav, body, length, channels, rate, bits, format, name);
                }
                at = body + size + (size & 1);
                if (size < 0)
                    break;
            }
            return null;
        }

        static AudioClip Build(byte[] wav, int start, int length, int channels, int rate, int bits, int format, string name)
        {
            if (rate <= 0)
                return null;
            var bytesPerSample = bits / 8;
            if (bytesPerSample <= 0)
                return null;
            var count = length / bytesPerSample;
            var frames = count / channels;
            if (frames <= 0)
                return null;
            var samples = new float[frames * channels];
            for (var i = 0; i < samples.Length; i++)
            {
                var p = start + i * bytesPerSample;
                samples[i] = bits switch
                {
                    16 => I16(wav, p) / 32768f,
                    24 => ((wav[p] << 8) | (wav[p + 1] << 16) | (wav[p + 2] << 24)) / 2147483648f,
                    32 when format == 3 => System.BitConverter.ToSingle(wav, p),
                    32 => I32(wav, p) / 2147483648f,
                    8 => (wav[p] - 128) / 128f,
                    _ => 0f,
                };
            }
            var clip = AudioClip.Create(name, frames, channels, rate, false);
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
