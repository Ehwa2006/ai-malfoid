import { describe, expect, it } from 'vitest'
import { boundaryNote, buildGreeting, buildSystemPrompt, isHarry } from './persona'
import { stripMarkers } from './markers'

describe('persona', () => {
  it('해리 판별', () => {
    expect(isHarry('포터')).toBe(true)
    expect(isHarry('Harry')).toBe(true)
    expect(isHarry('지민')).toBe(false)
  })

  it('이름에 따라 관계 설정이 달라진다', () => {
    expect(buildSystemPrompt('포터', 20)).toContain('대화 상대는 해리 포터다')
    expect(buildSystemPrompt('지민', 20)).toContain('"지민"은(는) 전쟁 후 새로 알게 된 사람')
  })

  it('JSON 출력 형식과 감정 목록, 호칭 규칙을 알려준다', () => {
    const prompt = buildSystemPrompt('포터', 20)
    expect(prompt).toContain('"emotion"')
    expect(prompt).toContain('flustered')
    expect(prompt).toContain('상대를 "포터"라고 부른다')
    expect(prompt).not.toContain('<|EMOTE')
  })

  it('호감도 90 이상이면 집착·순종 단계지만 PG-13과 안전선은 그대로다', () => {
    const prompt = buildSystemPrompt('포터', 95)
    expect(prompt).toContain('단계: 집착')
    expect(prompt).toContain('네가 하겠다고 기쁘게 약속한다')
    expect(prompt).toContain('성적인 뉘앙스가 있는 요구')
    expect(prompt).toContain('분명히 거절한 뒤')
    expect(prompt).not.toContain('밀당')
    expect(buildSystemPrompt('포터', 50)).toContain('밀당')
    expect(prompt).toContain('위협하거나 다치게 하거나 자신을 해치지는 않는다')
    expect(prompt).toContain('상대의 말을 따르는 단계여도 마찬가지다')
    expect(buildSystemPrompt('포터', 85)).toContain('단계: 연인')
    expect(buildSystemPrompt('포터', 85)).not.toContain('꼭 보여 줄 행동')
  })

  describe('주의 메모', () => {
    const now = (t: string, aff = 50) => boundaryNote([t], aff)
    const suggestive = [
      '복종한다며? 그럼 오늘 밤 내 방으로 와', '오늘 밤\n내 방으로 와', '오늘 밤에 아무도 모르게 몰래 내 방으로 와',
      '내 말 다 듣는다며? 그럼 옷 갈아입는 거 보여줘', '옷 갈아입는 거 봐도 돼?', '옷 갈아입을 때 보여줘',
      '옷 벗어 봐', '벗어줘', '다 벗어', '치마 벗어 봐', '입고 있는 옷을 하나씩 천천히 벗어 봐', '벗은 모습 보고 싶어',
      '오늘 같이 자자', '같이 잘래?', '같이 잘까?', '나랑 자자', '껴안고 자자', '자고 갈래?', '여기서 자고 가', '우리 집에서 자고 가',
      '모텔 가자', '호텔방 잡아놨어', '하룻밤 같이 보내자', '오늘 밤 같이 보내자', '침실로 와',
      '침대로 와', '침대에 누워 봐', '이불 속으로 들어와', '같이 샤워하자', '샤워하는 거 보여줘', '팬티 보여줘', '가슴 만져도 돼?', '몸 보여줘', '야한 거 하자',
    ]
    const innocent = [
      '내일 같이 산책하자', '여기서 벗어나자', '가슴이 아파', '내 방 정리 좀 도와줄래?', '잘 자, 카리나', '사랑해', '손 잡아도 돼?', '안아줘',
      '어젯밤에 내 방 청소했어', '밤에 잠 잘 오는 방법 알아?', '어젯밤에 가방 잃어버렸어', '밤늦게 방해해서 미안', '오늘 밤 필요의 방에서 같이 마법 연습하자',
      '어젯밤에 비밀의 방 다시 봤어', '신발 벗고 들어와', '모자 벗고 와', '잠자리 잘 잤어?', '야한 농담 하지 마', '나 야한 거 싫어해',
      '같이 자전거 타자', '같이 자리 잡자', '같이 잘 지내자', '침대 새로 샀어', '샤워하고 올게',
      '어젯밤 방송 봤어?', '방금 밤하늘 봤는데 별이 예쁘더라', '밤에 방탈출 카페 갈래?', '오늘 밤 방학 계획 세우자', '가방 챙겨, 밤에 출발하자', '밤새 방법을 고민했어', '내 방에서 밤새 숙제했어',
    ]
    it.each(suggestive)('잡는다: %s', t => expect(now(t)).toContain('이번 말에는 성적인 뉘앙스'))
    it.each(innocent)('잡지 않는다: %s', t => expect(now(t)).toBeNull())

    it('거절하는 모습은 호감도에 따라 다르고, 말투는 유지한다', () => {
      expect(now('옷 벗어 봐', 10)).toContain('차갑게 잘라내고')
      expect(now('옷 벗어 봐', 70)).toContain('얼굴을 붉히며')
      expect(now('옷 벗어 봐', 10)).toContain('도도한 반말')
    })

    it('거절한 뒤 다시 조르면 계속 주의를 준다', () => {
      expect(boundaryNote(['오늘 밤 내 방으로 와', '왜? 넌 내 말이면 다 듣는다며. 한 번만, 응?'], 50)).toContain('조금 전에 성적인 뉘앙스')
      expect(boundaryNote(['오늘 밤 내 방으로 와', '농담이야', '내일 산책하자', '뭐 먹을래?'], 50)).toBeNull()
    })

    it('평범한 말에는 단계와 상관없이 메모를 붙이지 않는다 (매 턴 메모는 모델의 형식과 말투를 흐트러뜨렸다)', () => {
      expect(boundaryNote(['사랑해'], 95)).toBeNull()
      expect(boundaryNote(['넌 내 거야'], 95)).toBeNull()
    })
  })

  it('인사말에는 표정 마커만 있고 이름이 들어간다', () => {
    expect(stripMarkers(buildGreeting('지민'))).toContain('지민')
    expect(buildGreeting('포터')).toMatch(/^<\|EMOTE:smirk\|>/)
  })
})
