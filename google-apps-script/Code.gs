/**
 * Returns Check-In — Google Sheets Sync Webhook
 *
 * DEPLOYMENT STEPS:
 * 1. Create a new Google Spreadsheet (or use existing).
 * 2. Extensions > Apps Script > paste this code into Code.gs.
 * 3. In Apps Script: Project Settings > Script Properties > Add:
 *    - Property: WEBHOOK_SECRET   Value: <your shared secret>
 * 4. Deploy > New deployment:
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL — use as VITE_SHEETS_WEBHOOK_URL in .env.local.
 * 6. On redeployment, always create a NEW VERSION of existing deployment.
 */

var SHEET_NAME = 'Scans';
var NOTIFY_EMAIL = 'returnsapp@deako.com';
var HEADERS = [
  'Scan_ID', 'Device_ID', 'Timestamp', 'Updated_At',
  'Session_ID', 'Operator_ID', 'Scan_Type', 'Value',
  'Normalized_Value', 'Prefix', 'Product_Type', 'Carrier',
  'Tracking_Format', 'Is_Suspect_Tracking', 'Status', 'Tracking_Number',
  'Is_Voided', 'Voided_At', 'Void_Reason', 'Is_Escalated',
  'Escalation_Reason', 'Notes', 'Synced_At'
];
var UPDATED_AT_COL = 4; // 1-indexed column D

// ---------- ENTRY POINTS ----------

function doGet(e) {
  var cb = (e.parameter.cb || '').toString();
  // Strict callback name validation
  if (!cb || !/^[A-Za-z0-9_.$]{1,60}$/.test(cb)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid callback name' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var result;
  try {
    var action = (e.parameter.action || '').toString();
    if (action === 'issueReport') {
      result = handleIssueReport(e.parameter);
    } else if (action === 'logExport') {
      result = handleLogExport(e.parameter);
    } else if (action === 'unknownProduct') {
      result = handleUnknownProduct(e.parameter);
    } else {
      result = handleRequest(e.parameter);
    }
  } catch (err) {
    result = { ok: false, error: String(err) };
  }

  return ContentService.createTextOutput(cb + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var result;
  try {
    result = handleRequest(body);
  } catch (err) {
    result = { ok: false, error: String(err) };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- CORE SYNC LOGIC ----------

function handleRequest(params) {
  // Validate secret
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var secret = params.secret || '';
  if (!expectedSecret || secret !== expectedSecret) {
    return { ok: false, error: 'Unauthorized' };
  }

  // Decode payload
  var records = decodePayload(params.payload || '');
  if (!records || records.length === 0) {
    return { ok: false, error: 'No records in payload' };
  }

  var reqId = params.reqId || '';

  // Upsert with lock
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // wait up to 30s
  } catch (err) {
    return { ok: false, error: 'Could not acquire lock', reqId: reqId };
  }

  try {
    var sheet = ensureSheet();
    var result = upsertRecords(sheet, records);
    result.ok = true;
    result.reqId = reqId;
    result.serverTime = new Date().toISOString();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function decodePayload(encoded) {
  if (!encoded) return null;

  // Base64url decode
  var base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Pad
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  var jsonStr;
  try {
    jsonStr = Utilities.newBlob(Utilities.base64Decode(base64)).getDataAsString();
  } catch (err) {
    return null;
  }

  var parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }

  // Accept { records: [...] } or a single record object or an array
  if (Array.isArray(parsed)) return parsed;
  if (parsed.records && Array.isArray(parsed.records)) return parsed.records;
  if (parsed.Scan_ID) return [parsed];
  return null;
}

function ensureSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    // Format header row bold
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return sheet;
  }

  // Verify headers exist
  var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (firstRow[0] !== HEADERS[0]) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }

  return sheet;
}

function upsertRecords(sheet, records) {
  var lastRow = sheet.getLastRow();
  var inserted = 0;
  var updated = 0;
  var skipped = 0;
  var invalid = 0;
  var now = new Date().toISOString();

  // Build Scan_ID -> row number map (read column A once)
  var idMap = {};
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var val = String(ids[i][0]).trim();
      if (val) {
        idMap[val] = i + 2; // row number (1-indexed, skip header)
      }
    }
  }

  // Also read Updated_At column for existing rows (for last-write-wins check)
  var updatedAtMap = {};
  if (lastRow > 1) {
    var updatedAts = sheet.getRange(2, UPDATED_AT_COL, lastRow - 1, 1).getValues();
    for (var j = 0; j < updatedAts.length; j++) {
      var rowId = String(sheet.getRange(j + 2, 1).getValue()).trim();
      if (rowId) {
        updatedAtMap[rowId] = String(updatedAts[j][0]).trim();
      }
    }
  }

  for (var k = 0; k < records.length; k++) {
    var rec = records[k];
    var scanId = String(rec.Scan_ID || '').trim();
    if (!scanId) {
      invalid++;
      continue;
    }

    var rowData = buildRow(rec, now);
    var existingRow = idMap[scanId];

    if (existingRow) {
      // Last-write-wins: only overwrite if incoming Updated_At >= existing
      var existingUpdatedAt = updatedAtMap[scanId] || '';
      var incomingUpdatedAt = String(rec.Updated_At || '').trim();
      if (existingUpdatedAt && incomingUpdatedAt && incomingUpdatedAt < existingUpdatedAt) {
        skipped++;
        continue;
      }
      sheet.getRange(existingRow, 1, 1, HEADERS.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      lastRow++;
      idMap[scanId] = lastRow;
      updatedAtMap[scanId] = String(rec.Updated_At || '');
      inserted++;
    }
  }

  return { inserted: inserted, updated: updated, skipped: skipped, invalid: invalid };
}

