import { describe, expect, it } from 'vitest'
import { EMOTIONS } from '../lib/markers'
import { SCENES } from '../lib/scenes'
import { GIFTS, TOUCHES } from '../lib/interactions'
import { EXPRESSIONS, blushFor } from './expressions'
import { EMOTION_EFFECTS, GESTURES, type GestureId, gesture, pickGesture, pickHabit, reactionFor } from './gestures'
import { lookFor } from './season'
import { blinkCurve, nextBlink, seeded, Spring } from './motion'
import { fanOpenPaths, handPaths, mouthPaths, ringlet, sleeve } from './paint'

describe('움직임', () => {
  it('스프링은 목표로 가다가 조금 넘친 뒤 자리를 잡는다', () => {
    const s = new Spring(0, 120, 16)
    let peak = 0
    for (let i = 0; i < 120; i++)
      peak = Math.max(peak, s.step(1, 1 / 60))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.3)
    expect(s.value).toBeCloseTo(1, 2)
  })

  it('프레임이 크게 밀려도 터지지 않는다', () => {
    const s = new Spring(0, 400, 10)
    s.step(1, 0.5)
    expect(Number.isFinite(s.value)).toBe(true)
    expect(Math.abs(s.value)).toBeLessThan(3)
  })

  it('깜빡임: 빨리 감고 천천히 뜬다', () => {
    expect(blinkCurve(0)).toBe(0)
    expect(blinkCurve(0.35)).toBeCloseTo(1)
    // 감을 때보다 뜰 때가 느리다: 가장 감긴 때에서 같은 시간만큼 떨어지면 뜨는 쪽이 아직 더 감겨 있다
    expect(blinkCurve(0.45)).toBeGreaterThan(blinkCurve(0.25))
    expect(blinkCurve(1)).toBe(0)
    const rand = seeded(3)
    for (let i = 0; i < 50; i++) {
      const b = nextBlink(rand)
      expect(b.wait).toBeGreaterThanOrEqual(2.2)
      expect(b.wait).toBeLessThanOrEqual(6.2)
    }
  })
})

describe('몸짓', () => {
  const ids = Object.keys(GESTURES) as GestureId[]

  it('모든 몸짓의 손목·팔꿈치가 그림 안팎의 그럴듯한 자리에 있다', () => {
    for (const id of ids) {
      const g = gesture(id)
      for (const arm of [g.left, g.right]) {
        expect(arm.x).toBeGreaterThanOrEqual(0)
        expect(arm.x).toBeLessThanOrEqual(300)
        expect(arm.y).toBeGreaterThan(150)
        expect(arm.ey).toBeGreaterThan(250) // 팔꿈치는 어깨보다 아래
      }
    }
  })

  it('감정마다 몸짓을 고르고, 방금 한 몸짓은 되풀이하지 않는다', () => {
    const rand = seeded(11)
    for (const emotion of EMOTIONS) {
      let last: GestureId | null = null
      for (let i = 0; i < 20; i++) {
        const next = pickGesture(emotion, 'tearoom', last, rand)
        expect(ids).toContain(next)
        if (last && emotion !== 'sad' && emotion !== 'annoyed' && emotion !== 'surprised')
          expect(next).not.toBe(last)
        last = next
      }
    }
  })

  it('같은 감정이어도 여러 몸짓이 나온다', () => {
    const rand = seeded(5)
    const seen = new Set(Array.from({ length: 40 }, () => pickGesture('smirk', 'manor', null, rand)))
    expect(seen.size).toBeGreaterThanOrEqual(3)
    expect(seen).toContain('fanLaugh')
  })

  it('정원에서는 양산, 경기장에서는 빗자루를 들기도 한다 (기분이 괜찮을 때만)', () => {
    const rand = seeded(21)
    const garden = new Set(Array.from({ length: 60 }, () => pickGesture('happy', 'garden', null, rand)))
    expect(garden).toContain('parasol')
    const pitch = new Set(Array.from({ length: 60 }, () => pickGesture('smirk', 'quidditch', null, rand)))
    expect(pitch).toContain('broom')
    for (let i = 0; i < 40; i++)
      expect(pickGesture('sad', 'garden', null, rand)).not.toBe('parasol')
  })

  it('조용할 때의 버릇: 늦은 밤에는 하품이 잦다', () => {
    const rand = seeded(4)
    const night = Array.from({ length: 40 }, () => pickHabit('neutral', 'manor', 'idle', rand, true))
    expect(night.filter(h => h === 'yawn').length).toBeGreaterThan(10)
    const day = Array.from({ length: 40 }, () => pickHabit('neutral', 'manor', 'idle', rand, false))
    expect(day).not.toContain('yawn')
    expect(pickHabit('sad', 'manor', 'clutch', rand)).toBeNull()
  })

  it('찻잔은 실내에서만 든다', () => {
    const rand = seeded(9)
    for (let i = 0; i < 60; i++)
      expect(pickGesture('neutral', 'quidditch', null, rand)).not.toBe('teacup')
  })

  it('선물·다가가기에는 곧바로 반응하고, 싫어하는 선물에는 토라진다', () => {
    for (const item of [...GIFTS, ...TOUCHES])
      expect(reactionFor(item.id), item.id).not.toBeNull()
    expect(reactionFor('candy')).toMatchObject({ emotion: 'annoyed', gesture: 'armsCrossed' })
    expect(reactionFor('lily')).toMatchObject({ prop: 'bouquet' })
    expect(reactionFor('pat')?.effects).toContain('pat')
    expect(reactionFor('dodge')?.effects).toContain('hmph')
    expect(reactionFor('nothing')).toBeNull()
  })

  it('표정과 효과 표가 모든 감정에 있다', () => {
    for (const e of EMOTIONS) {
      expect(EXPRESSIONS[e]).toBeDefined()
      expect(EMOTION_EFFECTS[e]).toBeDefined()
    }
    expect(SCENES.length).toBeGreaterThan(0)
    // 호감도가 높을수록 볼이 조금 더 붉다
    expect(blushFor(EXPRESSIONS.neutral, 95)).toBeGreaterThan(blushFor(EXPRESSIONS.neutral, 30))
  })
})

