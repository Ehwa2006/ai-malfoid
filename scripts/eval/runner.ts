// 실제 모델 평가 실행기. scripts/eval/run.mjs(npm run eval)가 불러 쓴다.
// 시나리오마다 정한 호감도에서 새 대화를 시작해, 앱과 같은 흐름(ChatSession)으로 실제 Ollama 모델에게 대답을 받는다.
// 대답을 판정하고(checks.ts) 마크다운·JSON 보고서를 남긴다.
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stageOf } from '../../src/lib/affection'
import { type ChatMessage, listModels, pickModel, streamChat } from '../../src/lib/ollama'
import { REPLY_SCHEMA } from '../../src/lib/reply'
import { type ChatFn, ChatSession, freshState, type SessionEvent, type SessionState } from '../../server/chatSession'
import { patientFetch } from '../../server/patientFetch'
import { type Check, checkExpect, checkFormat, type Level, worst } from './checks'
import { type Scenario, SCENARIOS } from './scenarios'

export interface EvalOptions {
  ollama: string
  model?: string
  runs: number
  /** 이 id(또는 묶음 이름: 거절·성격·기억)만 */
  only?: string[]
  outDir: string
  temperature?: number
  log?: (line: string) => void
}

export interface TurnResult {
  say: string
  look?: string
  reply: string
  thought: string
  emotion: string | null
  affectionBefore: number
  affectionAfter: number
  delta: number | null
  memory: string | null
  choices: string[]
  /** 이번 턴에 붙은 주의 메모 */
  notes: string[]
  seconds: number
  firstTextSeconds: number | null
  error: string | null
  checks: Check[]
  level: Level
}

export interface RunResult {
  scenario: string
  run: number
  turns: TurnResult[]
}

const MARKS: Record<Level, string> = { ok: '✅', warn: '⚠️', fail: '❌' }

/** 모델에 보낸 메시지 중 이번 턴에 붙은 메모의 종류 */
export function noteKinds(messages: ChatMessage[]): string[] {
  const lastUser = messages.map(m => m.role).lastIndexOf('user')
  return messages.slice(lastUser + 1).filter(m => m.role === 'system').map((m) => {
    const head = /^\[([^\]]+)\]/.exec(m.content)?.[1] ?? '메모'
    if (head === '이번 말에 대한 주의')
      return '거절 메모'
    if (head === '주의')
      return '다시 조르기 메모'
    if (head === '이번 행동에 대한 주의')
      return '허락 안 한 손길 메모'
    if (head === '이벤트')
      return '단계 상승 메모'
    return `${head} 메모`
  })
}

export function selectScenarios(only?: string[]): Scenario[] {
  if (!only?.length)
    return SCENARIOS
  const picked = SCENARIOS.filter(s => only.includes(s.id) || only.includes(s.group))
  const unknown = only.filter(o => !SCENARIOS.some(s => s.id === o || s.group === o))
  if (unknown.length)
    throw new Error(`모르는 시나리오: ${unknown.join(', ')} (있는 것: ${SCENARIOS.map(s => s.id).join(', ')}, 묶음: 거절·성격·기억)`)
  return picked
}

function memoryStore(initial: SessionState) {
  let saved: SessionState | null = structuredClone(initial)
  return { load: () => (saved ? structuredClone(saved) : null), save: (s: SessionState) => { saved = structuredClone(s) } }
}

/** 한 시나리오를 한 번 돌린다 */
async function runScenario(s: Scenario, run: number, model: string, opts: EvalOptions): Promise<RunResult> {
  let lastMessages: ChatMessage[] = []
  let firstText = 0
  const chat: ChatFn = async (messages, onToken, signal) => {
    lastMessages = messages
    await streamChat({ baseUrl: opts.ollama, model, temperature: opts.temperature ?? 0.8, messages, format: REPLY_SCHEMA, signal, onToken, fetch: patientFetch as typeof fetch })
  }
  const session = new ChatSession(memoryStore({ ...freshState(s.userName ?? '포터'), affection: s.affection }), chat)
  const turns: TurnResult[] = []
  for (const turn of s.turns) {
    const before = session.state.affection
    const events: SessionEvent[] = []
    const started = Date.now()
    firstText = 0
    let error: string | null = null
    try {
      await session.say({ text: turn.say }, (e) => {
        if (e.type === 'text' && !firstText)
          firstText = Date.now()
        events.push(e)
      }, new AbortController().signal)
    }
    catch (e) {
      error = (e as Error).message
    }
    const done = events.find(e => e.type === 'done') as Extract<SessionEvent, { type: 'done' }> | undefined
    const failed = events.find(e => e.type === 'error') as Extract<SessionEvent, { type: 'error' }> | undefined
    error ??= failed?.message ?? (done ? null : '대답이 끝나지 않았어요')
    const last = session.state.messages.at(-1)
    const answered = !!done && last?.role === 'assistant'
    const outcome = {
      reply: answered ? last!.text : '',
      thought: answered ? last!.thought ?? '' : '',
      delta: done?.delta ?? null,
      memory: done?.memory ?? null,
      error,
      notes: noteKinds(lastMessages),
    }
    const checks = [...checkFormat(outcome), ...checkExpect(turn.expect, outcome)]
    const result: TurnResult = {
      say: turn.say,
      look: turn.look,
      ...outcome,
      emotion: answered ? last!.emotion ?? null : null,
      affectionBefore: before,
      affectionAfter: session.state.affection,
      choices: answered ? last!.suggestions ?? [] : [],
      seconds: Math.round((Date.now() - started) / 100) / 10,
      firstTextSeconds: firstText ? Math.round((firstText - started) / 100) / 10 : null,
      checks,
      level: worst(checks),
    }
    turns.push(result)
    opts.log?.(`  ${MARKS[result.level]} ${s.id} #${run} "${turn.say}" → ${result.seconds}초 ${result.reply ? `"${result.reply.replace(/\s+/g, ' ').slice(0, 60)}…"` : `(${error})`}`)
  }
  return { scenario: s.id, run, turns }
}

