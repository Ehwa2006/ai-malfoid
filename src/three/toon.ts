import { Color, DataTexture, MeshToonMaterial, NearestFilter, RedFormat, type MeshToonMaterialParameters } from 'three'

const gradients = new Map<string, DataTexture>()

/** 애니풍 셀 셰이딩용 계단 그라디언트. 피부는 그림자를 옅게 잡는다. */
function gradientMap(steps: number[]): DataTexture {
  const key = steps.join(',')
  let texture = gradients.get(key)
  if (!texture) {
    texture = new DataTexture(new Uint8Array(steps), steps.length, 1, RedFormat)
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    texture.needsUpdate = true
    gradients.set(key, texture)
  }
  return texture
}

export const SOFT_SHADE = [228, 255]
export const CLOTH_SHADE = [110, 190, 255]

export function toon(
  color: string,
  params: MeshToonMaterialParameters = {},
  outline = true,
  steps: number[] = CLOTH_SHADE,
): MeshToonMaterial {
  const material = new MeshToonMaterial({ color: new Color(color), gradientMap: gradientMap(steps), ...params })
  material.userData.outlineParameters = outline
    ? { thickness: 0.004, color: [0.16, 0.12, 0.1] }
    : { visible: false }
  return material
}
