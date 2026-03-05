import { getProductPrefix, getProductType, detectCarrier, detectTrackingFormat } from '../utils/helpers'

/**
 * Transform an IndexedDB scan record into a sheet-row object
 * keyed by the 23 column headers (minus Synced_At which is set server-side).
 */
export function scanToSheetRecord(scan) {
  const isTracking = scan.scanType === 'Tracking'
  const isVoided = !!scan.voidedAt
  const isEscalated = scan.status === 'Escalated'
  const normalizedValue = (scan.value || '').trim().toUpperCase()
  const prefix = scan.scanType === 'Serial' ? getProductPrefix(scan.value) : ''
  const carrier = isTracking ? (scan.carrier || detectCarrier(scan.value)) : ''
  const trackingFormat = isTracking ? detectTrackingFormat(scan.value) : ''
  const isSuspectTracking = isTracking && carrier === 'UNKNOWN'

  return {
    Scan_ID: scan.scanUuid || '',
    Device_ID: scan.deviceId || '',
    Timestamp: scan.timestamp || '',
    Updated_At: scan.updatedAt || '',
    Session_ID: scan.sessionId || '',
    Operator_ID: scan.operatorId || '',
    Scan_Type: scan.scanType || '',
    Value: scan.value || '',
    Normalized_Value: normalizedValue,
    Prefix: prefix,
    Product_Type: scan.scanType === 'Tracking' ? '' : (scan.productType || getProductType(scan.value) || ''),
    Carrier: carrier,
    Tracking_Format: trackingFormat,
    Is_Suspect_Tracking: isTracking ? String(isSuspectTracking) : '',
    Status: isVoided ? 'VOIDED' : (scan.status || ''),
    Tracking_Number: scan.trackingNumber || '',
    Is_Voided: String(isVoided),
    Voided_At: isVoided ? (scan.voidedAt || '') : '',
    Void_Reason: isVoided ? (scan.voidReason || '') : '',
    Is_Escalated: String(isEscalated),
    Escalation_Reason: isEscalated ? (scan.escalationReason || '') : '',
    Notes: scan.notes || '',
  }
}
