/**
 * Fire-and-forget email notification when an operator reports an issue.
 * Uses a JSONP call to an Apps Script endpoint (same deployment as sync).
 * Never blocks the UI — failures are silently swallowed.
 */

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL || ''
const WEBHOOK_SECRET = import.meta.env.VITE_SHEETS_WEBHOOK_SECRET || ''

export function sendIssueNotification({ category, note, trackingNumber, operatorName, timestamp, deviceId }) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) return

  const cbName = '_issueCb_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now()
  const params = new URLSearchParams({
    secret: WEBHOOK_SECRET,
    action: 'issueReport',
    cb: cbName,
    category,
    note: note || '',
    trackingNumber: trackingNumber || '',
    operatorName: operatorName || '',
    timestamp,
    deviceId: deviceId || '',
    _: Date.now().toString(),
  })

  const url = WEBHOOK_URL + '?' + params.toString()

  // JSONP fire-and-forget
  const script = document.createElement('script')
  window[cbName] = () => { cleanup() }
  script.src = url
  script.onerror = () => { cleanup() }

  const timer = setTimeout(() => { cleanup() }, 10_000)

  function cleanup() {
    clearTimeout(timer)
    delete window[cbName]
    if (script.parentNode) script.parentNode.removeChild(script)
  }

  document.head.appendChild(script)
}
