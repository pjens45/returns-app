import { getPending, dequeueProcessed, markFailed, setLastSuccessTime } from './syncQueue'
import { scanToSheetRecord } from './syncHelpers'
import { logInfo, logWarn, logError } from '../utils/appLogger'

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL || ''
const WEBHOOK_SECRET = import.meta.env.VITE_SHEETS_WEBHOOK_SECRET || ''

const TICK_INTERVAL = 60_000      // 60s
const BATCH_SIZE = 10             // records per JSONP request
const MAX_PER_FLUSH = 50          // max queue items per flush
const JSONP_TIMEOUT = 15_000      // 15s timeout per request
const MAX_CONCURRENCY = 1         // serialise requests to avoid Apps Script contention
const MAX_URL_LENGTH = 7000       // browsers silently truncate ~8k; stay well under

let intervalId = null
let running = false

// ---------- PUBLIC API ----------

export function start() {
  if (intervalId) return
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) return
  intervalId = setInterval(tick, TICK_INTERVAL)
  // Run first tick after a short delay to let app settle
  setTimeout(tick, 5_000)
}

export function stop() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function flushNow() {
  tick() // fire-and-forget
}

// ---------- SYNC TICK ----------

async function tick() {
  if (running) return
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) return
  running = true

  try {
    const pending = await getPending(MAX_PER_FLUSH)
    if (pending.length === 0) return
    logInfo('sync', `Sync tick: ${pending.length} pending`, { count: pending.length })

    // Split into chunks of BATCH_SIZE
    const chunks = []
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      chunks.push(pending.slice(i, i + BATCH_SIZE))
    }

    // Process chunks with limited concurrency
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
      const batch = chunks.slice(i, i + MAX_CONCURRENCY)
      await Promise.all(batch.map(chunk => processChunk(chunk)))
    }
  } catch (err) {
    console.error('[SyncEngine] tick error:', err)
    logError('sync', 'Sync tick error', { error: String(err) })
  } finally {
    running = false
  }
}

async function processChunk(queueItems) {
  const records = queueItems.map(item => scanToSheetRecord(item.payload))
  const reqId = crypto.randomUUID()
  const urlLen = measureUrl(records, reqId)

  // URL too long — split and retry smaller sub-chunks
  if (urlLen > MAX_URL_LENGTH) {
    if (queueItems.length <= 1) {
      // Single record still too long — mark failed, don't retry forever
      for (const item of queueItems) {
        await markFailed(item.id, `JSONP URL too long (len=${urlLen})`)
      }
      return
    }
    const mid = Math.ceil(queueItems.length / 2)
    await processChunk(queueItems.slice(0, mid))
    await processChunk(queueItems.slice(mid))
    return
  }

  try {
    const resp = await sendJsonpBatch(records, reqId)

    if (resp && resp.ok) {
      await dequeueProcessed(queueItems.map(item => item.id))
      await setLastSuccessTime(new Date().toISOString())
      logInfo('sync', `Chunk synced: ${records.length} records`, { batchSize: records.length })
    } else {
      const error = resp?.error || 'Unknown error from server'
      for (const item of queueItems) {
        await markFailed(item.id, `Server error: ${error} (urlLen=${urlLen}, batchSize=${records.length})`)
      }
      logWarn('sync', 'Chunk failed (server)', { error, batchSize: records.length })
    }
  } catch (err) {
    for (const item of queueItems) {
      await markFailed(item.id, `${String(err)} (urlLen=${urlLen}, batchSize=${records.length})`)
    }
    logError('sync', 'Chunk failed (exception)', { error: String(err), batchSize: records.length })
  }
}

// ---------- JSONP TRANSPORT ----------

function base64url(str) {
  // Encode string to UTF-8 bytes, then base64, then URL-safe
  const utf8Bytes = new TextEncoder().encode(str)
  const binaryStr = Array.from(utf8Bytes, b => String.fromCharCode(b)).join('')
  const b64 = btoa(binaryStr)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function buildUrl(records, reqId) {
  const cbName = '_syncCb_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now()
  const cacheBust = Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const payload = base64url(JSON.stringify({ records }))

  return {
    cbName,
    url: WEBHOOK_URL
      + '?secret=' + encodeURIComponent(WEBHOOK_SECRET)
      + '&cb=' + encodeURIComponent(cbName)
      + '&reqId=' + encodeURIComponent(reqId)
      + '&payload=' + encodeURIComponent(payload)
      + '&_=' + cacheBust,
  }
}

function measureUrl(records, reqId) {
  return buildUrl(records, reqId).url.length
}

function sendJsonpBatch(records, reqId) {
  return new Promise((resolve, reject) => {
    const { cbName, url } = buildUrl(records, reqId)

    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('JSONP timeout after ' + JSONP_TIMEOUT + 'ms'))
      }
    }, JSONP_TIMEOUT)

    window[cbName] = (resp) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        cleanup()
        resolve(resp)
      }
    }

    const script = document.createElement('script')
    script.src = url
    script.onerror = () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        cleanup()
        reject(new Error('JSONP script load error'))
      }
    }

    function cleanup() {
      delete window[cbName]
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }

    document.head.appendChild(script)
  })
}

// ---------- AUTO-START ----------

if (WEBHOOK_URL && WEBHOOK_SECRET) {
  start()
}
