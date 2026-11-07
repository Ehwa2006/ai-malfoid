// 카리나의 비밀 일기: 최근 대화와 기억을 바탕으로, 겉으로는 못 한 속마음을 일기로 쓰게 한다.
import { stageOf } from './affection'
import type { Memory } from './memory'
import type { ChatMessage } from './ollama'
import { callName, suggestive } from './persona'

export interface DiaryEntry {
  id: string
  /** 쓴 시각 (ms) */
  at: number
  title: string
  text: string
  /** 쓸 때의 호감도 단계 */
  stage: string
}

export const DIARY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    entry: { type: 'string' },
  },
  required: ['title', 'entry'],
} as const

export const MAX_DIARY = 60

/** 일기를 쓰게 하는 요청 (대화 기록은 사람이 읽는 대본 꼴로 넘긴다) */
export function diaryMessages(
  userName: string,
  affection: number,
  memories: Memory[],
  recent: { role: 'user' | 'assistant', text: string }[],
  now: Date,
): ChatMessage[] {
  const name = callName(userName)
  const stage = stageOf(affection)
  const script = recent
    .filter(m => m.text.trim())
    // 품위 없는 말은 일기에 옮기지 않는다 (모델이 그 말을 받아 적거나 이어 쓰지 않게)
    .map(m => `${m.role === 'user' ? name : '카리나'}: ${m.role === 'user' && suggestive(m.text) ? '(품위 없는 말을 해서 잘라냈다)' : m.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
  const system = `너는 『악역영애 말포이』의 카리나 말포이(23세, 말포이가의 영애)다. 겉으로는 도도하고 거만하지만 속은 여리다.
지금은 ${now.getMonth() + 1}월 ${now.getDate()}일 밤, 혼자 방에서 아무에게도 보여 주지 않는 비밀 일기를 쓴다.
- ${name}와의 관계: 호감도 ${affection}/100, "${stage.name}" 단계. ${stage.attitude}
- 오늘 ${name}와 나눈 대화를 떠올리며, 겉으로는 절대 말하지 못한 솔직한 속마음을 쓴다. 대화에 없던 일을 지어내지 않는다.
- 반말 독백체로 4~7문장. 날짜는 쓰지 않는다. 설레는 순애 수준(PG-13)을 넘지 않는다.
- 자신을 해치거나 ${name}를 탓하고 몰아세우는 말, 성적인 내용은 쓰지 않는다. 서운한 일이 있었어도 투정 정도로만 적는다.
- title은 그날 일기의 짧은 제목(15자 이내).
JSON으로만 답한다: {"title": 제목, "entry": 일기 본문}`
  const known = memories.length ? `\n\n[${name}에 대해 기억하는 것]\n${memories.slice(-15).map(m => `- ${m.text}`).join('\n')}` : ''
  return [
    { role: 'system', content: system },
    { role: 'user', content: `[오늘의 대화]\n${script || '(오늘은 별말 없이 지나갔다)'}${known}\n\n오늘의 일기를 써.` },
  ]
}
