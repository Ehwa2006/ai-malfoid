#!/usr/bin/env node
// 노트북에서 한 번에 실행하기: npm start
//   1. Ollama가 꺼져 있으면 켠다 (설치돼 있지 않으면 설치 방법을 알려 준다)
//   2. 모델이 하나도 없으면 기본 모델을 받는다
//   3. 의존성을 설치하고 개발 서버를 띄운 뒤 브라우저를 연다
// 환경 변수: OLLAMA_HOST (기본 127.0.0.1:11434), MALFOID_MODEL (기본 exaone3.5:7.8b)
import { existsSync, statSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
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