function buildRow(rec, syncedAt) {
  return [
    rec.Scan_ID || '',
    rec.Device_ID || '',
    rec.Timestamp || '',
    rec.Updated_At || '',
    rec.Session_ID || '',
    rec.Operator_ID || '',
    rec.Scan_Type || '',
    rec.Value || '',
    rec.Normalized_Value || '',
    rec.Prefix || '',
    rec.Product_Type || '',
    rec.Carrier || '',
    rec.Tracking_Format || '',
    rec.Is_Suspect_Tracking || '',
    rec.Status || '',
    rec.Tracking_Number || '',
    rec.Is_Voided || '',
    rec.Voided_At || '',
    rec.Void_Reason || '',
    rec.Is_Escalated || '',
    rec.Escalation_Reason || '',
    rec.Notes || '',
    syncedAt
  ];
}

// ---------- ISSUE REPORT HANDLER ----------

function handleIssueReport(params) {
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var secret = params.secret || '';
  if (!expectedSecret || secret !== expectedSecret) {
    return { ok: false, error: 'Unauthorized' };
  }

  var category = params.category || 'Unknown';
  var note = params.note || '';
  var trackingNumber = params.trackingNumber || '';
  var operatorName = params.operatorName || '';
  var timestamp = params.timestamp || new Date().toISOString();
  var deviceId = params.deviceId || '';

  // Send email
  var subject = '[Returns App] Issue Report: ' + category;
  var body = 'An operator reported an issue:\n\n' +
    'Category: ' + category + '\n' +
    'Note: ' + note + '\n' +
    'Tracking #: ' + trackingNumber + '\n' +
    'Operator: ' + operatorName + '\n' +
    'Device: ' + deviceId + '\n' +
    'Time: ' + timestamp + '\n';

  try {
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (err) {
    return { ok: false, error: 'Email failed: ' + String(err) };
  }

  // Log to Issues sheet tab
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var issueSheet = ss.getSheetByName('Issues');
    if (!issueSheet) {
      issueSheet = ss.insertSheet('Issues');
      issueSheet.getRange(1, 1, 1, 7).setValues([['Timestamp', 'Operator', 'Category', 'Note', 'Tracking', 'Device', 'Received_At']]);
      issueSheet.setFrozenRows(1);
      issueSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    }
    issueSheet.appendRow([timestamp, operatorName, category, note, trackingNumber, deviceId, new Date().toISOString()]);
  } catch (err) {
    // Non-fatal — email already sent
  }

  return { ok: true, action: 'issueReport' };
}

// ---------- LOG EXPORT HANDLER ----------

function handleLogExport(params) {
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var secret = params.secret || '';
  if (!expectedSecret || secret !== expectedSecret) {
    return { ok: false, error: 'Unauthorized' };
  }

  var logCount = params.logCount || '0';
  var summary = params.summary || '(empty)';
  var timestamp = params.timestamp || new Date().toISOString();

  var subject = '[Returns App] Log Export — ' + logCount + ' warn/error entries';
  var body = 'App log export at ' + timestamp + '\n' +
    'Total warn/error entries: ' + logCount + '\n\n' +
    '--- LOG SUMMARY ---\n' + summary;

  try {
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (err) {
    return { ok: false, error: 'Email failed: ' + String(err) };
  }

  return { ok: true, action: 'logExport' };
}

// ---------- UNKNOWN PRODUCT HANDLER ----------

function handleUnknownProduct(params) {
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var secret = params.secret || '';
  if (!expectedSecret || secret !== expectedSecret) {
    return { ok: false, error: 'Unauthorized' };
  }

  var serialValue = params.serialValue || '';
  var prefix = params.prefix || '';
  var operatorName = params.operatorName || '';
  var trackingNumber = params.trackingNumber || '';
  var timestamp = params.timestamp || new Date().toISOString();
  var deviceId = params.deviceId || '';

  var subject = '[Returns App] Unknown Product Scanned — Prefix: ' + prefix;
  var body = 'An unknown product was scanned:\n\n' +
    'Serial: ' + serialValue + '\n' +
    'Prefix: ' + prefix + '\n' +
    'Operator: ' + operatorName + '\n' +
    'Tracking #: ' + trackingNumber + '\n' +
    'Device: ' + deviceId + '\n' +
    'Time: ' + timestamp + '\n\n' +
    'This prefix is not in the product map. If this is a known Deako product, ' +
    'please update PRODUCT_PREFIX_MAP in src/utils/helpers.js.';

  try {
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (err) {
    return { ok: false, error: 'Email failed: ' + String(err) };
  }

  return { ok: true, action: 'unknownProduct' };
}
