#!/usr/bin/env node
// 노트북에서 한 번에 실행하기: npm start
//   1. Ollama가 꺼져 있으면 켠다 (설치돼 있지 않으면 설치 방법을 알려 준다)
//   2. 모델이 하나도 없으면 기본 모델을 받는다
//   3. AI 음성(GPT-SoVITS)이 설치돼 있으면 켠다 (없으면 Edge 음성으로 읽는다)
//   4. 의존성을 설치하고 개발 서버를 띄운 뒤 브라우저를 연다
// 환경 변수: OLLAMA_HOST (기본 127.0.0.1:11434), MALFOID_MODEL (기본 exaone3.5:7.8b),
//           GPT_SOVITS_DIR (GPT-SoVITS 폴더), GPT_SOVITS_URL (기본 http://127.0.0.1:9880)
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IS_WINDOWS = process.platform === 'win32'
const MODEL = process.env.MALFOID_MODEL || 'exaone3.5:7.8b'
const OLLAMA = ollamaOrigin(process.env.OLLAMA_HOST)

/** OLLAMA_HOST 값("0.0.0.0", "127.0.0.1:11434", "http://host:port")을 접속 주소로 바꾼다 */
function ollamaOrigin(value) {
  const url = new URL(/^https?:\/\//.test(value || '') ? value : `http://${value || '127.0.0.1:11434'}`)
  if (!url.port)
    url.port = '11434'
  if (url.hostname === '0.0.0.0')
    url.hostname = '127.0.0.1' // 서버를 모든 주소에 열어 둔 설정이어도 접속은 로컬로
  return url.origin
}

const say = msg => console.log(`\x1B[32m▸\x1B[0m ${msg}`)
const fail = (msg) => {
  console.error(`\x1B[31m✖\x1B[0m ${msg}`)
  process.exit(1)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: IS_WINDOWS })
  if (r.status !== 0)
    fail(`${cmd} ${args.join(' ')} 실패 (종료 코드 ${r.status})`)
}

async function ollamaUp() {
  try {
    return (await fetch(`${OLLAMA}/api/version`)).ok
  }
  catch {
    return false
  }
}

async function installedModels() {
  const res = await fetch(`${OLLAMA}/api/tags`)
  const data = await res.json()
  return (data.models ?? []).map(m => m.name)
}

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 19))
  fail(`Node.js 20.19 이상이 필요해요 (지금 ${process.versions.node}). https://nodejs.org 에서 받아 주세요.`)

if (!(await ollamaUp())) {
  const hasCli = spawnSync('ollama', ['--version'], { stdio: 'ignore', shell: IS_WINDOWS }).status === 0
  if (!hasCli) {
    fail([
      'Ollama가 설치돼 있지 않아요. 설치한 뒤 다시 npm start 해 주세요.',
      '  macOS / Windows: https://ollama.com/download 에서 앱 설치',
      '  Linux: curl -fsSL https://ollama.com/install.sh | sh',
    ].join('\n'))
  }
  say('Ollama를 켜는 중…')
  spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', shell: IS_WINDOWS }).unref()
  for (let i = 0; i < 30 && !(await ollamaUp()); i++)
    await sleep(500)
  if (!(await ollamaUp()))
    fail(`Ollama(${OLLAMA})에 연결하지 못했어요. 터미널에서 "ollama serve"를 직접 실행해 보세요.`)
}
say(`Ollama 연결됨 (${OLLAMA})`)

const models = await installedModels()
if (!models.length) {
  say(`설치된 모델이 없어서 ${MODEL}을(를) 받아요. 처음 한 번만 받고, 4~5GB라 몇 분 걸려요.`)
  run('ollama', ['pull', MODEL])
}
else if (!models.includes(MODEL)) {
  say(`${MODEL}이(가) 없어서 설치된 모델(${models.join(', ')}) 중 하나를 써요.`)
  say(`가장 자연스러운 대화를 원하면: ollama pull ${MODEL}`)
}
else {
  say(`모델 준비됨: ${MODEL}`)
}