describe('계절·시간 차림새', () => {
  it('할로윈 무렵에는 마녀 모자, 크리스마스 무렵에는 호랑가시', () => {
    expect(lookFor(new Date(2026, 9, 31, 20), 'manor').witchHat).toBe(true)
    expect(lookFor(new Date(2026, 10, 1, 20), 'manor').witchHat).toBe(false)
    expect(lookFor(new Date(2026, 11, 24, 20), 'manor').holly).toBe(true)
    expect(lookFor(new Date(2026, 6, 1, 12), 'manor')).toEqual({ witchHat: false, holly: false, scarf: false, snow: false, sleepy: false })
  })

  it('겨울이나 눈 오는 호그스미드에서는 목도리, 늦은 밤에는 졸리다', () => {
    expect(lookFor(new Date(2026, 0, 10, 12), 'garden').scarf).toBe(true)
    expect(lookFor(new Date(2026, 6, 10, 12), 'hogsmeade')).toMatchObject({ scarf: true, snow: true })
    expect(lookFor(new Date(2026, 6, 10, 23, 30), 'manor').sleepy).toBe(true)
    expect(lookFor(new Date(2026, 6, 10, 4, 59), 'manor').sleepy).toBe(true)
    expect(lookFor(new Date(2026, 6, 10, 5, 0), 'manor').sleepy).toBe(false)
  })
})

describe('그리기', () => {
  const finite = (d: string) => !/NaN|Infinity/.test(d)

  it('소매와 손', () => {
    const s = sleeve({ x: 72, y: 254 }, { x: 100, y: 330 }, { x: 116, y: 196 })
    expect(finite(s.upper + s.fore + s.lace + s.sheen)).toBe(true)
    expect(s.upper.startsWith('M')).toBe(true)
    expect(handPaths('hidden')).toBeNull()
    for (const shape of ['tips', 'open', 'hold', 'point'] as const)
      expect(handPaths(shape)?.glove).toMatch(/Z$/)
  })

  it('입: 말할 때는 벌어지고, 다물면 선만 남는다', () => {
    expect(mouthPaths('smile', 0).inner).toBeNull()
    expect(mouthPaths('smile', 0.8).inner).not.toBeNull()
    expect(mouthPaths('o', 0).inner).not.toBeNull()
    expect(mouthPaths('laugh', 0).tongue).not.toBeNull()
  })

  it('세로 롤과 부채', () => {
    const lock = ringlet(-1, 6)
    expect(finite(lock.outline)).toBe(true)
    expect(lock.outline.endsWith('Z')).toBe(true)
    expect(lock.bands.length).toBeGreaterThanOrEqual(4)
    // 오른쪽 롤은 왼쪽 롤의 거울상
    expect(ringlet(1, 0).outline).not.toBe(ringlet(-1, 0).outline)
    const fan = fanOpenPaths({ x: 180, y: 240 }, -2, 1)
    expect(finite(fan.leaf + fan.ribs + fan.scallops)).toBe(true)
  })
})
