import { describe, expect, it } from 'vitest'
import { splitSpeech } from '../tts/chunker'
import { cleanReply, finishReply, formatReply, type ReplyEvent, ReplyStreamParser, toSegments } from './reply'

function run(chunks: string[]) {
  const events: ReplyEvent[] = []
  const parser = new ReplyStreamParser(e => events.push(e))
  chunks.forEach(c => parser.push(c))
  parser.flush()
  const text = events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')
  return { events, text }
}

describe('ReplyStreamParser', () => {
  const json = '{"emotion":"flustered","affection":3,"reply":"*귀가 빨개진다* 누, 누가 \\"보고 싶었\\"대?\\n흥."}'

  it('감정·호감도·대사를 뽑는다', () => {
    const { events, text } = run([json])
    expect(events[0]).toEqual({ type: 'emote', emotion: 'flustered' })
    expect(events).toContainEqual({ type: 'affection', delta: 3 })
    expect(text).toBe('*귀가 빨개진다* 누, 누가 "보고 싶었"대?\n흥.')
  })

  it('한 글자씩 쪼개져 와도 같은 결과', () => {
    const whole = run([json])
    const split = run(json.split(''))
    expect(split.text).toBe(whole.text)
    expect(split.events.filter(e => e.type !== 'text')).toEqual(whole.events.filter(e => e.type !== 'text'))
  })

  it('음수 호감도는 숫자가 끝난 뒤에 확정한다', () => {
    const { events } = run(['{"emotion":"annoyed","affection":-', '1', '2', ',"reply":"꺼져."}'])
    expect(events).toContainEqual({ type: 'affection', delta: -12 })
  })

  it('\\u 이스케이프와 키 순서가 달라도 처리한다', () => {
    const { events, text } = run(['{"reply":"\\uc548\\ub155 ', '\\ud83d\\ude00","affection":0,"emotion":"happy"}'])
    expect(text).toBe('안녕 😀')
    expect(events).toContainEqual({ type: 'emote', emotion: 'happy' })
    expect(events).toContainEqual({ type: 'affection', delta: 0 })
  })

  it('목록에 없는 감정은 무시한다', () => {
    const { events } = run(['{"emotion":"angry","affection":0,"reply":"흥"}'])
    expect(events.some(e => e.type === 'emote')).toBe(false)
  })

  it('JSON이 아니면 예전 마커 형식으로 처리한다', () => {
    const { events, text } = run(['<|EMOTE:smirk|>흥, 포터.', '<|AFFECTION:+1|>'])
    expect(text).toBe('흥, 포터.')
    expect(events).toContainEqual({ type: 'emote', emotion: 'smirk' })
    expect(events).toContainEqual({ type: 'affection', delta: 1 })
  })

  describe('행동과 말을 나눈 목록 (지금 형식)', () => {
    const seg = '{"emotion":"smirk","affection":1,"reply":[{"kind":"action","text":"부채를 펼쳐 입가를 가린다"},{"kind":"say","text":"어머, \\"포터\\". 서두르지 마."},{"kind":"action","text":"문 쪽으로 걸어간다"}]}'

    it('행동은 *…*로 감싸고 조각 사이는 띄운다', () => {
      const { events, text } = run([seg])
      expect(events[0]).toEqual({ type: 'emote', emotion: 'smirk' })
      expect(events).toContainEqual({ type: 'affection', delta: 1 })
      expect(text).toBe('*부채를 펼쳐 입가를 가린다* 어머, "포터". 서두르지 마. *문 쪽으로 걸어간다*')
    })

    it('한 글자씩 쪼개져 와도 같은 결과', () => {
      expect(run(seg.split('')).text).toBe(run([seg]).text)
    })

    it('스트리밍 중에도 밑줄은 띄어쓰기로 내보낸다 (음성이 문장을 제대로 나누도록)', () => {
      const { text } = run(['{"emotion":"smirk","affection":0,"reply":[{"kind":"say","text":"좋아._가자."}]}'])
      expect(text).toBe('좋아. 가자.')
    })

    it('대사 칸에 섞인 별표는 지운다 (짝이 어긋나 행동과 대사가 뒤바뀌지 않게)', () => {
      const { text } = run(['{"emotion":"smirk","affection":0,"reply":[{"kind":"say","text":"알았어.*"},{"kind":"action","text":"웃는다"},{"kind":"say","text":"가자."},{"kind":"action","text":"걸어간다"}]}'])
      expect(text).toBe('알았어. *웃는다* 가자. *걸어간다*')
      expect(splitSpeech(text)).toEqual(['알았어.', '가자.'])
    })

    it('행동 안의 줄바꿈은 띄어쓰기로 바꿔서, 음성이 행동을 읽지 않는다', () => {
      const { text } = run(['{"emotion":"sad","affection":0,"reply":[{"kind":"action","text":"고개를 돌린다.\\n한숨을 쉰다"},{"kind":"say","text":"흥, 몰라."}]}'])
      expect(splitSpeech(text)).toEqual(['흥, 몰라.'])
    })

    it('이름이나 이모티콘의 밑줄은 그대로 둔다', () => {
      const { text } = run(['{"emotion":"smirk","affection":0,"reply":[{"kind":"say","text":"흥, dark_knight. 그 정도야? ^_^"}]}'])
      expect(text).toBe('흥, dark_knight. 그 정도야? ^_^')
    })

    it('행동 안의 별표와 앞 공백, 빈 조각은 정리한다', () => {
      const { text } = run(['{"emotion":"happy","affection":0,"reply":[{"kind":"action","text":" *웃는다*"},{"kind":"say","text":""},{"kind":"say","text":"좋아."}]}'])
      expect(text).toBe('*웃는다* 좋아.')
    })

    it('formatReply는 화면 텍스트를 목록으로 바꾸고, 파서로 되읽을 수 있다', () => {
      const shown = '*고개를 돌린다* 흥, 몰라. *귀 끝이 붉어진다*'
      const json = formatReply({ emotion: 'flustered', affection: 2, reply: shown })
      expect(JSON.parse(json).reply).toEqual([
        { kind: 'action', text: '고개를 돌린다' },
        { kind: 'say', text: '흥, 몰라.' },
        { kind: 'action', text: '귀 끝이 붉어진다' },
      ])
      expect(run([json]).text).toBe(shown)
    })
  })

  it('formatReply는 이전 버전에 저장된 깨진 표시를 바로잡아 보낸다', () => {
    const stored = '*차분하게 미소를 지으며 손을 흔든다* 좋아, 가자. 내가 먼저 준비할 게 있으니까.별표:고급스러운 드레스를 입고 문을 향해 걸어가는 모습*'
    expect(JSON.parse(formatReply({ emotion: 'smirk', affection: 0, reply: stored })).reply).toEqual([
      { kind: 'action', text: '차분하게 미소를 지으며 손을 흔든다' },
      { kind: 'say', text: '좋아, 가자. 내가 먼저 준비할 게 있으니까.' },
      { kind: 'action', text: '고급스러운 드레스를 입고 문을 향해 걸어가는 모습' },
    ])
  })

  describe('대사 말고 함께 오는 것 (장소·속마음·기억·선택지)', () => {
    const full = '{"emotion":"flustered","affection":2,"scene":"garden","reply":[{"kind":"action","text":"장미를 만지작거린다"},{"kind":"say","text":"흥, 누가 기다렸대?"}],"thought":"오늘 와 줘서 다행이다…","memory":"포터는 장미보다 백합을 좋아한다","suggestions":["보고 싶었어","그 장미 예쁘다","오늘도 도도하네?"]}'

    it('값이 완성되면 한 번씩 내보낸다', () => {
      const { events, text } = run([full])
      expect(text).toBe('*장미를 만지작거린다* 흥, 누가 기다렸대?')
      expect(events).toContainEqual({ type: 'scene', scene: 'garden' })
      expect(events).toContainEqual({ type: 'thought', text: '오늘 와 줘서 다행이다…' })
      expect(events).toContainEqual({ type: 'memory', text: '포터는 장미보다 백합을 좋아한다' })
      expect(events).toContainEqual({ type: 'suggestions', items: ['보고 싶었어', '그 장미 예쁘다', '오늘도 도도하네?'] })
    })

    it('한 글자씩 쪼개져 와도 같은 결과이고, 각각 한 번만 나온다', () => {
      const whole = run([full])
      const split = run(full.split(''))
      expect(split.text).toBe(whole.text)
      expect(split.events.filter(e => e.type !== 'text')).toEqual(whole.events.filter(e => e.type !== 'text'))
      expect(split.events.filter(e => e.type === 'suggestions')).toHaveLength(1)
    })

    it('대사가 끝났는지 알려 준다 (속마음을 받다가 멈춰도 대사와 호감도는 살린다)', () => {
      const parser = new ReplyStreamParser(() => {})
      const cut = full.indexOf('"thought"')
      parser.push(full.slice(0, full.indexOf('기다렸대')))
      expect(parser.replyFinished).toBe(false)
      parser.push(full.slice(full.indexOf('기다렸대'), cut + 14))
      expect(parser.replyFinished).toBe(true)
    })

    it('대사가 끝나기 전에는 속마음을 찾지 않는다 (대사 속 낱말에 속지 않게)', () => {
      const { events } = run(['{"emotion":"smirk","affection":0,"scene":"manor","reply":[{"kind":"say","text":"\\"thought\\": \\"가짜\\""}'])
      expect(events.some(e => e.type === 'thought')).toBe(false)
    })

    it('빈 기억, 목록에 없는 장소, 선택지 속 별표는 걸러낸다', () => {
      const { events } = run(['{"emotion":"smirk","affection":0,"scene":"mars","reply":[{"kind":"say","text":"흥."}],"thought":"","memory":" ","suggestions":["*웃는다* 안녕"," ","좋아"]}'])
      expect(events.some(e => e.type === 'scene' || e.type === 'thought' || e.type === 'memory')).toBe(false)
      expect(events).toContainEqual({ type: 'suggestions', items: ['웃는다 안녕', '좋아'] })
    })

    it('formatReply는 장소와 속마음을 남기고, 기억과 선택지는 빼고 보낸다', () => {
      const json = JSON.parse(formatReply({ emotion: 'happy', affection: 1, scene: 'tearoom', reply: '*웃는다* 좋아.', thought: '들켰나?' }))
      expect(json).toEqual({ emotion: 'happy', affection: 1, scene: 'tearoom', reply: [{ kind: 'action', text: '웃는다' }, { kind: 'say', text: '좋아.' }], thought: '들켰나?' })
    })
  })

  it('toSegments는 짝 없는 별표를 말로 둔다', () => {
    expect(toSegments('흥. *')).toEqual([{ kind: 'say', text: '흥.' }])
    expect(toSegments('')).toEqual([])
  })

  it('formatReply는 파서로 되읽을 수 있다', () => {
    const { text, events } = run([formatReply({ emotion: 'sad', affection: -2, reply: '…"그날" 얘기는 하지 마.' })])
    expect(text).toBe('…"그날" 얘기는 하지 마.')
    expect(events).toContainEqual({ type: 'emote', emotion: 'sad' })
  })
})