// AI 음성 (GPT-SoVITS): 켜져 있지 않으면 설치 폴더를 찾아 켠다. 없으면 Edge 음성으로 대신 읽는다.
await startGptSovits()

// 처음이거나, git pull로 package-lock.json이 바뀌었으면(새 패키지 추가 등) 다시 설치한다
const installed = join(ROOT, 'node_modules', '.package-lock.json')
if (!existsSync(installed) || statSync(join(ROOT, 'package-lock.json')).mtimeMs > statSync(installed).mtimeMs) {
  say('패키지 설치 중 (npm install)…')
  run('npm', ['install'])
}

say('앱을 띄워요. 브라우저가 열리지 않으면 아래 "Local:" 주소를 열어 주세요. 끝내려면 Ctrl+C')
const vite = spawn('npx', ['vite', '--open'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: IS_WINDOWS,
  env: { ...process.env, OLLAMA_HOST: OLLAMA },
})
vite.on('exit', code => process.exit(code ?? 0))

async function gsvUp(url) {
  try {
    const r = await fetch(`${url}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(1500) })
    return r.status === 400 || r.ok
  }
  catch {
    return false
  }
}

/** GPT-SoVITS 설치 폴더: GPT_SOVITS_DIR, 아니면 홈·다운로드·바탕화면·C:\ 에서 "GPT-SoVITS"로 시작하는 폴더 */
function findGptSovits() {
  if (process.env.GPT_SOVITS_DIR)
    return existsSync(join(process.env.GPT_SOVITS_DIR, 'api_v2.py')) ? process.env.GPT_SOVITS_DIR : null
  const roots = [homedir(), join(homedir(), 'Downloads'), join(homedir(), 'Desktop'), IS_WINDOWS ? 'C:\\' : '/opt']
  for (const root of roots) {
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
          return dir
      }
    }
  }
  return null
}

async function startGptSovits() {
  const url = (process.env.GPT_SOVITS_URL || 'http://127.0.0.1:9880').replace(/\/+$/, '')
  if (await gsvUp(url)) {
    say(`AI 음성(GPT-SoVITS) 연결됨 (${url})`)
    return
  }
  const dir = findGptSovits()
  if (!dir) {
    say('AI 음성(GPT-SoVITS)이 없어서 Edge 음성으로 읽어요. 설치 방법은 README의 "AI 음성" 참고')
    return
  }
  if (!existsSync(join(dir, 'GPT_SoVITS', 'pretrained_models', 'v2Pro', 's2Gv2Pro.pth'))) {
    say(`${dir}에 v2Pro 모델이 없어서 Edge 음성으로 읽어요. README의 "AI 음성"에 있는 v2pro 패키지를 받아 주세요`)
    return
  }
  // 우리 설정 파일을 GPT-SoVITS 폴더에 복사하고, NVIDIA GPU가 없으면 CPU 설정으로 바꾼다
  const config = join(dir, 'GPT_SoVITS', 'configs', 'tts_infer_karina.yaml')
  copyFileSync(join(ROOT, 'scripts', 'gpt-sovits', 'karina.yaml'), config)
  const hasNvidia = spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore', shell: IS_WINDOWS }).status === 0
  if (!hasNvidia)
    writeFileSync(config, readFileSync(config, 'utf8').replace('device: cuda', 'device: cpu').replace('is_half: true', 'is_half: false'))
  const python = [join(dir, 'runtime', 'python.exe'), join(dir, 'runtime', 'bin', 'python'), join(dir, '.venv', 'bin', 'python')]
    .find(p => existsSync(p)) ?? 'python'
  say(`AI 음성(GPT-SoVITS)을 켜는 중… (${dir}, ${hasNvidia ? 'NVIDIA GPU' : 'CPU'}) 모델을 올리는 30초쯤은 Edge 음성으로 읽어요`)
  const port = new URL(url).port || '9880'
  spawn(python, ['api_v2.py', '-a', '127.0.0.1', '-p', port, '-c', 'GPT_SoVITS/configs/tts_infer_karina.yaml'], {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
}
