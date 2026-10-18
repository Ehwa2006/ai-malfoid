#!/usr/bin/env node
// AI 음성(GPT-SoVITS) 설치 (Windows): npm run voice:install
//   1. 그래픽카드에 맞는 GPT-SoVITS 윈도우 통합 패키지(v2pro, 약 8.2GB)를 받는다. 끊기면 다시 실행해서 이어 받는다.
//   2. 받은 파일이 온전한지 SHA-256으로 확인한다.
//   3. 홈 폴더에 압축을 푼다(7-Zip, 없으면 윈도우 내장 tar). 다 풀리면 압축 파일은 지운다.
// 그 뒤 npm start가 이 폴더를 찾아 AI 음성 서버를 켠다.
//
// 옵션 (npm run에 넘길 때는 앞에 -- 를 붙인다: npm run voice:install -- --dir D:\AI)
//   --dir <폴더>                 설치할 곳 (기본: 홈 폴더, 경로에 한글이 있으면 C:\)
//   --package standard|nvidia50  패키지를 직접 고른다 (기본: RTX 50 시리즈면 nvidia50)
//   --keep                       다 푼 뒤에도 압축 파일을 남긴다
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, parse, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { EXTRACTING_MARK, filesPresent, findGptSovits, INSTALL_DIR_FILE, INSTALLED_MARK, installedAt, searchRoots } from './find.mjs'

const IS_WINDOWS = process.platform === 'win32'
/**
 * 같은 이름의 파일이 저장소에서 여러 번 바뀌어 올라왔으므로, 해시를 확인한 커밋에 고정한다.
 * 파일 크기·해시는 이 커밋의 Hugging Face 정보, 압축을 푼 크기·가장 긴 경로(자)는 7z 목록에서 확인한 값.
 */
const REPO = 'https://huggingface.co/lj1995/GPT-SoVITS-windows-package/resolve/fb387b7a65a5441e5e3985f4ab9b721a9d455363'
export const PACKAGES = {
  standard: {
    file: 'GPT-SoVITS-v2pro-20250604.7z',
    folder: 'GPT-SoVITS-v2pro-20250604',
    size: 8_185_086_602,
    sha256: 'bd60d0796553ff05d8568136e199c13e0dc22ebe2ed24273134e34ed6f215cd6',
    unpacked: 14_130_000_000,
    longest: 186,
  },
  nvidia50: {
    file: 'GPT-SoVITS-v2pro-20250604-nvidia50.7z',
    folder: 'GPT-SoVITS-v2pro-20250604-nvidia50',
    size: 8_835_144_925,
    sha256: '97b4edcd451c42357db7e26e6c1c877ca5d85144fe97beaff6d7005d35bee008',
    unpacked: 14_960_000_000,
    longest: 195,
  },
}
const CMD = IS_WINDOWS ? 'npm.cmd run voice:install' : 'npm run voice:install'
const STALL_MS = 60_000
const MAX_RETRIES = 30

const say = msg => console.log(`\x1B[32m▸\x1B[0m ${msg}`)
const fail = (msg) => {
  console.error(`\x1B[31m✖\x1B[0m ${msg}`)
  process.exit(1)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const gb = n => `${(n / 1e9).toFixed(2)}GB`
/** fetch가 내는 짧은 오류("terminated", "fetch failed")를 알아듣게 */
const reason = e => e.message === 'terminated' || e.message === 'fetch failed'
  ? `연결이 끊겼어요${e.cause?.code ? `: ${e.cause.code}` : ''}`
  : e.message
/** 다시 해 봐야 소용없는 오류 (디스크 부족, 서버 파일이 바뀜) */
const fatal = (message, code) => Object.assign(new Error(message), { fatal: true, code })

/**
 * 옵션을 읽는다. `npm run voice:install --dir D:\AI`처럼 -- 없이 쓰면 npm이 옵션을 가로채서
 * npm_config_* 환경 변수로 바꾸고 값만 넘기므로, 그 경우도 알아듣는다.
 */
export function parseArgs(argv, env = process.env) {
  const args = { dir: null, package: null, keep: env.npm_config_keep === 'true' }
  if (Object.hasOwn(PACKAGES, env.npm_config_package ?? ''))
    args.package = env.npm_config_package
  if (env.npm_config_dir && env.npm_config_dir !== 'true') // --dir=D:\AI 꼴
    args.dir = env.npm_config_dir
  // --dir=D:\AI 꼴도 받는다
  argv = argv.flatMap(a => /^--(dir|package)=/.test(a) ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a])
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir')
      args.dir = argv[++i]
    else if (argv[i] === '--package')
      args.package = argv[++i]
    else if (argv[i] === '--keep')
      args.keep = true
    else if (env.npm_config_dir === 'true' && !args.dir && !argv[i].startsWith('-'))
      args.dir = argv[i]
    else
      fail(`모르는 옵션: ${argv[i]} (예: ${CMD} -- --dir D:\\AI · --package standard|nvidia50 · --keep)`)
  }
  if (args.dir === undefined || args.dir === '')
    fail(`--dir 뒤에 폴더를 적어 주세요 (예: ${CMD} -- --dir D:\\AI)`)
  if (args.package && !Object.hasOwn(PACKAGES, args.package))
    fail(`--package는 standard 또는 nvidia50이에요 (지금: ${args.package})`)
  return args
}

