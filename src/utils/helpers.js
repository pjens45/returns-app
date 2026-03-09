export const PRODUCT_PREFIX_MAP = {
  // Smart Products
  '221': 'Smart Switch',
  '322': 'Smart Switch (Gen 2)',
  '231': 'Single Pole Smart Dimmer',
  '232': 'Master Smart Dimmer',
  '233': 'Remote Smart Dimmer',
  '250': 'Smart Plug',
  '220': 'Smart Switch Multiway',
  // Simple Products
  '013': 'Single Pole Rocker Switch',
  '016': '3-Way Rocker Switch',
  '012': 'Multiway Rocker Switch (3 and 4-Way)',
  '061': 'Simple Dimmer',
  '070': 'Simple Motion Switch',
  '014': 'Simple Fan Speed Controller',
  '015': 'Simple Astronomical Timer',
  '017': 'Simple Nightlight',
  '018': 'Simple Timer Switch',
  // Backplates
  '00B': '1-gang Quick Wire Backplate',
  '00C': '2-gang Quick Wire Backplate',
  '00D': '3-gang Quick Wire Backplate',
  '003': '4-gang Wired Backplate',
  '00E': '4-gang Quick Wire Backplate',
  '00J': '1-Gang Universal Backplate',
  '000': '1-gang Wired Backplate',
  '001': '2-gang Wired Backplate',
  '002': '3-gang Wired Backplate',
  '00K': '2-Gang Universal Backplate',
  '00L': '3-Gang Universal Backplate',
  '00M': '4-Gang Universal Backplate',
  '005': '2-gang Wired Backplate w/ 1-Outlet (Left)',
  '006': '2-gang Wired Backplate w/ 1-Outlet (Right)',
  // Faceplates (no serial — logged via Can't Scan or UPC)
  'FP1': '1-Gang Faceplate',
  'FP1H': '1-Gang Faceplate (Holly)',
  'FP1M': '1-Gang Faceplate (Mushroom)',
  'FP2': '2-Gang Faceplate',
  'FP2H': '2-Gang Faceplate (Holly)',
  'FP2M': '2-Gang Faceplate (Mushroom)',
  'FP3': '3-Gang Faceplate',
  'FP4': '4-Gang Faceplate',
}

// UPC barcode → product type mapping (for auto-identification during UPC scan)
export const UPC_PRODUCT_MAP = {
  // 1-Gang Faceplates
  '850022963056': '1-Gang Faceplate',
  '850022963629': '1-Gang Faceplate (Holly)',
  '850022963568': '1-Gang Faceplate (Mushroom)',
  // 2-Gang Faceplates
  '850022963063': '2-Gang Faceplate',
  '850022963636': '2-Gang Faceplate (Holly)',
  '850022963575': '2-Gang Faceplate (Mushroom)',
}

export function getProductType(serial) {
  if (!serial || serial.length < 3) return 'Unknown Product'
  const prefix = serial.substring(0, 3).toUpperCase()
  return PRODUCT_PREFIX_MAP[prefix] || 'Unknown Product'
}

export function getProductPrefix(serial) {
  if (!serial || serial.length < 3) return ''
  return serial.substring(0, 3).toUpperCase()
}

// --- Carrier & barcode detection ---

const RE_420_ZIP = /^420\d{5}(\d{4})?$/
const RE_420_FULL = /^420\d{27,37}$/ // USPS GS1-128: 420 + 5-digit ZIP + 22-32 digit tracking
const RE_UPS = /^1Z[0-9A-Z]{16}$/
const RE_USPS_NUMERIC = /^\d{20,22}$/
const RE_USPS_ALPHA = /^[A-Z]{2}\d{9}[A-Z]{2}$/
const RE_FEDEX_12 = /^\d{12}$/
const RE_FEDEX_15 = /^\d{15}$/
const RE_FEDEX_20 = /^\d{20,22}$/
const RE_FEDEX_96 = /^96\d{20,32}$/ // FedEx Ground/SmartPost 96-prefix (22-34 digits)
const RE_UPC_EAN = /^\d{8,14}$/

