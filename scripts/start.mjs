#!/usr/bin/env node
// 노트북에서 한 번에 실행하기: npm start
//   1. Ollama가 꺼져 있으면 켠다 (설치돼 있지 않으면 설치 방법을 알려 준다)
//   2. 모델이 하나도 없으면 기본 모델을 받는다
//   3. AI 음성(GPT-SoVITS)을 켠다. 설치돼 있지 않으면 지금 설치할지 한 번 묻는다(윈도우).
//      켜지는 동안은 Edge 음성으로 읽고, 준비되면 짧은 문장으로 데워 둔 뒤 카리나 목소리로 바뀐다.
//   4. 음성 입력(받아쓰기, faster-whisper)을 켠다. AI 음성 설치(GPT-SoVITS 통합 패키지)에 든 Python을 쓴다.
//      처음에는 음성 인식 모델(약 1.6GB)을 받는다. 없으면 앱은 브라우저 받아쓰기로 한다.
//   5. 의존성을 설치하고 개발 서버를 띄운 뒤 브라우저를 연다
// 환경 변수: OLLAMA_HOST (기본 127.0.0.1:11434), MALFOID_MODEL (기본 exaone3.5:7.8b),
//           GPT_SOVITS_DIR (GPT-SoVITS 폴더), GPT_SOVITS_URL (기본 http://127.0.0.1:9880),
//           MALFOID_VOICE=off (AI 음성을 켜지도 묻지도 않는다),
//           MALFOID_STT=off (음성 입력 서버를 켜지 않는다), MALFOID_STT_MODEL (기본 large-v3-turbo),
//           MALFOID_STT_DEVICE=cpu|cuda (기본: 그래픽카드 메모리가 10GB 이상이면 cuda), MALFOID_STT_URL (기본 http://127.0.0.1:9881)
import { copyFileSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { spawn, spawnSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXTRACTING_MARK, findGptSovits, hasV2Pro, installedAt, pythonOf } from './gpt-sovits/find.mjs'

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
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm'
/** AI 음성 설치를 거절했다는 표시 (다음부터 묻지 않는다, git에 올리지 않는다) */
const VOICE_DECLINED = join(ROOT, 'scripts', 'gpt-sovits', '.declined')

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

// 음성 입력(받아쓰기): AI 음성 설치의 Python으로 faster-whisper 서버를 켠다. 없으면 브라우저 받아쓰기로 한다.
await startStt()

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

/** 터미널에서 예/아니오를 묻는다 (그냥 Enter는 예) */
async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`\x1B[33m?\x1B[0m ${question} [Y/n] `)).trim().toLowerCase()
    return answer === '' || answer === 'y' || answer === 'yes' || answer === 'ㅇ' || answer === '네' || answer === '예'
  }
  finally {
    rl.close()
  }
}

/**
 * AI 음성이 없으면 지금 설치할지 묻는다 (윈도우, 터미널에서 직접 실행했을 때만).
 * @returns 설치를 마쳤는지
 */
async function offerVoiceInstall(partial) {
  if (!IS_WINDOWS) {
    say(`AI 음성(GPT-SoVITS)이 없어서 Edge 음성으로 읽어요. 자동 설치는 윈도우용이에요. 직접 설치했다면 GPT_SOVITS_DIR에 폴더를 알려 주세요`)
    return false
  }
  if (!process.stdin.isTTY || existsSync(VOICE_DECLINED)) {
    say(`AI 음성(GPT-SoVITS)이 없어서 Edge 음성으로 읽어요. 카리나 목소리를 쓰려면: ${NPM} run voice:install`)
    return false
  }
  const ok = await confirm(partial
    ? 'AI 음성(카리나 목소리) 설치가 덜 끝났어요. 지금 이어서 끝낼까요?'
    : 'AI 음성(카리나 목소리, GPT-SoVITS)을 지금 설치할까요? 처음 한 번만 약 8GB를 받아요(인터넷 속도에 따라 10~40분). 설치를 마치면 바로 이어서 앱이 켜져요.')
  if (!ok) {
    writeFileSync(VOICE_DECLINED, `${new Date().toISOString()}\n`)
    say(`Edge 음성으로 읽어요. 다음부터는 묻지 않아요. 나중에 설치하려면: ${NPM} run voice:install`)
    return false
  }
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gpt-sovits', 'install.mjs')], { cwd: ROOT, stdio: 'inherit' })
  if (r.status !== 0) {
    say(`AI 음성 설치를 끝내지 못해 이번에는 Edge 음성으로 읽어요. 다시 npm start 하면 이어서 설치할 수 있어요`)
    return false
  }
  return true
}

