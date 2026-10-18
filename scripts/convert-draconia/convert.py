"""Malfoy Draconia (HiGuys920, CC BY 4.0) FBX → VRM 1.0 변환.

Blender(bpy 모듈)로 화면 없이 실행한다. convert.sh가 환경을 맞춰서 부른다.

    python convert.py --fbx "Malfoy Draconia (3D Model).fbx" --textures <dir> --out malfoy-draconia.vrm

하는 일:
  1. VRM 휴머노이드 본 매핑 (원본 리그의 Hips/Spine/Chest/... 이름 그대로)
  2. 얼굴 본(눈꺼풀·눈썹·입술·턱)을 움직여 표정 셰이프키를 굽고 VRM 표정에 연결 (expressions.py)
  3. 눈 본 시선(lookAt), 머리카락·치마 스프링 본과 몸 콜라이더 (springs.py)
  4. 재질을 MToon(애니풍 셀 셰이딩)으로 바꾸고 텍스처를 줄인다
  5. 라이선스(CC BY 4.0)와 작가 정보를 VRM 메타에 기록한다
"""
import argparse
import os
import sys
import tempfile

import bpy  # addon_utils는 bpy를 먼저 불러와야 import된다
import addon_utils  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expressions  # noqa: E402
import springs  # noqa: E402

SOURCE_URL = 'https://sketchfab.com/3d-models/harry-potter-malfoy-draconia-3d-model-dl-49a0f6d87e7b4079a6a6a5b15768e627'

# 재질 이름 → (텍스처 파일, 줄일 크기). 머리카락 텍스처는 단순한 그라디언트라 작게 둔다.
TEXTURES = {
    'Clothes': ('Clothes_Tex.png', 2048),
    'Face': ('Face_Tex.png', 1024),
    'Hair': ('Hair_Tex.png', 512),
}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--fbx', required=True)
    p.add_argument('--textures', required=True, help='Clothes_Tex.png, Face_Tex.png, Hair_Tex.png가 있는 폴더')
    p.add_argument('--out', required=True)
    p.add_argument('--thumbnail', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'thumbnail.png'))
    return p.parse_args()


def enable_vrm_addon():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # BLENDER_USER_SCRIPTS/addons/io_scene_vrm에 있어야 애드온 환경설정까지 등록되어 내보내기가 동작한다
    addon_utils.enable('io_scene_vrm', default_set=True, handle_error=lambda e: print('addon error:', e))
    assert 'io_scene_vrm' in bpy.context.preferences.addons, 'VRM Add-on for Blender를 찾지 못했습니다 (convert.sh 참고)'


def human_bone_map():
    bones = {
        'hips': 'Hips', 'spine': 'Spine', 'chest': 'Chest', 'neck': 'Neck', 'head': 'Head',
        'left_eye': 'Eye_L', 'right_eye': 'Eye_R', 'jaw': 'Jaw',
    }
    for side, s, en in (('left', 'L', 'Left'), ('right', 'R', 'Right')):
        bones.update({
            f'{side}_shoulder': f'{en} shoulder', f'{side}_upper_arm': f'{en} arm',
            f'{side}_lower_arm': f'{en} elbow', f'{side}_hand': f'{en} wrist',
            f'{side}_upper_leg': f'{en} leg', f'{side}_lower_leg': f'{en} knee',
            f'{side}_foot': f'{en} ankle', f'{side}_toes': f'{en} toe',
            f'{side}_thumb_metacarpal': f'Thumb0_{s}',
            f'{side}_thumb_proximal': f'Thumb1_{s}',
            f'{side}_thumb_distal': f'Thumb2_{s}',
        })
        for finger, src in (('index', 'IndexFinger'), ('middle', 'MiddleFinger'), ('ring', 'RingFinger'), ('little', 'LittleFinger')):
            for part, n in (('proximal', 1), ('intermediate', 2), ('distal', 3)):
                bones[f'{side}_{finger}_{part}'] = f'{src}{n}_{s}'
    return bones


def setup_humanoid(arm, vrm1):
    human_bones = vrm1.humanoid.human_bones
    for key, bone in human_bone_map().items():
        assert bone in arm.data.bones, f'본 없음: {bone}'
        getattr(human_bones, key).node.bone_name = bone
    errors = list(human_bones.error_messages())
    assert not errors, errors
    # 원본의 휴식 자세가 이미 T포즈라 그대로 쓴다 (autoPose는 손가락 등을 다시 펴 버린다)
    vrm1.humanoid.pose = 'restPositionPose'


