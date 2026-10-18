import { ref, watch, type Ref } from 'vue'

export function useStoredRef<T>(key: string, initial: T): Ref<T> {
  let value = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null)
      value = JSON.parse(raw) as T
  }
  catch {}

  const state = ref(value) as Ref<T>
  watch(state, (v) => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    }
    catch {}
  }, { deep: true })
  return state
}
