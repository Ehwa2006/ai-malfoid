// 모델에 보낼 메시지 순서. Ollama는 앞부분이 지난 요청과 같으면 그 계산(KV 캐시)을 다시 쓰므로
// 바뀌지 않는 것을 앞에, 매번 바뀌는 것을 뒤에 둔다.
//   [설정·형식] → [지난 대화] → [지금의 상태] → [상대의 마지막 말] → [이번 턴의 메모]
// 그러면 턴마다 새로 계산하는 건 마지막 몇 백 토큰뿐이라 첫 글자가 훨씬 빨리 나온다.

import type { ChatMessage } from './ollama'

/** 대화 기록을 몇 개씩 묶어서 밀어낼지. 한 개씩 밀면 맨 앞이 매번 바뀌어 캐시를 못 쓴다 */
export const HISTORY_STEP = 10

/**
 * 보낼 대화 기록의 시작 위치. 최근 limit개 이상, limit + HISTORY_STEP개 미만을 보내고
 * 시작 위치는 HISTORY_STEP개마다 한 번만 움직인다.
 */
export function historyStart(length: number, limit: number): number {
  const over = Math.max(0, length - limit)
  return Math.floor(over / HISTORY_STEP) * HISTORY_STEP
}

export function composeChat(system: string, history: ChatMessage[], state: string, notes: string[]): ChatMessage[] {
  const last = history.at(-1)
  const [past, current] = last?.role === 'user' ? [history.slice(0, -1), [last]] : [history, []]
  return [
    { role: 'system', content: system },
    ...past,
    { role: 'system', content: state },
    ...current,
    ...notes.map(content => ({ role: 'system' as const, content })),
  ]
}
