// 유니티 메뉴 "Malfoid": 처음 한 번 순서대로 누르면 VR 장면이 완성된다.
//   1. 모델 가져오기   저장소의 public/models/malfoy-draconia.vrm을 Assets/Malfoid/Models로 복사 (UniVRM이 프리팹으로 가져온다)
//   2. VR 설정         OpenXR 켜기(PC·Android), 컨트롤러 프로필(Quest·Index·Vive), 입력 방식(Input System + 예전 방식 둘 다)
//   3. VR 장면 만들기  말포이 저택 응접실, 카리나, 플레이어(머리·두 손), 대화 판, 선물 탁자 → Assets/Malfoid/Scenes/MalfoidVR.unity
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features.Interactions;
using UnityEngine.XR.OpenXR.Features.MetaQuestSupport;
using UniVRM10;

namespace Malfoid.Editor
{
    public static class MalfoidSetup
    {
        const string ModelDir = "Assets/Malfoid/Models";
        const string ModelPath = ModelDir + "/malfoy-draconia.vrm";
        const string MaterialDir = "Assets/Malfoid/Materials";
        const string ScenePath = "Assets/Malfoid/Scenes/MalfoidVR.unity";

        static string RepoRoot => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));

        [MenuItem("Malfoid/전부 한 번에 (1 → 2 → 3)", priority = 0)]
        static void All()
        {
            if (!ImportModel())
                return;
            ConfigureVr();
            BuildScene();
        }

        // ── 1. 모델 ──

        [MenuItem("Malfoid/1. 모델 가져오기", priority = 11)]
        static void ImportModelMenu() => ImportModel();

        static bool ImportModel()
        {
            var src = Path.Combine(RepoRoot, "public", "models", "malfoy-draconia.vrm");
            if (!File.Exists(src))
            {
                EditorUtility.DisplayDialog("Malfoid", $"모델 파일이 없어요:\n{src}\n\n저장소 전체를 받은 뒤(유니티 프로젝트는 unity/MalfoidVR) 다시 해 주세요.", "확인");
                return false;
            }
            Directory.CreateDirectory(ModelDir);
            var dst = Path.GetFullPath(ModelPath);
            if (!File.Exists(dst) || new FileInfo(dst).Length != new FileInfo(src).Length)
                File.Copy(src, dst, true);
            var credits = Path.Combine(RepoRoot, "public", "models", "CREDITS.md");
            if (File.Exists(credits))
                File.Copy(credits, Path.Combine(ModelDir, "CREDITS.md"), true);
            AssetDatabase.Refresh();
            AssetDatabase.ImportAsset(ModelPath, ImportAssetOptions.ForceSynchronousImport);
            if (AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath) == null)
            {
                EditorUtility.DisplayDialog("Malfoid", "모델을 프리팹으로 가져오지 못했어요. UniVRM(com.vrmc.vrm)이 설치됐는지 Package Manager에서 확인해 주세요.", "확인");
                return false;
            }
            Debug.Log($"[Malfoid] 모델을 가져왔어요: {ModelPath} (Malfoy Draconia, HiGuys920, CC BY 4.0)");
            return true;
        }

        // ── 2. VR 설정 ──

        [MenuItem("Malfoid/2. VR 설정 (OpenXR)", priority = 12)]
        static void ConfigureVrMenu() => ConfigureVr();

        static void ConfigureVr()
        {
            var restart = SetProjectSetting("activeInputHandler", 2); // 2: Input System과 예전 입력 둘 다
            AllowHttp();
            PlayerSettings.colorSpace = ColorSpace.Linear;

            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget perTarget) || perTarget == null)
            {
                Directory.CreateDirectory("Assets/XR");
                perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(perTarget, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, perTarget, true);
            }
            var problems = new List<string>();
            foreach (var group in new[] { BuildTargetGroup.Standalone, BuildTargetGroup.Android })
            {
                if (!perTarget.HasManagerSettingsForBuildTarget(group))
                    perTarget.CreateDefaultManagerSettingsForBuildTarget(group);
                var general = perTarget.SettingsForBuildTarget(group);
                general.InitManagerOnStart = true;
                if (!XRPackageMetadataStore.AssignLoader(general.Manager, "UnityEngine.XR.OpenXR.OpenXRLoader", group))
                    problems.Add($"{group}: OpenXR 로더를 켜지 못했어요");
                EditorUtility.SetDirty(general);
                EditorUtility.SetDirty(general.Manager);

                var openxr = OpenXRSettings.GetSettingsForBuildTargetGroup(group);
                if (openxr == null)
                {
                    problems.Add($"{group}: OpenXR 설정이 아직 없어요 (메뉴를 한 번 더 눌러 주세요)");
                    continue;
                }
                Enable<OculusTouchControllerProfile>(openxr);
                Enable<MetaQuestTouchPlusControllerProfile>(openxr);
                if (group == BuildTargetGroup.Standalone)
                {
                    Enable<ValveIndexControllerProfile>(openxr);
                    Enable<HTCViveControllerProfile>(openxr);
                    Enable<KHRSimpleControllerProfile>(openxr);
                }
                else
                {
                    Enable<MetaQuestFeature>(openxr);
                }
                EditorUtility.SetDirty(openxr);
            }
            AssetDatabase.SaveAssets();
            var msg = "OpenXR을 켰어요 (PC: Quest Link·SteamVR / Android: Quest 단독).\n" +
                      "Project Settings ▸ XR Plug-in Management ▸ Project Validation에 경고가 있으면 Fix All을 눌러 주세요.";
            if (problems.Count > 0)
                msg += "\n\n" + string.Join("\n", problems);
            if (restart)
                msg += "\n\n입력 방식을 바꿨어요. 유니티를 껐다 켜야 적용돼요.";
            EditorUtility.DisplayDialog("Malfoid", msg, "확인");
        }

        static void Enable<T>(OpenXRSettings settings) where T : UnityEngine.XR.OpenXR.Features.OpenXRFeature
        {
            var feature = settings.GetFeature<T>();
            if (feature != null)
                feature.enabled = true;
        }

        /// <summary>
        /// 집 안의 개발 서버는 http://로 접속한다. 유니티 2022부터는 http 요청을 기본으로 막으므로 허용한다
        /// (Player Settings ▸ Allow downloads over HTTP ▸ Always allowed)
        /// </summary>
        static void AllowHttp() => SetProjectSetting("insecureHttpOption", 2);

        /// <summary>Player Settings의 값 하나를 바꾼다. 바꿨으면 true (입력 방식은 유니티를 다시 켜야 적용된다)</summary>
        static bool SetProjectSetting(string name, int value)
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets == null || assets.Length == 0)
                return false;
            var so = new SerializedObject(assets[0]);
            var prop = so.FindProperty(name);
            if (prop == null || prop.intValue == value)
                return false;
            prop.intValue = value;
            so.ApplyModifiedProperties();
            return true;
        }

        // ── 3. 장면 ──

        [MenuItem("Malfoid/3. VR 장면 만들기", priority = 13)]
        static void BuildScene()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
            if (prefab == null && !ImportModel())
                return;
            prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath);
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
                return;
            AllowHttp();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Directory.CreateDirectory(MaterialDir);
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));

            var room = BuildRoom(out var keyLight, out var fireLight);

            // 카리나: 플레이어(원점, +z를 봄) 앞 1m에서 플레이어를 마주 본다
            var karina = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            karina.name = "Karina";
            karina.transform.SetPositionAndRotation(new Vector3(0, 0, 1.0f), Quaternion.Euler(0, 180, 0));
            var props = BuildProps(karina.transform);
            var avatar = karina.AddComponent<KarinaAvatar>();
            avatar.propsRoot = props;
            karina.AddComponent<KarinaFace>();
            var voiceGo = new GameObject("Voice", typeof(AudioSource));
            var vrm = karina.GetComponent<Vrm10Instance>();
            var headBone = vrm != null && vrm.TryGetBoneTransform(HumanBodyBones.Head, out var hb) ? hb : null;
            voiceGo.transform.SetParent(headBone != null ? headBone : karina.transform, false);
            voiceGo.transform.localPosition = headBone != null ? new Vector3(0, 0.06f, 0.05f) : new Vector3(0, 1.45f, 0);
            var voice = voiceGo.AddComponent<KarinaVoice>();

            // 플레이어
            var player = BuildPlayer(out var cam, out var left, out var right);

            // 앱
            var app = new GameObject("MalfoidApp");
            var server = app.AddComponent<MalfoidServer>();
            voice.server = server;
            var mood = app.AddComponent<SceneMood>();
            mood.keyLight = keyLight;
            mood.fireLight = fireLight;
            var controller = app.AddComponent<KarinaController>();
            controller.server = server;
            controller.avatar = avatar;
            controller.voice = voice;
            controller.mood = mood;
            controller.rig = player;
            var interactions = app.AddComponent<KarinaInteractions>();
            interactions.controller = controller;
            interactions.avatar = avatar;
            interactions.player = player;
            app.AddComponent<ChatBox>().controller = controller;
            avatar.player = cam.transform;

            var dialogue = new GameObject("Dialogue").AddComponent<DialoguePanel>();
            dialogue.viewer = cam.transform;
            dialogue.anchor = karina.transform;
            dialogue.transform.position = karina.transform.TransformPoint(dialogue.offset);
            controller.dialogue = dialogue;
            var status = new GameObject("Status").AddComponent<StatusPanel>();
            status.viewer = cam.transform;
            status.anchor = karina.transform;
            status.transform.position = karina.transform.TransformPoint(status.offset);
            controller.status = status;

            var voiceInput = app.AddComponent<VoiceInput>();
            voiceInput.controller = controller;
            voiceInput.player = player;
            voiceInput.dialogue = dialogue;

            var desktop = player.gameObject.AddComponent<DesktopControls>();
            desktop.view = cam;
            desktop.body = player.transform;
            desktop.controller = controller;
            desktop.interactions = interactions;
            player.desktop = desktop;

            BuildGiftTable(room.transform);

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = mood.baseAmbient;
            RenderSettings.skybox = null;

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            Selection.activeGameObject = karina;
            EditorUtility.DisplayDialog("Malfoid",
                "VR 장면을 만들었어요: " + ScenePath + "\n\n" +
                "1) 저장소 폴더에서 npm start (Quest 단독이면 npm run start:vr)\n" +
                "2) 헤드셋을 연결하고 ▶ Play (헤드셋이 없으면 마우스·키보드로 움직이는 데스크톱 모드)\n\n" +
                "서버 주소는 MalfoidApp ▸ Malfoid Server ▸ Server Url 에서 바꿔요.", "확인");
        }

        // ── 재료 ──

        static readonly Dictionary<string, Material> Mats = new Dictionary<string, Material>();

        static Material Mat(string name, string hex, float smooth = 0.3f, float metal = 0f, string emission = null)
        {
            if (Mats.TryGetValue(name, out var cached) && cached != null)
                return cached;
            var path = $"{MaterialDir}/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(Shader.Find("Standard"));
                AssetDatabase.CreateAsset(mat, path);
            }
            ColorUtility.TryParseHtmlString(hex, out var color);
            mat.color = color;
            mat.SetFloat("_Glossiness", smooth);
            mat.SetFloat("_Metallic", metal);
            if (emission != null && ColorUtility.TryParseHtmlString(emission, out var em))
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", em);
                mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            }
            EditorUtility.SetDirty(mat);
            Mats[name] = mat;
            return mat;
        }

        static GameObject Prim(PrimitiveType type, string name, Transform parent, Vector3 pos, Vector3 scale, Material mat, Vector3? euler = null, bool keepCollider = false)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.transform.localRotation = Quaternion.Euler(euler ?? Vector3.zero);
            go.GetComponent<Renderer>().sharedMaterial = mat;
            if (!keepCollider)
                Object.DestroyImmediate(go.GetComponent<Collider>());
            return go;
        }

        static GameObject Group(string name, Transform parent, Vector3 pos, Vector3? euler = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(euler ?? Vector3.zero);
            return go;
        }

        // ── 방: 말포이 저택 응접실 ──

        static GameObject BuildRoom(out Light key, out Light fire)
        {
            var room = new GameObject("Manor Drawing Room");
            var t = room.transform;
            var wall = Mat("Wall", "#1d3326", 0.15f);
            var panel = Mat("Wainscot", "#3a2618", 0.35f);
            var floor = Mat("Floor", "#2f2119", 0.45f);
            var rug = Mat("Rug", "#5a1d24", 0.05f);
            var gold = Mat("Gold", "#b8954a", 0.65f, 0.8f);
            var marble = Mat("Marble", "#d8d2c4", 0.7f);
            var dark = Mat("DarkWood", "#24170f", 0.4f);
            var velvet = Mat("Velvet", "#173d2a", 0.1f);
            var glass = Mat("Window", "#1b2740", 0.9f, 0f, "#2c4170");
            var ember = Mat("Ember", "#ff7a2a", 0.2f, 0f, "#ff6a1a");
            var ceiling = Mat("Ceiling", "#d9d1bd", 0.1f);

            // 바닥·천장·벽 (x: -3~3, z: -2.5~3.5, 높이 3.2)
            Prim(PrimitiveType.Cube, "Floor", t, new Vector3(0, -0.05f, 0.5f), new Vector3(6, 0.1f, 6), floor, null, true);
            Prim(PrimitiveType.Cube, "Rug", t, new Vector3(0, 0.005f, 0.6f), new Vector3(3.2f, 0.01f, 2.4f), rug);
            Prim(PrimitiveType.Cube, "RugBorder", t, new Vector3(0, 0.004f, 0.6f), new Vector3(3.4f, 0.008f, 2.6f), gold);
            Prim(PrimitiveType.Cube, "Ceiling", t, new Vector3(0, 3.25f, 0.5f), new Vector3(6, 0.1f, 6), ceiling);
            Prim(PrimitiveType.Cube, "WallBack", t, new Vector3(0, 1.6f, 3.5f), new Vector3(6, 3.2f, 0.1f), wall, null, true);
            Prim(PrimitiveType.Cube, "WallFront", t, new Vector3(0, 1.6f, -2.5f), new Vector3(6, 3.2f, 0.1f), wall, null, true);
            Prim(PrimitiveType.Cube, "WallLeft", t, new Vector3(-3, 1.6f, 0.5f), new Vector3(0.1f, 3.2f, 6), wall, null, true);
            Prim(PrimitiveType.Cube, "WallRight", t, new Vector3(3, 1.6f, 0.5f), new Vector3(0.1f, 3.2f, 6), wall, null, true);
            foreach (var (name, pos, scale) in new[]
            {
                ("WainscotBack", new Vector3(0, 0.5f, 3.43f), new Vector3(6, 1f, 0.04f)),
                ("WainscotFront", new Vector3(0, 0.5f, -2.43f), new Vector3(6, 1f, 0.04f)),
                ("WainscotLeft", new Vector3(-2.93f, 0.5f, 0.5f), new Vector3(0.04f, 1f, 6)),
                ("WainscotRight", new Vector3(2.93f, 0.5f, 0.5f), new Vector3(0.04f, 1f, 6)),
            })
                Prim(PrimitiveType.Cube, name, t, pos, scale, panel);
            Prim(PrimitiveType.Cube, "CrownBack", t, new Vector3(0, 3.12f, 3.42f), new Vector3(6, 0.12f, 0.06f), gold);

            // 벽난로 (카리나 뒤)
            var hearth = Group("Fireplace", t, new Vector3(0, 0, 3.3f)).transform;
            Prim(PrimitiveType.Cube, "Surround", hearth, new Vector3(0, 0.65f, 0), new Vector3(1.7f, 1.3f, 0.35f), marble);
            Prim(PrimitiveType.Cube, "Opening", hearth, new Vector3(0, 0.45f, -0.1f), new Vector3(0.9f, 0.75f, 0.2f), Mat("Soot", "#0b0a09", 0.05f));
            Prim(PrimitiveType.Cube, "Mantel", hearth, new Vector3(0, 1.33f, -0.05f), new Vector3(1.9f, 0.08f, 0.45f), marble);
            Prim(PrimitiveType.Sphere, "Embers", hearth, new Vector3(0, 0.18f, -0.15f), new Vector3(0.5f, 0.12f, 0.2f), ember);
            Prim(PrimitiveType.Cube, "Portrait", hearth, new Vector3(0, 2.1f, 0.12f), new Vector3(1.0f, 1.2f, 0.04f), gold);
            Prim(PrimitiveType.Cube, "PortraitCanvas", hearth, new Vector3(0, 2.1f, 0.09f), new Vector3(0.86f, 1.06f, 0.02f), Mat("PortraitPaint", "#2a3b33", 0.2f));
            var fireGo = Group("FireLight", hearth, new Vector3(0, 0.5f, -0.5f));
            fire = fireGo.AddComponent<Light>();
            fire.type = LightType.Point;
            fire.color = new Color(1f, 0.55f, 0.25f);
            fire.range = 5f;
            fire.intensity = 1.4f;
            fire.shadows = LightShadows.None;

            // 창 (오른쪽 벽): 달빛·햇빛이 들어온다
            for (var i = 0; i < 2; i++)
            {
                var z = -0.6f + i * 2.2f;
                Prim(PrimitiveType.Cube, $"Window{i}", t, new Vector3(2.94f, 1.75f, z), new Vector3(0.03f, 1.8f, 1.0f), glass);
                Prim(PrimitiveType.Cube, $"WindowFrame{i}", t, new Vector3(2.95f, 1.75f, z), new Vector3(0.02f, 1.95f, 1.15f), gold);
                Prim(PrimitiveType.Cube, $"CurtainA{i}", t, new Vector3(2.88f, 1.85f, z - 0.65f), new Vector3(0.06f, 2.3f, 0.3f), velvet);
                Prim(PrimitiveType.Cube, $"CurtainB{i}", t, new Vector3(2.88f, 1.85f, z + 0.65f), new Vector3(0.06f, 2.3f, 0.3f), velvet);
            }
            var keyGo = Group("KeyLight", t, new Vector3(0, 3, -1), new Vector3(32, 25, 0));
            key = keyGo.AddComponent<Light>();
            key.type = LightType.Directional;
            key.color = new Color(0.66f, 0.76f, 1f);
            key.intensity = 1.05f;
            key.shadows = LightShadows.Soft;
            var fill = Group("Chandelier", t, new Vector3(0, 2.7f, 0.6f)).AddComponent<Light>();
            fill.type = LightType.Point;
            fill.color = new Color(1f, 0.86f, 0.66f);
            fill.range = 6f;
            fill.intensity = 0.8f;
            Prim(PrimitiveType.Sphere, "ChandelierBody", t, new Vector3(0, 2.85f, 0.6f), new Vector3(0.45f, 0.25f, 0.45f), gold);

            // 가구: 소파 둘, 책장
            foreach (var (x, rot) in new[] { (-1.9f, 90f), (1.9f, -90f) })
            {
                var sofa = Group(x < 0 ? "SofaLeft" : "SofaRight", t, new Vector3(x, 0, 1.4f), new Vector3(0, rot, 0)).transform;
                Prim(PrimitiveType.Cube, "Seat", sofa, new Vector3(0, 0.25f, 0), new Vector3(1.6f, 0.4f, 0.7f), velvet);
                Prim(PrimitiveType.Cube, "Back", sofa, new Vector3(0, 0.62f, -0.3f), new Vector3(1.6f, 0.55f, 0.15f), velvet);
                Prim(PrimitiveType.Cube, "ArmL", sofa, new Vector3(-0.78f, 0.42f, 0), new Vector3(0.12f, 0.35f, 0.7f), dark);
                Prim(PrimitiveType.Cube, "ArmR", sofa, new Vector3(0.78f, 0.42f, 0), new Vector3(0.12f, 0.35f, 0.7f), dark);
            }
            var shelf = Group("Bookshelf", t, new Vector3(-2.75f, 0, -0.9f), new Vector3(0, 90, 0)).transform;
            Prim(PrimitiveType.Cube, "Case", shelf, new Vector3(0, 1.1f, 0), new Vector3(1.4f, 2.2f, 0.4f), dark);
            var bookColors = new[] { "#5a1d24", "#173d2a", "#2c3550", "#6b5a2e", "#3a2618" };
            for (var row = 0; row < 4; row++)
                for (var b = 0; b < 9; b++)
                    Prim(PrimitiveType.Cube, $"Book{row}_{b}", shelf, new Vector3(-0.56f + b * 0.14f, 0.32f + row * 0.5f, -0.05f), new Vector3(0.1f, 0.34f + (b % 3) * 0.03f, 0.3f), Mat($"Book{(row + b) % 5}", bookColors[(row + b) % 5], 0.3f));
            return room;
        }

        // ── 카리나의 소품 (웹 앱 props3d와 같은 것들, 단순한 모양) ──

        static Transform BuildProps(Transform karina)
        {
            var root = Group("Props", karina, Vector3.zero).transform;
            var black = Mat("FanLace", "#141414", 0.4f);
            var green = Mat("Ribbon", "#1f6b45", 0.3f);
            var white = Mat("Porcelain", "#f4f1ea", 0.8f);
            var gold = Mat("Gold", "#b8954a", 0.65f, 0.8f);
            var lily = Mat("Lily", "#fbfbf5", 0.2f);
            var stem = Mat("Stem", "#3f7a3a", 0.2f);
            var box = Mat("GiftBox", "#1d4d36", 0.4f);
            var lace = Mat("ParasolLace", "#f2ece0", 0.1f);
            var wood = Mat("BroomWood", "#6b4a2b", 0.35f);
            var straw = Mat("BroomStraw", "#c9a35a", 0.1f);

            var fanOpen = Group("fanOpen", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cylinder, "Leaf", fanOpen, new Vector3(0, 0.07f, 0), new Vector3(0.22f, 0.002f, 0.14f), black, new Vector3(90, 0, 0));
            Prim(PrimitiveType.Cube, "Rib", fanOpen, new Vector3(0, 0.02f, 0.002f), new Vector3(0.012f, 0.05f, 0.004f), gold);
            var fanClosed = Group("fanClosed", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cube, "Body", fanClosed, new Vector3(0, 0.09f, 0), new Vector3(0.02f, 0.2f, 0.012f), black);
            Prim(PrimitiveType.Sphere, "Tassel", fanClosed, new Vector3(0, -0.02f, 0), Vector3.one * 0.018f, green);
            var cup = Group("teacup", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cylinder, "Saucer", cup, Vector3.zero, new Vector3(0.11f, 0.004f, 0.11f), white);
            Prim(PrimitiveType.Cylinder, "Cup", cup, new Vector3(0, 0.025f, 0), new Vector3(0.065f, 0.022f, 0.065f), white);
            Prim(PrimitiveType.Cylinder, "Rim", cup, new Vector3(0, 0.047f, 0), new Vector3(0.068f, 0.002f, 0.068f), gold);
            var bouquet = Group("bouquet", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cylinder, "Stems", bouquet, new Vector3(0, -0.05f, 0), new Vector3(0.03f, 0.08f, 0.03f), stem);
            for (var i = 0; i < 7; i++)
            {
                var a = i * Mathf.PI * 2f / 7f;
                Prim(PrimitiveType.Sphere, $"Flower{i}", bouquet, new Vector3(Mathf.Cos(a) * 0.045f, 0.05f + (i % 2) * 0.015f, Mathf.Sin(a) * 0.045f), Vector3.one * 0.045f, lily);
            }
            Prim(PrimitiveType.Sphere, "FlowerTop", bouquet, new Vector3(0, 0.075f, 0), Vector3.one * 0.05f, lily);
            var gift = Group("giftbox", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cube, "Box", gift, new Vector3(0, 0.05f, 0), Vector3.one * 0.1f, box);
            Prim(PrimitiveType.Cube, "RibbonA", gift, new Vector3(0, 0.05f, 0), new Vector3(0.104f, 0.104f, 0.02f), gold);
            Prim(PrimitiveType.Cube, "RibbonB", gift, new Vector3(0, 0.05f, 0), new Vector3(0.02f, 0.104f, 0.104f), gold);
            var parasol = Group("parasol", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cylinder, "Shaft", parasol, new Vector3(0, 0.3f, 0), new Vector3(0.012f, 0.4f, 0.012f), wood);
            Prim(PrimitiveType.Sphere, "Canopy", parasol, new Vector3(0, 0.68f, 0), new Vector3(0.75f, 0.18f, 0.75f), lace);
            var broom = Group("broom", root, Vector3.zero).transform;
            Prim(PrimitiveType.Cylinder, "Handle", broom, new Vector3(0, 0.2f, 0), new Vector3(0.025f, 0.55f, 0.025f), wood);
            Prim(PrimitiveType.Capsule, "Bristles", broom, new Vector3(0, -0.45f, 0), new Vector3(0.12f, 0.16f, 0.12f), straw);
            foreach (Transform p in root)
                p.gameObject.SetActive(false);
            return root;
        }

        // ── 플레이어 ──

        static PlayerRig BuildPlayer(out Camera cam, out HandProbe left, out HandProbe right)
        {
            var root = new GameObject("Player");
            var rig = root.AddComponent<PlayerRig>();
            var offset = Group("CameraOffset", root.transform, Vector3.zero).transform;
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            camGo.tag = "MainCamera";
            camGo.transform.SetParent(offset, false);
            camGo.transform.localPosition = new Vector3(0, 1.6f, 0);
            cam = camGo.GetComponent<Camera>();
            cam.nearClipPlane = 0.03f;
            cam.farClipPlane = 50f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.03f, 0.04f, 0.05f);
            var hmd = camGo.AddComponent<TrackedPoseDriver>();
            hmd.positionInput = new InputActionProperty(new InputAction("HeadPosition", InputActionType.Value, "<XRHMD>/centerEyePosition", expectedControlType: "Vector3"));
            hmd.rotationInput = new InputActionProperty(new InputAction("HeadRotation", InputActionType.Value, "<XRHMD>/centerEyeRotation", expectedControlType: "Quaternion"));
            hmd.trackingStateInput = new InputActionProperty(new InputAction("HeadTracking", InputActionType.Value, "<XRHMD>/trackingState", expectedControlType: "Integer"));

            left = BuildHand(offset, true);
            right = BuildHand(offset, false);
            rig.cameraOffset = offset;
            rig.head = cam;
            rig.leftHand = left;
            rig.rightHand = right;
            return rig;
        }

        static HandProbe BuildHand(Transform parent, bool isLeft)
        {
            var side = isLeft ? "LeftHand" : "RightHand";
            var go = new GameObject(isLeft ? "Left Hand" : "Right Hand", typeof(SphereCollider), typeof(Rigidbody));
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(isLeft ? -0.2f : 0.2f, 1.1f, 0.3f);
            var driver = go.AddComponent<TrackedPoseDriver>();
            driver.positionInput = new InputActionProperty(new InputAction($"{side}Position", InputActionType.Value, $"<XRController>{{{side}}}/devicePosition", expectedControlType: "Vector3"));
            driver.rotationInput = new InputActionProperty(new InputAction($"{side}Rotation", InputActionType.Value, $"<XRController>{{{side}}}/deviceRotation", expectedControlType: "Quaternion"));
            driver.trackingStateInput = new InputActionProperty(new InputAction($"{side}Tracking", InputActionType.Value, $"<XRController>{{{side}}}/trackingState", expectedControlType: "Integer"));
            var probe = go.AddComponent<HandProbe>();
            probe.isLeft = isLeft;
            // 하얀 장갑 같은 손 (충돌체 없음)
            var glove = Mat("Glove", "#f1ede4", 0.3f);
            Prim(PrimitiveType.Cube, "Palm", go.transform, new Vector3(0, -0.01f, -0.02f), new Vector3(0.075f, 0.03f, 0.1f), glove, new Vector3(20, 0, 0));
            Prim(PrimitiveType.Sphere, "Knuckles", go.transform, new Vector3(0, 0.0f, 0.035f), new Vector3(0.08f, 0.035f, 0.05f), glove);
            Prim(PrimitiveType.Capsule, "Thumb", go.transform, new Vector3(isLeft ? 0.04f : -0.04f, 0.0f, 0.0f), new Vector3(0.022f, 0.03f, 0.022f), glove, new Vector3(0, 0, isLeft ? -50 : 50));
            return probe;
        }

        // ── 선물 탁자 ──

        static void BuildGiftTable(Transform room)
        {
            var dark = Mat("DarkWood", "#24170f", 0.4f);
            var marble = Mat("Marble", "#d8d2c4", 0.7f);
            var table = Group("Gift Table", room, new Vector3(0.75f, 0, 0.35f)).transform;
            Prim(PrimitiveType.Cylinder, "Top", table, new Vector3(0, 0.72f, 0), new Vector3(0.75f, 0.02f, 0.75f), marble, null, true);
            Prim(PrimitiveType.Cylinder, "Leg", table, new Vector3(0, 0.36f, 0), new Vector3(0.08f, 0.36f, 0.08f), dark);
            Prim(PrimitiveType.Cylinder, "Foot", table, new Vector3(0, 0.02f, 0), new Vector3(0.4f, 0.02f, 0.4f), dark);
            var gifts = Group("Gifts", table, new Vector3(0, 0.74f, 0)).transform;

            var items = new (string id, string label, System.Action<Transform> build)[]
            {
                ("tea", "얼그레이 홍차", g =>
                {
                    Prim(PrimitiveType.Cube, "Tin", g, new Vector3(0, 0.05f, 0), new Vector3(0.08f, 0.1f, 0.08f), Mat("TeaTin", "#1e2a4a", 0.6f, 0.4f));
                    Prim(PrimitiveType.Cube, "Band", g, new Vector3(0, 0.05f, 0), new Vector3(0.082f, 0.02f, 0.082f), Mat("Gold", "#b8954a", 0.65f, 0.8f));
                }),
                ("lily", "은방울꽃 다발", g =>
                {
                    Prim(PrimitiveType.Cylinder, "Stems", g, new Vector3(0, 0.06f, 0), new Vector3(0.03f, 0.06f, 0.03f), Mat("Stem", "#3f7a3a", 0.2f));
                    for (var i = 0; i < 6; i++)
                    {
                        var a = i * Mathf.PI / 3f;
                        Prim(PrimitiveType.Sphere, $"Bell{i}", g, new Vector3(Mathf.Cos(a) * 0.04f, 0.14f + (i % 2) * 0.012f, Mathf.Sin(a) * 0.04f), Vector3.one * 0.04f, Mat("Lily", "#fbfbf5", 0.2f));
                    }
                }),
                ("chocolate", "고급 초콜릿", g =>
                {
                    Prim(PrimitiveType.Cube, "Box", g, new Vector3(0, 0.025f, 0), new Vector3(0.13f, 0.05f, 0.09f), Mat("Chocolate", "#3b2216", 0.4f));
                    Prim(PrimitiveType.Cube, "Ribbon", g, new Vector3(0, 0.026f, 0), new Vector3(0.025f, 0.052f, 0.092f), Mat("RedRibbon", "#9b1c2a", 0.3f));
                }),
                ("broom", "빗자루 손질 세트", g =>
                {
                    Prim(PrimitiveType.Cube, "Case", g, new Vector3(0, 0.035f, 0), new Vector3(0.16f, 0.07f, 0.1f), Mat("Leather", "#5a3a22", 0.35f));
                    Prim(PrimitiveType.Cube, "Clasp", g, new Vector3(0, 0.05f, 0.051f), new Vector3(0.03f, 0.02f, 0.004f), Mat("Gold", "#b8954a", 0.65f, 0.8f));
                }),
                ("book", "오래된 마법서", g =>
                {
                    Prim(PrimitiveType.Cube, "Cover", g, new Vector3(0, 0.025f, 0), new Vector3(0.12f, 0.05f, 0.16f), Mat("OldBook", "#4b1a1f", 0.3f));
                    Prim(PrimitiveType.Cube, "Pages", g, new Vector3(0.004f, 0.025f, 0), new Vector3(0.112f, 0.042f, 0.152f), Mat("Pages", "#e9dfc6", 0.1f));
                }),
                ("brooch", "은빛 브로치", g =>
                {
                    Prim(PrimitiveType.Cylinder, "Silver", g, new Vector3(0, 0.03f, 0), new Vector3(0.05f, 0.006f, 0.05f), Mat("Silver", "#c9ccd1", 0.85f, 0.9f), new Vector3(70, 0, 0));
                    Prim(PrimitiveType.Sphere, "Emerald", g, new Vector3(0, 0.035f, -0.006f), Vector3.one * 0.02f, Mat("Emerald", "#0f8a55", 0.9f));
                }),
                ("candy", "싸구려 사탕", g =>
                {
                    Prim(PrimitiveType.Sphere, "Bag", g, new Vector3(0, 0.045f, 0), new Vector3(0.08f, 0.09f, 0.08f), Mat("CandyBag", "#e8b4d8", 0.6f));
                    Prim(PrimitiveType.Sphere, "Knot", g, new Vector3(0, 0.095f, 0), Vector3.one * 0.02f, Mat("CandyTie", "#f5d742", 0.4f));
                }),
                ("scarf", "그리핀도르 목도리", g =>
                {
                    for (var i = 0; i < 6; i++)
                        Prim(PrimitiveType.Cube, $"Stripe{i}", g, new Vector3(0, 0.012f, -0.075f + i * 0.03f), new Vector3(0.09f, 0.024f, 0.03f), i % 2 == 0 ? Mat("ScarfRed", "#8a1c1c", 0.1f) : Mat("ScarfGold", "#d4a62a", 0.1f));
                }),
            };
            for (var i = 0; i < items.Length; i++)
            {
                var a = Mathf.PI * 0.62f + i * Mathf.PI * 2f / items.Length;
                var item = Group($"Gift_{items[i].id}", gifts, new Vector3(Mathf.Cos(a) * 0.24f, 0, Mathf.Sin(a) * 0.24f), new Vector3(0, -a * Mathf.Rad2Deg, 0));
                items[i].build(item.transform);
                var col = item.AddComponent<BoxCollider>();
                col.isTrigger = true;
                col.center = new Vector3(0, 0.06f, 0);
                col.size = new Vector3(0.16f, 0.14f, 0.18f);
                var g = item.AddComponent<Grabbable>();
                g.giftId = items[i].id;
                g.label = items[i].label;
            }
        }
    }
}
