"""머리카락·치마 스프링 본과 몸 콜라이더 (VRMC_springBone)."""
import bpy
from mathutils import Vector

# 스프링 체인을 만들지 않는 머리 자식 본 (얼굴, 귀걸이)
NOT_HAIR = ('Face_Root', 'O_Acs_Ear_Torus')


def _chain(bone):
    """자식이 하나뿐인 동안 아래로 따라가며 체인을 만든다."""
    chain = [bone]
    while len(chain[-1].children) == 1:
        chain.append(chain[-1].children[0])
    return chain


def hair_chains(arm):
    chains = []
    for root in arm.data.bones['Head'].children:
        if root.name.startswith(NOT_HAIR):
            continue
        # 루트 본(머리에 붙은 짧은 본) 아래 갈래마다 체인 하나
        for child in root.children:
            chains.append(_chain(child))
    return [c for c in chains if len(c) >= 1]


def skirt_chains(arm):
    return [_chain(b) for b in arm.data.bones['Hips'].children if b.name.startswith('Sk_')]


def _offset(arm, bone_name, point):
    """아마추어 공간의 점 → 해당 본(휴식 자세) 기준 오프셋"""
    return arm.pose.bones[bone_name].matrix.inverted() @ Vector(point)


def add_colliders(arm, spring_bone1):
    b = arm.data.bones
    specs = [
        # (본, 모양, 시작점, 끝점, 반지름) — 아마추어 공간(m)
        ('Head', 'Sphere', (0, 0.008, 1.49), None, 0.098),
        ('Neck', 'Sphere', (0, 0.018, 1.36), None, 0.05),
        ('Chest', 'Capsule', (0, 0.03, 1.17), (0, 0.03, 1.29), 0.115),
        ('Hips', 'Sphere', (0, 0.01, 0.97), None, 0.13),
    ]
    for side in ('Left', 'Right'):
        specs.append((f'{side} arm', 'Capsule', b[f'{side} arm'].head_local[:], b[f'{side} elbow'].head_local[:], 0.045))
        specs.append((f'{side} leg', 'Capsule', b[f'{side} leg'].head_local[:], b[f'{side} knee'].head_local[:], 0.075))

    group = spring_bone1.add_collider_group()
    group.vrm_name = 'Body'
    for bone, shape, a, tail, radius in specs:
        collider = spring_bone1.add_collider(bpy.context, arm)
        collider.node.bone_name = bone
        collider.shape_type = shape
        if shape == 'Sphere':
            collider.shape.sphere.offset = _offset(arm, bone, a)
            collider.shape.sphere.radius = radius
        else:
            collider.shape.capsule.offset = _offset(arm, bone, a)
            collider.shape.capsule.tail = _offset(arm, bone, tail)
            collider.shape.capsule.radius = radius
        group.add_collider().collider_uuid = collider.uuid
    return group


def add_spring(spring_bone1, name, chain, group, stiffness, gravity, drag, hit_radius):
    spring = spring_bone1.add_spring()
    spring.vrm_name = name
    for bone in chain:
        joint = spring.add_joint()
        joint.node.bone_name = bone.name
        joint.stiffness = stiffness
        joint.gravity_power = gravity
        joint.drag_force = drag
        joint.hit_radius = hit_radius
    spring.add_collider_group().collider_group_uuid = group.uuid
    return spring


def setup(arm):
    sb = arm.data.vrm_addon_extension.spring_bone1
    group = add_colliders(arm, sb)
    hair = hair_chains(arm)
    skirt = skirt_chains(arm)
    for chain in hair:
        # 앞머리(머리 중심보다 앞, Blender에서 -Y)는 모양을 유지하도록 단단하게, 긴 뒷머리는 부드럽게
        if chain[0].head_local.y < 0:
            add_spring(sb, f'Bangs {chain[0].name}', chain, group, stiffness=4.0, gravity=0.03, drag=0.7, hit_radius=0.008)
        else:
            add_spring(sb, f'Hair {chain[0].name}', chain, group, stiffness=0.9, gravity=0.15, drag=0.45, hit_radius=0.015)
    for chain in skirt:
        add_spring(sb, f'Skirt {chain[0].name}', chain, group, stiffness=1.4, gravity=0.08, drag=0.6, hit_radius=0.02)
    return len(hair), len(skirt), len(sb.colliders)
