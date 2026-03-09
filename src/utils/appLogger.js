import { db } from '../db/database'

/**
 * Lightweight app logger — writes to IndexedDB for local debugging.
 * All calls are fire-and-forget (never block UI).
 * Categories: scan, sync, session, app
 * Levels: info, warn, error
 */

const MAX_LOGS = 5000
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function write(level, category, message, context = {}) {
  try {
    db.appLogs.add({
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      context: JSON.stringify(context).slice(0, 2000),
      operatorId: context.operatorId || '',
      sessionId: context.sessionId || '',
    }).catch(() => {}) // swallow write failures
  } catch {
    // noop — never crash the app for a log
  }
}

export function logInfo(category, message, context) {
  write('info', category, message, context)
}

export function logWarn(category, message, context) {
  write('warn', category, message, context)
}

export function logError(category, message, context) {
  write('error', category, message, context)
}

/**
 * Prune old logs — call once on app init.
 * Keeps at most MAX_LOGS entries and removes anything older than 7 days.
 */
export async function pruneAppLogs() {
  try {
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString()
    await db.appLogs.where('timestamp').below(cutoff).delete()

    const count = await db.appLogs.count()
    if (count > MAX_LOGS) {
      const excess = count - MAX_LOGS
      const oldest = await db.appLogs.orderBy('timestamp').limit(excess).primaryKeys()
      await db.appLogs.bulkDelete(oldest)
    }
  } catch {
    // noop
  }
}