/** RTX 50 시리즈(Blackwell)는 CUDA 12.8이 필요해서 전용 패키지를 쓴다 */
export function pickPackage(gpuNames) {
  return gpuNames.some(n => /RTX\s*50\d\d|Blackwell/i.test(n)) ? 'nvidia50' : 'standard'
}

function gpuNames() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : []
}

/** 한글 등이 들어간 경로에서는 GPT-SoVITS가 한국어·일본어 발음 분석에 실패한다 */
const asciiPath = p => /^[\x20-\x7E]+$/.test(p)

function freeBytes(dir) {
  try {
    const s = statfsSync(dir)
    return s.bavail * s.bsize
  }
  catch {
    return Infinity // 알 수 없으면 막지 않는다
  }
}

/** 폴더 안 파일 크기의 합 (압축을 풀다 멈춘 폴더가 이미 차지한 공간) */
function dirSize(dir) {
  let total = 0
  const stack = [dir]
  try {
    while (stack.length) {
      const d = stack.pop()
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory())
          stack.push(join(d, e.name))
        else if (e.isFile())
          total += statSync(join(d, e.name)).size
      }
    }
  }
  catch {}
  return total
}

function fmtTime(sec) {
  if (!Number.isFinite(sec))
    return '?'
  const m = Math.floor(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : m ? `${m}분 ${Math.round(sec % 60)}초` : `${Math.round(sec)}초`
}

function progressPrinter(label, total) {
  const tty = process.stdout.isTTY
  const started = Date.now()
  let startBytes = null
  let lastPrint = 0
  let lastPct = -10
  let lineOpen = false
  return {
    update(done) {
      startBytes ??= done
      const now = Date.now()
      if (now - lastPrint < 1000 && done < total)
        return
      lastPrint = now
      const pct = Math.floor((done / total) * 100)
      const speed = (done - startBytes) / Math.max(0.001, (now - started) / 1000)
      const line = `  ${label} ${gb(done)} / ${gb(total)} (${pct}%) · ${(speed / 1e6).toFixed(1)}MB/s · 남은 시간 ${fmtTime((total - done) / speed)}`
      if (tty) {
        // 한글은 두 칸을 차지하므로 공백으로 채우지 않고 줄 끝까지 지운다 (좁은 창에서 줄이 넘치지 않게)
        process.stdout.write(`\r${line}\x1B[K`)
        lineOpen = true
      }
      else if (pct >= lastPct + 10 || done >= total) {
        console.log(line)
        lastPct = pct
      }
    },
    /** 진행 표시 줄을 끝낸다 (여러 번 불러도 된다) */
    end() {
      if (lineOpen)
        process.stdout.write('\n')
      lineOpen = false
    },
  }
}

/** 서버가 알려 준 파일 전체 크기 (206은 Content-Range의 /전체, 200은 Content-Length) */
function reportedTotal(res) {
  const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
  if (res.status === 206)
    return range ? Number(range[1]) : null
  const length = res.headers.get('content-length')
  return length === null ? null : Number(length)
}

/**
 * url을 part 파일로 받는다. 이미 받은 만큼은 건너뛰고(Range) 이어 받는다.
 * 데이터가 stallMs 동안 안 들어오면 끊고 다시 잇는다.
 */
export async function download(url, part, total, { stallMs = STALL_MS, maxRetries = MAX_RETRIES, retryDelay = s => Math.min(30, 2 ** s) * 1000 } = {}) {
  let failures = 0
  const progress = progressPrinter('받는 중', total)
  try {
    while (true) {
      const have = existsSync(part) ? statSync(part).size : 0
      if (have === total)
        return
      if (have > total)
        rmSync(part) // 다른 파일이 섞였다. 처음부터 받는다
      const from = have > total ? 0 : have
      const abort = new AbortController()
      let timer
      const kick = () => {
        clearTimeout(timer)
        timer = setTimeout(() => abort.abort(new Error(`${stallMs / 1000}초 동안 받은 데이터가 없어요`)), stallMs)
      }
      try {
        kick()
        const res = await fetch(url, { headers: from ? { Range: `bytes=${from}-` } : {}, signal: abort.signal })
        if (!res.ok)
          throw new Error(`서버 응답 ${res.status}`)
        const remote = reportedTotal(res)
        if (remote !== null && remote !== total)
          throw fatal(`서버의 파일 크기(${remote})가 예상(${total})과 달라요. git pull로 앱을 업데이트한 뒤 다시 실행해 주세요`)
        // 서버가 이어 받기를 무시하고 처음부터 보내면(200) 파일을 새로 쓴다
        const append = from > 0 && res.status === 206
        if (append && Number(/^bytes (\d+)-/.exec(res.headers.get('content-range') ?? '')?.[1]) !== from)
          throw new Error(`서버가 엉뚱한 위치부터 보냈어요 (${res.headers.get('content-range')})`)
        let done = append ? from : 0
        const counter = new Transform({
          transform(chunk, _enc, cb) {
            kick()
            done += chunk.length
            if (done > total)
              return cb(fatal(`서버가 예상(${total})보다 큰 파일을 보냈어요. git pull로 앱을 업데이트한 뒤 다시 실행해 주세요`))
            progress.update(done)
            cb(null, chunk)
          },
        })
        await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(part, { flags: append ? 'a' : 'w' }))
        clearTimeout(timer)
        if (statSync(part).size !== total)
          throw new Error(`받은 크기(${statSync(part).size})가 예상(${total})과 달라요`)
        return
      }
      catch (e) {
        clearTimeout(timer)
        const err = abort.signal.aborted && abort.signal.reason instanceof Error ? abort.signal.reason : e
        if (err.code === 'ENOSPC')
          throw fatal('디스크 공간이 부족해요', 'ENOSPC')
        if (err.fatal)
          throw err
        const now = existsSync(part) ? statSync(part).size : 0
        failures = now > from ? 1 : failures + 1 // 조금이라도 더 받았으면 실패 횟수를 다시 센다
        if (failures > maxRetries)
          throw new Error(`계속 받지 못했어요 (${reason(err)})`)
        const wait = retryDelay(failures)
        progress.end()
        say(`받기가 끊겼어요 (${reason(err)}). ${wait / 1000}초 뒤 이어 받아요…`)
        await sleep(wait)
      }
    }
  }
  finally {
    progress.end()
  }
}

