// 대화가 일어나는 장소. 모델이 답변마다 하나를 고르면 화면의 장소 표시와 배경 색이 바뀐다.
export const SCENES = ['manor', 'garden', 'tearoom', 'hogsmeade', 'quidditch', 'library', 'london'] as const
export type Scene = typeof SCENES[number]

export const SCENE_INFO: Record<Scene, { label: string, icon: string, /** 배경 그라데이션 */ sky: string }> = {
  manor: { label: '말포이 저택 응접실', icon: '🏰', sky: 'radial-gradient(120% 90% at 30% 0%, #2c3b31 0%, #121a15 60%, #0b0f0d 100%)' },
  garden: { label: '말포이 저택 정원', icon: '🌹', sky: 'radial-gradient(120% 90% at 30% 0%, #2f4a2f 0%, #15241a 60%, #0b120d 100%)' },
  tearoom: { label: '런던의 찻집', icon: '🫖', sky: 'radial-gradient(120% 90% at 30% 0%, #4a3a2a 0%, #241b14 60%, #120e0b 100%)' },
  hogsmeade: { label: '호그스미드', icon: '❄️', sky: 'radial-gradient(120% 90% at 30% 0%, #36405a 0%, #1a2030 60%, #0d1018 100%)' },
  quidditch: { label: '퀴디치 경기장', icon: '🧹', sky: 'radial-gradient(120% 90% at 30% 0%, #2d4a5c 0%, #15232e 60%, #0a1117 100%)' },
  library: { label: '저택 서재', icon: '📚', sky: 'radial-gradient(120% 90% at 30% 0%, #3d2f22 0%, #1f1811 60%, #100c09 100%)' },
  london: { label: '런던 거리', icon: '🌆', sky: 'radial-gradient(120% 90% at 30% 0%, #3a3346 0%, #1c1824 60%, #0e0c12 100%)' },
}

export function isScene(value: unknown): value is Scene {
  return SCENES.includes(value as Scene)
}
