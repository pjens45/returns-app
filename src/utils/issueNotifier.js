/**
 * Fire-and-forget notifications via Apps Script JSONP.
 * Never blocks the UI — failures are silently swallowed.
 */

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL || ''
const WEBHOOK_SECRET = import.meta.env.VITE_SHEETS_WEBHOOK_SECRET || ''

function fireJsonp(params) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) return
  const cbName = '_cb_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now()
  params.set('secret', WEBHOOK_SECRET)
  params.set('cb', cbName)
  params.set('_', Date.now().toString())

  const url = WEBHOOK_URL + '?' + params.toString()
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

export function sendIssueNotification({ category, note, trackingNumber, operatorName, timestamp, deviceId }) {
  fireJsonp(new URLSearchParams({
    action: 'issueReport',
    category,
    note: note || '',
    trackingNumber: trackingNumber || '',
    operatorName: operatorName || '',
    timestamp,
    deviceId: deviceId || '',
  }))
}

export function sendUnknownProductAlert({ serialValue, prefix, operatorName, trackingNumber, timestamp, deviceId }) {
  fireJsonp(new URLSearchParams({
    action: 'unknownProduct',
    serialValue,
    prefix: prefix || '',
    trackingNumber: trackingNumber || '',
    operatorName: operatorName || '',
    timestamp,
    deviceId: deviceId || '',
  }))
}

export function sendLogExport(logs) {
  // Send a summary of warn/error logs via email
  const summary = logs.map(l =>
    `[${l.level.toUpperCase()}] ${l.timestamp} [${l.category}] ${l.message}`
  ).join('\n')

  // Truncate to fit in URL (JSONP limit)
  const truncated = summary.length > 4000 ? summary.slice(0, 4000) + '\n... (truncated)' : summary

  fireJsonp(new URLSearchParams({
    action: 'logExport',
    logCount: String(logs.length),
    summary: truncated,
    timestamp: new Date().toISOString(),
  }))
}