export async function sha256File(file) {
  const total = statSync(file).size
  const progress = progressPrinter('확인 중', total)
  const hash = createHash('sha256')
  let done = 0
  for await (const chunk of createReadStream(file, { highWaterMark: 4 << 20 })) {
    hash.update(chunk)
    done += chunk.length
    progress.update(done)
  }
  progress.end()
  return hash.digest('hex')
}

/** 압축 풀 도구: 7-Zip → liblzma가 들어간 윈도우 내장 tar(윈도우 11) */
export function findExtractor() {
  const sevenZips = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, '7-Zip', '7z.exe'),
    process.env.ProgramW6432 && join(process.env.ProgramW6432, '7-Zip', '7z.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe'),
  ].filter(Boolean)
  const found = sevenZips.find(p => existsSync(p))
  if (found)
    return { kind: '7z', exe: found }
  for (const exe of ['7z', '7zz', '7za']) {
    if (spawnSync(exe, ['i'], { stdio: 'ignore' }).status === 0)
      return { kind: '7z', exe }
  }
  const tar = IS_WINDOWS ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const version = spawnSync(tar, ['--version'], { encoding: 'utf8' })
  // 윈도우 10의 tar는 7z의 LZMA 압축을 풀지 못한다 (버전 문자열에 liblzma가 없다)
  if (version.status === 0 && /libarchive/.test(version.stdout) && /liblzma/.test(version.stdout))
    return { kind: 'tar', exe: tar }
  return null
}

