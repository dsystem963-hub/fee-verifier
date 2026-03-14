# Global Student Admission & Automated Fee Verification System

Automated fee verification system for local and international student admissions.

## Tech Stack
- **Backend:** Node.js (Express) + SQLite3
- **Frontend:** React (Vite) + Tailwind CSS 4
- **Database:** SQLite (local localized transaction logging)

## Installation

### 1. Backend Setup
```bash
cd server
npm install
node init-db.js
node index.js
```
The server will run on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd client
npm install
npm run dev
```
The client will run on `http://localhost:5173`.

## Task 2: Setting up "SMS Forwarder" (Android)

To automate local payment verification (EasyPaisa, JazzCash, Banks), configure an "SMS Forwarder" app on an Android device that receives the payment SMS:

1. **Install an SMS Forwarder App:** (e.g., "SMS Forwarder" by Benoit Mortier or similar).
2. **Add a Forwarding Rule:**
   - **Filter:** Sender should match `8558` (EasyPaisa), `8585` (JazzCash), or your bank's shortcode.
   - **Action:** Send a Webhook (POST request).
3. **Configure Webhook URL:**
   - **URL:** `http://YOUR_SERVER_IP:5000/api/v1/gateway/local-sms`
   - **Method:** POST
   - **Headers:** `x-gateway-secret: supersecretkey123` (Same as in `.env`)
   - **Body Type:** JSON
   - **JSON Template:**
     ```json
     {
       "message_body": "{{message_body}}",
       "sender": "{{sender}}"
     }
     ```
4. **Test:** Send a test SMS or receive a payment. The system will automatically parse the TID and mark it as `Verified` in the database.

## International Payments
For international students (Wise, Remitly, etc.), they must toggle the "International Student" switch, enter their Reference Number/MTCN, and upload a digital receipt. These appear in the Admin Dashboard for manual verification.

## Admin Dashboard
Access the Admin view by clicking the "Admin" button on the top right of the admission form. Here you can approve pending international payments.