// Exact denylist of known Deako product UPC/EAN barcodes.
// These are 12-digit numeric codes that would otherwise match FedEx 12-digit tracking.
// Checked BEFORE carrier detection so they are always rejected as tracking.
export const REJECTED_TRACKING_BARCODES = new Set([
  '853006008866', '853006008873', '853006008880', '853006008897',
  '853006008620', '850022963247', '850022963278', '850022963209',
  '850022963285', '850022963292', '850022963308', '850022963315',
  '850022963360', '850022963377', '853006008743', '853006008750',
  '853006008767', '853006008774', '853006008798', '853006008804',
  '853006008811', '853006008828', '850022963056', '850022963063',
  '850022963070', '850022963087', '853006008217', '853006008071',
  '850022963414', '850022963445', '850022963452', '850022963421',
  '850022963438', '850022963025', '850022963193', '850022963179',
  '850022963186', '850022963407', '850022963155', '850022963162',
  '853006008712', '853006008996', '850022963018', '850022963001',
  '853006008729',
  // Faceplates
  '850022963629', '850022963568', // 1-Gang: Holly, Mushroom
  '850022963636', '850022963575', // 2-Gang: Holly, Mushroom
])

export function is420Zip(value) {
  return RE_420_ZIP.test(value)
}

export function isTrackingPattern(value) {
  const v = value.toUpperCase()
  return RE_UPS.test(v) || RE_USPS_NUMERIC.test(v) || RE_USPS_ALPHA.test(v) ||
    RE_420_FULL.test(v) ||
    RE_FEDEX_12.test(v) || RE_FEDEX_15.test(v) || RE_FEDEX_20.test(v) || RE_FEDEX_96.test(v)
}

export function isSuspiciousForSerial(value) {
  const v = value.toUpperCase()
  return is420Zip(v) || isTrackingPattern(v) || RE_UPC_EAN.test(v)
}

/**
 * Detect carrier from a tracking number value.
 * Returns 'UPS', 'USPS', 'FedEx', or 'UNKNOWN'.
 */
export function detectCarrier(value) {
  if (!value) return 'UNKNOWN'
  const v = value.trim().toUpperCase()
  if (RE_UPS.test(v)) return 'UPS'
  if (RE_USPS_ALPHA.test(v)) return 'USPS'
  if (RE_420_FULL.test(v)) return 'USPS'
  // USPS numeric (20-22 digits) — but also overlaps FedEx SmartPost (20-22 digits)
  // FedEx 12/15 are unambiguous; for 20-22 digit, prefer USPS since it's more common for returns
  if (RE_FEDEX_96.test(v)) return 'FedEx'
  if (RE_FEDEX_12.test(v)) return 'FedEx'
  if (RE_FEDEX_15.test(v)) return 'FedEx'
  if (RE_USPS_NUMERIC.test(v)) return 'USPS'
  return 'UNKNOWN'
}

/**
 * Classify the format/pattern of a tracking number value.
 */
export function detectTrackingFormat(value) {
  if (!value) return 'UNKNOWN'
  const v = value.trim().toUpperCase()
  if (RE_UPS.test(v)) return 'UPS_1Z'
  if (RE_USPS_ALPHA.test(v)) return 'USPS_13_US'
  if (RE_420_FULL.test(v)) return 'USPS_420_FULL'
  if (RE_FEDEX_12.test(v)) return 'FEDEX_12'
  if (RE_FEDEX_15.test(v)) return 'FEDEX_15'
  if (RE_FEDEX_96.test(v)) return 'FEDEX_96'
  // 20-22 digits: could be USPS or FedEx SmartPost — label as USPS since more common for returns
  if (RE_USPS_NUMERIC.test(v)) return 'USPS_20_22_DIGIT'
  if (RE_FEDEX_20.test(v)) return 'FEDEX_20_22'
  return 'UNKNOWN'
}

