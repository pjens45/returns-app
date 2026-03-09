import { useState, useRef, useEffect } from 'react'

const ISSUE_CATEGORIES = [
  { label: "Barcode won't scan", desc: 'Damaged, smudged, or missing barcode' },
  { label: "Don't know what this item is", desc: 'No label or unfamiliar product' },
  { label: "Contents don't match label", desc: 'What\'s inside doesn\'t match the box' },
  { label: 'App problem', desc: 'Something in the app isn\'t working right' },
  { label: 'Something else', desc: 'Anything not listed above' },
]

export default function ReportIssueModal({ trackingNumber, onSubmit, onCancel }) {
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submittedCategory, setSubmittedCategory] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (category) => {
    onSubmit(category, note.trim())
    setSubmittedCategory(category)
    setSubmitted(true)
  }

  // After submission — "set it aside" confirmation
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold text-white">Issue Reported</h2>
          <p className="text-beige text-sm">
            <span className="text-yellow-300 font-semibold">{submittedCategory}</span> has been logged
            {trackingNumber && <> for box <span className="font-mono text-air-blue">{trackingNumber}</span></>}.
          </p>
          <div className="px-5 py-4 rounded-xl bg-air-blue/10 border border-air-blue/30">
            <p className="text-white font-bold text-base">Set this item aside and continue scanning.</p>
            <p className="text-beige/70 text-xs mt-1">A notification has been sent — someone will follow up.</p>
          </div>
          <button
            onClick={onCancel}
            className="w-full py-4 rounded-xl bg-air-blue text-white font-bold text-lg hover:bg-air-blue/80 transition"
          >
            Got It
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-yellow-300">Report an Issue</h2>
          <p className="text-beige text-sm mt-1">
            What's going on?
            {trackingNumber && (
              <span className="block text-xs text-air-blue/60 mt-0.5 font-mono">
                Box: {trackingNumber}
              </span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          {ISSUE_CATEGORIES.map(({ label, desc }) => (
            <button
              key={label}
              onClick={() => handleSubmit(label)}
              className="w-full text-left px-5 py-3.5 rounded-lg bg-deako-black/50 text-white border border-yellow-500/20 hover:border-yellow-500 hover:bg-yellow-500/10 transition"
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="block text-xs text-beige/50 mt-0.5">{desc}</span>
            </button>
          ))}
        </div>

        <div className="pt-2 border-t border-air-blue/10">
          <p className="text-xs text-beige/60 mb-2">Add a note (optional):</p>
          <input
            ref={inputRef}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe what you noticed..."
            className="w-full px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-yellow-500 text-sm"
          />
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
