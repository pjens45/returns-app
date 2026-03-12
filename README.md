# Returns Check-In App

A warehouse tool for receiving and logging returned products. Built for barcode-scanner workstations — operators scan tracking numbers and serial numbers to check items back into inventory.

## What It Does

- Scan box tracking numbers (UPS, USPS, FedEx) and product serial numbers with a USB barcode scanner
- Auto-detect product type from serial prefix, carrier from tracking format
- Handle edge cases: damaged QR codes, UPC-only products, unknown items, duplicate scans
- Sync all scan data to Google Sheets in real time via Apps Script webhook
- Email alerts for operator-reported issues and unknown products
- Offline-first — works without internet, syncs when connection is available

## Tech Stack

React 19, Vite 6, Tailwind CSS v4, Dexie (IndexedDB), Google Apps Script

## Setup

```bash
git clone https://github.com/pjens45/returns-app.git
cd returns-app
npm install
cp .env.local.example .env.local
# Fill in your Apps Script webhook URL and secret
npm run dev
```

## Google Sheets Sync

The app syncs scan data to a Google Sheet via an Apps Script web app. See `google-apps-script/Code.gs` for the full script. Deploy it as a web app (Execute as: Me, Access: Anyone) and set the URL in `.env.local`.
