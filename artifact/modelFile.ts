// 3D 모델 파일을 아티팩트로 올리고 다시 읽는 방법.
// 아티팩트는 .vrm(glb) 같은 바이너리 파일을 올려 주지 않아서, 모델을 base64 글자로 바꾼 .txt 파일로 올린다.
// 페이지는 그 글자를 받아 바이트로 되돌리고, 브라우저 안의 blob 주소로 만들어 3D 아바타에 넘긴다.

/** 페이지 옆에 함께 올리는 모델 파일 (vite.artifact.config.ts가 만든다) */
export const MODEL_FILE = 'models/malfoy-draconia.vrm.txt'

export function decodeModel(text: string): Uint8Array {
  const bin = atob(text.replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 모델 파일을 받아 blob 주소로 돌려준다 (다 쓰면 URL.revokeObjectURL) */
export async function fetchModel(url = MODEL_FILE, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`모델 파일을 받지 못했어요 (HTTP ${res.status})`)
  const bytes = decodeModel(await res.text())
  // glb는 "glTF"로 시작한다. 아니면 다른 파일(오류 페이지 등)을 받은 것이다
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'glTF')
    throw new Error('모델 파일이 올바르지 않아요')
  return URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'model/gltf-binary' }))
}