def setup_look_at(arm, vrm1):
    la = vrm1.look_at
    la.type = 'bone'
    head = arm.data.bones['Head']
    eye_mid = (arm.data.bones['Eye_L'].head_local + arm.data.bones['Eye_R'].head_local) / 2
    la.offset_from_head_bone = head.matrix_local.inverted() @ eye_mid
    for range_map, scale in ((la.range_map_horizontal_inner, 8.0), (la.range_map_horizontal_outer, 12.0),
                             (la.range_map_vertical_down, 8.0), (la.range_map_vertical_up, 8.0)):
        range_map.input_max_value = 90.0
        range_map.output_scale = scale


def resized_image(path, size, tmp_dir):
    image = bpy.data.images.load(path)
    if max(image.size) > size:
        image.scale(size, size)
    # 내보내기가 원본 파일을 다시 읽지 않도록 줄인 이미지를 새 파일로 저장해 둔다
    image.filepath_raw = os.path.join(tmp_dir, os.path.basename(path))
    image.file_format = 'PNG'
    image.save()
    image.name = os.path.splitext(os.path.basename(path))[0]
    return image


def setup_materials(texture_dir, tmp_dir):
    for mat_name, (tex_name, size) in TEXTURES.items():
        mat = bpy.data.materials[mat_name]
        nt = mat.node_tree
        bsdf = nt.nodes['Principled BSDF']
        # 얼굴 재질은 알파가 연결돼 있어 BLEND로 나가는데, 텍스처가 완전 불투명이라 그리기 순서만 꼬인다
        for link in list(bsdf.inputs['Alpha'].links):
            nt.links.remove(link)
        image = resized_image(os.path.join(texture_dir, tex_name), size, tmp_dir)
        for node in nt.nodes:
            if node.type == 'TEX_IMAGE':
                node.image = image

        bpy.ops.vrm.convert_material_to_mtoon1(material_name=mat.name)
        gltf = mat.vrm_addon_extension.mtoon1
        gltf.enabled = True  # 변환 연산자만으로는 꺼진 채로 남아 PBR로 내보내진다
        mtoon = gltf.extensions.vrmc_materials_mtoon
        gltf.alpha_mode = gltf.ALPHA_MODE_OPAQUE.identifier
        # 변환은 Principled의 기본값을 그대로 가져와 텍스처를 20% 어둡게(0.8) 만들고,
        # 발광을 (1,1,1)·세기 0으로 남긴다. 세기 확장을 모르는 뷰어에서 하얗게 빛나지 않도록 0으로 둔다.
        gltf.pbr_metallic_roughness.base_color_factor = (1.0, 1.0, 1.0, 1.0)
        gltf.emissive_factor = (0.0, 0.0, 0.0)
        gltf.extensions.khr_materials_emissive_strength.emissive_strength = 1.0
        gltf.double_sided = mat_name != 'Face'
        mtoon.shade_multiply_texture.index.source = image
        mtoon.shading_toony_factor = 0.9
        mtoon.gi_equalization_factor = 0.9
        mtoon.rim_lighting_mix_factor = 1.0
        mtoon.parametric_rim_fresnel_power_factor = 4.0
        if mat_name == 'Face':
            # 얼굴은 그림자를 만들지 않는다 (애니풍). 외곽선도 없음.
            mtoon.shade_color_factor = (1.0, 1.0, 1.0)
            mtoon.shading_shift_factor = 0.6
            mtoon.outline_width_mode = mtoon.OUTLINE_WIDTH_MODE_NONE.identifier
        else:
            mtoon.shade_color_factor = (0.82, 0.78, 0.86)
            mtoon.shading_shift_factor = 0.15
            mtoon.outline_width_mode = mtoon.OUTLINE_WIDTH_MODE_WORLD_COORDINATES.identifier
            mtoon.outline_width_factor = 0.0012
            mtoon.outline_color_factor = (0.12, 0.09, 0.08)
            mtoon.outline_lighting_mix_factor = 1.0
        if mat_name == 'Hair':
            mtoon.parametric_rim_color_factor = (0.12, 0.12, 0.12)


