require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const distPath = path.join(__dirname, '../client/dist');
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(distPath));

console.log('Serving static files from:', distPath);
if (!fs.existsSync(distPath)) {
  console.warn('Warning: client/dist directory NOT found!');
}

// Database setup
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE,
    amount REAL,
    currency TEXT,
    payment_source TEXT,
    status TEXT,
    receipt_image_url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT,
    email TEXT,
    transaction_id TEXT,
    source TEXT,
    amount REAL,
    currency TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Multer setup for receipt uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Security Middleware
const authenticateGateway = (req, res, next) => {
  const secretKey = req.headers['x-gateway-secret'];
  if (secretKey === process.env.GATEWAY_SECRET_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid Gateway Secret Key' });
  }
};

// --- Task 2: Local SMS Parsing Engine ---
app.post('/api/v1/gateway/local-sms', authenticateGateway, (req, res) => {
  const { message_body, sender } = req.body;
  
  if (!message_body) {
    return res.status(400).json({ error: 'Message body is required' });
  }

  let transaction_id = null;
  let amount = null;
  let payment_source = 'Unknown';

  // EasyPaisa (8558)
  if (sender === '8558' || message_body.includes('EasyPaisa')) {
    const tidMatch = message_body.match(/Trans ID: (\d+)/i);
    const amountMatch = message_body.match(/Rs\. ([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = 'EasyPaisa';
  } 
  // JazzCash (8585)
  else if (sender === '8585' || message_body.includes('JazzCash')) {
    const tidMatch = message_body.match(/TID: (\d+)/i);
    const amountMatch = message_body.match(/Rs\. ([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = 'JazzCash';
  }
  // NayaPay / SadaPay
  else if (message_body.includes('NayaPay') || message_body.includes('SadaPay')) {
    const tidMatch = message_body.match(/(?:Ref No|Reference Code):?\s?([A-Z0-9]+)/i);
    const amountMatch = message_body.match(/(?:Amount Received|Rs\.?)\s?([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = message_body.includes('NayaPay') ? 'NayaPay' : 'SadaPay';
  }
  // Banks (Meezan/Commercial)
  else {
    const tidMatch = message_body.match(/(?:Ref No|TRX ID):?\s?(\d+)/i);
    const amountMatch = message_body.match(/(?:PKR|Rs\.?)\s?([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = 'Bank';
  }

  if (transaction_id && amount) {
    try {
      const stmt = db.prepare(`INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status) VALUES (?, ?, ?, ?, ?)`);
      stmt.run(transaction_id, amount, 'PKR', payment_source, 'Verified');
      res.status(200).json({ status: 'Parsed & Saved', transaction_id, amount });
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Transaction already exists' });
      }
      return res.status(500).json({ error: 'Database error' });
    }
  } else {
    res.status(422).json({ error: 'Failed to parse required fields', raw: message_body });
  }
});

// --- Task 3: International Payment / Admin ---

// Submit Student Admission (Immediate)
app.post('/api/v1/admission/submit', (req, res) => {
  const { fullName, email, tid, source, amount, currency } = req.body;

  if (!fullName || !email || !tid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const stmt = db.prepare(`INSERT INTO admissions (full_name, email, transaction_id, source, amount, currency) VALUES (?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(fullName, email, tid, source, amount, currency || 'PKR');
    res.status(201).json({ status: 'Submitted', id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Verify a TID (Public check)
app.get('/api/v1/verify-payment/:tid', (req, res) => {
  const { tid } = req.params;
  try {
    const row = db.prepare(`SELECT * FROM payment_logs WHERE transaction_id = ?`).get(tid);
    if (row && row.status === 'Verified') {
      res.json({ verified: true, data: row });
    } else {
      res.json({ verified: false, message: 'Matching process active...' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Submit International Payment Evidence
app.post('/api/v1/admission/international-payment', upload.single('receipt'), (req, res) => {
  const { fullName, email, transaction_id, amount, currency, payment_source } = req.body;
  const receipt_image_url = req.file ? `/uploads/${req.file.filename}` : null;

  if (!transaction_id || !amount || !receipt_image_url || !fullName || !email) {
    return res.status(400).json({ error: 'Missing required fields or receipt image' });
  }

  try {
    const insertAdmission = db.prepare(`INSERT INTO admissions (full_name, email, transaction_id, source, amount, currency) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertPayment = db.prepare(`INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status, receipt_image_url) VALUES (?, ?, ?, ?, ?, ?)`);

    const transaction = db.transaction(() => {
      insertAdmission.run(fullName, email, transaction_id, payment_source, amount, currency);
      return insertPayment.run(transaction_id, amount, currency, payment_source, 'Pending', receipt_image_url);
    });

    const info = transaction();
    res.status(201).json({ status: 'Submitted for Approval', id: info.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Reference Number/TID already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: Get All Admission Status (Joined)
app.get('/api/v1/admin/admissions-status', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        a.*, 
        p.status as payment_status, 
        p.payment_source as verified_source,
        p.receipt_image_url
      FROM admissions a
      LEFT JOIN payment_logs p ON a.transaction_id = p.transaction_id
      ORDER BY a.timestamp DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: Get Pending Approvals (For international receipts)
app.get('/api/v1/admin/approvals', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM payment_logs WHERE status = 'Pending'`).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: Approve Payment
app.post('/api/v1/admin/approve', (req, res) => {
  const { id } = req.body; // payment_logs id
  try {
    db.prepare(`UPDATE payment_logs SET status = 'Verified' WHERE id = ?`).run(id);
    res.json({ status: 'Verified' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve index.html for any other routes (SPA)
// Serve index.html for any other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
