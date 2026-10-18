import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three'

export interface TubeOptions {
  /** 단면의 가로 반지름 (t: 0 → 1) */
  width: (t: number) => number
  /** 단면의 두께 반지름 (t: 0 → 1) */
  thickness: (t: number) => number
  /** 단면의 두께 방향(바깥쪽). 지정하지 않으면 곡선의 프레네 프레임을 쓴다. */
  outward?: (point: Vector3) => Vector3
  segments?: number
  radial?: number
}

/**
 * 굵기가 변하는 납작한 튜브. 머리카락 가닥과 팔에 쓴다.
 * 머리카락은 outward를 머리 중심 바깥 방향으로 줘서 두피에 붙어 펼쳐지게 한다.
 */
export function taperedTube(points: Vector3[], opts: TubeOptions): BufferGeometry {
  const curve = new CatmullRomCurve3(points, false, 'centripetal')
  const segments = opts.segments ?? 24
  const radial = opts.radial ?? 8
  const frames = opts.outward ? null : curve.computeFrenetFrames(segments, false)

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const normal = new Vector3()
  const binormal = new Vector3()

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t)

    if (opts.outward) {
      const out = opts.outward(p)
      binormal.crossVectors(tangent, out).normalize()
      normal.crossVectors(binormal, tangent).normalize()
    }
    else {
      normal.copy(frames!.normals[i])
      binormal.copy(frames!.binormals[i])
    }

    const w = opts.width(t)
    const h = opts.thickness(t)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const x = Math.cos(a) * w
      const y = Math.sin(a) * h
      positions.push(
        p.x + binormal.x * x + normal.x * y,
        p.y + binormal.y * x + normal.y * y,
        p.z + binormal.z * x + normal.z * y,
      )
      uvs.push(j / radial, t)
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
