# Deako Product Reference — Returns & Refurbishment

## Serial Number Schema

Deako serials are 16-character uppercase alphanumeric strings. The structure is:

```
[PPP][M][LLLLLL][UUUUUU]
 │    │    │       └── Unit number (6 digits)
 │    │    └────────── Lot number (6 digits)
 │    └─────────────── Modifier / sub-identifier (1 char)
 └──────────────────── Product prefix (3 chars)
```

Example: `250M001644000731` → Prefix `250` (Smart Plug), Lot `001644`, Unit `000731`

Validation rules (from returns app):
- Must be uppercase alphanumeric only (A-Z, 0-9)
- Standard length: exactly 16 characters
- Extended: 14–20 characters accepted if the first 3 chars match a known product prefix

## Product Catalog

### Smart Products (have serial numbers)

| Prefix | Product Name |
|--------|-------------|
| 221 | Smart Switch |
| 322 | Smart Switch (Gen 2) |
| 231 | Single Pole Smart Dimmer |
| 232 | Master Smart Dimmer |
| 233 | Remote Smart Dimmer |
| 250 | Smart Plug |
| 220 | Smart Switch Multiway |

### Simple Products (have serial numbers)

| Prefix | Product Name |
|--------|-------------|
| 013 | Single Pole Rocker Switch |
| 016 | 3-Way Rocker Switch |
| 012 | Multiway Rocker Switch (3 and 4-Way) |
| 061 | Simple Dimmer |
| 070 | Simple Motion Switch |
| 014 | Simple Fan Speed Controller |
| 015 | Simple Astronomical Timer |
| 017 | Simple Nightlight |
| 018 | Simple Timer Switch |

### Backplates (have serial numbers)

| Prefix | Product Name |
|--------|-------------|
| 000 | 1-gang Wired Backplate |
| 001 | 2-gang Wired Backplate |
| 002 | 3-gang Wired Backplate |
| 003 | 4-gang Wired Backplate |
| 005 | 2-gang Wired Backplate w/ 1-Outlet (Left) |
| 006 | 2-gang Wired Backplate w/ 1-Outlet (Right) |
| 00B | 1-gang Quick Wire Backplate |
| 00C | 2-gang Quick Wire Backplate |
| 00D | 3-gang Quick Wire Backplate |
| 00E | 4-gang Quick Wire Backplate |
| 00J | 1-Gang Universal Backplate |
| 00K | 2-Gang Universal Backplate |
| 00L | 3-Gang Universal Backplate |
| 00M | 4-Gang Universal Backplate |

### Faceplates (no serial — identified by UPC barcode or manual selection)

| Code | Product Name | UPC |
|------|-------------|-----|
| FP1 | 1-Gang Faceplate | 850022963056 |
| FP1H | 1-Gang Faceplate (Holly) | 850022963629 |
| FP1M | 1-Gang Faceplate (Mushroom) | 850022963568 |
| FP2 | 2-Gang Faceplate | 850022963063 |
| FP2H | 2-Gang Faceplate (Holly) | 850022963636 |
| FP2M | 2-Gang Faceplate (Mushroom) | 850022963575 |
| FP3 | 3-Gang Faceplate | — |
| FP4 | 4-Gang Faceplate | — |

## Lot Number

6-digit numeric code embedded in the serial at characters 5–10 (0-indexed position 4–9). Used to identify production batches. The returns app supports lot-based scanning via a separate "Lot Mode" workflow, where an operator scans a 6-digit lot ID and a device type barcode (format `DT:<prefix_or_name>`).

Known discard lots (auto-flagged in returns app):
- `167202` — Simple Dimmer
- `167203` — Simple Dimmer

## Returns App Data Schema

### Scan Record Fields

The returns app writes scan records to IndexedDB and syncs to Google Sheets. Each record contains:

| Field | Description |
|-------|------------|
| Scan_ID | Auto-increment integer (local DB), used as primary key |
| Device_ID | UUID identifying the workstation |
| Timestamp | ISO 8601 timestamp of the scan |
| Updated_At | ISO 8601 timestamp of last update (for void/escalation) |
| Session_ID | UUID identifying the operator session |
| Operator_ID | Username of the logged-in operator |
| Scan_Type | `Tracking`, `Serial`, `Lot`, or `Manual Note` |
| Value | Raw scanned value (serial number, tracking number, etc.) |
| Normalized_Value | Uppercase trimmed value |
| Prefix | First 3 chars of serial (blank for tracking scans) |
| Product_Type | Resolved product name from prefix map |
| Carrier | For tracking: `UPS`, `USPS`, `FedEx`, or `UNKNOWN` |
| Tracking_Format | Specific format detected (e.g., `USPS_20_22_DIGIT`) |
| Is_Suspect_Tracking | Boolean — tracking with unknown carrier |
| Status | `OK`, `Discard`, `Escalated`, or `VOIDED` |
| Tracking_Number | Parent tracking number for serial/lot scans |
| Is_Voided | Boolean |
| Voided_At | ISO 8601 timestamp |
| Void_Reason | Free text |
| Is_Escalated | Boolean |
| Escalation_Reason | Free text |
| Notes | Free text (includes issue report categories, manual entry notes) |
| Synced_At | ISO 8601 timestamp set by Google Sheets on receipt |

### Key Relationships for Hex Reporting

To trace a product end-to-end (RMA → receipt → refurbishment):

- **Serial number** (`Value` where `Scan_Type = 'Serial'`) is the primary product identifier across all systems
- **Tracking number** (`Tracking_Number`) links a serial to its inbound shipment box
- **Session ID** groups all scans from one operator work session
- **Lot number** (chars 5–10 of serial) links to production batch data
- **Prefix** (chars 1–3 of serial) identifies product type without a lookup table

### Google Sheets Sync

The returns app syncs to a Google Sheet via Apps Script webhook (JSONP/GET). The sheet name is `Scans` with the same column headers as the scan record fields above. Upsert logic uses `Scan_ID` as the key with last-write-wins on `Updated_At`.

Separate sheet tabs:
- `Scans` — all scan records
- `Issues` — operator-reported issues (emailed to returnsapp@deako.com)

### UPC-Only Products

Some products don't have QR serial labels and are checked in via UPC barcode scan followed by manual product selection. By default these are: Multiway Rocker Switch, and all Faceplate variants. This list is admin-configurable.
