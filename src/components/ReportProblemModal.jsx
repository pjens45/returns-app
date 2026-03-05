import { useState, useRef, useEffect } from 'react'

const QUICK_REASONS = [
  'Heat damage / burn marks',
  'Water damage',
  'Cracked or broken housing',
  'Unusual odor',
  'Missing parts',
  'Wrong item in box',
]

export default function ReportProblemModal({ scan, onSubmit, onCancel }) {
  const [reason, setReason] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (text) => {
    const r = text || reason.trim()
    if (!r) return
    onSubmit(scan.id, r)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-white">Report a Problem</h2>
          <p className="text-beige text-sm mt-1">
            What's wrong with <span className="font-mono text-air-blue">{scan.value}</span>?
          </p>
        </div>

        <div className="space-y-2">
          {QUICK_REASONS.map(r => (
            <button
              key={r}
              onClick={() => handleSubmit(r)}
              className="w-full text-left px-5 py-3.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 hover:border-terra hover:bg-terra/10 transition text-sm font-medium"
            >
              {r}
            </button>
          ))}
        </div>

        <div className="pt-2 border-t border-air-blue/10">
          <p className="text-xs text-beige/60 mb-2">Or type your own reason:</p>
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) handleSubmit() }}
              placeholder="Describe the problem..."
              className="flex-1 px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-air-blue text-sm"
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!reason.trim()}
              className="px-5 py-3 rounded-lg bg-terra text-white font-medium hover:bg-terra-dark transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="w-full px-4 py-3 rounded-lg border border-air-blue/20 text-air-blue/70 hover:bg-air-blue/10 transition font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
