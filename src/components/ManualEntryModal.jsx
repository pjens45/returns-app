import { useState, useRef, useEffect } from 'react'

/**
 * Context-aware manual entry modal.
 *
 * entryMode = 'tracking' → "Enter Box Tracking Number" (single input, required)
 * entryMode = 'serial'   → "Enter Item Serial" (serial input + optional notes)
 *
 * In serial mode an operator can toggle to "new box" mode if they need to
 * manually type a tracking number that their scanner can't read.
 */
export default function ManualEntryModal({ entryMode, onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [overrideToTracking, setOverrideToTracking] = useState(false)
  const inputRef = useRef(null)

  const isTracking = entryMode === 'tracking' || overrideToTracking

  useEffect(() => { inputRef.current?.focus() }, [])

  // Reset fields when toggling modes
  const handleToggle = () => {
    setValue('')
    setNote('')
    setOverrideToTracking(prev => !prev)
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const canSubmit = isTracking
    ? value.trim().length > 0
    : (value.trim().length > 0 || note.trim().length > 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      value: value.trim(),
      note: isTracking ? '' : note.trim(),
      forceTracking: overrideToTracking,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="glass-solid rounded-2xl p-8 max-w-md w-full mx-4 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-white">
            {isTracking ? '📦 Enter Box Tracking Number' : '🔧 Enter Item Serial'}
          </h2>
          <p className="text-air-blue text-sm mt-1">
            {isTracking
              ? 'Type or paste the tracking number from the shipping label.'
              : 'Type or paste the serial number, or log a free-form note.'}
          </p>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isTracking ? 'Tracking number...' : 'Serial number...'}
          className="w-full px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-air-blue font-mono"
        />

        {!isTracking && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Notes (optional)"
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-deako-black/50 text-white border border-air-blue/30 outline-none focus:border-air-blue resize-none"
          />
        )}

        {/* Toggle: let operator switch between serial ↔ tracking when a box is active */}
        {entryMode === 'serial' && (
          <button
            type="button"
            onClick={handleToggle}
            className="w-full text-left px-4 py-2.5 rounded-lg border border-dashed border-air-blue/20 text-air-blue/70 hover:bg-air-blue/10 transition text-xs"
          >
            {overrideToTracking
              ? '↩️ Actually, I need to enter an Item Serial'
              : '📦 Actually, I need to enter a new Box Tracking Number'}
          </button>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-lg border border-air-blue/30 text-air-blue hover:bg-air-blue/10 transition font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 px-4 py-3 rounded-lg bg-moss text-white hover:bg-moss-dark transition font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isTracking ? 'Add Box' : 'Add Item'}
          </button>
        </div>
      </form>
    </div>
  )
}
