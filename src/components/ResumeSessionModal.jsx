import { formatTimestamp } from '../utils/helpers'

export default function ResumeSessionModal({ session, onResume, onStartFresh }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass-solid rounded-2xl p-8 max-w-md w-full mx-4 space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🔄</div>
          <h2 className="text-xl font-bold text-white">Session Interrupted</h2>
          <p className="text-beige mt-2 text-sm">
            Looks like your last session didn't end cleanly. Would you like to pick up where you left off?
          </p>
        </div>

        <div className="px-4 py-3 rounded-lg bg-deako-black/40 border border-air-blue/10 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-air-blue/60">Started</span>
            <span className="text-white font-medium">{formatTimestamp(session.startTime)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-air-blue/60">Operator</span>
            <span className="text-white font-medium">{session.operatorId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-air-blue/60">Scans recorded</span>
            <span className="text-white font-medium">{session.scanCount ?? '—'}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onStartFresh}
            className="flex-1 px-4 py-3 rounded-lg border border-air-blue/30 text-air-blue hover:bg-air-blue/10 transition font-medium"
          >
            Start Fresh
          </button>
          <button
            onClick={onResume}
            className="flex-1 px-4 py-3 rounded-lg bg-moss text-white hover:bg-moss-dark transition font-medium"
          >
            Resume Session
          </button>
        </div>
      </div>
    </div>
  )
}