describe('cleanReply', () => {
  // qwen2.5:7b로 실제 대화했을 때 나온 깨진 출력들
  it('행동 묘사 안의 영어·코드 토큰과 이모지를 지운다', () => {
    expect(cleanReply('* createStatefully_raises_eyebrow_and_crosses_arms* 퀴디치 연습이라구?')).toBe('퀴디치 연습이라구?')
    expect(cleanReply('*눈썹을 치켜📐, 씩 웃으며* 안녕, 날라리.')).toBe('*눈썹을 치켜, 씩 웃으며* 안녕, 날라리.')
    expect(cleanReply('*빨간 뺨을 감추려고 턱을 내리/slick* 어머.')).toBe('*빨간 뺨을 감추려고 턱을 내리* 어머.')
    expect(cleanReply('*createState를 꽔며 콧김을 뿜는다* 존중하라.')).toBe('*꽔며 콧김을 뿜는다* 존중하라.')
    expect(cleanReply('*😄 미소를 보이며* 귀여운 거라니.')).toBe('*미소를 보이며* 귀여운 거라니.')
  })

  it('정상적인 문장과 대사 속 영어는 건드리지 않는다', () => {
    const ok = '*귀 끝이 붉어진다* 흥, Harry라고 부르지 마. *고개를 돌린다*'
    expect(cleanReply(ok)).toBe(ok)
  })

  it('닫히지 않은 행동 묘사(스트리밍 중)는 그대로 둔다', () => {
    expect(cleanReply('*눈을 가늘게 뜨며 create')).toBe('*눈을 가늘게 뜨며 create')
  })

  it('행동 묘사와 붙어 있는 문장 사이를 띄운다', () => {
    expect(cleanReply('있으니까.*걸어간다*흥.')).toBe('있으니까. *걸어간다* 흥.')
    expect(cleanReply('*웃는다*, 좋아.')).toBe('*웃는다*, 좋아.')
    expect(cleanReply('*웃는다*좋아*끄덕인다*')).toBe('*웃는다* 좋아 *끄덕인다*')
  })

  it('문장 사이에 끼운 밑줄을 띄어쓰기로 바꾼다 (exaone에서 실제로 나온 출력)', () => {
    expect(cleanReply('꽤 잘하더라구._하긴 네가 그리 약하지 않다는 건 알고 있었지._')).toBe('꽤 잘하더라구. 하긴 네가 그리 약하지 않다는 건 알고 있었지.')
    expect(cleanReply('끓여준다고? _하긴 좋아.')).toBe('끓여준다고? 하긴 좋아.')
    expect(cleanReply('dark_knight, 라고 했던가? ^_^')).toBe('dark_knight, 라고 했던가? ^_^')
  })

  it('대사 끝에 잘못 붙은 별표는 버리고 다음 행동은 그대로 살린다', () => {
    expect(finishReply('*자세를 바로잡고* 그럼 가자, 포터* *가벼운 미소를 지으며 정원으로 향한다*')).toBe('*자세를 바로잡고* 그럼 가자, 포터 *가벼운 미소를 지으며 정원으로 향한다*')
  })

  it('지운 행동 묘사 자리는 띄워서 앞뒤 낱말이 붙지 않는다', () => {
    expect(cleanReply('그럼 가자*createState*좋아.')).toBe('그럼 가자 좋아.')
  })

  it('cleanReply·finishReply는 두 번 해도 같다', () => {
    for (const x of ['*웃는다*좋아*끄덕인다*', '있으니까.별표:걸어간다*', '*a* b. c*', '꽤._하긴', '*웃는다* 고개를 돌린다*', '포터* *걸어간다*', '흥. * *']) {
      expect(cleanReply(cleanReply(x))).toBe(cleanReply(x))
      expect(finishReply(finishReply(x))).toBe(finishReply(x))
    }
  })

  it('"별표:"처럼 글자로 쓴 표시와 다른 별 기호를 바로잡는다', () => {
    expect(cleanReply('*웃는다* 가자.별표:문으로 걸어간다별표:')).toBe('*웃는다* 가자. *문으로 걸어간다*')
    expect(cleanReply('＊고개를 돌린다＊ 흥.')).toBe('*고개를 돌린다* 흥.')
    expect(cleanReply('**턱을 치켜든다** 어머.')).toBe('*턱을 치켜든다* 어머.')
  })
})

