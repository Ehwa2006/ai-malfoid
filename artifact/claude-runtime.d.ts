// 클로드 앱이 아티팩트 페이지에 넣어 주는 window.claude (이 페이지가 쓰는 것만)
import type { SampleFn } from './claudeChat'

export type Voice = 'buttery' | 'airy' | 'glassy' | 'rounded'

export interface TtsLine {
  text: string
  voice?: Voice
  language?: string
}

export interface Tts {
  add: (what: string | TtsLine[]) => Promise<{ playedMs: number }>
  stop: () => Promise<void>
  onState: (handler: (e: { state: 'idle' | 'starting' | 'speaking' | 'paused', reason?: string }) => void) => () => void
  languages?: () => Promise<string[]>
}

export interface Dictation {
  start: (options?: { language?: string }) => Promise<void>
  stop: () => Promise<void>
  onPartial: (handler: (e: { text: string }) => void) => () => void
  onFinal: (handler: (e: { text: string }) => void) => () => void
  onState: (handler: (e: { state: 'idle' | 'starting' | 'listening' | 'finishing', reason?: string }) => void) => () => void
}

interface CapabilityMap {
  sample: SampleFn
  tts: Tts
  dictation: Dictation
}

declare global {
  interface Window {
    claude?: { use: <K extends keyof CapabilityMap>(name: K) => Promise<CapabilityMap[K] | null> }
  }
}
