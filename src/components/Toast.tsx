import { useState, useCallback } from 'react'

export interface ToastItem {
  id: number
  title: string
  msg: string
  type: 'success' | 'error' | 'info'
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((title: string, msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, title, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  return { toasts, addToast }
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  const icon = { success: '✅', error: '❌', info: 'ℹ️' }
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`} style={{ pointerEvents: 'all' }}>
          <div className="toast-icon">{icon[t.type]}</div>
          <div>
            <div className="toast-title">{t.title}</div>
            <div className="toast-msg">{t.msg}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
