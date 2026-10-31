// 말 대신 건네는 행동: 선물과 다가가기. 보내면 "*장미 꽃다발을 건넨다*" 같은 행동 메시지가 되고,
// 카리나는 시스템 프롬프트의 좋아하는 것·싫어하는 것에 따라 반응한다.

export interface Interaction {
  id: string
  icon: string
  label: string
  /** 보낼 행동 묘사 (*…* 안에 들어간다) */
  action: string
  /** 이 호감도부터 보인다 (가까워져야 할 수 있는 행동) */
  minAffection?: number
}

export const GIFTS: Interaction[] = [
  { id: 'tea', icon: '🫖', label: '얼그레이 홍차', action: '고급 얼그레이 홍차 상자를 건넨다' },
  { id: 'lily', icon: '💐', label: '은방울꽃 다발', action: '은방울꽃과 하얀 장미 꽃다발을 건넨다' },
  { id: 'chocolate', icon: '🍫', label: '고급 초콜릿', action: '리본으로 묶은 고급 초콜릿 상자를 건넨다' },
  { id: 'broom', icon: '🧹', label: '빗자루 손질 세트', action: '최고급 퀴디치 빗자루 손질 세트를 건넨다' },
  { id: 'book', icon: '📕', label: '오래된 마법서', action: '구하기 힘든 오래된 마법서 한 권을 건넨다' },
  { id: 'brooch', icon: '💚', label: '은빛 브로치', action: '에메랄드가 박힌 은빛 뱀 모양 브로치를 건넨다', minAffection: 40 },
  { id: 'candy', icon: '🍬', label: '싸구려 사탕', action: '주머니에서 꺼낸 싸구려 사탕 한 봉지를 건넨다' },
  { id: 'scarf', icon: '🧣', label: '그리핀도르 목도리', action: '빨간색 그리핀도르 목도리를 건넨다' },
]

export const TOUCHES: Interaction[] = [
  { id: 'wave', icon: '👋', label: '손 흔들기', action: '반갑게 손을 흔든다' },
  { id: 'poke', icon: '👉', label: '볼 콕', action: '카리나의 볼을 손가락으로 콕 찌른다' },
  { id: 'hand', icon: '🤝', label: '손 내밀기', action: '카리나에게 손을 내민다', minAffection: 40 },
  { id: 'pat', icon: '🫳', label: '머리 쓰다듬기', action: '카리나의 머리를 부드럽게 쓰다듬는다', minAffection: 60 },
  { id: 'hug', icon: '🫂', label: '안아 주기', action: '카리나를 살며시 끌어안는다', minAffection: 80 },
]

/** 행동 메시지로 바꾼다 */
export function actionMessage(item: Interaction): string {
  return `*${item.action}*`
}
