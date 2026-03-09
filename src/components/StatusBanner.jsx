import { useEffect, useState } from 'react'

export default function StatusBanner({ message, type, onDismiss }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    if (type !== 'discard' && type !== 'discard-lot' && type !== 'duplicate') {
      const t = setTimeout(() => {
        setVisible(false)
        onDismiss?.()
      }, 2500)
      return () => clearTimeout(t)
    }
  }, [message, type, onDismiss])

  if (!visible || !message) return null

  const styles = {
    success: 'bg-moss/20 border-moss text-moss',
    error: 'bg-terra/20 border-terra text-terra',
    discard: 'bg-terra/30 border-terra text-terra discard-alert',
    'discard-lot': 'bg-yellow-500/20 border-yellow-500 text-yellow-300 discard-alert',
    flag: 'bg-yellow-500/15 border-yellow-500/60 text-yellow-300',
    duplicate: 'bg-air-blue/20 border-air-blue text-air-blue',
    info: 'bg-air-blue/10 border-air-blue/50 text-air-blue',
  }

  return (
    <div className={`w-full px-6 py-4 rounded-xl border-2 text-center text-lg font-semibold transition-all ${styles[type] || styles.info}`}>
      {message}
    </div>
  )
}
