# AdmitPay - AI Student Admission & Automated Fee Verification

AdmitPay is a premium automated fee verification system for local and international student admissions. It matches bank transaction IDs (TIDs) from SMS gateways with student applications in real-time.

## Tech Stack
- **Backend:** Node.js (Express)
- **Frontend:** React (Vite) + Tailwind CSS + Lucide Icons
- **Database:** Supabase (PostgreSQL) - Persistent Cloud Storage
- **Automation:** SMS Gateway integration for auto-verification

## Features
- **Premium UI:** Custom-built course selection and responsive design.
- **Auto-Matching:** Automatically verifies payments received via EasyPaisa, JazzCash, and Pakistani Banks.
- **Admin Security:** Password-protected dashboard for staff.
- **Data Export:** Export verified student data to Excel (.xlsx) with one click.
- **International Support:** Support for Wise, Western Union, and manual receipt uploads.

## Installation

### 1. Backend Setup
```bash
cd server
npm install
node index.js
```

### 2. Frontend Setup
```bash
cd client
npm install
npm run dev
```

## Production Deployment
- **Supabase:** Ensure `SUPABASE_URL` and `SUPABASE_KEY` are set in the environment.
- **SMS Gateway:** Configure your Android SMS forwarder to send POST requests to `/api/v1/gateway/local-sms?secret=123456`.
- **Admin Password:** Default password is `admin786`.

## License
ISC
