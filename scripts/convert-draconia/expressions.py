"""얼굴 본을 움직여 표정 셰이프키를 굽는다 (아마추어 공간, 단위 m, 정면 = -Y, 위 = +Z, 캐릭터 왼쪽 = +X)."""
import math

import bpy
from mathutils import Matrix, Vector

SIDES = (('Left', 1.0), ('Right', -1.0))


def rest_head(arm, name):
    return arm.data.bones[name].head_local.copy()


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def translate(arm, name, delta):
    pb = arm.pose.bones[name]
    m = pb.matrix.copy()
    m.translation = m.translation + Vector(delta)
    pb.matrix = m
    bpy.context.view_layer.update()


def rotate(arm, name, axis, angle):
    pb = arm.pose.bones[name]
    head = pb.matrix.translation.copy()
    pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()


def lower_lid_curve(arm, side):
    """눈 안쪽 끝 → 아래 눈꺼풀 → 바깥 끝을 |x| 순으로 정렬한 점들"""
    names = [f'{side}_Eyelid_Inner'] + [f'{side}_Eyelid_Lower_{i}' for i in (4, 3, 2, 1)] + [f'{side}_Eyelid_Top_7']
    pts = sorted((rest_head(arm, n) for n in names), key=lambda v: abs(v.x))
    return pts


def curve_at(pts, ax):
    if ax <= abs(pts[0].x):
        return pts[0].copy()
    for a, b in zip(pts, pts[1:]):
        if abs(a.x) <= ax <= abs(b.x):
            t = (ax - abs(a.x)) / max(1e-9, abs(b.x) - abs(a.x))
            return a.lerp(b, t)
    return pts[-1].copy()


def close_eye(arm, side, amount=1.0, lower_up=0.002):
    pts = lower_lid_curve(arm, side)
    for i in range(1, 7):
        name = f'{side}_Eyelid_Top_{i}'
        head = rest_head(arm, name)
        target = curve_at(pts, abs(head.x)) + Vector((0, -0.0008, 0.0006))
        translate(arm, name, (target - head) * amount)
    for i in range(1, 5):
        translate(arm, f'{side}_Eyelid_Lower_{i}', (0, 0, lower_up * amount))


def move_top_lids(arm, side, dz):
    """윗눈꺼풀을 위(+)/아래(-)로. 가운데일수록 많이 움직인다."""
    for i, w in zip(range(1, 7), (0.5, 0.85, 1.0, 1.0, 0.8, 0.5)):
        translate(arm, f'{side}_Eyelid_Top_{i}', (0, 0, dz * w))


def move_lower_lids(arm, side, dz):
    for i in range(1, 5):
        translate(arm, f'{side}_Eyelid_Lower_{i}', (0, 0, dz))


BROW_INNER = ('Eyebrow_Inner', 'Eyebrow_Center_Inner')
BROW_MID = ('Eyebrow_Center',)
BROW_OUTER = ('Eyebrow_Center_Outer', 'Eyebrow_Outer')


def brows(arm, inner=0.0, mid=0.0, outer=0.0, squeeze=0.0):
    """눈썹: 안쪽/가운데/바깥쪽 높이, squeeze(+) = 미간 쪽으로 모으기"""
    for side, sign in SIDES:
        for n in BROW_INNER:
            translate(arm, f'{side}_{n}', (-sign * squeeze, 0, inner))
        for n in BROW_MID:
            translate(arm, f'{side}_{n}', (-sign * squeeze * 0.5, 0, mid))
        for n in BROW_OUTER:
            translate(arm, f'{side}_{n}', (0, 0, outer))
        translate(arm, f'{side}_Eyebrow_Mark_Root', (-sign * squeeze * 0.5, 0, (inner + outer) / 2))


def mouth_corners(arm, up=0.0, out=0.0, back=0.0):
    for side, sign in SIDES:
        translate(arm, f'Lip_Corner_{side}', (sign * out, back, up))


def jaw_open(arm, degrees):
    rotate(arm, 'Jaw', Vector((1, 0, 0)), math.radians(degrees))


