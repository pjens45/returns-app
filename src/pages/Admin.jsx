import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db, getDeviceId } from '../db/database'
import { generateCSV, generateCSVRows, CSV_HEADERS, generateTrackingSummaryCSV, downloadCSV, formatTimestamp, PRODUCT_PREFIX_MAP } from '../utils/helpers'
import { getPendingCount, getFailedCount, getLastSuccessTime, enqueueSync } from '../sync/syncQueue'
import { flushNow } from '../sync/syncEngine'
import { logInfo } from '../utils/appLogger'

const MODES = [
  { value: 'tracking_only', label: 'Tracking Only' },
  { value: 'serial_only', label: 'Serial Only' },
  { value: 'tracking_serial', label: 'Tracking + Serial' },
]

export default function Admin() {
  const { user, logout, sessionTimeout, setSessionTimeout } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [discardList, setDiscardList] = useState([])
  const [discardLots, setDiscardLots] = useState([])
  const [timeoutVal, setTimeoutVal] = useState(sessionTimeout)
  const [upcAllowedProducts, setUpcAllowedProducts] = useState([])

  // New user form
  const [newUser, setNewUser] = useState({ username: '', password: '', mode: 'tracking_serial', securityQuestion: '', securityAnswer: '' })
  const [newDiscard, setNewDiscard] = useState('')
  const [newDiscardLot, setNewDiscardLot] = useState('')
  const [newDiscardLotProduct, setNewDiscardLotProduct] = useState('')
  const [newDiscardLotReason, setNewDiscardLotReason] = useState('')
  const [message, setMessage] = useState('')

  // Logs
  const [logs, setLogs] = useState([])
  const [logFilter, setLogFilter] = useState('all') // all, warn, error

  // Sync status
  const [syncPending, setSyncPending] = useState(0)
  const [syncFailed, setSyncFailed] = useState(0)
  const [syncLastSuccess, setSyncLastSuccess] = useState(null)
  const [devDeviceId, setDevDeviceId] = useState('')

  useEffect(() => {
    loadData()
  }, [tab])

  // Load logs when logs tab is active
  useEffect(() => {
    if (tab !== 'logs') return
    const loadLogs = async () => {
      try {
        const allLogs = await db.appLogs.orderBy('timestamp').reverse().limit(500).toArray()
        setLogs(allLogs)
      } catch { setLogs([]) }
    }
    loadLogs()
    const id = setInterval(loadLogs, 5000)
    return () => clearInterval(id)
  }, [tab])

  // Poll sync status every 5s when sync tab is active
  useEffect(() => {
    if (tab !== 'sync') return
    const loadSyncStatus = async () => {
      setSyncPending(await getPendingCount())
      setSyncFailed(await getFailedCount())
      setSyncLastSuccess(await getLastSuccessTime())
    }
    loadSyncStatus()
    if (import.meta.env.DEV) getDeviceId().then(setDevDeviceId)
    const id = setInterval(loadSyncStatus, 5000)
    return () => clearInterval(id)
  }, [tab])

  const loadData = async () => {
    const allUsers = await db.users.toArray()
    setUsers(allUsers)
    const allSessions = await db.sessions.orderBy('startTime').reverse().toArray()
    setSessions(allSessions)
    const allDiscards = await db.discardList.toArray()
    setDiscardList(allDiscards)
    const allDiscardLots = await db.discardLots.toArray()
    setDiscardLots(allDiscardLots)
    const upcSetting = await db.settings.get('upcAllowedProducts')
    setUpcAllowedProducts(upcSetting?.value || [])
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!newUser.username || !newUser.password) {
      setMessage('Username and password required')
      return
    }
    const exists = await db.users.where('username').equals(newUser.username).first()
    if (exists) {
      setMessage('Username already exists')
      return
    }
    await db.users.put({
      id: newUser.username,
      username: newUser.username,
      password: newUser.password,
      role: 'operator',
      mode: newUser.mode,
      securityQuestion: newUser.securityQuestion || 'What is your favorite color?',
      securityAnswer: newUser.securityAnswer || 'blue',
      createdAt: new Date().toISOString(),
    })
    setNewUser({ username: '', password: '', mode: 'tracking_serial', securityQuestion: '', securityAnswer: '' })
    setMessage('User created')
    loadData()
  }

  const handleDeleteUser = async (id) => {
    if (id === 'admin') return
    await db.users.delete(id)
    loadData()
  }

  const handleModeChange = async (userId, mode) => {
    await db.users.update(userId, { mode })
    loadData()
  }

  const handleTimeoutSave = async () => {
    const val = Math.max(1, Math.min(120, Math.floor(Number(timeoutVal))))
    if (isNaN(val)) {
      setMessage('Invalid timeout value')
      return
    }
    await db.settings.put({ key: 'sessionTimeout', value: val })
    setSessionTimeout(val)
    setTimeoutVal(val)
    setMessage(`Timeout set to ${val} minutes`)
  }

  const handleExportCSV = async () => {
    const count = await db.scans.count()
    if (!count) {
      setMessage('No scan data to export')
      return
    }
    const filename = `returns-export-${new Date().toISOString().slice(0, 10)}.csv`
    const CHUNK_SIZE = 5000

    if (count > 10000) {
      // Paginated approach for large datasets
      const csvParts = [CSV_HEADERS.join(',')]
      for (let i = 0; i < count; i += CHUNK_SIZE) {
        setMessage(`Exporting... (${Math.min(i + CHUNK_SIZE, count)} of ${count})`)
        const chunk = await db.scans.offset(i).limit(CHUNK_SIZE).toArray()
        const rows = generateCSVRows(chunk)
        csvParts.push(rows.join('\n'))
      }
      const csv = csvParts.join('\n')
      downloadCSV(csv, filename)
      setMessage(`Exported ${count} records`)
    } else {
      const allScans = await db.scans.toArray()
      const csv = generateCSV(allScans)
      downloadCSV(csv, filename)
      setMessage(`Exported ${count} records`)
    }
  }

  const handleExportTrackingSummary = async () => {
    const allScans = await db.scans.toArray()
    if (!allScans.length) {
      setMessage('No scan data to export')
      return
    }
    const csv = generateTrackingSummaryCSV(allScans)
    const lineCount = csv.split('\n').length - 1 // minus header
    const filename = `returns-tracking-summary-${new Date().toISOString().slice(0, 10)}.csv`
    downloadCSV(csv, filename)
    setMessage(`Exported tracking summary: ${lineCount} tracking groups`)
  }

  const handleAddDiscard = async (e) => {
    e.preventDefault()
    const serial = newDiscard.trim().toUpperCase()
    if (!serial || serial.length !== 16) {
      setMessage('Serial must be 16 characters')
      return
    }
    await db.discardList.put({ serial, reason: 'Added by admin', addedBy: user.id, addedAt: new Date().toISOString() })
    setNewDiscard('')
    setMessage('Added to discard list')
    loadData()
  }

  const handleRemoveDiscard = async (serial) => {
    await db.discardList.delete(serial)
    loadData()
  }

  const handleAddDiscardLot = async (e) => {
    e.preventDefault()
    const lot = newDiscardLot.trim()
    if (!lot || !/^\d{4,10}$/.test(lot)) {
      setMessage('Lot number must be 4–10 digits')
      return
    }
    if (!newDiscardLotProduct) {
      setMessage('Please select a product type')
      return
    }
    // Check for existing entry with same lot + product
    const existing = await db.discardLots.where('lot').equals(lot).toArray()
    if (existing.some(e => e.productType === newDiscardLotProduct)) {
      setMessage(`Lot ${lot} / ${newDiscardLotProduct} is already on the discard list`)
      return
    }
    await db.discardLots.put({ lot, productType: newDiscardLotProduct, reason: newDiscardLotReason.trim() || 'Added by admin', addedBy: user.id, addedAt: new Date().toISOString() })
    setNewDiscardLot('')
    setNewDiscardLotProduct('')
    setNewDiscardLotReason('')
    setMessage(`Lot ${lot} (${newDiscardLotProduct}) added to discard list`)
    loadData()
  }

  const handleRemoveDiscardLot = async (id) => {
    await db.discardLots.delete(id)
    loadData()
  }

  const handleToggleUpcProduct = async (productName) => {
    const current = [...upcAllowedProducts]
    const idx = current.indexOf(productName)
    if (idx >= 0) {
      current.splice(idx, 1)
    } else {
      current.push(productName)
    }
    await db.settings.put({ key: 'upcAllowedProducts', value: current })
    setUpcAllowedProducts(current)
    setMessage(idx >= 0 ? `${productName} removed from UPC check-in` : `${productName} enabled for UPC check-in`)
  }

  const handleResetPassword = async (userId) => {
    await db.users.update(userId, { password: 'reset123' })
    setMessage(`Password reset to "reset123" for ${userId}`)
  }

  const handleSendTestRecord = async () => {
    const now = new Date().toISOString()
    const deviceId = await getDeviceId()
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const suffix = Array.from({ length: 13 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const fakeSerial = '322' + suffix
    const fakeScan = {
      scanUuid: crypto.randomUUID(),
      deviceId,
      sessionId: 'test-session-' + Date.now(),
      operatorId: user.id,
      scanType: 'Serial',
      value: fakeSerial,
      productType: '',
      status: 'OK',
      notes: 'DEV test record',
      trackingNumber: '1ZTEST00000000000',
      carrier: '',
      timestamp: now,
      updatedAt: now,
      voidedAt: null,
      voidReason: '',
      escalationReason: '',
    }
    await enqueueSync(fakeScan)
    flushNow()
    setMessage(`Test record enqueued (${fakeSerial}) — flush triggered`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass-solid header-glow px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">Admin Panel</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/scan')}
            className="text-sm px-4 py-2 rounded-lg bg-moss text-white font-medium hover:bg-moss-dark transition"
          >
            Start Scanning
          </button>
          <button
            onClick={() => { logout(); navigate('/') }}
            className="text-xs px-3 py-1.5 rounded-lg border border-terra/30 text-terra hover:bg-terra/10 transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
        {/* Hero CTA */}
        <button
          onClick={() => navigate('/scan')}
          className="w-full py-7 mb-6 rounded-2xl bg-moss text-white text-2xl font-black uppercase tracking-wider hover:bg-moss-dark transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          Start Scanning
        </button>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'users', label: 'Users' },
            { id: 'settings', label: 'Settings' },
            { id: 'discard', label: 'Discard List' },
            { id: 'sessions', label: 'Sessions' },
            { id: 'export', label: 'Export' },
            { id: 'sync', label: 'Sync' },
            { id: 'logs', label: 'Logs' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMessage('') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-air-blue text-white'
                  : 'bg-deako-black/40 text-air-blue/60 hover:text-air-blue border border-air-blue/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {message && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-air-blue/10 border border-air-blue/20 text-air-blue text-sm">
            {message}
          </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="space-y-6">
            <div className="glass rounded-xl p-6">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider mb-4">Current Users</h2>
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-deako-black/30 border border-air-blue/10">
                    <span className="font-medium text-white flex-1">{u.username}</span>
                    <span className={`text-xs px-2 py-1 rounded ${u.role === 'admin' ? 'bg-terra/20 text-terra' : 'bg-air-blue/20 text-air-blue'}`}>
                      {u.role}
                    </span>
                    <select
                      value={u.mode}
                      onChange={(e) => handleModeChange(u.id, e.target.value)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none"
                    >
                      {MODES.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    {u.id !== 'admin' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="text-xs px-2 py-1 rounded border border-air-blue/20 text-air-blue/60 hover:text-air-blue transition"
                        >
                          Reset PW
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-xs px-2 py-1 rounded border border-terra/20 text-terra/60 hover:text-terra transition"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-xl p-6">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider mb-4">Create Operator</h2>
              <form onSubmit={handleCreateUser} className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Username"
                  value={newUser.username}
                  onChange={(e) => setNewUser(p => ({ ...p, username: e.target.value }))}
                  className="px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue text-sm"
                />
                <input
                  type="text"
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))}
                  className="px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue text-sm"
                />
                <select
                  value={newUser.mode}
                  onChange={(e) => setNewUser(p => ({ ...p, mode: e.target.value }))}
                  className="px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none text-sm"
                >
                  {MODES.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Security Question"
                  value={newUser.securityQuestion}
                  onChange={(e) => setNewUser(p => ({ ...p, securityQuestion: e.target.value }))}
                  className="px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue text-sm"
                />
                <input
                  type="text"
                  placeholder="Security Answer"
                  value={newUser.securityAnswer}
                  onChange={(e) => setNewUser(p => ({ ...p, securityAnswer: e.target.value }))}
                  className="px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-moss text-white hover:bg-moss-dark transition font-medium text-sm"
                >
                  Create User
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {tab === 'settings' && (
          <div className="space-y-6">
            <div className="glass rounded-xl p-6 space-y-6">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider">Session Settings</h2>
              <div className="flex items-center gap-4">
                <label className="text-sm text-beige">Inactivity Timeout (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={timeoutVal}
                  onChange={(e) => setTimeoutVal(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue text-sm"
                />
                <button
                  onClick={handleTimeoutSave}
                  className="px-4 py-2 rounded-lg bg-moss text-white hover:bg-moss-dark transition text-sm font-medium"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="glass rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider">UPC Barcode Check-In</h2>
              <p className="text-xs text-air-blue/40">
                Products enabled here can be checked in by scanning the UPC barcode on the packaging.
                Only enable this for products that do NOT have a serial number or lot ID.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(PRODUCT_PREFIX_MAP).map(([prefix, name]) => {
                  const enabled = upcAllowedProducts.includes(name)
                  return (
                    <button
                      key={prefix}
                      onClick={() => handleToggleUpcProduct(name)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition text-left ${
                        enabled
                          ? 'bg-moss/15 border-moss/40 text-white'
                          : 'bg-deako-black/30 border-air-blue/10 text-air-blue/40'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                        enabled ? 'bg-moss text-white' : 'bg-deako-black/50 border border-air-blue/20'
                      }`}>
                        {enabled ? '✓' : ''}
                      </span>
                      <span className="font-mono text-xs text-air-blue/60">{prefix}</span>
                      <span className="text-sm font-medium">{name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Discard List Tab */}
        {tab === 'discard' && (
          <div className="space-y-6">
            <div className="glass rounded-xl p-6">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider mb-4">Discard List</h2>
              <form onSubmit={handleAddDiscard} className="flex gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Serial number (16 chars)"
                  value={newDiscard}
                  onChange={(e) => setNewDiscard(e.target.value.toUpperCase())}
                  maxLength={16}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue font-mono text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-terra text-white hover:bg-terra-dark transition text-sm font-medium"
                >
                  Add to Discard
                </button>
              </form>
              <div className="space-y-2">
                {discardList.map(d => (
                  <div key={d.serial} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-deako-black/30 border border-terra/10">
                    <span className="font-mono text-sm text-white flex-1">{d.serial}</span>
                    <span className="text-xs text-air-blue/50">{d.reason}</span>
                    <span className="text-xs text-air-blue/40">{formatTimestamp(d.addedAt)}</span>
                    <button
                      onClick={() => handleRemoveDiscard(d.serial)}
                      className="text-xs px-2 py-1 rounded border border-terra/20 text-terra/60 hover:text-terra transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {discardList.length === 0 && (
                  <p className="text-sm text-air-blue/40 text-center py-4">No serial discards</p>
                )}
              </div>
            </div>

            {/* Discard Lots */}
            <div className="glass rounded-xl p-6">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider mb-2">Discard Lots</h2>
              <p className="text-xs text-air-blue/40 mb-4">Lot numbers flagged here will trigger an action-needed alert during scanning. The scan is still recorded with Discard status.</p>
              <form onSubmit={handleAddDiscardLot} className="flex gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  placeholder="Lot number"
                  value={newDiscardLot}
                  onChange={(e) => setNewDiscardLot(e.target.value.replace(/\D/g, ''))}
                  maxLength={10}
                  className="w-32 px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue font-mono text-sm"
                />
                <select
                  value={newDiscardLotProduct}
                  onChange={(e) => setNewDiscardLotProduct(e.target.value)}
                  className="w-52 px-3 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none text-sm"
                >
                  <option value="">Select product...</option>
                  {Object.entries(PRODUCT_PREFIX_MAP).map(([prefix, name]) => (
                    <option key={prefix} value={name}>{name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={newDiscardLotReason}
                  onChange={(e) => setNewDiscardLotReason(e.target.value)}
                  className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-deako-black/50 text-white border border-air-blue/20 outline-none focus:border-air-blue text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-terra text-white hover:bg-terra-dark transition text-sm font-medium"
                >
                  Add Lot
                </button>
              </form>
              <div className="space-y-2">
                {discardLots.map(d => (
                  <div key={d.id} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-deako-black/30 border border-terra/10">
                    <span className="font-mono text-sm text-white font-bold">{d.lot}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-terra/15 text-terra">{d.productType}</span>
                    <span className="text-xs text-air-blue/50 flex-1">{d.reason}</span>
                    <span className="text-xs text-air-blue/40">{formatTimestamp(d.addedAt)}</span>
                    <button
                      onClick={() => handleRemoveDiscardLot(d.id)}
                      className="text-xs px-2 py-1 rounded border border-terra/20 text-terra/60 hover:text-terra transition"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {discardLots.length === 0 && (
                  <p className="text-sm text-air-blue/40 text-center py-4">No lot discards</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {tab === 'sessions' && (
          <div className="glass rounded-xl p-6">
            <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider mb-4">Recent Sessions</h2>
            <div className="space-y-2">
              {sessions.slice(0, 50).map(s => (
                <div key={s.id} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-deako-black/30 border border-air-blue/10">
                  <span className="font-mono text-xs text-air-blue/60">{s.id.slice(0, 8)}</span>
                  <span className="text-sm text-white">{s.operatorId}</span>
                  <span className="text-xs text-air-blue/50">{formatTimestamp(s.startTime)}</span>
                  <span className="text-xs text-air-blue/50">&rarr; {s.endTime ? formatTimestamp(s.endTime) : 'Active'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${s.status === 'active' ? 'bg-moss/20 text-moss' : 'bg-air-blue/10 text-air-blue/50'}`}>
                    {s.status}
                  </span>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="text-sm text-air-blue/40 text-center py-4">No sessions yet</p>
              )}
            </div>
          </div>
        )}

        {/* Export Tab */}
        {tab === 'export' && (
          <div className="space-y-6">
            <div className="glass rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider">Scan Event Log</h2>
              <p className="text-sm text-beige">
                Full event log — one row per scan event. Includes void/escalation detail columns.
              </p>
              <button
                onClick={handleExportCSV}
                className="px-6 py-3 rounded-lg bg-moss text-white hover:bg-moss-dark transition font-semibold"
              >
                Export Scan Log CSV
              </button>
            </div>
            <div className="glass rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider">Tracking Summary</h2>
              <p className="text-sm text-beige">
                One row per tracking number — serial counts, product mix, escalation/discard counts. Best for "what was in each box?"
              </p>
              <button
                onClick={handleExportTrackingSummary}
                className="px-6 py-3 rounded-lg bg-air-blue text-white hover:bg-air-blue/80 transition font-semibold"
              >
                Export Tracking Summary CSV
              </button>
            </div>
          </div>
        )}

        {/* Sync Tab */}
        {tab === 'sync' && (
          <div className="glass rounded-xl p-6 space-y-6">
            <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider">Google Sheets Sync</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="px-4 py-3 rounded-lg bg-deako-black/30 border border-air-blue/10 text-center">
                <div className={`text-2xl font-bold ${syncPending > 0 ? 'text-yellow-400' : 'text-moss'}`}>{syncPending}</div>
                <div className="text-xs text-air-blue/50 mt-1">Pending</div>
              </div>
              <div className="px-4 py-3 rounded-lg bg-deako-black/30 border border-air-blue/10 text-center">
                <div className={`text-2xl font-bold ${syncFailed > 0 ? 'text-terra' : 'text-moss'}`}>{syncFailed}</div>
                <div className="text-xs text-air-blue/50 mt-1">Failed</div>
              </div>
              <div className="px-4 py-3 rounded-lg bg-deako-black/30 border border-air-blue/10 text-center">
                <div className="text-sm font-medium text-white">{syncLastSuccess ? formatTimestamp(syncLastSuccess) : 'Never'}</div>
                <div className="text-xs text-air-blue/50 mt-1">Last Success</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => { flushNow(); setMessage('Sync flush triggered') }}
                className="px-6 py-3 rounded-lg bg-air-blue text-white hover:bg-air-blue/80 transition font-semibold"
              >
                Flush Now
              </button>
              {import.meta.env.DEV && (
                <button
                  onClick={handleSendTestRecord}
                  className="px-6 py-3 rounded-lg bg-moss text-white hover:bg-moss-dark transition font-semibold border border-dashed border-moss/60"
                  title="DEV only — enqueues a fake scan and flushes"
                >
                  Send Test Record
                </button>
              )}
              <p className="text-sm text-beige">
                Sync runs automatically every 60 seconds. Use Flush Now to trigger immediately.
              </p>
            </div>
            {!import.meta.env.VITE_SHEETS_WEBHOOK_URL && (
              <div className="px-4 py-3 rounded-lg bg-terra/10 border border-terra/20 text-terra text-sm">
                Webhook not configured. Set VITE_SHEETS_WEBHOOK_URL and VITE_SHEETS_WEBHOOK_SECRET in .env.local and restart the dev server.
              </div>
            )}
            {import.meta.env.DEV && (
              <div className="px-4 py-3 rounded-lg bg-deako-black/40 border border-air-blue/10 font-mono text-xs text-air-blue/40 space-y-1">
                <div>webhook: {(() => { try { const u = new URL(import.meta.env.VITE_SHEETS_WEBHOOK_URL || ''); return u.hostname + '/\u2026' + u.pathname.slice(-6) } catch { return '(not set)' } })()}</div>
                <div>deviceId: {devDeviceId || '\u2026'}</div>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {tab === 'logs' && (
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-air-blue uppercase tracking-wider">App Logs</h2>
              <div className="flex gap-2">
                {['all', 'warn', 'error'].map(f => (
                  <button
                    key={f}
                    onClick={() => setLogFilter(f)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      logFilter === f
                        ? 'bg-air-blue text-white'
                        : 'bg-deako-black/40 text-air-blue/50 hover:text-air-blue border border-air-blue/10'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'warn' ? 'Warnings' : 'Errors'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {logs
                .filter(l => logFilter === 'all' || l.level === logFilter)
                .map(l => (
                  <div
                    key={l.id}
                    className={`px-3 py-2 rounded-lg text-xs border ${
                      l.level === 'error' ? 'bg-terra/10 border-terra/20 text-terra' :
                      l.level === 'warn' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300' :
                      'bg-deako-black/30 border-air-blue/10 text-beige/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-air-blue/40">{formatTimestamp(l.timestamp)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        l.level === 'error' ? 'bg-terra/20 text-terra' :
                        l.level === 'warn' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-air-blue/15 text-air-blue/60'
                      }`}>{l.level}</span>
                      <span className="text-air-blue/40">{l.category}</span>
                    </div>
                    <p className="text-white/90">{l.message}</p>
                    {l.context && l.context !== '{}' && (
                      <details className="mt-1">
                        <summary className="text-air-blue/30 cursor-pointer hover:text-air-blue/50 text-[10px]">context</summary>
                        <pre className="mt-1 text-[10px] text-air-blue/40 font-mono whitespace-pre-wrap break-all">{l.context}</pre>
                      </details>
                    )}
                  </div>
                ))}
              {logs.filter(l => logFilter === 'all' || l.level === logFilter).length === 0 && (
                <p className="text-sm text-air-blue/40 text-center py-8">
                  {logFilter === 'all' ? 'No logs yet' : `No ${logFilter} logs`}
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
