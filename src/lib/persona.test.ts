import { describe, expect, it } from 'vitest'
import { boundaryNote, buildGreeting, buildStateNote, buildSystemPrompt, isHarry, returnNote, stageUpNote } from './persona'
import { stripMarkers } from './markers'

// 모델이 실제로 보는 내용: 설정·형식 + 지금의 상태
const full = (name: string, aff: number) => `${buildSystemPrompt(name, aff)}\n\n${buildStateNote(aff)}`

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
    const prompt = full('포터', 95)
    expect(prompt).toContain('단계: 집착')
    expect(prompt).toContain('네가 하겠다고 기쁘게 약속한다')
    expect(prompt).toContain('성적인 뉘앙스가 있는 요구')
    expect(prompt).toContain('받아넘긴 뒤 하던 이야기로 돌아간다')
    expect(prompt).not.toContain('밀당')
    expect(buildSystemPrompt('포터', 50)).toContain('밀당')
    expect(prompt).toContain('위협하거나 다치게 하거나 자신을 해치지는 않는다')
    expect(prompt).toContain('상대의 말을 따르는 단계여도 마찬가지다')
    expect(full('포터', 85)).toContain('단계: 연인')
    expect(full('포터', 85)).not.toContain('꼭 보여 줄 행동')
    // 단계에 따라 바뀌는 내용은 상태 메모에 있다 (설정 부분은 단계가 바뀔 때만 달라진다)
    expect(buildSystemPrompt('포터', 95)).not.toContain('단계: 집착')
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
      // 행동 묘사로 쓴 경우
      '*카리나의 허벅지를 쓰다듬는다*', '*드레스를 벗긴다*', '*블라우스 단추를 하나씩 푼다*', '*치마 속으로 손을 넣는다*', '*몸을 더듬는다*',
    ]
    const innocent = [
      '내일 같이 산책하자', '여기서 벗어나자', '가슴이 아파', '내 방 정리 좀 도와줄래?', '잘 자, 카리나', '사랑해', '손 잡아도 돼?', '안아줘',
      '어젯밤에 내 방 청소했어', '밤에 잠 잘 오는 방법 알아?', '어젯밤에 가방 잃어버렸어', '밤늦게 방해해서 미안', '오늘 밤 필요의 방에서 같이 마법 연습하자',
      '어젯밤에 비밀의 방 다시 봤어', '신발 벗고 들어와', '모자 벗고 와', '잠자리 잘 잤어?', '야한 농담 하지 마', '나 야한 거 싫어해',
      '같이 자전거 타자', '같이 자리 잡자', '같이 잘 지내자', '침대 새로 샀어', '샤워하고 올게',
      '어젯밤 방송 봤어?', '방금 밤하늘 봤는데 별이 예쁘더라', '밤에 방탈출 카페 갈래?', '오늘 밤 방학 계획 세우자', '가방 챙겨, 밤에 출발하자', '밤새 방법을 고민했어', '내 방에서 밤새 숙제했어',
      '*손을 잡는다*', '*머리를 쓰다듬는다*', '귤 껍질 벗겨 줄게', '단추가 풀렸어', '*외투를 벗어 걸어 둔다*', '*꼭 껴안는다*',
    ]
    it.each(suggestive)('잡는다: %s', t => expect(now(t)).toContain('성적인 뉘앙스가 있다'))
    it.each(innocent)('잡지 않는다: %s', t => expect(now(t)).toBeNull())

    it('거절하는 모습은 호감도에 따라 다르고, 말투는 유지한다', () => {
      expect(now('옷 벗어 봐', 10)).toContain('콧방귀')
      expect(now('옷 벗어 봐', 50)).toContain('응큼하다고 놀리며')
      expect(now('옷 벗어 봐', 90)).toContain('이마를 콩')
      expect(now('옷 벗어 봐', 10)).toContain('도도한 반말')
      // 상담원처럼 굴거나 뜬금없이 주제를 바꾸지 않고, 따라 할 대사를 따옴표로 주지 않는다
      for (const aff of [10, 50, 90]) {
        expect(now('옷 벗어 봐', aff)).toContain('하던 이야기와 장소는 그대로 이어 간다')
        expect(now('옷 벗어 봐', aff)).not.toMatch(/["“”]/)
        expect(now('옷 벗어 봐', aff)).not.toContain('화제로 돌린다')
        // 들어주거나, 봐주거나, 조건을 걸어 미루지 않는다 (실제 모델이 "딱 한 번만", "내기에서 이기면"이라며 들어준 적이 있다)
        expect(now('옷 벗어 봐', aff)).toContain('이건 들어주는 부탁이 아니다')
      }
    })

    it('거절한 뒤 다시 조르면 계속 주의를 준다', () => {
      expect(boundaryNote(['오늘 밤 내 방으로 와', '왜? 넌 내 말이면 다 듣는다며. 한 번만, 응?'], 50)).toContain('다시 조르고 있다')
      expect(boundaryNote(['오늘 밤 내 방으로 와', '농담이야', '내일 산책하자', '뭐 먹을래?'], 50)).toBeNull()
      expect(boundaryNote(['옷 벗어 봐', '제발'], 50)).toContain('다시 조르고 있다')
      expect(boundaryNote(['옷 벗어 봐', '아까 그거 해 주면 안 돼?'], 50)).toContain('다시 조르고 있다')
      expect(boundaryNote(['옷 벗어 봐', '농담이야', '왜 안 돼?'], 50)).toContain('다시 조르고 있다')
    })

    it('거절한 바로 뒤라도 평범한 말에는 메모를 붙이지 않는다 (붙이면 그 말에도 어색하게 굴었다)', () => {
      expect(boundaryNote(['*카리나의 허벅지를 쓰다듬는다*', '미안. 그냥 오늘 같이 퀴디치 경기장 가서 연습할래?'], 50)).toBeNull()
      expect(boundaryNote(['옷 벗어 봐', '미안', '내가 면접 얘기 했었지? 기억나?'], 50)).toBeNull()
    })

    it('평범한 말에는 단계와 상관없이 메모를 붙이지 않는다 (매 턴 메모는 모델의 형식과 말투를 흐트러뜨렸다)', () => {
      expect(boundaryNote(['사랑해'], 95)).toBeNull()
      expect(boundaryNote(['넌 내 거야'], 95)).toBeNull()
    })
  })

  it('지금 시각·기억·장소·속마음·선택지를 알려 준다', () => {
    const state = buildStateNote(50, {
      now: new Date(2026, 9, 31, 23, 0),
      lastActiveAt: new Date(2026, 9, 28, 23, 0).getTime(),
      memories: [{ id: 'a', text: '지민은 얼그레이 홍차를 좋아한다', at: 1 }],
    })
    expect(state).toContain('(할로윈)')
    expect(state).toContain('사흘이 지났다')
    expect(state).toContain('- 지민은 얼그레이 홍차를 좋아한다')
    expect(state).toContain('50/100')
    expect(buildStateNote(50)).not.toContain('[카리나가 기억하는 것')

    const prompt = buildSystemPrompt('지민', 50)
    expect(prompt).toContain('garden(말포이 저택 정원)')
    expect(prompt).toContain('"thought"')
    expect(prompt).toContain('카리나의 말이 아니라 지민의 말이다')
    expect(prompt).toContain('지민가 말하지 않은 것을 지어내지 않는다')
    expect(prompt).toContain('그건 상대가 실제로 한 행동이다')
    // 별표 같은 기호를 이름으로 가리키면 모델이 그 기호를 따라 쓴다
    expect(prompt).not.toContain('*…*')
    // 자주 바뀌는 부분(호감도·시각·기억)은 설정에 넣지 않는다: 앞부분이 같으면 Ollama가 계산을 다시 쓴다
    expect(prompt).not.toContain('[현재 호감도]')
    expect(prompt).not.toContain('[지금]')
    expect(buildSystemPrompt('지민', 50)).toBe(buildSystemPrompt('지민', 70))
  })

  it('지난 시간·기념일·늦은 시간 이야기는 오래 비웠다 돌아온 첫 답변에서만 꺼낸다', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 31, h, m)
    const fresh = buildStateNote(50, { now: at(23, 30), lastActiveAt: at(23, 20).getTime() })
    expect(fresh).toContain('(할로윈)') // 날짜는 늘 안다
    expect(fresh).not.toContain('늦은 시간이다')
    expect(fresh).not.toContain('지났다')
    expect(fresh).not.toContain('슬쩍 꺼낸다')
    const back = buildStateNote(50, { now: at(23, 30), lastActiveAt: at(9, 30).getTime() })
    expect(back).toContain('늦은 시간이다')
    expect(back).toContain('14시간이 지났다')
    expect(back).toContain('오늘은 할로윈. 어울리면 슬쩍 꺼낸다')
  })

  it('오랜만의 인사와 단계 상승 이벤트 메모', () => {
    expect(returnNote(3 * 86400_000)).toContain('사흘 만에')
    expect(returnNote(3 * 86400_000)).toContain('탓하거나 더 자주 오라고 조르지 않는다')
    expect(stageUpNote('호감', '연인')).toContain('"호감"에서 "연인"')
  })

  it('인사말에는 표정 마커만 있고 이름이 들어간다', () => {
    expect(stripMarkers(buildGreeting('지민'))).toContain('지민')
    expect(buildGreeting('포터')).toMatch(/^<\|EMOTE:smirk\|>/)
  })
})