async function startGptSovits() {
  const url = (process.env.GPT_SOVITS_URL || 'http://127.0.0.1:9880').replace(/\/+$/, '')
  if (await gsvUp(url)) {
    say(`AI 음성(GPT-SoVITS) 연결됨 (${url})`)
    return
  }
  if (process.env.MALFOID_VOICE === 'off') {
    say('MALFOID_VOICE=off라서 AI 음성을 켜지 않고 Edge 음성으로 읽어요')
    return
  }
  let dir = findGptSovits()
  const envDir = process.env.GPT_SOVITS_DIR
  if (envDir && dir !== envDir && dir !== join(envDir, basename(envDir)))
    say(`GPT_SOVITS_DIR(${envDir})에서 GPT-SoVITS를 찾지 못했어요.${dir ? ` 대신 ${dir}를 써요.` : ''} 이 설정을 지우려면 PowerShell에서 [Environment]::SetEnvironmentVariable('GPT_SOVITS_DIR', $null, 'User') 후 새 창을 여세요`)
  if (!dir || !installedAt(dir)) {
    // 없거나, v2Pro 모델이 없거나, 압축을 풀다 멈춘 설치: 지금 설치(이어서 설치)할지 묻는다
    if (!(await offerVoiceInstall(!!dir && existsSync(join(dir, EXTRACTING_MARK)))))
      return
    dir = findGptSovits()
    if (!dir || !installedAt(dir)) {
      say('설치한 AI 음성을 찾지 못해 Edge 음성으로 읽어요')
      return
    }
  }
  if (!hasV2Pro(dir)) {
    say(`${dir}에 v2Pro 모델이 없어서 Edge 음성으로 읽어요. v2pro 패키지 설치: ${NPM} run voice:install`)
    return
  }
  const python = pythonOf(dir)
  if (!python) {
    say(`${dir}에서 Python을 찾지 못해 Edge 음성으로 읽어요. 다시 설치: ${NPM} run voice:install`)
    return
  }
  // 우리 설정 파일을 GPT-SoVITS 폴더에 복사하고, NVIDIA GPU가 없으면 CPU 설정으로 바꾼다
  const hasNvidia = spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore', shell: IS_WINDOWS }).status === 0
  const logFile = join(dir, 'karina-api.log')
  let out
  try {
    const config = join(dir, 'GPT_SoVITS', 'configs', 'tts_infer_karina.yaml')
    copyFileSync(join(ROOT, 'scripts', 'gpt-sovits', 'karina.yaml'), config)
    if (!hasNvidia)
      writeFileSync(config, readFileSync(config, 'utf8').replace('device: cuda', 'device: cpu').replace('is_half: true', 'is_half: false'))
    // 서버 출력은 karina-api.log에 남긴다 (켜지지 않을 때 원인 확인용)
    out = openSync(logFile, 'w')
  }
  catch (e) {
    say(`AI 음성 서버를 준비하지 못해 Edge 음성으로 읽어요: ${e.message}`)
    return
  }
  say(`AI 음성(GPT-SoVITS)을 켜는 중… (${dir}, ${hasNvidia ? 'NVIDIA GPU' : 'CPU'}) 켜지는 동안(처음에는 1~3분, 다음부터는 30초쯤)은 Edge 음성으로 읽다가, 준비되면 카리나 목소리로 바뀌어요`)
  const port = new URL(url).port || '9880'
  // -X utf8: 콘솔 없이 켜면 Python 출력이 cp949가 되어, 대사에 "—" 같은 글자가 있으면 합성이 실패한다
  const server = spawn(python, ['-X', 'utf8', 'api_v2.py', '-a', '127.0.0.1', '-p', port, '-c', 'GPT_SoVITS/configs/tts_infer_karina.yaml'], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  })
  server.on('error', e => say(`AI 음성 서버를 켜지 못해 Edge 음성으로 읽어요: ${e.message}`))
  server.unref()
  // 앱을 띄우는 것은 기다리지 않는다: 켜지는 동안 따로 지켜보다가 준비되면 알린다
  void watchVoice(url, server, logFile)
}