function installSevenZip() {
  say('압축을 풀 도구가 없어서 7-Zip을 설치해요 (winget)…')
  const r = spawnSync('winget', ['install', '--id', '7zip.7zip', '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements'], { stdio: 'inherit' })
  return r.status === 0 ? findExtractor() : null
}

export function extract(extractor, archive, dest) {
  // 7-Zip 진행률은 터미널에서만 (화면이 아니면 지우지 못한 진행률이 다음 줄에 섞인다)
  const args = extractor.kind === '7z'
    ? ['x', archive, `-o${dest}`, '-y', '-bso0', `-bsp${process.stdout.isTTY ? 1 : 0}`]
    : ['-xf', archive, '-C', dest]
  const r = spawnSync(extractor.exe, args, { stdio: 'inherit' })
  return r.status === 0
}

export async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!IS_WINDOWS) {
    fail([
      'GPT-SoVITS 통합 패키지는 윈도우용이에요.',
      '  macOS/Linux는 https://github.com/RVC-Boss/GPT-SoVITS 의 설치 안내대로 설치한 뒤, GPT_SOVITS_DIR에 그 폴더를 적고 npm start 해 주세요.',
    ].join('\n'))
  }

  const gpus = gpuNames()
  const key = args.package ?? pickPackage(gpus)
  const pkg = PACKAGES[key]

  const home = homedir()
  const root = resolve(args.dir ?? (asciiPath(home) ? home : 'C:\\'))
  const target = join(root, pkg.folder)
  // 압축 파일은 다운로드 폴더에 받는다 (C:\ 바로 아래에는 일반 사용자가 파일을 만들 수 없다).
  // --dir을 고르면 그 드라이브에 받는다 (C: 공간이 모자라 다른 드라이브를 고른 경우)
  const downloads = join(home, 'Downloads')
  const inDownloads = existsSync(join(downloads, pkg.file)) || existsSync(join(downloads, `${pkg.file}.part`))
  const archiveDir = existsSync(downloads) && (!args.dir || inDownloads) ? downloads : root
  const archive = join(archiveDir, pkg.file)
  const part = `${archive}.part`

  // 압축을 풀다 멈춘 폴더(EXTRACTING_MARK가 남아 있음)는 설치된 것으로 보지 않는다 (installedAt)
  const existing = installedAt(target) ? target : findGptSovits()
  if (existing && installedAt(existing)) {
    say(`이미 설치돼 있어요: ${existing}`)
    say(`${IS_WINDOWS ? 'npm.cmd' : 'npm'} start로 실행하면 AI 음성 서버도 같이 켜져요`)
    return
  }
  const resuming = existsSync(join(target, EXTRACTING_MARK))
  if (resuming)
    say(`${target}의 압축을 풀다 멈췄었어요. 다시 풀어요.`)
  else if (existing && existing !== target)
    say(`${existing}에는 카리나 목소리에 필요한 파일(v2Pro 모델 등)이 없어서 v2pro 패키지를 새로 받아요`)
  say(`그래픽카드: ${gpus.length ? gpus.join(', ') : 'NVIDIA 없음 (CPU로 읽어요, 문장당 10초쯤)'} → ${pkg.file}`)

  if (!asciiPath(root))
    fail(`설치 경로에 한글 등 영문이 아닌 글자가 있으면 GPT-SoVITS가 한국어 발음을 분석하지 못해요: ${root}\n  영문 경로를 골라 주세요: ${CMD} -- --dir C:\\AI`)
  // 패키지 안에서 가장 긴 경로가 윈도우 경로 길이 제한(260자)을 넘지 않도록
  if (root.length + 1 + pkg.longest > 259)
    fail(`경로가 너무 길어요 (${root}). 윈도우 경로 길이 제한 때문에 짧은 경로를 골라 주세요: ${CMD} -- --dir C:\\AI`)
  mkdirSync(root, { recursive: true })

  const haveArchive = existsSync(archive) && statSync(archive).size === pkg.size
  const have = haveArchive ? pkg.size : existsSync(part) ? Math.min(statSync(part).size, pkg.size) : 0

  // 공간: 남은 다운로드 + 압축을 푼 크기 (+ 여유 1GB). 압축 파일은 다 푼 뒤 지운다.
  // 풀다 멈춘 폴더가 있으면 그 파일들은 덮어쓰므로 이미 차지한 만큼은 빼고 센다
  const sameDrive = parse(archiveDir).root.toLowerCase() === parse(root).root.toLowerCase()
  const needArchive = pkg.size - have
  const needUnpack = Math.max(0, pkg.unpacked - (resuming ? dirSize(target) : 0)) + 1e9
  const checks = sameDrive ? [[root, needArchive + needUnpack]] : [[archiveDir, needArchive], [root, needUnpack]]
  for (const [dir, need] of checks) {
    const free = freeBytes(dir)
    if (free < need)
      fail(`${parse(dir).root} 드라이브 공간이 부족해요: ${gb(need)} 필요, ${gb(free)} 남음.\n  공간을 비우거나 다른 드라이브에 설치해 주세요: ${CMD} -- --dir D:\\AI`)
  }

  if (!haveArchive) {
    say(`${pkg.file} (${gb(pkg.size)})을 ${archiveDir}에 받아요.${have ? ` 받아 둔 ${gb(have)}부터 이어 받아요.` : ''}`)
    say('중간에 끊기거나 창을 닫아도 다시 실행하면 이어 받아요.')
    try {
      await download(`${REPO}/${pkg.file}`, part, pkg.size)
    }
    catch (e) {
      if (e.code === 'ENOSPC')
        fail(`디스크 공간이 부족해요. 공간을 비우고 다시 실행해 주세요 (받은 만큼은 남아 있어요).`)
      fail(e.fatal ? e.message : `${e.message}. 인터넷 연결을 확인하고 다시 실행해 주세요 (받은 만큼은 남아 있어요).`)
    }
    renameSync(part, archive)
  }

  say('받은 파일이 온전한지 확인해요…')
  if (await sha256File(archive) !== pkg.sha256) {
    rmSync(archive, { force: true, maxRetries: 10, retryDelay: 500 })
    fail('받은 파일이 손상됐어요. 지웠으니 다시 실행해서 새로 받아 주세요.')
  }

  const extractor = findExtractor() ?? installSevenZip()
  if (!extractor)
    fail(`압축을 풀 도구가 없어요. 7-Zip(https://www.7-zip.org)을 설치하고 다시 실행해 주세요.`)
  // 다 풀 때까지 "푸는 중" 표시를 남겨 둔다 (창을 닫거나 전원이 꺼지면 다음 실행에서 다시 푼다)
  mkdirSync(target, { recursive: true })
  rmSync(join(target, INSTALLED_MARK), { force: true })
  writeFileSync(join(target, EXTRACTING_MARK), '')
  say(`${root}에 압축을 풀어요 (약 ${gb(pkg.unpacked)}, 파일 5만여 개).`)
  say(extractor.kind === 'tar'
    ? '진행 표시 없이 10분 넘게 걸릴 수 있어요. 끝날 때까지 창을 닫지 마세요.'
    : '몇 분 걸려요. 끝날 때까지 창을 닫지 마세요.')
  if (!extract(extractor, archive, root) || !filesPresent(target))
    fail(`압축을 다 풀지 못했어요. 다시 실행하면 처음부터 다시 풀어요 (그래도 안 되면 7-Zip을 설치하고 다시 실행해 주세요).`)
  writeFileSync(join(target, INSTALLED_MARK), `${pkg.file} ${pkg.sha256}\n`)
  rmSync(join(target, EXTRACTING_MARK), { force: true })

  // 기본으로 찾아보는 곳이 아니면 설치 위치를 적어 두어 npm start가 찾게 한다
  if (!searchRoots().some(r => resolve(r).toLowerCase() === root.toLowerCase()))
    writeFileSync(INSTALL_DIR_FILE, `${target}\n`)

  if (!args.keep) {
    rmSync(archive, { force: true, maxRetries: 10, retryDelay: 500 })
    say(`압축 파일을 지웠어요 (${gb(pkg.size)} 확보)`)
  }
  say(`설치 완료: ${target}`)
  say(`이제 ${IS_WINDOWS ? 'npm.cmd' : 'npm'} start로 실행하세요. AI 음성 서버가 같이 켜지고, 30초쯤 뒤부터 카리나 목소리로 읽어요.`)
}

// npm run voice:install로 실행했을 때만 설치한다 (테스트에서 불러 쓸 때는 실행하지 않는다).
// 윈도우는 경로의 대소문자를 구분하지 않아서, 입력한 경로와 실제 경로의 대소문자가 달라도 같은 파일로 본다
const samePath = (a, b) => IS_WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b
if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url)))
  await main()
