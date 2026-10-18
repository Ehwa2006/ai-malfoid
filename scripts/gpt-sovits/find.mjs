// GPT-SoVITS 설치 폴더 찾기 (npm start와 설치 스크립트가 같이 쓴다)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const IS_WINDOWS = process.platform === 'win32'
/** 설치 스크립트가 기본 위치가 아닌 곳(--dir)에 설치했을 때 그 경로를 적어 두는 파일 (git에 올리지 않는다) */
export const INSTALL_DIR_FILE = join(dirname(fileURLToPath(import.meta.url)), '.install-dir')
/** 설치 스크립트가 압축을 끝까지 풀었을 때 설치 폴더에 남기는 표시 */
export const INSTALLED_MARK = '.malfoid-installed'

/** 설치 폴더를 찾아보는 곳: 홈, 다운로드, 바탕화면, C:\ */
export function searchRoots() {
  return [homedir(), join(homedir(), 'Downloads'), join(homedir(), 'Desktop'), IS_WINDOWS ? 'C:\\' : '/opt']
}

/** 카리나 설정(v2Pro)에 필요한 모델이 있는지 */
export function hasV2Pro(dir) {
  return existsSync(join(dir, 'GPT_SoVITS', 'pretrained_models', 'v2Pro', 's2Gv2Pro.pth'))
}

/** 통합 패키지의 Python 실행 파일 */
export function pythonOf(dir) {
  return [join(dir, 'runtime', 'python.exe'), join(dir, '.venv', 'Scripts', 'python.exe'), join(dir, 'runtime', 'bin', 'python'), join(dir, '.venv', 'bin', 'python')]
    .find(p => existsSync(p)) ?? null
}

/** 바로 켤 수 있는 설치인지 (서버 코드, Python, v2Pro 모델) */
export function installedAt(dir) {
  return existsSync(join(dir, 'api_v2.py')) && pythonOf(dir) !== null && hasV2Pro(dir)
}

/**
 * GPT-SoVITS 설치 폴더: GPT_SOVITS_DIR, 설치 스크립트가 적어 둔 경로, 찾아보는 곳의 "GPT-SoVITS"로 시작하는 폴더 순.
 * 여러 개면 바로 켤 수 있는 것, 그다음 v2Pro 모델이 있는 것을 먼저 고른다.
 */
export function findGptSovits() {
  if (process.env.GPT_SOVITS_DIR)
    return existsSync(join(process.env.GPT_SOVITS_DIR, 'api_v2.py')) ? process.env.GPT_SOVITS_DIR : null
  const found = []
  try {
    const saved = readFileSync(INSTALL_DIR_FILE, 'utf8').trim()
    if (saved && existsSync(join(saved, 'api_v2.py')))
      found.push(saved)
  }
  catch {}
  for (const root of searchRoots()) {
    let names = []
    try {
      names = readdirSync(root)
    }
    catch {
      continue
    }
    for (const name of names.filter(n => /^gpt-?sovits/i.test(n)).sort().reverse()) {
      // 압축을 풀면 한 단계 안쪽에 실제 폴더가 있는 경우가 많다
      for (const dir of [join(root, name), join(root, name, name)]) {
        if (existsSync(join(dir, 'api_v2.py')))
          found.push(dir)
      }
    }
  }
  return found.find(installedAt) ?? found.find(hasV2Pro) ?? found[0] ?? null
}