/** 서버가 켜질 때까지 지켜보고, 켜지면 짧은 문장으로 한 번 데워서 첫 대답부터 빨리 나오게 한다 */
async function watchVoice(url, server, logFile) {
  const started = Date.now()
  let exitCode = null
  server.on('exit', (code) => { exitCode = code ?? -1 })
  while (Date.now() - started < 8 * 60_000) {
    if (await gsvUp(url)) {
      const warmed = await warmUp(url)
      const secs = Math.round((Date.now() - started) / 1000)
      say(`\x1B[1mAI 음성 준비 완료\x1B[0m (${secs}초${warmed ? ', 첫 문장까지 데워 둠' : ''}). 이제 카리나 목소리로 읽어요`)
      return
    }
    if (exitCode !== null) {
      say(`AI 음성 서버가 꺼졌어요 (종료 코드 ${exitCode}). Edge 음성으로 계속 읽어요. 로그 끝부분 (${logFile}):`)
      console.log(logTail(logFile))
      return
    }
    await sleep(2000)
  }
  say(`AI 음성 서버가 8분이 지나도 켜지지 않아 Edge 음성으로 읽어요. 원인은 ${logFile}에서 볼 수 있어요`)
}

function sttOrigin(value) {
  const url = new URL(/^https?:\/\//.test(value || '') ? value : `http://${value || '127.0.0.1:9881'}`)
  if (url.hostname === '0.0.0.0')
    url.hostname = '127.0.0.1'
  return url.origin
}

async function sttHealth(url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) })
    return r.ok ? await r.json() : null
  }
  catch {
    return null
  }
}

/**
 * 음성 인식을 어디서 돌릴지. 그래픽카드 메모리가 넉넉할 때(10GB 이상)만 그래픽카드를 쓴다:
 * 그보다 작으면 대화 모델과 AI 음성이 그 자리를 더 필요로 하고, 음성 인식은 CPU에서도 한 문장에 몇 초면 된다.
 */
function sttDevice() {
  const env = process.env.MALFOID_STT_DEVICE
  if (env === 'cpu' || env === 'cuda')
    return env
  const r = spawnSync('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', shell: IS_WINDOWS })
  const mib = r.status === 0 ? Math.max(0, ...String(r.stdout).split(/\r?\n/).map(Number).filter(Number.isFinite)) : 0
  return mib >= 10_000 ? 'cuda' : 'cpu'
}

