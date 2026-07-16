/** 전역 토스트 / 로딩 상태 (가벼운 pub-sub) */

export type ToastKind = 'info' | 'success' | 'error'

export type ToastItem = {
  id: number
  message: string
  kind: ToastKind
}

type UiState = {
  toasts: ToastItem[]
  globalLoading: boolean
  loadingMessage: string
}

let state: UiState = {
  toasts: [],
  globalLoading: false,
  loadingMessage: '',
}

let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function getUiState(): UiState {
  return state
}

export function subscribeUi(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showToast(message: string, kind: ToastKind = 'info') {
  const id = nextId++
  state = { ...state, toasts: [...state.toasts, { id, message, kind }] }
  emit()
  window.setTimeout(() => dismissToast(id), 3200)
}

export function dismissToast(id: number) {
  state = { ...state, toasts: state.toasts.filter((t) => t.id !== id) }
  emit()
}

export function setGlobalLoading(loading: boolean, message = '처리 중...') {
  state = {
    ...state,
    globalLoading: loading,
    loadingMessage: loading ? message : '',
  }
  emit()
}
