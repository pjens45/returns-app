# Returns Check-In System — Project Handoff Brief

## What This Is
A local-first Single Page Application for processing returned Deako smart home devices. Operators scan USB barcodes (tracking numbers + serial numbers) to log returns. All data is stored in the browser via IndexedDB (Dexie.js). No backend server.

## Tech Stack
- **React 18** + **Vite 6** (dev server on port 5173)
- **Tailwind CSS v4** (@tailwindcss/vite plugin)
- **Dexie.js v4** (IndexedDB wrapper) — currently at schema version(3)
- **react-router-dom** (HashRouter)
- **uuid** (v4 for session IDs)
- **Node.js v24.13.1** — path: `/usr/local/bin/node`

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
Then open http://localhost:5173

## Default Login
- Username: `admin` / Password: `admin`
- Role: admin, Mode: tracking_serial

---

## Architecture Overview

### File Map (18 files)

**Core:**
- `src/App.jsx` — Routes: `/` (Login), `/scan` (Scanner), `/admin` (Admin, adminOnly)
- `src/main.jsx` — React entry point
- `src/index.css` — Tailwind + custom "Dark Mode Glass" Deako theme (colors: deako-black, air-blue, terra, moss, beige)
- `src/db/database.js` — Dexie v3 schema (tables: users, sessions, scans, discardList, settings) + seedDatabase()
- `src/context/AuthContext.jsx` — Auth state, login/logout, session timeout via refs
- `src/utils/helpers.js` — All validation, carrier detection, CSV generation

**Pages:**
- `src/pages/Login.jsx` — Simple login form
- `src/pages/Scanner.jsx` — Main scanning workflow engine (most complex file)
- `src/pages/Admin.jsx` — Tabs: Users, Settings, Discard List, Sessions, Export

**Components:**
- `src/components/ScanInput.jsx` — Auto-focusing input, Enter-to-submit, paste-to-submit
- `src/components/ScanLog.jsx` — FlatRow + GroupedView + toggle; shows carrier, product prefix, escalation buttons
- `src/components/StatusBanner.jsx` — Flash messages with auto-dismiss
- `src/components/DuplicateModal.jsx` — Blocking modal, single "OK" button (no accept option)
- `src/components/ManualEntryModal.jsx` — Free-form code + notes entry
- `src/components/SessionSummary.jsx` — End-of-session stats with product breakdown

---

## Operating Modes
Operators are assigned one of three modes (set in Admin > Users):
1. **tracking_only** — Scan tracking numbers only
2. **serial_only** — Scan serial numbers only
3. **tracking_serial** — Scan tracking first, then 1+ serials, then next tracking (the primary mode)

## Scanning Flow (tracking_serial mode)
1. Operator scans a **tracking number** (10-40 chars, A-Z0-9, validated against carrier patterns)
2. System detects carrier (UPS/USPS/FedEx/UNKNOWN), stores it, shows it
3. Operator scans **serial numbers** (exactly 16 uppercase alphanumeric chars)
4. System derives product type from first 3 chars using 28-entry Deako prefix map
5. When done with that box, operator scans the next tracking number
6. Repeat until session ends

## Validation Logic (helpers.js)

### Tracking Validation (`validateTracking`)
Order of checks:
1. **REJECTED_TRACKING_BARCODES** denylist (Set of 45 exact Deako product UPC codes) — always rejected first
2. Alphanumeric only (A-Z0-9)
3. Length 10-40 chars
4. Reject 420+ZIP routing barcodes (`/^420\d{5}(\d{4})?$/`)
5. Reject UPC/EAN patterns (`/^\d{8,14}$/`)

### Carrier Detection (`detectCarrier`)
- UPS: `/^1Z[0-9A-Z]{16}$/`
- USPS alpha: `/^[A-Z]{2}\d{9}[A-Z]{2}$/`
- FedEx 12: `/^\d{12}$/` (but denylist checked first to exclude product barcodes)
- FedEx 15: `/^\d{15}$/`
- USPS numeric / FedEx SmartPost: `/^\d{20,22}$/` (defaults to USPS)
- Else: UNKNOWN