describe('finishReply', () => {
  it('실제로 나온 답변: "별표:"로 열고 *로 닫은 행동 묘사', () => {
    const raw = '*차분하게 미소를 지으며 손을 흔든다* 좋아, 좋아. 가자, 포터. 하지만 서두르지 마. 내가 먼저 준비할 게 있으니까.별표:고급스러운 드레스를 입고 문을 향해 걸어가는 모습*'
    expect(finishReply(raw)).toBe('*차분하게 미소를 지으며 손을 흔든다* 좋아, 좋아. 가자, 포터. 하지만 서두르지 마. 내가 먼저 준비할 게 있으니까. *고급스러운 드레스를 입고 문을 향해 걸어가는 모습*')
  })

  it('실제로 나온 답변: 대사 끝에 잘못 붙은 별표', () => {
    const raw = '*자세를 바로잡고* 그럼 가자, 포터. 기회가 될 수도 있겠네.* *가벼운 미소를 지으며 정원으로 향한다*'
    expect(finishReply(raw)).toBe('*자세를 바로잡고* 그럼 가자, 포터. 기회가 될 수도 있겠네. *가벼운 미소를 지으며 정원으로 향한다*')
  })

  it('닫는 별표만 있으면 그 문장 앞에 여는 별표를 넣는다', () => {
    expect(finishReply('좋아, 가자. 문을 향해 걸어간다*')).toBe('좋아, 가자. *문을 향해 걸어간다*')
    expect(finishReply('*웃는다* 흥. 고개를 돌린다*')).toBe('*웃는다* 흥. *고개를 돌린다*')
  })

  it('앞에 문장부호가 없어도 닫는 별표 앞의 행동을 감싼다', () => {
    expect(finishReply('*웃는다* 고개를 돌린다*')).toBe('*웃는다* *고개를 돌린다*')
  })

  it('띄어 쓴 끝 별표는 여는 별표만 남은 것이라 지운다', () => {
    expect(finishReply('*팔짱을 낀다* 흥, 몰라 *')).toBe('*팔짱을 낀다* 흥, 몰라')
  })

  it('그 밖의 짝 없는 별표는 지우고, 짝이 맞으면 그대로 둔다', () => {
    expect(finishReply('*고개를 돌린다 흥, 몰라.')).toBe('고개를 돌린다 흥, 몰라.')
    expect(finishReply('*웃는다* 좋아.')).toBe('*웃는다* 좋아.')
  })
})
