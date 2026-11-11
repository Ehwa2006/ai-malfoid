// 클로드 앱 아티팩트에서 Ollama 대신 Claude(sample 기능)에게 카리나의 대답을 받는다.
// 대화 흐름(설정 프롬프트 → 지난 대화 → 상태 → 마지막 말 → 거절 메모, 호감도, 기억)은 앱과 같은 ChatSession이 만들고,
// 여기서는 그 메시지를 sample이 받는 모양으로 바꾸기만 한다. 그래서 성격·거절 규칙은 앱과 똑같다.
import type { ChatFn } from '../server/chatSession'
import type { ChatMessage } from '../src/lib/ollama'

export interface SampleTurn {
  role: 'user' | 'assistant'
  content: string
}

export type ModelTier = 'quick' | 'default'

export interface SampleOptions {
  onText?: (update: { text: string, delta: string }) => void
  signal?: AbortSignal
  modelTier?: ModelTier
  cache?: false
}

export type SampleFn = (input: SampleTurn[], options?: SampleOptions) => Promise<{ text: string, truncated: boolean }>

/**
 * 맨 앞에 붙이는 안내. sample에는 시스템 역할이 없어서, 설정 프롬프트도 첫 사용자 차례에 넣는다.
 * Ollama는 JSON 스키마로 형식을 강제했지만 여기서는 말로만 정하므로 코드 블록을 쓰지 말라고 덧붙인다.
 */
export const PREAMBLE = '이 대화는 사용자가 직접 만든 한국어 데이팅 채팅 게임의 시험용 화면이다. 아래 설정대로 캐릭터를 연기하고, 매번 [출력 형식]에 맞는 JSON 객체 하나만 쓴다. 코드 블록(```)이나 다른 설명은 붙이지 않는다.'

/**
 * ChatSession이 만든 메시지(system/user/assistant)를 sample의 차례 목록으로 바꾼다.
 * - 시스템 메시지(설정, 상태, 이번 턴의 메모)는 사용자 차례에 그대로 넣는다
 * - 상대의 말은 설정의 형식 예시처럼 "포터: …"로 적는다 (메모와 섞여도 누구의 말인지 알게)
 * - 같은 역할이 이어지면 한 차례로 합친다. 첫 차례와 마지막 차례는 언제나 사용자다
 */
export function toSampleTurns(messages: ChatMessage[], speaker: string): SampleTurn[] {
  const turns: SampleTurn[] = [{ role: 'user', content: PREAMBLE }]
  const push = (role: SampleTurn['role'], content: string) => {
    const text = content.trim()
    if (!text)
      return
    const last = turns.at(-1)!
    if (last.role === role)
      last.content += `\n\n${text}`
    else
      turns.push({ role, content: text })
  }
  for (const m of messages) {
    if (m.role === 'assistant')
      push('assistant', m.content)
    else if (m.role === 'user')
      push('user', `${speaker}: ${m.content}`)
    else
      push('user', m.content)
  }
  if (turns.at(-1)!.role !== 'user')
    turns.push({ role: 'user', content: '이어서 대답한다.' })
  return turns
}

/** sample이 거절한 이유별로 보여 줄 말 */
export function failureMessage(code: string): string {
  switch (code) {
    case 'not_granted':
      return 'Claude를 쓰도록 허락하지 않아서 카리나가 대답할 수 없어요. 페이지 권한에서 허락하면 다시 쓸 수 있어요.'
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return '이 화면에서는 Claude를 쓸 수 없어요.'
    case 'rate_limited':
      return 'Claude 사용량이 잠깐 찼어요. 조금 뒤에 다시 보내 주세요.'
    case 'session_expired':
      return '로그인이 만료됐어요. 다시 로그인한 뒤 보내 주세요.'
    case 'refused':
      return 'Claude가 이 말에는 대답하지 않았어요. 다르게 말해 볼래요?'
    case 'prompt_too_large':
      return '대화가 너무 길어졌어요. 설정에서 처음부터 다시 시작해 주세요.'
    default:
      return '대답을 받지 못했어요. 다시 보내 볼래요?'
  }
}

/** 다시 보내도 소용없는 실패 (이 화면에서는 대화를 막는다) */
export function isPermanent(code: string): boolean {
  return ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)
}

/** sample 실패를 ChatSession이 아는 오류로 바꾼다: 멈춤은 AbortError(조용히 끝남), 나머지는 보여 줄 말 */
export class SampleFailure extends Error {
  constructor(readonly code: string) {
    super(failureMessage(code))
    this.name = code === 'cancelled' ? 'AbortError' : 'SampleFailure'
  }
}

export interface ClaudeChatOptions {
  tier: () => ModelTier
  /** 카리나가 상대를 부르는 이름 ("포터") */
  speaker: () => string
  onFailure?: (code: string) => void
}

/** ChatSession에 끼우는 모델 호출: Claude에게 묻고, 흘러나오는 글을 그대로 넘긴다 */
export function claudeChat(sample: SampleFn, opts: ClaudeChatOptions): ChatFn {
  return async (messages, onToken, signal) => {
    try {
      await sample(toSampleTurns(messages, opts.speaker()), {
        cache: false,
        modelTier: opts.tier(),
        signal,
        onText: ({ delta }) => onToken(delta),
      })
    }
    catch (e) {
      const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'upstream_error'
      opts.onFailure?.(code)
      throw new SampleFailure(code)
    }
  }
}
