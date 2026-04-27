import { useState, useRef, useEffect } from 'react'

const PRODUCT_CATEGORIES = [
  { label: "Barcode won't scan", desc: 'Damaged, smudged, or missing barcode' },
  { label: "Don't know what this item is", desc: 'No label or unfamiliar product' },
  { label: "Contents don't match label", desc: 'What\'s inside doesn\'t match the box' },
  { label: 'Something else', desc: 'Anything not listed above' },
]

export default function ReportIssueModal({ trackingNumber, onSubmit, onCancel }) {
  const [mode, setMode] = useState(null) // null = top menu, 'product' | 'app'
  const [note, setNote] = useState('')
  const [appNote, setAppNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submittedCategory, setSubmittedCategory] = useState('')
  const [submittedMode, setSubmittedMode] = useState(null)
  const inputRef = useRef(null)
  const appInputRef = useRef(null)

  useEffect(() => {
    if (mode === 'product') inputRef.current?.focus()
    if (mode === 'app') appInputRef.current?.focus()
  }, [mode])

  const handleProductSubmit = (category) => {
    onSubmit(category, note.trim())
    setSubmittedCategory(category)
    setSubmittedMode('product')
    setSubmitted(true)
  }

  const handleAppSubmit = () => {
    if (!appNote.trim()) return
    onSubmit('App problem', appNote.trim())
    setSubmittedCategory('App problem')
    setSubmittedMode('app')
    setSubmitted(true)
  }

  // After submission — confirmation
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold text-white">
            {submittedMode === 'app' ? 'Deako Has Been Notified' : 'Issue Reported'}
          </h2>
          {submittedMode === 'app' ? (
            <p className="text-beige text-sm">
              Your feedback has been sent. Thanks for reporting this — we'll look into it.
            </p>
          ) : (
            <>
              <p className="text-beige text-sm">
                <span className="text-yellow-300 font-semibold">{submittedCategory}</span> has been logged
                {trackingNumber && <> for box <span className="font-mono text-air-blue">{trackingNumber}</span></>}.
              </p>
              <div className="px-5 py-4 rounded-xl bg-air-blue/10 border border-air-blue/30">
                <p className="text-white font-bold text-base">Set this item aside and continue scanning.</p>
                <p className="text-beige/70 text-xs mt-1">A notification has been sent — someone will follow up.</p>
              </div>
            </>
          )}
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

  // App problem screen
  if (mode === 'app') {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-yellow-300">App Problem</h2>
            <p className="text-beige text-sm mt-1">Describe what's not working and we'll look into it.</p>
          </div>

          <textarea
            ref={appInputRef}
            value={appNote}
            onChange={(e) => setAppNote(e.target.value)}
            placeholder="e.g. scan button not responding, screen froze, data not syncing..."
            className="w-full px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-yellow-500 text-sm resize-none"
            rows={4}
          />

          <button
            onClick={handleAppSubmit}
            disabled={!appNote.trim()}
            className={`w-full py-4 rounded-xl font-bold text-lg transition ${
              appNote.trim()
                ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30'
                : 'bg-deako-black/30 border border-air-blue/10 text-beige/30 cursor-not-allowed'
            }`}
          >
            Send Report
          </button>

          <button
            onClick={() => { setMode(null); setAppNote('') }}
            className="w-full px-4 py-3 rounded-lg border border-air-blue/20 text-air-blue/70 hover:bg-air-blue/10 transition font-medium"
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // Product/shipment problem screen
  if (mode === 'product') {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-yellow-300">Product / Shipment Problem</h2>
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
            {PRODUCT_CATEGORIES.map(({ label, desc }) => (
              <button
                key={label}
                onClick={() => handleProductSubmit(label)}
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
            onClick={() => { setMode(null); setNote('') }}
            className="w-full px-4 py-3 rounded-lg border border-air-blue/20 text-air-blue/70 hover:bg-air-blue/10 transition font-medium"
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // Top-level menu: pick a path
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-yellow-300">Help</h2>
          <p className="text-beige text-sm mt-1">What do you need help with?</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setMode('product')}
            className="w-full text-left px-5 py-4 rounded-lg bg-deako-black/50 text-white border border-yellow-500/20 hover:border-yellow-500 hover:bg-yellow-500/10 transition"
          >
            <span className="text-base font-bold">Product / Shipment Problem</span>
            <span className="block text-xs text-beige/50 mt-1">Damaged barcode, wrong contents, can't identify an item</span>
          </button>

          <button
            onClick={() => setMode('app')}
            className="w-full text-left px-5 py-4 rounded-lg bg-deako-black/50 text-white border border-yellow-500/20 hover:border-yellow-500 hover:bg-yellow-500/10 transition"
          >
            <span className="text-base font-bold">App Problem</span>
            <span className="block text-xs text-beige/50 mt-1">Something in the app isn't working right</span>
          </button>
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