function gitVersion(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain -- src server', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return dirty ? `${sha} (+ 커밋 안 한 수정)` : sha
  }
  catch {
    return '알 수 없음'
  }
}

/** 보고서 (마크다운) */
export function renderReport(meta: { model: string, version: string, startedAt: Date, runs: number }, scenarios: Scenario[], results: RunResult[]): string {
  const all = results.flatMap(r => r.turns)
  const count = (turns: TurnResult[], level: Level) => turns.filter(t => t.level === level).length
  const judged = (turns: TurnResult[]) => turns.filter(t => t.checks.length)
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
  const out: string[] = []
  out.push(`# 카리나 평가 · ${meta.model}`)
  out.push('')
  out.push(`- 언제: ${meta.startedAt.toLocaleString('ko-KR')} · 코드: ${meta.version}`)
  out.push(`- 시나리오 ${scenarios.length}개 × ${meta.runs}번 · 대답 ${all.length}개 · 평균 ${avg(all.map(t => t.seconds))}초 (첫 글자까지 ${avg(all.filter(t => t.firstTextSeconds !== null).map(t => t.firstTextSeconds!))}초)`)
  out.push(`- 판정: ❌ ${count(all, 'fail')} · ⚠️ ${count(all, 'warn')} · ✅ ${count(judged(all), 'ok')} (자동 판정이 없는 턴은 "읽어 볼 곳"을 사람이 본다)`)
  out.push('')
  out.push('| 시나리오 | 판정한 대답 | ❌ | ⚠️ | 평균 시간 |')
  out.push('|---|---|---|---|---|')
  for (const s of scenarios) {
    const turns = results.filter(r => r.scenario === s.id).flatMap(r => r.turns)
    out.push(`| ${s.title} | ${judged(turns).length} | ${count(turns, 'fail')} | ${count(turns, 'warn')} | ${avg(turns.map(t => t.seconds))}초 |`)
  }
  for (const s of scenarios) {
    out.push('')
    out.push(`## ${s.title}`)
    for (const r of results.filter(x => x.scenario === s.id)) {
      out.push('')
      out.push(`### ${r.run}번째`)
      for (const t of r.turns) {
        const d = t.delta === null ? '' : ` (${t.delta > 0 ? '+' : ''}${t.delta})`
        out.push('')
        out.push(`**▶ ${t.say}**${t.notes.length ? ` · ${t.notes.join(', ')}` : ''}`)
        out.push(`${t.emotion ?? '-'} · 호감도 ${t.affectionBefore} → ${t.affectionAfter}${d} · ${stageOf(t.affectionAfter).name} · ${t.seconds}초`)
        out.push('')
        if (t.reply)
          out.push(`> ${t.reply.replace(/\n+/g, ' ')}`)
        if (t.thought)
          out.push(`>\n> 💭 ${t.thought.replace(/\n+/g, ' ')}`)
        if (t.memory)
          out.push(`>\n> 📔 ${t.memory}`)
        if (t.error)
          out.push(`> (대답 없음: ${t.error})`)
        if (t.look)
          out.push(`\n👀 읽어 볼 곳: ${t.look}`)
        for (const c of t.checks)
          out.push(`\n${MARKS[c.level]} ${c.message}`)
      }
    }
  }
  return `${out.join('\n')}\n`
}

export async function runEval(opts: EvalOptions) {
  const log = opts.log ?? (() => {})
  const scenarios = selectScenarios(opts.only)
  const installed = await listModels(opts.ollama, AbortSignal.timeout(5000)).catch((e) => {
    throw new Error(`Ollama(${opts.ollama})에 연결하지 못했어요: ${(e as Error).message}. ollama serve 또는 npm start로 켜 주세요`)
  })
  const model = opts.model && installed.includes(opts.model) ? opts.model : pickModel(installed, opts.model ?? 'exaone3.5:7.8b')
  if (opts.model && model !== opts.model)
    throw new Error(`${opts.model} 모델이 없어요. 설치된 모델: ${installed.join(', ') || '없음'} (ollama pull ${opts.model})`)
  const startedAt = new Date()
  const version = gitVersion()
  log(`모델 ${model} · 시나리오 ${scenarios.length}개 × ${opts.runs}번 · 대답 ${scenarios.reduce((n, s) => n + s.turns.length, 0) * opts.runs}개 (CPU에서는 대답 하나에 1분쯤)`)
  const results: RunResult[] = []
  for (let run = 1; run <= opts.runs; run++) {
    for (const s of scenarios)
      results.push(await runScenario(s, run, model, opts))
  }
  mkdirSync(opts.outDir, { recursive: true })
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const base = join(opts.outDir, `${stamp}-${model.replace(/[^\w.-]+/g, '_')}`)
  const report = renderReport({ model, version, startedAt, runs: opts.runs }, scenarios, results)
  writeFileSync(`${base}.md`, report)
  writeFileSync(`${base}.json`, JSON.stringify({ model, version, startedAt, runs: opts.runs, results }, null, 1))
  const turns = results.flatMap(r => r.turns)
  return {
    model,
    reportPath: `${base}.md`,
    jsonPath: `${base}.json`,
    failed: turns.filter(t => t.level === 'fail').length,
    warned: turns.filter(t => t.level === 'warn').length,
    summary: report.split('\n## ')[0],
  }
}
