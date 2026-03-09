import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAuth } from '../context/AuthContext'
import { db, getDeviceId } from '../db/database'
import { validateTracking, validateSerial, getProductType, getTrackingRejectReason, isSuspiciousForSerial, isTrackingPattern, detectCarrier, isLotId, resolveLotDeviceType, PRODUCT_PREFIX_MAP, REJECTED_TRACKING_BARCODES, UPC_PRODUCT_MAP } from '../utils/helpers'
import { enqueueSync } from '../sync/syncQueue'
import '../sync/syncEngine' // auto-starts sync timer on import
import ScanInput from '../components/ScanInput'
import DuplicateModal from '../components/DuplicateModal'
import ManualEntryModal from '../components/ManualEntryModal'
import SessionSummary from '../components/SessionSummary'
import ReportProblemModal from '../components/ReportProblemModal'
import { playSuccess, playError, playAction } from '../utils/sounds'
import { logInfo, logWarn, logError, pruneAppLogs } from '../utils/appLogger'
import ReportIssueModal from '../components/ReportIssueModal'
import { sendIssueNotification } from '../utils/issueNotifier'
import ResumeSessionModal from '../components/ResumeSessionModal'
import SyncHealthIndicator from '../components/SyncHealthIndicator'
import { useSyncHealth } from '../hooks/useSyncHealth'

