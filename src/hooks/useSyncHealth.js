import { useState, useEffect, useRef } from 'react'
import { getPendingCount, getFailedCount, getLastSuccessTime } from '../sync/syncQueue'

/**
 * Polls sync queue status every 10s and returns health state.
 * health: 'healthy' | 'pending' | 'error'
 */
export function useSyncHealth() {
  const [state, setState] = useState({
    pending: 0,
    failed: 0,
    lastSuccess: null,
    health: 'healthy',
  })
  const intervalRef = useRef(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const [pending, failed, lastSuccess] = await Promise.all([
          getPendingCount(),
          getFailedCount(),
          getLastSuccessTime(),
        ])

        let health = 'healthy'
        if (failed > 0) {
          health = 'error'
        } else if (lastSuccess) {
          const elapsed = Date.now() - new Date(lastSuccess).getTime()
          if (elapsed > 5 * 60_000) {
            health = 'error'
          } else if (pending > 2 || elapsed > 2 * 60_000) {
            health = 'pending'
          }
        } else if (pending > 0) {
          health = 'pending'
        }

        setState({ pending, failed, lastSuccess, health })
      } catch {
        // noop — don't break the UI if polling fails
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 10_000)
    return () => clearInterval(intervalRef.current)
  }, [])

  return state
}
