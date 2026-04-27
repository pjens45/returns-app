import { useState } from 'react'
import { flushNow } from '../sync/syncEngine'
import { clearFailed } from '../sync/syncQueue'

const DOT_COLORS = {
  healthy: 'bg-moss',
  pending: 'bg-yellow-400',
  error: 'bg-terra',
}

const LABEL = {
  healthy: 'Synced',
  pending: 'Syncing...',
  error: 'Sync issue',
}

function timeAgo(isoString) {
  if (!isoString) return 'Never'
  const elapsed = Date.now() - new Date(isoString).getTime()
  if (elapsed < 60_000) return 'Just now'
  if (elapsed < 3600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  return `${Math.floor(elapsed / 3600_000)}h ago`
}

export default function SyncHealthIndicator({ pending, failed, lastSuccess, health }) {
  const [expanded, setExpanded] = useState(false)

  const handleClearFailed = async () => {
    await clearFailed()
    setExpanded(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-air-blue/10 transition"
        title={LABEL[health] || 'Sync status'}
      >
        <span className={`w-2 h-2 rounded-full ${DOT_COLORS[health] || DOT_COLORS.healthy} ${health === 'pending' ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] text-air-blue/50 font-medium hidden sm:inline">{LABEL[health]}</span>
      </button>

      {expanded && (
        <div className="absolute top-full left-0 mt-1 w-56 glass-solid rounded-lg p-4 z-50 space-y-2 shadow-lg border border-air-blue/20">
          <div className="flex justify-between text-xs">
            <span className="text-air-blue/60">Last synced</span>
            <span className="text-white font-medium">{timeAgo(lastSuccess)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-air-blue/60">Pending</span>
            <span className={`font-medium ${pending > 0 ? 'text-yellow-400' : 'text-white'}`}>{pending}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-air-blue/60">Failed</span>
            <span className={`font-medium ${failed > 0 ? 'text-terra' : 'text-white'}`}>{failed}</span>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => { flushNow(); setExpanded(false) }}
              className="flex-1 text-xs px-3 py-1.5 rounded-md bg-air-blue/15 text-air-blue hover:bg-air-blue/25 transition font-medium"
            >
              Flush Now
            </button>
            {failed > 0 && (
              <button
                onClick={handleClearFailed}
                className="flex-1 text-xs px-3 py-1.5 rounded-md bg-terra/15 text-terra hover:bg-terra/25 transition font-medium"
              >
                Clear Failed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
