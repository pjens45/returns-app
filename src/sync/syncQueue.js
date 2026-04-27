import { db } from '../db/database'

/**
 * Enqueue a scan record snapshot for sync.
 * This is always fast (IndexedDB write only) and never blocks the UI.
 */
export async function enqueueSync(scanRecord) {
  await db.syncQueue.add({
    recordId: scanRecord.scanUuid || scanRecord.id,
    payload: JSON.parse(JSON.stringify(scanRecord)), // snapshot
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  })
}

/**
 * Get pending queue items (attempts < 5), ordered by enqueuedAt.
 */
export async function getPending(limit = 50) {
  const all = await db.syncQueue
    .where('attempts')
    .below(5)
    .sortBy('enqueuedAt')
  return all.slice(0, limit)
}

/**
 * Delete successfully synced queue items by their ids.
 */
export async function dequeueProcessed(ids) {
  await db.syncQueue.bulkDelete(ids)
}

/**
 * Mark a queue item as failed — increment attempts, store error.
 */
export async function markFailed(id, error) {
  const item = await db.syncQueue.get(id)
  if (!item) return
  await db.syncQueue.update(id, {
    attempts: (item.attempts || 0) + 1,
    lastError: String(error).slice(0, 500),
  })
}

/**
 * Count of items still pending (attempts < 5).
 */
export async function getPendingCount() {
  return await db.syncQueue.where('attempts').below(5).count()
}

/**
 * Count of items that have failed (attempts >= 5).
 */
export async function getFailedCount() {
  return await db.syncQueue.where('attempts').aboveOrEqual(5).count()
}

/**
 * Get last successful sync time from settings.
 */
export async function getLastSuccessTime() {
  const setting = await db.settings.get('syncLastSuccess')
  return setting?.value || null
}

/**
 * Store last successful sync time in settings.
 */
export async function setLastSuccessTime(isoString) {
  await db.settings.put({ key: 'syncLastSuccess', value: isoString })
}

/**
 * Clear all failed items from the queue (attempts >= 5).
 * Use when failures are stale (e.g. data already synced via a previous race condition).
 */
export async function clearFailed() {
  const failed = await db.syncQueue.where('attempts').aboveOrEqual(5).toArray()
  if (failed.length > 0) {
    await db.syncQueue.bulkDelete(failed.map(f => f.id))
  }
  return failed.length
}