export function validateTracking(value) {
  if (!value) return false
  const v = value.trim().toUpperCase()
  // FIRST: exact denylist of known product barcodes (beats carrier regex)
  if (REJECTED_TRACKING_BARCODES.has(v)) return false
  // Hard reject: values starting with a known Deako product prefix (these are serials, not tracking)
  if (hasDeakoPrefix(v)) return false
  // Must be alphanumeric only (A-Z0-9, no spaces/special chars)
  if (!/^[A-Z0-9]+$/.test(v)) return false
  // Length must be 10-40 characters
  if (v.length < 10 || v.length > 40) return false
  // Hard reject: USPS 420+ZIP routing barcodes
  if (RE_420_ZIP.test(v)) return false
  // Hard reject: UPC/EAN product barcodes (8-14 digits, all numeric)
  if (RE_UPC_EAN.test(v)) return false
  return true
}

export function getTrackingRejectReason(value) {
  if (!value) return null
  const v = value.trim().toUpperCase()
  // FIRST: exact denylist of known product barcodes
  if (REJECTED_TRACKING_BARCODES.has(v)) {
    return 'This looks like a product barcode, not a tracking number. Scan the tracking label on the shipping box, not the product barcode.'
  }
  if (RE_420_ZIP.test(v)) {
    return 'This is a ZIP routing barcode, not tracking. Scan the barcode labeled "Tracking #".'
  }
  if (RE_UPC_EAN.test(v)) {
    return 'This looks like a product barcode, not a tracking number. Scan the tracking label on the shipping box, not the product barcode.'
  }
  if (v.length < 10) {
    return 'Too short for a tracking number. Must be at least 10 characters (UPS/USPS/FedEx).'
  }
  if (v.length > 40) {
    return 'Too long for a tracking number. Must be 40 characters or fewer.'
  }
  if (!/^[A-Z0-9]+$/i.test(v)) {
    return 'Tracking number must contain only letters and numbers (no spaces or special characters).'
  }
  return null
}

export function validateSerial(value) {
  if (!value) return false
  const v = value.trim()
  // Must be uppercase alphanumeric
  if (v !== v.toUpperCase() || !/^[A-Z0-9]+$/.test(v)) return false
  // Accept exactly 16 chars (standard serial length)
  if (v.length === 16) return true
  // Also accept 14-20 char serials that start with a known Deako product prefix
  if (v.length >= 14 && v.length <= 20 && hasDeakoPrefix(v)) return true
  return false
}

/** Check if a value starts with a known Deako product prefix */
export function hasDeakoPrefix(value) {
  if (!value || value.length < 3) return false
  const prefix = value.substring(0, 3).toUpperCase()
  return PRODUCT_PREFIX_MAP.hasOwnProperty(prefix)
}

// --- Lot ID helpers ---

const RE_LOT_ID = /^\d{6}$/

export function isLotId(value) {
  return RE_LOT_ID.test((value || '').trim())
}

/**
 * Resolve a DT:<code> barcode to a product type string.
 * code can be a 3-char prefix (e.g. "322") or an exact product name.
 */
export function resolveLotDeviceType(code) {
  if (!code) return 'Unknown Product'
  const c = code.trim().toUpperCase()
  // Try as a 3-char prefix first
  if (PRODUCT_PREFIX_MAP[c]) return PRODUCT_PREFIX_MAP[c]
  // Try case-insensitive match against known product names
  const lc = code.trim().toLowerCase()
  for (const name of Object.values(PRODUCT_PREFIX_MAP)) {
    if (name.toLowerCase() === lc) return name
  }
  return 'Unknown Product'
}

export function formatTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  })
}

export const CSV_HEADERS = [
  'Scan_ID', 'Timestamp', 'Session_ID', 'Operator_ID', 'Scan_Type',
  'Value', 'Normalized_Value', 'Prefix', 'Product_Type',
  'Carrier', 'Tracking_Format', 'Is_Suspect_Tracking',
  'Status', 'Tracking_Number',
  'Is_Voided', 'Voided_At', 'Void_Reason',
  'Is_Escalated', 'Escalation_Reason',
  'App_Version', 'Notes',
]

