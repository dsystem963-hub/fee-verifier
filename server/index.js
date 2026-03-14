require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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
const db = new sqlite3.Database(dbPath);

// Initialize Tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT UNIQUE,
      amount REAL,
      currency TEXT,
      payment_source TEXT,
      status TEXT,
      receipt_image_url TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT,
      email TEXT,
      transaction_id TEXT,
      source TEXT,
      amount REAL,
      currency TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

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
    const query = `INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [transaction_id, amount, 'PKR', payment_source, 'Verified'], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Transaction already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(200).json({ status: 'Parsed & Saved', transaction_id, amount });
    });
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

  const query = `INSERT INTO admissions (full_name, email, transaction_id, source, amount, currency) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [fullName, email, tid, source, amount, currency || 'PKR'], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ status: 'Submitted', id: this.lastID });
  });
});

// Verify a TID (Public check)
app.get('/api/v1/verify-payment/:tid', (req, res) => {
  const { tid } = req.params;
  db.get(`SELECT * FROM payment_logs WHERE transaction_id = ?`, [tid], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row && row.status === 'Verified') {
      res.json({ verified: true, data: row });
    } else {
      res.json({ verified: false, message: 'Matching process active...' });
    }
  });
});

// Submit International Payment Evidence
app.post('/api/v1/admission/international-payment', upload.single('receipt'), (req, res) => {
  const { fullName, email, transaction_id, amount, currency, payment_source } = req.body;
  const receipt_image_url = req.file ? `/uploads/${req.file.filename}` : null;

  if (!transaction_id || !amount || !receipt_image_url || !fullName || !email) {
    return res.status(400).json({ error: 'Missing required fields or receipt image' });
  }

  // Double entry: Save to admissions AND payment_logs as Pending
  db.serialize(() => {
    db.run(`INSERT INTO admissions (full_name, email, transaction_id, source, amount, currency) VALUES (?, ?, ?, ?, ?, ?)`, 
      [fullName, email, transaction_id, payment_source, amount, currency]);
    
    db.run(`INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status, receipt_image_url) VALUES (?, ?, ?, ?, ?, ?)`, 
      [transaction_id, amount, currency, payment_source, 'Pending', receipt_image_url], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Reference Number/TID already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ status: 'Submitted for Approval', id: this.lastID });
      });
  });
});

// Admin: Get All Admission Status (Joined)
app.get('/api/v1/admin/admissions-status', (req, res) => {
  const query = `
    SELECT 
      a.*, 
      p.status as payment_status, 
      p.payment_source as verified_source,
      p.receipt_image_url
    FROM admissions a
    LEFT JOIN payment_logs p ON a.transaction_id = p.transaction_id
    ORDER BY a.timestamp DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Admin: Get Pending Approvals (For international receipts)
app.get('/api/v1/admin/approvals', (req, res) => {
  db.all(`SELECT * FROM payment_logs WHERE status = 'Pending'`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Admin: Approve Payment
app.post('/api/v1/admin/approve', (req, res) => {
  const { id } = req.body; // payment_logs id
  db.run(`UPDATE payment_logs SET status = 'Verified' WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ status: 'Verified' });
  });
});

// Serve index.html for any other routes (SPA)
// Serve index.html for any other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