export default function Scanner() {
  const { user, logout, resetInactivity, setOnTimeout, timeoutWarning } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [scans, setScans] = useState([])
  const [status, setStatus] = useState(null)
  const [currentTracking, setCurrentTracking] = useState(null)
  const [failCount, setFailCount] = useState(0)
  const [showManual, setShowManual] = useState(false)
  const [duplicatePrompt, setDuplicatePrompt] = useState(null)
  const [showSummary, setShowSummary] = useState(false)
  const [inputDisabled, setInputDisabled] = useState(false)
  const [voidGroupConfirm, setVoidGroupConfirm] = useState(null) // { trackingValue, serialCount }
  const [suspiciousSerial, setSuspiciousSerial] = useState(null) // { value, reason }
  const [reportProblemScan, setReportProblemScan] = useState(null) // scan object
  const [deviceId, setDeviceId] = useState('')
  const deviceIdRef = useRef('')
  const [lotMode, setLotMode] = useState(false)
  const [showCantScan, setShowCantScan] = useState(false)
  const [showAllDT, setShowAllDT] = useState(false)
  const [pendingUpc, setPendingUpc] = useState(null) // UPC value waiting for product type selection
  const [upcAllowedProducts, setUpcAllowedProducts] = useState([])
  const [lotPartials, setLotPartials] = useState({ lot: null, deviceType: null }) // collected so far
  const lotPartialsRef = useRef({ lot: null, deviceType: null })
  const lotTimeoutRef = useRef(null)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showResumeModal, setShowResumeModal] = useState(null) // interrupted session object or null
  const [isFirstSession, setIsFirstSession] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

  const syncHealth = useSyncHealth()
  const mode = user?.mode || 'tracking_serial'
  const processingRef = useRef(false)
  const sessionRef = useRef(session)
  const scansRef = useRef(scans)
  sessionRef.current = session
  scansRef.current = scans

  // Active (non-voided) scans — used everywhere for counts, logic, display
  const activeScans = scans.filter(s => !s.voidedAt)

  // Load device ID, UPC-allowed products, and prune old logs
  useEffect(() => {
    getDeviceId().then(id => { deviceIdRef.current = id; setDeviceId(id) })
    db.settings.get('upcAllowedProducts').then(s => setUpcAllowedProducts(s?.value || []))
    pruneAppLogs()
  }, [])

  // Start session (with interrupted-session recovery check)
  useEffect(() => {
    const init = async () => {
      // Close any orphaned sessions from OTHER operators, then check for our own
      const activeSessions = await db.sessions.where('status').equals('active').toArray()
      const now = new Date().toISOString()
      for (const s of activeSessions) {
        if (String(s.operatorId) !== String(user.id) && !s.endTime) {
          await db.sessions.update(s.id, { endTime: now, status: 'completed' })
          logInfo('session', 'Auto-closed orphaned session from another user', { sessionId: s.id, operatorId: s.operatorId })
        }
      }
      const interrupted = activeSessions.find(s => !s.endTime && String(s.operatorId) === String(user.id))

      if (interrupted) {
        // Count scans in the interrupted session
        const scanCount = await db.scans.where('sessionId').equals(interrupted.id).count()
        setShowResumeModal({ ...interrupted, scanCount })
        logInfo('session', 'Interrupted session found', { sessionId: interrupted.id, scanCount })
        return // Don't auto-create new session yet
      }

      // First-session detection for onboarding
      const priorSessions = await db.sessions.where('operatorId').equals(user.id).count()
      if (priorSessions === 0) {
        setIsFirstSession(true)
        setShowWelcome(true)
      }

      // Create new session
      const s = {
        id: uuidv4(),
        operatorId: user.id,
        startTime: new Date().toISOString(),
        endTime: null,
        status: 'active',
      }
      await db.sessions.put(s)
      setSession(s)
      logInfo('session', 'Session started', { sessionId: s.id, operatorId: user.id })
      resetInactivity()
    }
    init()
  }, [user, resetInactivity])

  // Handle session resume
  const handleResumeSession = async () => {
    const interrupted = showResumeModal
    setShowResumeModal(null)
    // Restore session
    setSession(interrupted)
    // Load scans from that session
    const sessionScans = await db.scans.where('sessionId').equals(interrupted.id).toArray()
    setScans(sessionScans)
    // Find the last tracking number
    const lastTracking = [...sessionScans].reverse().find(s => s.scanType === 'Tracking' && !s.voidedAt)
    if (lastTracking) setCurrentTracking(lastTracking.value)
    flash('Session resumed', 'success')
    logInfo('session', 'Session resumed', { sessionId: interrupted.id, scanCount: sessionScans.length })
    resetInactivity()
  }

  const handleStartFresh = async () => {
    const interrupted = showResumeModal
    setShowResumeModal(null)
    // End the interrupted session
    const now = new Date().toISOString()
    await db.sessions.update(interrupted.id, { endTime: now, status: 'ended' })
    logInfo('session', 'Interrupted session ended', { sessionId: interrupted.id })
    // Create new session
    const s = {
      id: uuidv4(),
      operatorId: user.id,
      startTime: now,
      endTime: null,
      status: 'active',
    }
    await db.sessions.put(s)
    setSession(s)
    logInfo('session', 'Session started (fresh)', { sessionId: s.id, operatorId: user.id })
    resetInactivity()
  }

  // Inactivity timeout
  useEffect(() => {
    setOnTimeout(() => {
      endSession()
    })
  }, [setOnTimeout])

  // Cleanup: close active session when Scanner unmounts (logout, nav away, tab close)
  useEffect(() => {
    return () => {
      const sid = sessionRef.current?.id
      if (sid && !sessionRef.current?.endTime) {
        const now = new Date().toISOString()
        db.sessions.update(sid, { endTime: now, status: 'completed' }).catch(() => {})
        logInfo('session', 'Session auto-closed on unmount', { sessionId: sid })
      }
    }
  }, [])

  // Cmd/Ctrl+Z for undo
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        undoLastScan()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [scans])

  // --- LOT MODE ---

  const resetLotPartials = () => {
    lotPartialsRef.current = { lot: null, deviceType: null }
    setLotPartials({ lot: null, deviceType: null })
  }

  /** Enter lot mode. Returns true if mode was entered, false if a guard blocked it. */
  const enterLotMode = () => {
    if (mode === 'tracking_only') {
      flash('Lot mode is not available in Tracking Only mode', 'error')
      return false
    }
    // Must have an active box in tracking_serial mode
    if (mode === 'tracking_serial' && !currentTracking) {
      flash('Please scan a Box Tracking Number before adding items by Lot ID', 'error')
      return false
    }
    resetInactivity()
    setLotMode(true)
    resetLotPartials()
    flash('Lot mode active — scan a Lot ID or select a Device Type', 'action')
    // Auto-timeout after 30s
    clearTimeout(lotTimeoutRef.current)
    lotTimeoutRef.current = setTimeout(() => {
      setLotMode(false)
      resetLotPartials()
      setFailCount(0)
      setStatus({ message: 'Lot mode timed out', type: 'error' })
    }, 30_000)
    return true
  }

  const exitLotMode = () => {
    setLotMode(false)
    setShowAllDT(false)
    resetLotPartials()
    clearTimeout(lotTimeoutRef.current)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(lotTimeoutRef.current)
  }, [])

  const handleLotScan = async (value) => {
    resetInactivity()

    // Reset the 30s timer on each scan within lot mode
    clearTimeout(lotTimeoutRef.current)
    lotTimeoutRef.current = setTimeout(() => {
      setLotMode(false)
      resetLotPartials()
      setFailCount(0)
      setStatus({ message: 'Lot mode timed out', type: 'error' })
    }, 30_000)

    const isDT = value.startsWith('DT:') || value.startsWith('dt:')
    const isLot = isLotId(value)

    if (!isDT && !isLot) {
      flash('In Lot mode: scan a Lot ID (6 digits) or Device Type barcode (DT:code)', 'error')
      return
    }

    // Read from ref to avoid stale closure
    let next = { ...lotPartialsRef.current }

    if (isLot) {
      if (next.lot) {
        flash(`Lot ID already scanned (${next.lot}). Scan a Device Type barcode (DT:code) next.`, 'error')
        return
      }
      next.lot = value.trim()
      flash(`Lot ID: ${next.lot} — now select Device Type`, 'action')
    }

    if (isDT) {
      if (next.deviceType) {
        flash(`Device Type already scanned (${next.deviceType}). Scan a Lot ID (6 digits) next.`, 'error')
        return
      }
      const dtCode = value.slice(3).trim()
      if (!dtCode) {
        flash('Device Type barcode is empty — scan a valid DT:code barcode', 'error')
        return
      }
      next.deviceType = resolveLotDeviceType(dtCode)
      flash(`Device Type: ${next.deviceType} — ${next.lot ? 'completing...' : 'now scan Lot ID'}`, next.lot ? 'success' : 'action')
    }

    // Write to ref immediately, then update state for UI
    lotPartialsRef.current = next
    setLotPartials(next)

    // Both collected — create the Lot scan record
    if (next.lot && next.deviceType) {
      // ORPHAN GUARD: ensure a parent box exists in tracking_serial mode
      if (mode === 'tracking_serial' && !currentTracking) {
        flash('Please scan a Box Tracking Number first', 'error')
        exitLotMode()
        return
      }

      // Check if lot + product type is on the discard list
      const matchingDiscardLots = await db.discardLots.where('lot').equals(next.lot).toArray()
      const discardLot = matchingDiscardLots.find(d => d.productType === next.deviceType)

      await addScan({
        scanType: 'Lot',
        value: next.lot,
        productType: next.deviceType,
        status: discardLot ? 'Discard' : 'OK',
        notes: discardLot ? `Discard lot: ${discardLot.reason || ''}` : '',
        trackingNumber: currentTracking,
      })
      if (discardLot) {
        flash(`🚫 DISCARD LOT ${next.lot} — ${next.deviceType}\n${discardLot.reason || 'This lot is flagged for discard'}`, 'discard-lot')
      } else {
        flash(`Lot scan recorded: ${next.lot} — ${next.deviceType}`, 'success')
      }
      // Reset lot mode
      clearTimeout(lotTimeoutRef.current)
      setLotMode(false)
      resetLotPartials()
    }
  }

  const flash = (message, type) => {
    setStatus({ message, type })
    // Audio feedback
    if (type === 'success') playSuccess()
    else if (type === 'action' || type === 'discard-lot' || type === 'flag') playAction()
    else if (type === 'error' || type === 'duplicate' || type === 'discard' || type === 'warning') playError()
    resetInactivity()
  }

  const addScan = async (scanData) => {
    // SAFETY NET: in tracking_serial mode, non-tracking scans MUST have a tracking number
    if (mode === 'tracking_serial' && scanData.scanType !== 'Tracking' && !scanData.trackingNumber) {
      console.error('[ORPHAN BLOCKED] Attempted to save item without tracking:', scanData)
      flash('Error: No active box. Please scan a Box Tracking Number first.', 'error')
      return
    }

    const now = new Date().toISOString()
    const scan = {
      ...scanData,
      scanUuid: crypto.randomUUID(),
      deviceId: deviceIdRef.current,
      sessionId: sessionRef.current.id,
      operatorId: user.id,
      timestamp: now,
      updatedAt: now,
    }
    try {
      const id = await db.scans.add(scan)
      scan.id = id
      setScans(prev => [...prev, scan])
      setFailCount(0)
      enqueueSync(scan)
      logInfo('scan', `${scanData.scanType} recorded: ${scanData.value}`, { scanType: scanData.scanType, value: scanData.value, status: scanData.status, productType: scanData.productType })
    } catch (err) {
      console.error('[DB WRITE FAILED] addScan:', err)
      logError('scan', 'Failed to save scan', { error: String(err), scanType: scanData.scanType, value: scanData.value })
      flash('Failed to save scan — please try again', 'error')
    }
  }

  // --- VOID / UNDO ---

  const voidScan = async (scanId, reason) => {
    const now = new Date().toISOString()
    const voidData = { voidedAt: now, voidedBy: user.id, voidReason: reason || '', updatedAt: now }
    try {
      await db.scans.update(scanId, voidData)
      setScans(prev => prev.map(s => {
        if (s.id === scanId) {
          const updated = { ...s, ...voidData }
          enqueueSync(updated)
          return updated
        }
        return s
      }))
    } catch (err) {
      console.error('[DB WRITE FAILED] voidScan:', err)
      flash('Failed to save scan — please try again', 'error')
    }
  }

  const voidTrackingGroup = async (trackingValue) => {
    const toVoid = scansRef.current.filter(s =>
      !s.voidedAt && (
        (s.scanType === 'Tracking' && s.value === trackingValue) ||
        (s.trackingNumber === trackingValue && s.scanType !== 'Tracking')
      )
    )
    const now = new Date().toISOString()
    const voidData = { voidedAt: now, voidedBy: user.id, voidReason: 'Tracking group removed', updatedAt: now }
    const ids = toVoid.map(s => s.id)
    try {
      await Promise.all(ids.map(id => db.scans.update(id, voidData)))
      setScans(prev => prev.map(s => {
        if (ids.includes(s.id)) {
          const updated = { ...s, ...voidData }
          enqueueSync(updated)
          return updated
        }
        return s
      }))
      // If we just voided the active tracking, clear it
      if (currentTracking === trackingValue) {
        setCurrentTracking(null)
      }
      flash(`Removed tracking group: ${trackingValue}`, 'info')
      setVoidGroupConfirm(null)
    } catch (err) {
      console.error('[DB WRITE FAILED] voidTrackingGroup:', err)
      flash('Failed to save scan — please try again', 'error')
      setVoidGroupConfirm(null)
    }
  }

  const undoLastScan = async () => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      const active = scansRef.current.filter(s => !s.voidedAt)
      if (!active.length) {
        flash('Nothing to undo', 'info')
        return
      }
      const last = active[active.length - 1]
      await voidScan(last.id, 'Undo last scan')
      flash(`Undid: ${last.scanType} — ${last.value}`, 'info')
    } finally {
      processingRef.current = false
    }
  }

  const handleRemoveSerial = async (scanId) => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      await voidScan(scanId, 'Removed by operator')
      flash('Serial removed', 'info')
    } finally {
      processingRef.current = false
    }
  }

  const handleRemoveTrackingGroup = (trackingValue) => {
    if (processingRef.current) return
    const serials = scansRef.current.filter(s =>
      !s.voidedAt && s.scanType !== 'Tracking' && s.trackingNumber === trackingValue
    )
    setVoidGroupConfirm({ trackingValue, serialCount: serials.length })
    setInputDisabled(true)
  }

  // --- SELECT PRIOR TRACKING ---

  const handleSelectTracking = (trackingValue) => {
    setCurrentTracking(trackingValue)
    flash(`Active Tracking set to ${trackingValue}`, 'success')
  }

  // --- SCAN LOGIC (uses activeScans for duplicate/serial checks) ---

  const expectingTracking = () => {
    if (mode === 'tracking_only') return true
    if (mode === 'serial_only') return false
    return currentTracking === null
  }

  const handleScan = useCallback(async (raw) => {
    resetInactivity()
    const value = raw.trim()

    // If in lot mode, route all scans to lot handler
    if (lotMode) {
      return handleLotScan(value)
    }

    // Auto-detect lot IDs: 6 digits → auto-enter lot mode and pre-fill the lot number
    if (mode !== 'tracking_only' && isLotId(value)) {
      const entered = enterLotMode() // may fail if no box in tracking_serial mode
      if (entered) {
        await handleLotScan(value) // pre-fill the lot ID; operator still needs Device Type barcode
      }
      return
    }

    if (mode === 'tracking_only') {
      return handleTrackingScan(value)
    }
    if (mode === 'serial_only') {
      return handleSerialScan(value)
    }

    // tracking_serial mode
    if (currentTracking === null) {
      // STRICT GATING: If this looks like a serial, reject — must scan box first
      if (validateSerial(value)) {
        flash('Please scan a Box Tracking Number first', 'error')
        return
      }
      return handleTrackingScan(value)
    } else {
      // AUTO-DETECT: serial format (exactly 16 uppercase alphanumeric) → item scan
      if (validateSerial(value)) {
        return handleSerialScan(value)
      }
      // If it's a known product barcode (UPC on the box)
      if (REJECTED_TRACKING_BARCODES.has(value.toUpperCase())) {
        // Check if this UPC maps directly to a known product variant
        const mappedProduct = UPC_PRODUCT_MAP[value.toUpperCase()]
        if (mappedProduct && upcAllowedProducts.includes(mappedProduct)) {
          // Auto-identify — log immediately without picker
          await addScan({
            scanType: 'Serial',
            value,
            productType: mappedProduct,
            status: 'OK',
            notes: 'Logged via UPC barcode',
            trackingNumber: currentTracking,
          })
          flash(`${mappedProduct}: ${value} (UPC)`, 'success')
          return
        }
        if (upcAllowedProducts.length > 0) {
          // UPC check-in enabled but no direct mapping — show product picker
          setPendingUpc(value)
          setShowCantScan(true)
          setInputDisabled(true)
          playAction()
          flash('Product UPC scanned — select the product type', 'action')
        } else {
          // No products enabled for UPC check-in
          flash('Product barcode (UPC) scanned. This product has a serial number — scan the QR code on the device.', 'error')
        }
        return
      }
      // Generic UPC/EAN pattern (8-14 digits, all numeric) — reject with helpful message
      if (/^\d{8,14}$/.test(value)) {
        flash('This looks like a product barcode (UPC). Scan the QR code on the device, or use Can\'t Scan.', 'error')
        return
      }
      // Everything else → try as tracking (seamless box switch)
      // handleTrackingScan validates format and shows descriptive error if invalid
      return handleTrackingScan(value)
    }
  }, [mode, currentTracking, lotMode, resetInactivity])

  const lastTrackingScanRef = useRef({ value: '', time: 0 })

  const handleTrackingScan = async (value) => {
    if (!validateTracking(value)) {
      const reason = getTrackingRejectReason(value)
      handleFail(reason || 'Invalid tracking number')
      return
    }

    // Dedup: reject if same tracking scanned within 3 seconds (scanner double-fire)
    const now = Date.now()
    const last = lastTrackingScanRef.current
    if (last.value === value && now - last.time < 3000) {
      return // silently ignore duplicate
    }
    lastTrackingScanRef.current = { value, time: now }

    const carrier = detectCarrier(value)
    await addScan({
      scanType: 'Tracking',
      value,
      productType: '',
      status: 'OK',
      notes: '',
      trackingNumber: value,
      carrier,
    })
    setCurrentTracking(value)
    flash(`Tracking (${carrier}): ${value}`, 'success')
  }

  const handleSerialScan = async (value, forced) => {
    // ORPHAN GUARD: in tracking_serial mode, never save a serial without a parent box
    if (mode === 'tracking_serial' && !currentTracking) {
      flash('Please scan a Box Tracking Number first', 'error')
      return
    }

    if (!validateSerial(value)) {
      handleFail(`Invalid serial: must be exactly 16 uppercase alphanumeric characters`)
      return
    }

    // Check for suspicious patterns (tracking/UPC scanned as serial) — skip if operator already confirmed
    if (!forced && isSuspiciousForSerial(value)) {
      setSuspiciousSerial({ value, reason: 'This looks like a product barcode, not a serial number. Scan the serial number printed directly on the device (the QR/label on the product), not the box barcode.' })
      setInputDisabled(true)
      return
    }

    const discardItem = await db.discardList.get(value)
    if (discardItem) {
      await addScan({
        scanType: 'Serial',
        value,
        productType: getProductType(value),
        status: 'Discard',
        notes: `Discard item: ${discardItem.reason || ''}`,
        trackingNumber: currentTracking,
      })
      flash(`DISCARD ITEM: ${value}`, 'discard')
      return
    }

    // Duplicate check scoped to CURRENT SESSION only (non-voided serials)
    const allMatchingScans = await db.scans.where('value').equals(value).toArray()
    const dupInSession = allMatchingScans.find(s => s.scanType === 'Serial' && !s.voidedAt && s.sessionId === sessionRef.current.id)
    if (dupInSession) {
      flash(`Duplicate — ${value} already scanned in this session`, 'error')
      return
    }

    // Cross-session duplicate warning (informational only, not blocking)
    const crossSessionDup = allMatchingScans.find(s => s.scanType === 'Serial' && !s.voidedAt && s.sessionId !== sessionRef.current.id)

    await addScan({
      scanType: 'Serial',
      value,
      productType: getProductType(value),
      status: 'OK',
      notes: forced ? 'Operator confirmed suspicious scan' : '',
      trackingNumber: currentTracking,
      forced: forced || false,
    })
    if (crossSessionDup) {
      flash(`${getProductType(value)}: ${value} — ⚠️ previously scanned in another session`, 'warning')
    } else {
      flash(`${getProductType(value)}: ${value}`, 'success')
    }
  }

  const handleFail = (msg) => {
    const next = failCount + 1
    setFailCount(next)
    if (next >= 2) {
      flash(`${msg} — Manual entry enabled`, 'error')
      setShowManual(true)
      setInputDisabled(true)
    } else {
      flash(msg, 'error')
    }
  }

  const handleDuplicateDismiss = () => {
    setDuplicatePrompt(null)
    setInputDisabled(false)
  }

  const handleSuspiciousConfirm = async () => {
    const value = suspiciousSerial.value
    setSuspiciousSerial(null)
    setInputDisabled(false)
    // Re-run serial scan with forced=true to skip suspicious check
    await handleSerialScan(value, true)
  }

  const handleSuspiciousCancel = () => {
    setSuspiciousSerial(null)
    setInputDisabled(false)
    flash('Scan discarded', 'info')
  }

  const handleCantScan = async (productType) => {
    const upcValue = pendingUpc
    setShowCantScan(false)
    setShowAllDT(false)
    setInputDisabled(false)
    setPendingUpc(null)
    if (mode === 'tracking_serial' && !currentTracking) {
      flash('Please scan a Box Tracking Number first', 'error')
      return
    }
    if (upcValue) {
      // UPC product scan — log with actual UPC value
      await addScan({
        scanType: 'Serial',
        value: upcValue,
        productType,
        status: 'OK',
        notes: 'Logged via UPC barcode',
        trackingNumber: currentTracking,
      })
      flash(`${productType}: ${upcValue} (UPC)`, 'success')
    } else {
      // Can't Scan — damaged QR
      await addScan({
        scanType: 'Serial',
        value: `UNREADABLE-${Date.now()}`,
        productType,
        status: 'OK',
        notes: 'QR damaged / unreadable',
        trackingNumber: currentTracking,
      })
      flash(`Unreadable ${productType} logged`, 'success')
    }
  }

  const handleManualSubmit = async ({ value, note, forceTracking }) => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      setShowManual(false)
      setInputDisabled(false)
      setFailCount(0) // Reset — intentional manual action

      // If lot mode is active, route manual entry to lot handler (DT:code or lot ID)
      if (lotMode && value) {
        await handleLotScan(value)
        return
      }

      const needsTracking = forceTracking ||
        (mode === 'tracking_only') ||
        (mode === 'tracking_serial' && !currentTracking)

      if (needsTracking) {
        // Route through tracking pipeline — will validate, set currentTracking, flash feedback
        if (!value) return
        await handleTrackingScan(value)
      } else {
        // Serial / item context
        if (value && validateSerial(value)) {
          // Valid serial → serial pipeline
          await handleSerialScan(value)
        } else if (value && isTrackingPattern(value)) {
          // AUTO-DETECT: matches a known carrier format (1Z…, FedEx digits, etc.)
          // → seamless box switch even though operator didn't explicitly toggle
          await handleTrackingScan(value)
        } else if (value && isLotId(value)) {
          // AUTO-DETECT: 6-digit lot ID → enter lot mode with pre-filled lot number
          const entered = enterLotMode()
          if (entered) {
            await handleLotScan(value)
          }
        } else {
          // Freeform manual note (odd item, note-only, etc.)
          await addScan({
            scanType: 'Manual Note',
            value: value || 'N/A',
            productType: value ? getProductType(value) : '',
            status: 'OK',
            notes: note || '',
            trackingNumber: currentTracking,
          })
          flash('Manual entry logged', 'success')
        }
      }
    } finally {
      processingRef.current = false
    }
  }

  const handleToggleEscalation = async (scanId) => {
    if (processingRef.current) return
    processingRef.current = true
    try {
      const scan = scansRef.current.find(s => s.id === scanId)
      if (!scan) return
      const isEscalated = scan.status === 'Escalated'
      const newStatus = isEscalated ? 'OK' : 'Escalated'
      const newNotes = isEscalated
        ? (scan.notes || '').replace(/ ?\[ESCALATED: heat damage\/odor\]/g, '')
        : (scan.notes || '') + ' [ESCALATED: heat damage/odor]'
      const now = new Date().toISOString()
      try {
        await db.scans.update(scanId, { status: newStatus, notes: newNotes, updatedAt: now })
        setScans(prev => prev.map(s => {
          if (s.id === scanId) {
            const updated = { ...s, status: newStatus, notes: newNotes, updatedAt: now }
            enqueueSync(updated)
            return updated
          }
          return s
        }))
        flash(isEscalated ? `Unflagged: ${scan.value}` : `Escalated: ${scan.value}`, isEscalated ? 'info' : 'error')
      } catch (err) {
        console.error('[DB WRITE FAILED] handleToggleEscalation:', err)
        flash('Failed to save scan — please try again', 'error')
      }
    } finally {
      processingRef.current = false
    }
  }

  const handleReportProblem = async (scanId, reason) => {
    const now = new Date().toISOString()
    const newNotes = reason
    await db.scans.update(scanId, { status: 'Escalated', escalationReason: reason, notes: `[PROBLEM: ${reason}]`, updatedAt: now })
    setScans(prev => prev.map(s => {
      if (s.id === scanId) {
        const updated = { ...s, status: 'Escalated', escalationReason: reason, notes: `[PROBLEM: ${reason}]`, updatedAt: now }
        enqueueSync(updated)
        return updated
      }
      return s
    }))
    setReportProblemScan(null)
    setInputDisabled(false)
    flash(`Problem reported: ${reason}`, 'info')
  }

  // --- REPORT AN ISSUE ---
  const handleReportIssue = async (category, note) => {
    setShowFlagModal(false)
    setInputDisabled(false)
    const now = new Date().toISOString()
    const scan = {
      scanUuid: crypto.randomUUID(),
      deviceId: deviceIdRef.current,
      sessionId: sessionRef.current.id,
      operatorId: user.id,
      scanType: 'Manual Note',
      value: `ISSUE-${Date.now()}`,
      productType: '',
      status: 'Flagged',
      escalationReason: category,
      notes: note ? `[ISSUE: ${category}] ${note}` : `[ISSUE: ${category}]`,
      trackingNumber: currentTracking || '',
      carrier: '',
      timestamp: now,
      updatedAt: now,
    }
    try {
      const id = await db.scans.add(scan)
      scan.id = id
      setScans(prev => [...prev, scan])
      enqueueSync(scan)
      sendIssueNotification({
        category,
        note: note || '',
        trackingNumber: currentTracking || '',
        operatorName: user.username,
        timestamp: now,
        deviceId: deviceIdRef.current,
      })
      logInfo('scan', 'Issue reported', { category, hasTracking: !!currentTracking, note: note || '' })
    } catch (err) {
      logError('scan', 'Failed to report issue', { error: String(err) })
      flash('Failed to save report — please try again', 'error')
    }
  }

  const endSession = async () => {
    const endTime = new Date().toISOString()
    if (sessionRef.current) {
      await db.sessions.update(sessionRef.current.id, { endTime, status: 'completed' })
      setSession(prev => ({ ...prev, endTime, status: 'completed' }))
      const itemCount = scansRef.current.filter(s => !s.voidedAt).length
      logInfo('session', 'Session ended', { sessionId: sessionRef.current.id, scanCount: itemCount })
    }
    setShowSummary(true)
  }

  const handleSummaryClose = () => {
    setShowSummary(false)
    logout()
    navigate('/')
  }

  const getPromptText = () => {
    if (lotMode) {
      if (!lotPartials.lot && !lotPartials.deviceType) return 'Scan Lot ID or Device Type barcode...'
      if (!lotPartials.lot) return 'Scan Lot ID (6 digits)...'
      if (!lotPartials.deviceType) return 'Scan Device Type barcode (DT:code)...'
      return 'Completing...'
    }
    if (mode === 'tracking_only') return 'Scan tracking number...'
    if (mode === 'serial_only') return 'Scan serial number...'
    if (currentTracking === null) return 'Scan tracking number first...'
    return 'Scan serial number...'
  }

  // Exclude issue reports from product counts and display
  const productScans = activeScans.filter(s => s.scanType !== 'Manual Note')
  const serialCount = productScans.filter(s => s.scanType === 'Serial' || s.scanType === 'Lot').length
  const trackingCount = productScans.filter(s => s.scanType === 'Tracking').length
  const escalatedCount = productScans.filter(s => s.status === 'Escalated').length
  const currentTrackingSerials = currentTracking
    ? productScans.filter(s => (s.scanType === 'Serial' || s.scanType === 'Lot') && s.trackingNumber === currentTracking).length
    : 0

  // What kind of manual entry is needed right now?
  const manualEntryMode = (mode === 'tracking_only' || (mode === 'tracking_serial' && !currentTracking))
    ? 'tracking'
    : 'serial'

  // Derive "just scanned" = most recent non-tracking, non-issue active scan
  const lastScan = productScans.length > 0 ? productScans[productScans.length - 1] : null

  // Items in the current box (serials/lots under currentTracking — excludes issue reports)
  const currentBoxItems = currentTracking
    ? productScans.filter(s => s.scanType !== 'Tracking' && s.trackingNumber === currentTracking)
    : productScans.filter(s => s.scanType !== 'Tracking')

  // Build instruction text
  const getInstructionText = () => {
    if (lotMode) {
      if (!lotPartials.lot && !lotPartials.deviceType) return 'SCAN LOT ID (6 digits) OR DEVICE TYPE BARCODE'
      if (!lotPartials.lot) return 'NOW SCAN THE LOT ID (6 digits)'
      if (!lotPartials.deviceType) return 'NOW SCAN THE DEVICE TYPE BARCODE (DT:code)'
      return 'COMPLETING...'
    }
    if (mode === 'tracking_only') return 'SCAN THE NEXT BOX TRACKING NUMBER'
    if (mode === 'serial_only') return 'SCAN THE NEXT ITEM'
    if (currentTracking === null) return 'SCAN A BOX TRACKING NUMBER TO START'
    if (currentTrackingSerials === 0) return 'NOW SCAN THE ITEMS INSIDE THIS BOX'
    return 'SCAN NEXT ITEM  —  OR  —  NEW BOX'
  }

  // Determine feedback type for "Just Scanned" panel
  const getFeedbackType = () => {
    if (!status) return null
    if (status.type === 'success') return 'success'
    if (status.type === 'flag') return 'warning'
    if (status.type === 'discard' || status.type === 'discard-lot') return 'discard'
    if (status.type === 'error') return 'error'
    if (status.type === 'warning') return 'warning'
    if (status.type === 'duplicate') return 'warning'
    if (status.type === 'info') return 'info'
    return 'success'
  }

  const feedbackType = getFeedbackType()

  const feedbackIcon = {
    success: '✅',
    warning: '⚠️',
    error: '❌',
    discard: '🚫',
    info: 'ℹ️',
  }

  const feedbackClass = {
    success: 'feedback-success',
    warning: 'feedback-warning',
    error: 'feedback-error',
    discard: 'feedback-discard',
    info: 'feedback-success',
  }

  // Previous tracking groups (for "Previous Boxes" section)
  const previousTrackingGroups = (() => {
    if (mode === 'serial_only') return []
    const groups = []
    const seen = new Set()
    for (const s of productScans) {
      if (s.scanType === 'Tracking' && s.value !== currentTracking && !seen.has(s.value)) {
        seen.add(s.value)
        const count = productScans.filter(x => x.scanType !== 'Tracking' && x.trackingNumber === s.value).length
        groups.push({ tracking: s.value, count })
      }
    }
    return groups
  })()

  // Whether the "Just Scanned" panel should show action buttons
  const justScannedIsActionable = lastScan && lastScan.scanType !== 'Tracking' &&
    (feedbackType === 'success' || feedbackType === 'discard')

  // Reversed items for "Items in This Box" (newest first)
  const reversedBoxItems = [...currentBoxItems].reverse()

  // Virtualizer for "Items in This Box"
  const boxListRef = useRef(null)
  const boxVirtualizer = useVirtualizer({
    count: reversedBoxItems.length,
    getScrollElement: () => boxListRef.current,
    estimateSize: () => 58,
    overscan: 5,
  })

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Hidden always-focused scan input */}
      <ScanInput onScan={handleScan} placeholder="" disabled={inputDisabled} />

      {/* ═══ RESUME SESSION MODAL ═══ */}
      {showResumeModal && (
        <ResumeSessionModal
          session={showResumeModal}
          onResume={handleResumeSession}
          onStartFresh={handleStartFresh}
        />
      )}

      {/* ═══ REPORT ISSUE MODAL ═══ */}
      {showFlagModal && (
        <ReportIssueModal
          trackingNumber={currentTracking}
          onSubmit={handleReportIssue}
          onCancel={() => { setShowFlagModal(false); setInputDisabled(false) }}
        />
      )}

      {/* ═══ HEADER ═══ */}
      <header className="glass-solid header-glow px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white tracking-tight">Returns Check-In</h1>
          <span className="text-sm text-beige/60">{user?.username}</span>
          <SyncHealthIndicator {...syncHealth} />
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="text-xs px-3 py-2 rounded-lg border border-air-blue/30 text-air-blue hover:bg-air-blue/10 transition"
            >
              Admin
            </button>
          )}
          <button
            onClick={endSession}
            className="px-6 py-3 rounded-xl bg-terra text-white font-bold text-sm hover:bg-terra-dark transition uppercase tracking-wider"
          >
            Finish Work
          </button>
        </div>
      </header>

      {/* ═══ TIMEOUT WARNING BANNER ═══ */}
      {timeoutWarning && (
        <div className="px-5 py-3 bg-yellow-600/20 border-b border-yellow-500/30 text-yellow-300 text-sm text-center font-medium">
          Session will timeout soon — scan something to stay active
        </div>
      )}

      <main className="flex-1 p-4 max-w-2xl w-full mx-auto space-y-5 pb-8">

        {/* ═══ WELCOME BANNER (first session only) ═══ */}
        {showWelcome && (
          <div className="rounded-xl p-5 bg-moss/15 border-2 border-moss/40 text-center space-y-2">
            <p className="text-sm font-bold text-moss uppercase tracking-wider">Welcome to Returns Check-In</p>
            <p className="text-xs text-beige/80 leading-relaxed">
              Scan a <span className="text-white font-medium">box tracking number</span> to start, then scan each <span className="text-white font-medium">item inside</span>. When the box is done, scan the next tracking number.
            </p>
            <button
              onClick={() => setShowWelcome(false)}
              className="mt-1 text-xs px-4 py-1.5 rounded-lg border border-moss/30 text-moss hover:bg-moss/20 transition font-medium"
            >
              Got it
            </button>
          </div>
        )}

        {/* ═══ CURRENT BOX (primary focus) ═══ */}
        {mode !== 'serial_only' && currentTracking && (
          <div className="glass stat-accent-blue rounded-xl p-6 text-center">
            <p className="text-xs text-air-blue uppercase tracking-wider font-bold">Current Box</p>
            <p className="text-base font-mono text-white mt-1.5 break-all">{currentTracking}</p>
            <p className="text-5xl font-black text-white mt-2">{currentTrackingSerials}</p>
            <p className="text-xs text-air-blue/60 font-medium">item{currentTrackingSerials !== 1 ? 's' : ''} scanned</p>
          </div>
        )}

        {/* ═══ SESSION TOTALS (subdued) ═══ */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-air-blue/40 font-semibold mb-1">Session Totals</p>
          <div className="flex justify-center gap-6 opacity-60">
            <div>
              <span className="text-lg font-bold text-white">{trackingCount}</span>
              <span className="text-xs text-air-blue/60 ml-1.5">boxes</span>
            </div>
            <div className="border-l border-air-blue/20 pl-6">
              <span className="text-lg font-bold text-white">{serialCount}</span>
              <span className="text-xs text-air-blue/60 ml-1.5">items</span>
            </div>
          {escalatedCount > 0 && (
            <div className="border-l border-air-blue/20 pl-6">
              <span className="text-lg font-bold text-terra">{escalatedCount}</span>
              <span className="text-xs text-terra/60 ml-1.5">problems</span>
            </div>
          )}
          </div>
        </div>

        {/* ═══ LOT MODE BANNER ═══ */}
        {lotMode && (
          <div className="rounded-xl p-5 bg-terra/10 border-2 border-terra/40 space-y-3 text-center">
            <h2 className="text-sm font-bold text-terra uppercase tracking-wider">🏷️ Add by Lot ID</h2>
            <p className="text-xs text-beige/80">Scan a Lot ID (6 digits) and select a Device Type below.</p>
            <div className="flex justify-center gap-6 text-sm">
              <span className="text-air-blue/60">
                Lot: <span className={`font-mono ${lotPartials.lot ? 'text-moss font-bold' : 'text-air-blue/30'}`}>
                  {lotPartials.lot || '—'}
                </span>
              </span>
              <span className="text-air-blue/60">
                Device: <span className={`font-mono ${lotPartials.deviceType ? 'text-moss font-bold' : 'text-air-blue/30'}`}>
                  {lotPartials.deviceType || '—'}
                </span>
              </span>
            </div>
            {/* Device Type quick-select buttons */}
            {!lotPartials.deviceType && (
              <div className="space-y-2">
                <p className="text-xs text-air-blue/60 uppercase tracking-wider font-medium">Select Device Type</p>
                <div className="grid grid-cols-1 gap-2">
                  {[['013', 'Single Pole Rocker Switch'], ['00B', '1-gang Quick Wire Backplate'], ['00C', '2-gang Quick Wire Backplate'], ['00D', '3-gang Quick Wire Backplate']].map(([prefix, name]) => (
                    <button
                      key={prefix}
                      onClick={() => handleLotScan(`DT:${prefix}`)}
                      className="py-3 px-4 rounded-lg glass border border-air-blue/20 text-white text-sm font-medium hover:bg-air-blue/15 transition text-left"
                    >
                      <span className="font-mono text-air-blue">{prefix}</span> {name}
                    </button>
                  ))}
                </div>
                {!showAllDT ? (
                  <button
                    onClick={() => setShowAllDT(true)}
                    className="text-xs text-air-blue/50 hover:text-air-blue transition mt-1"
                  >
                    Show all product types...
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-air-blue/10">
                    {Object.entries(PRODUCT_PREFIX_MAP)
                      .filter(([prefix]) => !['013', '00B', '00C', '00D'].includes(prefix))
                      .map(([prefix, name]) => (
                        <button
                          key={prefix}
                          onClick={() => handleLotScan(`DT:${prefix}`)}
                          className="py-2.5 px-3 rounded-lg glass border border-air-blue/20 text-white text-xs font-medium hover:bg-air-blue/15 transition text-left"
                        >
                          <span className="font-mono text-air-blue">{prefix}</span> {name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => { exitLotMode(); flash('Lot mode cancelled', 'info') }}
              className="px-5 py-2.5 rounded-lg border border-terra/30 text-terra hover:bg-terra/20 transition text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ═══ INSTRUCTION AREA ═══ */}
        <div className="text-center py-6">
          <div className="text-3xl text-air-blue/30 mb-3 instruction-pulse">↓</div>
          <p className="text-xl font-black text-white uppercase tracking-wide px-4 leading-relaxed">
            {getInstructionText()}
          </p>
          <div className="text-3xl text-air-blue/30 mt-3 instruction-pulse">↓</div>
        </div>

        {/* ═══ ACTION BUTTONS ═══ */}
        <div className="flex gap-3">
          <button
            onClick={() => { setShowManual(true); setInputDisabled(true) }}
            className="flex-1 py-5 rounded-xl glass border border-air-blue/20 text-air-blue font-bold text-base hover:bg-air-blue/15 transition"
          >
            {manualEntryMode === 'tracking' ? '📦 Enter Box Number' : '✏️ Type Manually'}
          </button>
          {mode !== 'tracking_only' && !lotMode && manualEntryMode !== 'tracking' && (
            <button
              onClick={enterLotMode}
              className="flex-1 py-5 rounded-xl glass border border-terra/20 text-terra font-bold text-base hover:bg-terra/15 transition"
            >
              🏷️ Add by Lot ID
            </button>
          )}
          {mode !== 'tracking_only' && !lotMode && manualEntryMode !== 'tracking' && (
            <button
              onClick={() => { setShowCantScan(true); setInputDisabled(true); playAction() }}
              className="flex-1 py-5 rounded-xl glass border border-beige/20 text-beige font-bold text-base hover:bg-beige/15 transition"
            >
              ❌ Can't Scan
            </button>
          )}
        </div>

        {/* ═══ REPORT AN ISSUE (always visible when session active) ═══ */}
        {session && !lotMode && (
          <button
            onClick={() => { setShowFlagModal(true); setInputDisabled(true) }}
            className="w-full py-3 rounded-xl border-2 border-yellow-500/30 text-yellow-400/80 font-bold text-sm hover:bg-yellow-500/10 transition uppercase tracking-wider"
          >
            Report an Issue
          </button>
        )}

        {/* ═══ CAN'T SCAN / UPC — PRODUCT PICKER ═══ */}
        {showCantScan && (
          <div className={`rounded-xl p-5 ${pendingUpc ? 'bg-yellow-500/10 border-2 border-yellow-500/40' : 'bg-terra/10 border-2 border-terra/40'} space-y-3 text-center`}>
            <h2 className={`text-sm font-bold uppercase tracking-wider ${pendingUpc ? 'text-yellow-300' : 'text-terra'}`}>
              {pendingUpc ? 'UPC Scanned — Select Product Type' : 'QR Damaged — Select Product Type'}
            </h2>
            <p className="text-xs text-beige/80">{pendingUpc ? `Barcode: ${pendingUpc}` : 'What type of device is it?'}</p>
            {pendingUpc ? (
              /* UPC mode — only show admin-allowed products */
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(PRODUCT_PREFIX_MAP)
                  .filter(([, name]) => upcAllowedProducts.includes(name))
                  .map(([prefix, name]) => (
                    <button
                      key={prefix}
                      onClick={() => handleCantScan(name)}
                      className="py-3 px-4 rounded-lg glass border border-yellow-500/20 text-white text-sm font-medium hover:bg-yellow-500/15 transition text-left"
                    >
                      <span className="font-mono text-yellow-300">{prefix}</span> {name}
                    </button>
                  ))}
                {upcAllowedProducts.length === 0 && (
                  <p className="text-sm text-beige/50 py-2">No products enabled for UPC check-in. Ask admin to enable in Settings.</p>
                )}
              </div>
            ) : (
              /* Can't Scan mode — full shortlist + show all */
              <>
                <div className="grid grid-cols-1 gap-2">
                  {[['013', 'Single Pole Rocker Switch'], ['016', '3-Way Rocker Switch'], ['012', 'Multiway Rocker Switch (3 and 4-Way)'], ['00B', '1-gang Quick Wire Backplate'], ['00C', '2-gang Quick Wire Backplate'], ['00D', '3-gang Quick Wire Backplate']].map(([prefix, name]) => (
                    <button
                      key={prefix}
                      onClick={() => handleCantScan(name)}
                      className="py-3 px-4 rounded-lg glass border border-air-blue/20 text-white text-sm font-medium hover:bg-air-blue/15 transition text-left"
                    >
                      <span className="font-mono text-air-blue">{prefix}</span> {name}
                    </button>
                  ))}
                </div>
                {!showAllDT ? (
                  <button
                    onClick={() => setShowAllDT(true)}
                    className="text-xs text-air-blue/50 hover:text-air-blue transition mt-1"
                  >
                    Show all product types...
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-air-blue/10">
                    {Object.entries(PRODUCT_PREFIX_MAP)
                      .filter(([prefix]) => !['013', '016', '012', '00B', '00C', '00D'].includes(prefix))
                      .map(([prefix, name]) => (
                        <button
                          key={prefix}
                          onClick={() => handleCantScan(name)}
                          className="py-2.5 px-3 rounded-lg glass border border-air-blue/20 text-white text-xs font-medium hover:bg-air-blue/15 transition text-left"
                        >
                          <span className="font-mono text-air-blue">{prefix}</span> {name}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
            <button
              onClick={() => { setShowCantScan(false); setShowAllDT(false); setInputDisabled(false); setPendingUpc(null) }}
              className="px-5 py-2.5 rounded-lg border border-terra/30 text-terra hover:bg-terra/20 transition text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ═══ JUST SCANNED FEEDBACK ═══ */}
        {status && (
          <div className={`rounded-xl border-2 transition-all ${feedbackClass[feedbackType] || 'feedback-success'} ${justScannedIsActionable && lastScan ? 'p-0 overflow-hidden' : 'p-5 text-center'}`}>
            {justScannedIsActionable && lastScan ? (
              <div className="flex items-stretch">
                {/* Scan info — left side */}
                <div className="flex-1 p-5 flex items-center gap-4 min-w-0">
                  <div className="text-4xl flex-shrink-0">{feedbackIcon[feedbackType] || '✅'}</div>
                  <div className="min-w-0">
                    <p className="text-white font-bold text-base break-words">{status.message}</p>
                    <p className="text-sm text-beige/60 mt-0.5">
                      {lastScan.productType || getProductType(lastScan.value)}
                    </p>
                  </div>
                </div>
                {/* Action buttons — right side, stacked vertically */}
                <div className="flex flex-col border-l border-white/10 flex-shrink-0">
                  <button
                    onClick={() => handleRemoveSerial(lastScan.id)}
                    className="flex-1 px-5 py-3 text-beige hover:bg-air-blue/10 transition text-sm font-bold border-b border-white/10"
                  >
                    ↩️ Undo
                  </button>
                  <button
                    onClick={() => { setReportProblemScan(lastScan); setInputDisabled(true) }}
                    className="flex-1 px-5 py-3 text-terra hover:bg-terra/20 transition text-sm font-bold"
                  >
                    ⚠️ Problem
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2">{feedbackIcon[feedbackType] || '✅'}</div>
                <p className="text-white font-bold text-base break-words">{status.message}</p>
              </>
            )}
          </div>
        )}

        {/* ═══ ITEMS IN THIS BOX ═══ */}
        {currentBoxItems.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-xs font-bold text-air-blue uppercase tracking-wider mb-3 text-center">
              Items in This Box ({currentBoxItems.length})
            </h3>
            <div
              ref={boxListRef}
              className="overflow-y-auto"
              style={{ maxHeight: reversedBoxItems.length > 6 ? 400 : undefined }}
            >
              <div
                style={{
                  height: `${boxVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {boxVirtualizer.getVirtualItems().map(virtualRow => {
                  const item = reversedBoxItems[virtualRow.index]
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className={`flex items-center justify-between py-3 px-3.5 rounded-lg bg-deako-black/30 mb-1.5 ${
                          item.status === 'Discard' ? 'border border-terra/30 discard-alert' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-lg flex-shrink-0">
                            {item.status === 'Escalated' ? '⚠️' : item.status === 'Discard' ? '🚫' : '✅'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-mono font-medium truncate">{item.value}</p>
                            <p className="text-xs text-beige/60 truncate">
                              {item.productType || getProductType(item.value)}
                              {item.status === 'Discard' && <span className="text-terra ml-1 font-medium">DISCARD</span>}
                              {item.status === 'Escalated' && <span className="text-terra ml-1 font-medium">PROBLEM</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0 ml-2">
                          <button
                            onClick={() => { setReportProblemScan(item); setInputDisabled(true) }}
                            className={`p-2 rounded-lg border transition ${
                              item.status === 'Escalated'
                                ? 'border-terra text-terra bg-terra/10 hover:bg-terra/20'
                                : 'border-air-blue/10 text-air-blue/30 hover:text-terra hover:border-terra/30 hover:bg-terra/10'
                            }`}
                            title={item.status === 'Escalated' ? 'Problem reported' : 'Report a problem'}
                          >
                            {item.status === 'Escalated' ? '⚠️' : '⚑'}
                          </button>
                          <button
                            onClick={() => handleRemoveSerial(item.id)}
                            className="p-2 rounded-lg border border-air-blue/10 text-air-blue/30 hover:text-air-blue hover:border-air-blue/30 hover:bg-air-blue/10 transition"
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PREVIOUS BOXES ═══ */}
        {previousTrackingGroups.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-xs font-bold text-air-blue uppercase tracking-wider mb-3 text-center">
              Previous Boxes ({previousTrackingGroups.length})
            </h3>
            <div className="space-y-2">
              {previousTrackingGroups.map(group => (
                <div key={group.tracking} className="flex items-center justify-between py-3 px-3.5 rounded-lg bg-deako-black/30">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-mono font-medium truncate">{group.tracking}</p>
                    <p className="text-xs text-beige/60">{group.count} item{group.count !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 ml-2">
                    <button
                      onClick={() => handleSelectTracking(group.tracking)}
                      className="text-xs px-4 py-2.5 rounded-lg border border-air-blue/30 text-air-blue hover:bg-air-blue/10 transition font-bold"
                    >
                      Switch
                    </button>
                    <button
                      onClick={() => handleRemoveTrackingGroup(group.tracking)}
                      className="text-xs px-4 py-2.5 rounded-lg border border-terra/30 text-terra hover:bg-terra/10 transition font-bold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ═══ MODALS ═══ */}
      {duplicatePrompt && (
        <DuplicateModal
          serial={duplicatePrompt}
          onDismiss={handleDuplicateDismiss}
        />
      )}
      {showManual && (
        <ManualEntryModal
          entryMode={manualEntryMode}
          onSubmit={handleManualSubmit}
          onCancel={() => { setShowManual(false); setInputDisabled(false) }}
        />
      )}
      {showSummary && (
        <SessionSummary
          scans={scans}
          session={session}
          onClose={handleSummaryClose}
        />
      )}
      {reportProblemScan && (
        <ReportProblemModal
          scan={reportProblemScan}
          onSubmit={handleReportProblem}
          onCancel={() => { setReportProblemScan(null); setInputDisabled(false) }}
        />
      )}
      {voidGroupConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="glass-solid rounded-2xl p-8 max-w-md w-full mx-4 space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-xl font-bold text-white">Remove This Box?</h2>
              <p className="text-air-blue mt-2 font-mono text-sm break-all">{voidGroupConfirm.trackingValue}</p>
              <p className="text-beige mt-3 text-sm">
                This will remove the box and <strong className="text-white">{voidGroupConfirm.serialCount}</strong> item{voidGroupConfirm.serialCount !== 1 ? 's' : ''} inside it.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setVoidGroupConfirm(null); setInputDisabled(false) }}
                className="flex-1 px-4 py-3 rounded-lg border border-air-blue/30 text-air-blue hover:bg-air-blue/10 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => { voidTrackingGroup(voidGroupConfirm.trackingValue); setInputDisabled(false) }}
                className="flex-1 px-4 py-3 rounded-lg bg-terra text-white hover:bg-terra-dark transition font-medium"
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}
      {suspiciousSerial && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="glass-solid rounded-2xl p-8 max-w-md w-full mx-4 space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-xl font-bold text-white">Suspicious Scan</h2>
              <p className="text-air-blue mt-2 font-mono text-sm break-all">{suspiciousSerial.value}</p>
              <p className="text-beige mt-3 text-sm">{suspiciousSerial.reason}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSuspiciousCancel}
                className="flex-1 px-4 py-3 rounded-lg border border-air-blue/30 text-air-blue hover:bg-air-blue/10 transition font-medium"
              >
                Discard Scan
              </button>
              <button
                onClick={handleSuspiciousConfirm}
                className="flex-1 px-4 py-3 rounded-lg bg-terra text-white hover:bg-terra-dark transition font-medium"
              >
                Keep Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