### Tracking Format Detection (`detectTrackingFormat`)
Returns: UPS_1Z, USPS_13_US, USPS_20_22_DIGIT, FEDEX_12, FEDEX_15, FEDEX_20_22, UNKNOWN

### Serial Validation (`validateSerial`)
- Exactly 16 chars, uppercase, A-Z0-9

### Suspicious Serial Detection (`isSuspiciousForSerial`)
- If a value looks like tracking/UPC/420+ZIP when expecting serial input, shows blocking confirmation modal
- Operator message: "This looks like a product barcode, not a serial number. Scan the serial number printed directly on the device (the QR/label on the product), not the box barcode."

### Product Prefix Map (28 entries)
Maps first 3 chars of serial to product name (e.g., '322' → 'Smart Switch (Gen 2)', '231' → 'Single Pole Smart Dimmer')

## Data Features

### Soft Delete (Void/Undo)
- Fields: `voidedAt`, `voidedBy`, `voidReason` on scan records
- `activeScans = scans.filter(s => !s.voidedAt)` used everywhere
- "Undo Last" button + Cmd/Ctrl+Z shortcut
- Per-serial "Remove" buttons
- Per-tracking-group "Remove Group" with confirmation modal

### Duplicate Detection
- Session-scoped: only blocks if same serial already scanned in SAME sessionId and not voided
- Shows blocking modal with single "OK" button (no override option)
- Cross-session duplicates allowed silently

### Per-Row Escalation
- Escalate/Unflag toggle on each serial row
- Toggles status between OK ↔ Escalated
- Appends/removes `[ESCALATED: heat damage/odor]` in notes

### Discard List
- Admin manages a list of known-bad serials
- When scanned, auto-tagged as Status: "Discard"

### Prior Tracking Selection
- In grouped view, click any tracking header to set it as active
- Shows "ACTIVE" badge on current tracking group

## CSV Exports (Admin > Export tab)

### 1. Scan Event Log CSV (full event log)
21 columns:
```
Scan_ID, Timestamp, Session_ID, Operator_ID, Scan_Type,
Value, Normalized_Value, Prefix, Product_Type,
Carrier, Tracking_Format, Is_Suspect_Tracking,
Status, Tracking_Number,
Is_Voided, Voided_At, Void_Reason,
Is_Escalated, Escalation_Reason,
App_Version, Notes
```

### 2. Tracking Summary CSV (1 row per tracking number)
11 columns:
```
Tracking_Number, Carrier,
First_Scanned_At, Last_Scanned_At,
Operator_IDs, Session_IDs,
Serial_Count, Escalated_Count, Discard_Count,
Product_Mix, Serial_List
```

## Dexie Schema (version 3)
```js
db.version(3).stores({
  users: 'id, username, role',
  sessions: 'id, operatorId, startTime, status',
  scans: '++id, sessionId, operatorId, timestamp, scanType, value, status, trackingNumber',
  discardList: 'serial',
  settings: 'key',
})
```

## Known Design Decisions
- **No backend** — everything is IndexedDB in the browser
- **USB barcode scanner** emulates keyboard input (rapid chars → Enter)
- **Paste-to-submit** enabled for testing without scanner
- **ScanInput auto-focuses** every 300ms via setInterval (required for scanner workflow)
- **App_Version column** exists in CSV but is currently blank (placeholder for future)
- **escalationReason field** — column exists in CSV export but not yet stored on scan records (currently derived from status)

## UI Theme
"Dark Mode Glass" Deako brand:
- Background: deako-black (#0a0a0a)
- Primary: air-blue (#5eb1ef)
- Accent warm: terra (#c05746)
- Success: moss (#5a7c65)
- Neutral: beige (#b8a99a)
- Glass effect: `backdrop-blur-md bg-white/5 border border-white/10`

---

## What To Work On Next
The app is functionally complete for MVP. Potential next items:
- Wire up App_Version field (currently placeholder in CSV)
- Wire up escalationReason as a structured field on scan records
- Session history / recall
- Data purge / cleanup tools in Admin
- Any UX polish or bug fixes found during real-world testing
