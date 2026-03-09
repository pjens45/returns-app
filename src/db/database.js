import Dexie from 'dexie'

export const db = new Dexie('ReturnsCheckIn')

// Handle version-upgrade blocks (e.g. old tab holding older schema)
db.on('blocked', () => {
  console.warn('[Dexie] DB upgrade blocked — close other tabs and refresh.')
})

db.version(3).stores({
  users: 'id, username, role',
  sessions: 'id, operatorId, startTime, endTime, status',
  scans: '++id, sessionId, operatorId, timestamp, scanType, value, status, trackingNumber',
  discardList: 'serial',
  settings: 'key',
})

db.version(4).stores({
  users: 'id, username, role',
  sessions: 'id, operatorId, startTime, endTime, status',
  scans: '++id, sessionId, operatorId, timestamp, scanType, value, status, trackingNumber',
  discardList: 'serial',
  settings: 'key',
  syncQueue: '++id, recordId, enqueuedAt, attempts',
})

db.version(5).stores({
  users: 'id, username, role',
  sessions: 'id, operatorId, startTime, endTime, status',
  scans: '++id, sessionId, operatorId, timestamp, scanType, value, status, trackingNumber',
  discardList: 'serial',
  discardLots: '++id, lot',
  settings: 'key',
  syncQueue: '++id, recordId, enqueuedAt, attempts',
})

db.version(6).stores({
  users: 'id, username, role',
  sessions: 'id, operatorId, startTime, endTime, status',
  scans: '++id, sessionId, operatorId, timestamp, scanType, value, status, trackingNumber',
  discardList: 'serial',
  discardLots: '++id, lot',
  settings: 'key',
  syncQueue: '++id, recordId, enqueuedAt, attempts',
  appLogs: '++id, timestamp, level, category',
})

// Get or create a stable device ID for this workstation
export async function getDeviceId() {
  const existing = await db.settings.get('deviceId')
  if (existing?.value) return existing.value
  const id = crypto.randomUUID()
  await db.settings.put({ key: 'deviceId', value: id })
  return id
}

// Seed defaults on first run
export async function seedDatabase() {
  const adminExists = await db.users.get('admin')
  if (!adminExists) {
    await db.users.put({
      id: 'admin',
      username: 'admin',
      password: 'admin',
      role: 'admin',
      mode: 'tracking_serial',
      securityQuestion: 'What is the default password?',
      securityAnswer: 'admin',
      createdAt: new Date().toISOString(),
    })
  }

  const timeoutSetting = await db.settings.get('sessionTimeout')
  if (!timeoutSetting) {
    await db.settings.put({ key: 'sessionTimeout', value: 30 })
  }

  // Seed UPC-allowed products (products without serial/lot that can be checked in via UPC barcode)
  const DEFAULT_UPC_PRODUCTS = [
    'Multiway Rocker Switch (3 and 4-Way)',
    '1-Gang Faceplate',
    '1-Gang Faceplate (Holly)',
    '1-Gang Faceplate (Mushroom)',
    '2-Gang Faceplate',
    '2-Gang Faceplate (Holly)',
    '2-Gang Faceplate (Mushroom)',
    '3-Gang Faceplate',
    '4-Gang Faceplate',
  ]
  const upcSetting = await db.settings.get('upcAllowedProducts')
  if (!upcSetting || (Array.isArray(upcSetting.value) && upcSetting.value.length === 0)) {
    await db.settings.put({ key: 'upcAllowedProducts', value: DEFAULT_UPC_PRODUCTS })
  }

  // Seed discard list
  const discardExists = await db.discardList.get('130A001386013543')
  if (!discardExists) {
    await db.discardList.put({ serial: '130A001386013543', reason: 'Test discard item', addedBy: 'admin', addedAt: new Date().toISOString() })
  }

  // Seed discard lots
  const existingLots = await db.discardLots.where('lot').equals('167202').count()
  if (!existingLots) {
    await db.discardLots.put({ lot: '167202', productType: 'Simple Dimmer', reason: 'Simple dimmer — discard', addedBy: 'admin', addedAt: new Date().toISOString() })
  }
  const existingLots2 = await db.discardLots.where('lot').equals('167203').count()
  if (!existingLots2) {
    await db.discardLots.put({ lot: '167203', productType: 'Simple Dimmer', reason: 'Simple dimmer — discard', addedBy: 'admin', addedAt: new Date().toISOString() })
  }
}
