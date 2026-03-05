# Returns Check-In — Project Brief for Claude

## What This Is
Local-first SPA for processing Deako smart home device returns. Operators scan USB barcodes (tracking + serial numbers). **No backend** — all data lives in IndexedDB (Dexie.js). Google Sheets sync is optional and runs via JSONP.

## Project Location
```
/Users/piercevolkman/Desktop/claude/returns-app/
```

## To Run
```bash
export PATH="/usr/local/bin:$PATH"
cd /Users/piercevolkman/Desktop/claude/returns-app
npx vite --port 5173
```
Default login: `admin` / `admin`

## Tech Stack
- React 19 + Vite 6, Tailwind CSS v4, Dexie.js v4, react-router-dom v7, uuid v11
- Node.js v24 at `/usr/local/bin/node`

---

## Invariants — DO NOT VIOLATE

### 1. Operating Modes
Three modes, set per-user in Admin > Users:
- `tracking_only` — tracking scans only
- `serial_only` — serial scans only
- `tracking_serial` — must scan a tracking number first, then 1+ serials, then next tracking

### 2. Parsing / Validation Rules
- **Tracking**: alphanumeric (A-Z0-9), length 10–40, NOT in 45-entry UPC denylist, NOT `420\d{5}`, NOT pure digit 8-14 chars
- **Serial**: exactly 16 chars, uppercase A-Z0-9
- **Product prefix**: first 3 chars of serial → 28-entry map in `helpers.js`
- **Carrier detection**: UPS `1Z...`, USPS alpha `XX\d{9}XX`, FedEx 12/15 digits, USPS/FedEx SmartPost 20-22 digits, else UNKNOWN

### 3. Duplicate Serial Detection — SESSION-SCOPED ONLY
Duplicates are checked only within `sessionId` AND `!voidedAt`. Cross-session duplicates are silently allowed. Modal shows single "OK" — no override option.

### 4. Soft Delete (Void)
Never hard-delete scans. Set `voidedAt`, `voidedBy`, `voidReason`, `updatedAt`. Use `activeScans = scans.filter(s => !s.voidedAt)` everywhere for counts and display.

### 5. Sheet Column Schema (23 columns)
Exact order as defined in `Code.gs` `HEADERS` array and produced by `syncHelpers.js`:
```
Scan_ID, Device_ID, Timestamp, Updated_At,
Session_ID, Operator_ID, Scan_Type, Value,
Normalized_Value, Prefix, Product_Type, Carrier,
Tracking_Format, Is_Suspect_Tracking, Status, Tracking_Number,
Is_Voided, Voided_At, Void_Reason, Is_Escalated,
Escalation_Reason, Notes, Synced_At
```
`Synced_At` is set server-side. All other fields are set by `scanToSheetRecord()` in `syncHelpers.js`.
Upsert key: `Scan_ID`. Last-write-wins on `Updated_At` (ISO string compare).

### 6. JSONP Transport Contract
Client → Apps Script GET with these query params (all URL-encoded):
| Param | Description |
|-------|-------------|
| `secret` | Shared secret (matches `WEBHOOK_SECRET` Script Property) |
| `cb` | Callback function name (e.g. `_syncCb_abc123_1234567890`) |
| `reqId` | UUID for request correlation |
| `payload` | base64url-encoded JSON: `{ "records": [...] }` |
| `_` | Cache-buster (`Date.now() + '_' + random`) |

Apps Script responds with: `cbName({ ok: true, inserted, updated, skipped, invalid, reqId, serverTime })`
Callback name must match `/^[A-Za-z0-9_.$]{1,60}$/`.

### 7. Sync Queue Semantics
- `enqueueSync(scanRecord)` — always fast, non-blocking, fire-and-forget (called on every addScan / voidScan / escalate)
- Queue lives in `db.syncQueue` (Dexie v4 schema, `++id, recordId, enqueuedAt, attempts`)
- Items with `attempts >= 5` are considered permanently failed
- Engine ticks every 60s, batch size 10, max 50 items per flush, max concurrency 2
- `flushNow()` triggers an immediate tick (fire-and-forget)
- Engine auto-starts only when both `VITE_SHEETS_WEBHOOK_URL` and `VITE_SHEETS_WEBHOOK_SECRET` are set

### 8. Environment Variables
Configured in `.env.local` (copy from `.env.local.example`):
```
VITE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_SHEETS_WEBHOOK_SECRET=your-shared-secret-here
```
Restart dev server after changes. If not set, sync is silently disabled (no errors shown on Scanner page).

---

## Key File Map
```
src/
  App.jsx                  — Routes: / (Login), /scan (Scanner), /admin (Admin)
  db/database.js           — Dexie schema v4, getDeviceId(), seedDatabase()
  context/AuthContext.jsx  — Auth, session timeout
  utils/helpers.js         — All validation, carrier detection, prefix map, CSV generation
  pages/Scanner.jsx        — Main scan workflow (most complex)
  pages/Admin.jsx          — Tabs: Users, Settings, Discard List, Sessions, Export, Sync
  sync/
    syncEngine.js          — JSONP transport, tick loop, flushNow()
    syncQueue.js           — Dexie queue CRUD (enqueue, getPending, markFailed, etc.)
    syncHelpers.js         — scanToSheetRecord() — maps DB record → sheet columns
  components/
    ScanInput.jsx          — Auto-focus every 300ms (required for scanner hardware)
    ScanLog.jsx            — FlatRow + GroupedView
    StatusBanner.jsx       — Flash messages, auto-dismiss
    DuplicateModal.jsx     — Blocking, single OK button
    ManualEntryModal.jsx
    SessionSummary.jsx
google-apps-script/
  Code.gs                  — Apps Script: doGet (JSONP), doPost, upsertRecords, decodePayload
.env.local.example         — Template for env vars
```

## UI Theme
Dark Mode Glass — Deako brand:
- `deako-black` (#0a0a0a), `air-blue` (#5eb1ef), `terra` (#c05746), `moss` (#5a7c65), `beige` (#b8a99a)
- Glass: `backdrop-blur-md bg-white/5 border border-white/10`

## Dexie Schema Version History
- v3: users, sessions, scans, discardList, settings
- v4: + syncQueue (`++id, recordId, enqueuedAt, attempts`)