def lips_pucker(arm, amount):
    """입술을 앞으로 모은다 (ou/oh)"""
    for n in ('Lip_Top_Left', 'Lip_Top_Right', 'Lip_Bottom_Left', 'Lip_Bottom_Right'):
        x = rest_head(arm, n).x
        translate(arm, n, (-x * 0.35 * amount, -0.003 * amount, 0))
    for n in ('Lip_Top_Middle', 'Lip_Top_Middle_Left', 'Lip_Top_Middle_Right', 'Lip_Bottom_Middle', 'Lip_Bottom_Middle_Left', 'Lip_Bottom_Middle_Right'):
        translate(arm, n, (0, -0.004 * amount, 0))
    mouth_corners(arm, out=-0.004 * amount, back=-0.002 * amount)


def cheeks(arm, up):
    translate(arm, 'Cheeks', (0, 0, up))


# 표정 이름 → 포즈 함수. 셰이프키 이름은 VRM 프리셋 이름과 같게 둔다.
EXPRESSIONS = {
    'blink': lambda a: [close_eye(a, s) for s, _ in SIDES],
    'blinkLeft': lambda a: close_eye(a, 'Left'),
    'blinkRight': lambda a: close_eye(a, 'Right'),
    'aa': lambda a: jaw_open(a, 16),
    'ih': lambda a: (jaw_open(a, 5), mouth_corners(a, out=0.003, up=0.001)),
    'ou': lambda a: (jaw_open(a, 6), lips_pucker(a, 1.0)),
    'ee': lambda a: (jaw_open(a, 7), mouth_corners(a, out=0.004, up=0.0015)),
    'oh': lambda a: (jaw_open(a, 12), lips_pucker(a, 0.6)),
    'happy': lambda a: (
        [close_eye(a, s, 0.55, lower_up=0.004) for s, _ in SIDES],
        brows(a, inner=0.002, mid=0.002, outer=0.001),
        mouth_corners(a, up=0.004, out=0.002, back=0.002),
        cheeks(a, 0.002),
    ),
    'angry': lambda a: (
        brows(a, inner=-0.0045, mid=-0.0018, outer=0.0015, squeeze=0.0008),
        [move_top_lids(a, s, -0.004) for s, _ in SIDES],
        [move_lower_lids(a, s, 0.0015) for s, _ in SIDES],
        mouth_corners(a, up=-0.002, out=-0.001),
    ),
    'sad': lambda a: (
        brows(a, inner=0.005, mid=0.001, outer=-0.002),
        [move_top_lids(a, s, -0.004) for s, _ in SIDES],
        mouth_corners(a, up=-0.003, out=-0.001),
    ),
    'relaxed': lambda a: (
        [move_top_lids(a, s, -0.0065) for s, _ in SIDES],
        brows(a, inner=0.0005, outer=0.001),
        mouth_corners(a, up=0.0025, out=0.001, back=0.001),
    ),
    'surprised': lambda a: (
        brows(a, inner=0.006, mid=0.007, outer=0.005),
        [move_top_lids(a, s, 0.0025) for s, _ in SIDES],
        [move_lower_lids(a, s, -0.001) for s, _ in SIDES],
        jaw_open(a, 9),
        lips_pucker(a, 0.3),
    ),
}


def bake_shape_key(obj, name):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    coords = [v.co.copy() for v in me.vertices]
    ev.to_mesh_clear()
    if obj.data.shape_keys is None:
        obj.shape_key_add(name='Basis', from_mix=False)
    key = obj.shape_key_add(name=name, from_mix=False)
    # Blender 5에서는 새 셰이프키의 value가 1.0이라, 다음 표정을 구울 때 섞이지 않도록 0으로 둔다
    key.value = 0.0
    for i, c in enumerate(coords):
        key.data[i].co = c
    return key


def bake_all(arm, face):
    baked = {}
    for name, pose in EXPRESSIONS.items():
        reset_pose(arm)
        pose(arm)
        key = bake_shape_key(face, name)
        moved = max((key.data[i].co - face.data.vertices[i].co).length for i in range(len(face.data.vertices)))
        baked[name] = moved
    reset_pose(arm)
    return baked