export function generateCSVRows(scans) {
  return scans.map(s => {
    const isVoided = !!(s.voidedAt)
    const isEscalated = s.status === 'Escalated'
    const normalizedValue = (s.value || '').trim().toUpperCase()
    const prefix = s.scanType === 'Serial' ? getProductPrefix(s.value) : ''
    const isTracking = s.scanType === 'Tracking'
    const carrier = isTracking ? (s.carrier || detectCarrier(s.value)) : ''
    const trackingFormat = isTracking ? detectTrackingFormat(s.value) : ''
    const isSuspectTracking = isTracking && carrier === 'UNKNOWN'

    return [
      s.id ?? '',                                                         // Scan_ID
      s.timestamp,                                                        // Timestamp
      s.sessionId,                                                        // Session_ID
      s.operatorId,                                                       // Operator_ID
      s.scanType,                                                         // Scan_Type
      s.value,                                                            // Value
      normalizedValue,                                                    // Normalized_Value
      prefix,                                                             // Prefix
      s.scanType === 'Tracking' ? '' : (s.productType || getProductType(s.value) || ''),  // Product_Type
      carrier,                                                            // Carrier
      trackingFormat,                                                     // Tracking_Format
      isTracking ? isSuspectTracking : '',                               // Is_Suspect_Tracking
      isVoided ? 'VOIDED' : s.status,                                    // Status
      s.trackingNumber || '',                                             // Tracking_Number
      isVoided,                                                           // Is_Voided
      isVoided ? s.voidedAt : '',                                        // Voided_At
      isVoided ? (s.voidReason || '') : '',                              // Void_Reason
      isEscalated,                                                        // Is_Escalated
      isEscalated ? (s.escalationReason || '') : '',                     // Escalation_Reason
      '',                                                                 // App_Version (placeholder)
      s.notes || '',                                                      // Notes
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })
}

export function generateCSV(scans) {
  const rows = generateCSVRows(scans)
  return [CSV_HEADERS.join(','), ...rows].join('\n')
}

export function generateTrackingSummaryCSV(scans) {
  const headers = [
    'Tracking_Number', 'Carrier',
    'First_Scanned_At', 'Last_Scanned_At',
    'Operator_IDs', 'Session_IDs',
    'Serial_Count', 'Escalated_Count', 'Discard_Count',
    'Product_Mix', 'Serial_List',
  ]

  // Build a map of tracking groups
  const groups = new Map()

  for (const s of scans) {
    const trk = s.trackingNumber || ''
    if (!trk) continue

    if (!groups.has(trk)) {
      groups.set(trk, { tracking: trk, carrier: '', rows: [], trackingScanRow: null })
    }
    const g = groups.get(trk)

    // Capture carrier from the Tracking scan row (first non-empty wins)
    if (s.scanType === 'Tracking' && !g.carrier) {
      g.carrier = s.carrier || detectCarrier(s.value) || ''
    }
    if (s.scanType === 'Tracking' && !g.trackingScanRow) {
      g.trackingScanRow = s
    }

    g.rows.push(s)
  }

  const summaryRows = [...groups.values()].map(g => {
    const allRows = g.rows
    const activeSerials = allRows.filter(s => s.scanType === 'Serial' && !s.voidedAt)
    const escalatedCount = activeSerials.filter(s => s.status === 'Escalated').length
    const discardCount = activeSerials.filter(s => s.status === 'Discard').length

    // Timestamps across ALL rows (tracking + serials)
    const timestamps = allRows.map(s => s.timestamp).filter(Boolean).sort()
    const firstScanned = timestamps[0] || ''
    const lastScanned = timestamps[timestamps.length - 1] || ''

    // Unique operators and sessions
    const operatorIds = [...new Set(allRows.map(s => s.operatorId).filter(Boolean))].join('|')
    const sessionIds = [...new Set(allRows.map(s => s.sessionId).filter(Boolean))].join('|')

    // Product mix from active serials
    const productCounts = {}
    for (const s of activeSerials) {
      const pt = getProductType(s.value)
      productCounts[pt] = (productCounts[pt] || 0) + 1
    }
    const productMix = Object.entries(productCounts).map(([k, v]) => `${k}=${v}`).join('|')

    // Serial list (non-voided only)
    const serialList = activeSerials.map(s => s.value).join('|')

    return [
      g.tracking,
      g.carrier || 'UNKNOWN',
      firstScanned,
      lastScanned,
      operatorIds,
      sessionIds,
      activeSerials.length,
      escalatedCount,
      discardCount,
      productMix,
      serialList,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })

  return [headers.join(','), ...summaryRows].join('\n')
}

export function downloadCSV(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