# 셰이프키 이름 → VRM 프리셋 속성 이름
PRESET_ATTR = {'blinkLeft': 'blink_left', 'blinkRight': 'blink_right'}


def setup_expressions(arm, face, vrm1):
    for name, moved in expressions.bake_all(arm, face).items():
        print(f'  표정 {name:11} 최대 이동 {moved * 1000:.1f} mm')
    for name in expressions.EXPRESSIONS:
        expr = getattr(vrm1.expressions.preset, PRESET_ATTR.get(name, name))
        expr.morph_target_binds.clear()
        bind = expr.morph_target_binds.add()
        bind.node.mesh_object_name = face.name
        bind.index = name
        bind.weight = 1.0
        # 감정 표정이 켜지면 깜빡임을 그만큼 줄인다 (눈꺼풀이 겹쳐 뚫리지 않게)
        if name in ('happy', 'relaxed', 'angry', 'sad', 'surprised'):
            expr.override_blink = 'blend'
        # 입 모양을 바꾸는 표정은 립싱크를 그만큼 줄인다
        if name in ('happy', 'surprised'):
            expr.override_mouth = 'blend'


def setup_meta(vrm1, thumbnail):
    meta = vrm1.meta
    meta.vrm_name = 'Malfoy Draconia'
    meta.version = '1.0'
    meta.authors.clear()
    meta.authors.add().value = 'HiGuys920'
    meta.copyright_information = (
        '"Harry Potter - Malfoy Draconia (3D Model)" by HiGuys920, licensed under CC BY 4.0. '
        'Converted to VRM 1.0 (expressions, spring bones, MToon) for ai-malfoid. '
        'Harry Potter characters belong to their respective owners.'
    )
    meta.references.clear()
    meta.references.add().value = SOURCE_URL
    meta.avatar_permission = 'everyone'
    meta.commercial_usage = 'personalNonProfit'
    meta.credit_notation = 'required'
    meta.allow_redistribution = True
    meta.modification = 'allowModificationRedistribution'
    meta.allow_excessively_violent_usage = False
    meta.allow_excessively_sexual_usage = False
    meta.allow_political_or_religious_usage = False
    meta.allow_antisocial_or_hate_usage = False
    meta.other_license_url = 'https://creativecommons.org/licenses/by/4.0/'
    if thumbnail and os.path.exists(thumbnail):
        meta.thumbnail_image = bpy.data.images.load(thumbnail)


def main():
    args = parse_args()
    enable_vrm_addon()
    bpy.ops.import_scene.fbx(filepath=args.fbx)
    arm = bpy.data.objects['Armature']
    face = bpy.data.objects['Face']

    ext = arm.data.vrm_addon_extension
    ext.spec_version = '1.0'
    vrm1 = ext.vrm1
    # VRM 데이터를 쓰기 전에 마이그레이션을 한 번 돌린다. 안 그러면 내보낼 때 돌면서
    # 셰이프키 이름으로 표정을 자동 연결하고 시선 설정을 바꿔 버린다.
    from io_scene_vrm.editor import migration
    vrm1.expressions.initial_automatic_expression_assignment = False
    vrm1.humanoid.human_bones.initial_automatic_bone_assignment = False
    ext.vrm0.humanoid.initial_automatic_bone_assignment = False
    ext.spring_bone1.initial_automatic_spring_bone_assignment = False
    migration.migrate(bpy.context, arm.name, heavy_migration=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        print('휴머노이드·시선')
        setup_humanoid(arm, vrm1)
        setup_look_at(arm, vrm1)
        print('재질 (MToon)')
        setup_materials(args.textures, tmp_dir)
        print('표정 셰이프키')
        setup_expressions(arm, face, vrm1)
        hair, skirt, colliders = springs.setup(arm)
        print(f'스프링 본: 머리카락 {hair}, 치마 {skirt}, 콜라이더 {colliders}')
        setup_meta(vrm1, args.thumbnail)

        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)
        assert bpy.ops.vrm.model_validate(armature_object_name=arm.name) == {'FINISHED'}, '검증 실패 (로그 참고)'
        result = bpy.ops.export_scene.vrm(filepath=os.path.abspath(args.out), armature_object_name=arm.name)
        assert result == {'FINISHED'}, result
        assert vrm1.look_at.type == 'bone'
    print(f'완료: {args.out} ({os.path.getsize(args.out) / 1e6:.1f} MB)')


main()
