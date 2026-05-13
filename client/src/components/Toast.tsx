import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'error' | 'info'
  onDismiss: () => void
}

export function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded text-sm font-mono shadow-lg border ${
        type === 'error'
          ? 'bg-mantle border-red text-red'
          : 'bg-mantle border-blue text-blue'
      }`}
    >
      {message}
      <button onClick={onDismiss} className="ml-4 opacity-60 hover:opacity-100">✕</button>
    </div>
  )
}
