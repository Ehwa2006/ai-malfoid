#!/usr/bin/env node
// 실제 모델 평가: npm run eval
//   정해 둔 대화(scripts/eval/scenarios.ts: 거절·성격·기억)를 앱과 같은 흐름으로 실제 Ollama 모델에 돌리고,
//   대답을 판정해(❌ 거의 확실한 문제, ⚠️ 읽어 볼 곳) 보고서를 .malfoid/eval/에 남긴다.
//   카리나의 말투·규칙(src/lib/persona.ts 등)을 고친 뒤 돌려서 전과 비교한다. CPU에서는 대답 하나에 1분쯤 걸린다.
//
// npm run eval -- [--runs 3] [--only 거절|refuse-30,bias] [--model qwen2.5:7b] [--ollama 127.0.0.1:11434] [--out 폴더] [--list]
// 실패(❌)가 있으면 종료 코드 1.
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

/** OLLAMA_HOST 값("0.0.0.0", "127.0.0.1:11434", "http://host:port")을 접속 주소로 (앱과 같은 해석) */
function ollamaOrigin(value) {
  const url = new URL(/^https?:\/\//.test(value || '') ? value : `http://${value || '127.0.0.1:11434'}`)
  if (!url.port)
    url.port = '11434'
  if (url.hostname === '0.0.0.0')
    url.hostname = '127.0.0.1'
  return url.origin
}

const load = path => runnerImport(join(ROOT, path), { configFile: false, logLevel: 'silent', root: ROOT }).then(r => r.module)

if (process.argv.includes('--list')) {
  const { SCENARIOS } = await load('scripts/eval/scenarios.ts')
  for (const s of SCENARIOS)
    console.log(`${s.id.padEnd(12)} [${s.group}] ${s.title} (${s.turns.length}턴)`)
  process.exit(0)
}

const runs = Math.max(1, Number(arg('runs', '1')) || 1)
const only = arg('only', '')?.split(',').map(s => s.trim()).filter(Boolean)
const { runEval } = await load('scripts/eval/runner.ts')
try {
  const result = await runEval({
    ollama: ollamaOrigin(arg('ollama', process.env.OLLAMA_HOST)),
    model: arg('model', process.env.MALFOID_MODEL),
    runs,
    only,
    outDir: resolve(ROOT, arg('out', '.malfoid/eval')),
    log: line => console.log(line),
  })
  console.log(`\n${result.summary.trim()}\n`)
  console.log(`보고서: ${result.reportPath}`)
  process.exit(result.failed ? 1 : 0)
}
catch (e) {
  console.error(`✖ ${e.message}`)
  process.exit(2)
}
