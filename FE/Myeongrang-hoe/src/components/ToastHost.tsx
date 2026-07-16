import { useSyncExternalStore } from 'react'
import { dismissToast, getUiState, subscribeUi } from '../store/ui'

export default function ToastHost() {
  const ui = useSyncExternalStore(subscribeUi, getUiState, getUiState)

  return (
    <>
      {ui.globalLoading && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/20">
          <div className="rounded-[8px] bg-white px-[20px] py-[14px] shadow-lg">
            <p className="text-[13px] font-medium text-[var(--heading)]">{ui.loadingMessage}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-[110] flex flex-col items-center gap-[8px] px-[16px]">
        {ui.toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className={`pointer-events-auto max-w-[370px] rounded-[8px] px-[14px] py-[11px] text-left text-[13px] font-medium shadow-lg ${
              t.kind === 'error'
                ? 'bg-[#c62828] text-white'
                : t.kind === 'success'
                  ? 'bg-[var(--primary-deep)] text-white'
                  : 'bg-[var(--heading)] text-white'
            }`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </>
  )
}
