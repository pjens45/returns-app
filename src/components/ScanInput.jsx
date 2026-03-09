import { useRef, useEffect, useCallback } from 'react'

/**
 * Hidden, always-focused input that captures keyboard-wedge barcode scans.
 *
 * "Stubborn focus" strategy — three layers of defense:
 *
 * 1. PREVENT:  Global mousedown listener calls preventDefault() on clicks
 *    targeting non-interactive elements (divs, spans, body) so the browser
 *    never moves focus away from the hidden input in the first place.
 *
 * 2. RECOVER:  onBlur fires a triple-tap refocus (10 / 50 / 150ms) to
 *    survive React render-cycle race conditions after button clicks.
 *
 * 3. FALLBACK: 300ms setInterval polling catches anything the first two
 *    layers miss (e.g. browser dev-tools, OS-level focus changes).
 *
 * All three layers respect two rules:
 *   - Never refocus when `disabled` is true (a modal with its own inputs is open).
 *   - Never steal focus from another <input>, <textarea>, or <select>
 *     (defense-in-depth for any modal that forgets to set disabled).
 */
export default function ScanInput({ onScan, placeholder, disabled }) {
  const inputRef = useRef(null)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  /** Conditionally grab focus — respects disabled state + modal inputs */
  const grabFocus = useCallback(() => {
    if (disabledRef.current) return

    // Don't steal focus from modal inputs / textareas / selects
    const active = document.activeElement
    if (
      active &&
      active !== inputRef.current &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
    ) {
      return
    }

    // setTimeout(0) ensures we run after the current React commit phase,
    // avoiding the "focus is set then immediately stolen" race.
    setTimeout(() => {
      if (!disabledRef.current) {
        inputRef.current?.focus({ preventScroll: true })
      }
    }, 0)
  }, [])

  // ── Layer 1: PREVENT ──────────────────────────────────────────────
  // Stop non-interactive clicks from moving focus to <body> / <div>s.
  useEffect(() => {
    const handler = (e) => {
      if (disabledRef.current) return

      const el = e.target
      const tag = el.tagName

      // Allow normal interaction with form controls and buttons
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        el.closest('button') ||
        el.closest('a')
      ) {
        return
      }

      // Prevent the browser from blurring the hidden input
      e.preventDefault()
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Layer 1b: RECOVER after button clicks ─────────────────────────
  // Buttons legitimately receive focus on click; grab it back once the
  // click event has fully propagated and React has re-rendered.
  useEffect(() => {
    const handler = () => {
      // Stagger two attempts to survive React batched renders
      setTimeout(() => grabFocus(), 10)
      setTimeout(() => grabFocus(), 80)
    }

    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [grabFocus])

  // ── Layer 3: FALLBACK polling ─────────────────────────────────────
  // Also handles the initial focus when `disabled` flips to false
  // (i.e. modal just closed).
  useEffect(() => {
    if (disabled) return

    // Immediate focus with delay to survive the React commit that just
    // flipped `disabled` from true → false (modal closing).
    const boot = setTimeout(() => grabFocus(), 10)

    // Aggressive polling — barcode guns send chars in ~50ms, so 100ms
    // ensures we recapture focus before the next scan arrives
    const interval = setInterval(grabFocus, 100)

    return () => {
      clearTimeout(boot)
      clearInterval(interval)
    }
  }, [disabled, grabFocus])

  // ── Scan handling ─────────────────────────────────────────────────

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputRef.current.value.trim()) {
      e.preventDefault()
      onScan(inputRef.current.value.trim())
      inputRef.current.value = ''
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = (e.clipboardData || window.clipboardData).getData('text').trim()
    if (pasted) {
      onScan(pasted)
      inputRef.current.value = ''
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 10)
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      autoFocus
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      placeholder={placeholder || ''}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      // ── Layer 2: RECOVER on blur ────────────────────────────────
      // Triple-tap at staggered intervals to beat React render races.
      onBlur={() => {
        if (!disabledRef.current) {
          grabFocus()
          setTimeout(() => grabFocus(), 10)
          setTimeout(() => grabFocus(), 30)
          setTimeout(() => grabFocus(), 60)
        }
      }}
      className="opacity-0 pointer-events-none"
      style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1 }}
      tabIndex={0}
    />
  )
}