async function startStt() {
  const url = sttOrigin(process.env.MALFOID_STT_URL)
  const health = await sttHealth(url)
  if (health?.ready) {
    say(`음성 입력(받아쓰기) 연결됨 (${url})`)
    return
  }
  if (health) {
    say('음성 입력 서버가 켜지는 중이에요. 준비될 때까지는 브라우저 받아쓰기로 해요')
    void watchStt(url, null, null)
    return
  }
  if (process.env.MALFOID_STT === 'off') {
    say('MALFOID_STT=off라서 음성 입력은 브라우저 받아쓰기(크롬·엣지)로 해요')
    return
  }
  const dir = findGptSovits()
  const python = dir && installedAt(dir) ? pythonOf(dir) : null
  if (!python) {
    say('음성 입력: 로컬 음성 인식은 AI 음성(GPT-SoVITS)과 함께 설치돼요. 지금은 브라우저 받아쓰기(크롬·엣지, 인터넷 필요)로 해요')
    return
  }
  if (spawnSync(python, ['-c', 'import faster_whisper'], { stdio: 'ignore', windowsHide: true }).status !== 0) {
    say(`음성 입력: ${dir}의 Python에 faster-whisper가 없어서 브라우저 받아쓰기로 해요`)
    return
  }
  const device = sttDevice()
  const model = process.env.MALFOID_STT_MODEL || 'large-v3-turbo'
  // GPT-SoVITS 화면(WebUI)의 받아쓰기와 같은 곳에 모델을 둔다 (이미 받아 두었으면 다시 받지 않는다)
  const modelsDir = join(dir, 'tools', 'asr', 'models')
  const firstTime = !existsSync(model) && !existsSync(join(modelsDir, `faster-whisper-${model}`, 'model.bin'))
  const logFile = join(dir, 'karina-stt.log')
  let out
  try {
    out = openSync(logFile, 'w')
  }
  catch (e) {
    say(`음성 입력 서버를 준비하지 못해 브라우저 받아쓰기로 해요: ${e.message}`)
    return
  }
  say(`음성 입력(받아쓰기)을 켜는 중… (${device === 'cuda' ? 'NVIDIA GPU' : 'CPU'}, ${model})${firstTime ? ' 처음 한 번 음성 인식 모델(약 1.6GB)을 받아요. 그동안은 브라우저 받아쓰기로 해요' : ''}`)
  const port = new URL(url).port || '9881'
  const server = spawn(python, ['-X', 'utf8', join(ROOT, 'scripts', 'stt', 'stt_server.py'), '--port', port, '--model', model, '--models-dir', modelsDir, '--device', device], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  })
  server.on('error', e => say(`음성 입력 서버를 켜지 못해 브라우저 받아쓰기로 해요: ${e.message}`))
  server.unref()
  void watchStt(url, server, logFile)
}

/** 음성 입력 서버가 모델을 다 올릴 때까지 지켜본다 (처음에는 모델을 받느라 오래 걸린다) */
async function watchStt(url, server, logFile) {
  const started = Date.now()
  let exitCode = null
  server?.on('exit', (code) => { exitCode = code ?? -1 })
  while (Date.now() - started < 20 * 60_000) {
    const health = await sttHealth(url)
    if (health?.ready) {
      const secs = Math.round((Date.now() - started) / 1000)
      say(`\x1B[1m음성 입력 준비 완료\x1B[0m (${secs}초, ${health.device === 'cuda' ? 'GPU' : 'CPU'}). 🎤 버튼을 누르고 말해 보세요`)
      return
    }
    if (exitCode !== null) {
      say(`음성 입력 서버가 꺼졌어요 (종료 코드 ${exitCode}). 브라우저 받아쓰기로 해요.${logFile ? ` 로그 끝부분 (${logFile}):` : ''}`)
      if (logFile)
        console.log(logTail(logFile))
      return
    }
    await sleep(2000)
  }
  say(`음성 입력 서버가 20분이 지나도 준비되지 않아 브라우저 받아쓰기로 해요${logFile ? `. 원인은 ${logFile}에서 볼 수 있어요` : ''}`)
}

function logTail(file, lines = 15) {
  try {
    return readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).slice(-lines).map(l => `    ${l}`).join('\n')
  }
  catch {
    return '    (로그를 읽지 못했어요)'
  }
}

/** 보이스 팩의 기본 참고 음성으로 짧은 문장을 한 번 읽혀서 모델을 데운다 */
async function warmUp(url) {
  try {
    const pack = JSON.parse(readFileSync(join(ROOT, 'voices', 'karina', 'voice.json'), 'utf8'))
    const ref = pack.refs.neutral
    const r = await fetch(`${url}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        text: '흥, 준비는 끝났어.',
        text_lang: 'ko',
        ref_audio_path: join(ROOT, 'voices', 'karina', ref.file),
        prompt_text: ref.text,
        prompt_lang: pack.lang,
        text_split_method: 'cut0',
        media_type: 'wav',
      }),
    })
    return r.ok
  }
  catch {
    return false
  }
}
