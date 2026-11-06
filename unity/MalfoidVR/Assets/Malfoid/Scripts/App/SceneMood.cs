// 장소에 따라 방의 빛을 바꾼다. VR 방은 저택 응접실 하나지만, 카리나가 "정원"이나 "런던의 찻집"으로 장소를 옮기면
// 그 장소의 빛 색(웹 앱과 같은 SCENE_RIM)으로 창밖 빛과 주변광이 천천히 물든다.
using UnityEngine;

namespace Malfoid
{
    public class SceneMood : MonoBehaviour
    {
        [Tooltip("창으로 들어오는 빛 (장소의 색으로 물든다)")]
        public Light keyLight;
        [Tooltip("벽난로 불빛 (실내 장소에서만 밝다)")]
        public Light fireLight;
        public Color baseAmbient = new Color(0.22f, 0.24f, 0.26f);

        static readonly string[] Indoor = { "manor", "tearoom", "library" };

        Color targetKey = Color.white;
        Color targetAmbient;
        float targetFire = 1f;
        float flicker;

        void Awake()
        {
            targetAmbient = baseAmbient;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = baseAmbient;
        }

        public void SetScene(string scene)
        {
            var hex = PoseData.SceneRim.TryGetValue(scene ?? "", out var h) ? h : "#ffffff";
            if (!ColorUtility.TryParseHtmlString(hex, out var rim))
                rim = Color.white;
            targetKey = rim;
            targetAmbient = Color.Lerp(baseAmbient, rim * 0.45f, 0.35f);
            targetFire = System.Array.IndexOf(Indoor, scene) >= 0 ? 1f : 0.35f;
        }

        void Update()
        {
            var k = 1f - Mathf.Exp(-Time.deltaTime * 1.5f);
            if (keyLight != null)
                keyLight.color = Color.Lerp(keyLight.color, targetKey, k);
            RenderSettings.ambientLight = Color.Lerp(RenderSettings.ambientLight, targetAmbient, k);
            if (fireLight != null)
            {
                // 벽난로가 일렁인다
                flicker = Mathf.Lerp(flicker, Random.Range(0.75f, 1.15f), 1f - Mathf.Exp(-Time.deltaTime * 12f));
                fireLight.intensity = Mathf.Lerp(fireLight.intensity, 1.4f * targetFire * flicker, k * 4f);
            }
        }
    }
}
