require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Email Transporter (Configured via .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendVerificationEmail = async (toEmail, studentName, tid) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP Credentials missing. Skipping email for:', toEmail);
    return;
  }

  const mailOptions = {
    from: `"Admissions Portal" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Action Required: Admission Payment Verified',
    html: `
      <h2>Payment Verified!</h2>
      <p>Dear ${studentName},</p>
      <p>We are pleased to inform you that your payment for Transaction ID <b>${tid}</b> has been successfully verified.</p>
      <p>Your admission form status is now updated. Welcome to the Global Education Portal 2026!</p>
      <br/>
      <p>Best Regards,<br/>Admissions Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to: ${toEmail}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

// Middleware
const distPath = path.join(__dirname, '../client/dist');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(distPath));

console.log('Serving static files from:', distPath);
if (!fs.existsSync(distPath)) {
  console.warn('Warning: client/dist directory NOT found!');
}

// Database setup
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Promisify DB operations
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

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
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT,
      email TEXT,
      mobile_number TEXT,
      cnic TEXT,
      course TEXT,
      transaction_id TEXT,
      source TEXT,
      amount REAL,
      currency TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (!err) {
      // If table just created or exists, ensure new columns are there (Migration)
      const cols = [
        { name: 'mobile_number', type: 'TEXT' },
        { name: 'cnic', type: 'TEXT' },
        { name: 'course', type: 'TEXT' }
      ];
      cols.forEach(col => {
        db.run(`ALTER TABLE admissions ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error(`Migration Error (${col.name}):`, alterErr.message);
          }
        });
      });
    }
  });
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
  const secretKey = req.headers['x-gateway-secret'] || req.query.secret || req.body.secret;
  const expectedKey = process.env.GATEWAY_SECRET_KEY;
  
  if (secretKey === expectedKey && expectedKey) {
    next();
  } else {
    console.error(`[${new Date().toISOString()}] Auth Failed: Expected [${expectedKey}], but received [${secretKey}]`);
    res.status(401).json({ error: 'Unauthorized: Invalid Gateway Secret Key', received: secretKey });
  }
};

// --- Task 2: Local SMS Parsing Engine ---
app.post('/api/v1/gateway/local-sms', authenticateGateway, async (req, res) => {
  console.log(`[${new Date().toISOString()}] SMS Gateway Request received from IP: ${req.ip}`);

  const message_body = req.body.message_body || req.body.body || req.body.text || req.body.message || req.body.msg || 
                       req.query.message_body || req.query.body || req.query.text || req.query.message || req.query.msg || req.query.m;
  
  const sender = req.body.sender || req.body.from || req.body.phone || 
                 req.query.sender || req.query.from || req.query.phone || req.query.s;
  
  if (!message_body || 
      message_body === '[message]' || 
      message_body === '%msg%' || 
      message_body === '{msg}' || 
      message_body === '{formatted-msg}') {
    console.warn('Invalid Payload: App is sending literal placeholders. Received Body:', JSON.stringify(req.body));
    return res.status(422).json({ 
      error: 'Failed to parse required fields', 
      details: 'The app is sending the literal tag code instead of the real SMS text.',
      raw: message_body 
    });
  }

  let transaction_id = null;
  let amount = null;
  let payment_source = 'Unknown';

  if (sender === '8558' || message_body.toLowerCase().includes('easypaisa')) {
    const tidMatch = message_body.match(/(?:TID|Trans ID)[:\s]*(\d+)/i);
    const amountMatch = message_body.match(/(?:Rs\.?|Amount)[:\s]*([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = 'EasyPaisa';
  } 
  else if (sender === '8585' || message_body.toLowerCase().includes('jazzcash') || message_body.toLowerCase().includes('jazz')) {
    const tidMatch = message_body.match(/(?:TID|Ref)[:\s]*(\d+)/i);
    const amountMatch = message_body.match(/(?:Rs\.?|Amount)[:\s]*([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = message_body.toLowerCase().includes('jazzcash') ? 'JazzCash' : 'Jazz';
  }
  else if (message_body.includes('NayaPay') || message_body.includes('SadaPay')) {
    const tidMatch = message_body.match(/(?:Ref No|Reference Code|TID)[:\s]*([A-Z0-9]+)/i);
    const amountMatch = message_body.match(/(?:Amount Received|Rs\.?|Amount)[:\s]*([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = message_body.includes('NayaPay') ? 'NayaPay' : 'SadaPay';
  }
  else {
    const tidMatch = message_body.match(/(?:Ref No|TRX ID|TID|Reference|Ref)[:\s]*([A-Z0-9]+)/i);
    const amountMatch = message_body.match(/(?:PKR|Rs\.?|Amount)[:\s]*([\d,.]+)/i);
    transaction_id = tidMatch ? tidMatch[1] : null;
    amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    payment_source = 'Bank/Other';
  }

  if (!transaction_id) {
    const tidMatch = message_body.match(/(?:TID|Ref)[:\s]*(\d{10,12})/i);
    if (tidMatch) transaction_id = tidMatch[1];
  }

  if (transaction_id && amount) {
    try {
      await dbRun(`INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status) VALUES (?, ?, ?, ?, ?)`, 
        [transaction_id, amount, 'PKR', payment_source, 'Verified']);
      console.log(`Successfully verified TID: ${transaction_id}`);

      // Auto-match: If an admission already exists for this TID, send email
      const admission = await dbGet(`SELECT full_name, email FROM admissions WHERE transaction_id = ?`, [transaction_id]);
      if (admission) {
        sendVerificationEmail(admission.email, admission.full_name, transaction_id);
      }

      res.status(200).json({ status: 'Parsed & Saved', transaction_id, amount });
    } catch (err) {
      console.error('Database Error during SMS parsing:', err.message);
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Transaction already exists' });
      }
      return res.status(500).json({ error: 'Database error' });
    }
  } else {
    console.warn('Connection Successful but Parsing Failed:', message_body);
    res.status(200).json({ 
      status: 'Connected', 
      details: 'Website reached successfully! This message is not a bank payment.' 
    });
  }
});

// --- Task 3: International Payment / Admin ---

// Submit Student Admission (Immediate)
app.post('/api/v1/admission/submit', async (req, res) => {
  const { fullName, email, mobileNumber, cnic, course, tid, source, amount, currency } = req.body;

  if (!fullName || !email || !tid || !mobileNumber || !cnic || !course) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await dbRun(`INSERT INTO admissions (full_name, email, mobile_number, cnic, course, transaction_id, source, amount, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName, email, mobileNumber, cnic, course, tid, source, amount, currency || 'PKR']);
    
    // Check if payment already exists
    const payment = await dbGet(`SELECT status FROM payment_logs WHERE transaction_id = ?`, [tid]);
    if (payment && payment.status === 'Verified') {
      sendVerificationEmail(email, fullName, tid);
    }

    res.status(201).json({ status: 'Submitted', id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Verify a TID (Public check)
app.get('/api/v1/verify-payment/:tid', async (req, res) => {
  const { tid } = req.params;
  try {
    const row = await dbGet(`SELECT * FROM payment_logs WHERE transaction_id = ?`, [tid]);
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
app.post('/api/v1/admission/international-payment', upload.single('receipt'), async (req, res) => {
  const { fullName, email, mobileNumber, cnic, course, transaction_id, amount, currency, payment_source } = req.body;
  const receipt_image_url = req.file ? `/uploads/${req.file.filename}` : null;

  if (!transaction_id || !amount || !receipt_image_url || !fullName || !email || !mobileNumber || !cnic || !course) {
    return res.status(400).json({ error: 'Missing required fields or receipt image' });
  }

  try {
    await dbRun('BEGIN TRANSACTION');
    await dbRun(`INSERT INTO admissions (full_name, email, mobile_number, cnic, course, transaction_id, source, amount, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName, email, mobileNumber, cnic, course, transaction_id, payment_source, amount, currency]);
    const result = await dbRun(`INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status, receipt_image_url) VALUES (?, ?, ?, ?, ?, ?)`,
      [transaction_id, amount, currency, payment_source, 'Pending', receipt_image_url]);
    await dbRun('COMMIT');
    res.status(201).json({ status: 'Submitted for Approval', id: result.lastID });
  } catch (err) {
    await dbRun('ROLLBACK');
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Reference Number/TID already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: Get All Admission Status (Joined)
app.get('/api/v1/admin/admissions-status', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT 
        a.*, 
        p.id as log_id,
        p.status as payment_status, 
        p.payment_source as verified_source,
        p.receipt_image_url
      FROM admissions a
      LEFT JOIN payment_logs p ON a.transaction_id = p.transaction_id
      ORDER BY a.timestamp DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: Approve Payment
app.post('/api/v1/admin/approve', async (req, res) => {
  const { id } = req.body; // payment_logs id
  try {
    await dbRun(`UPDATE payment_logs SET status = 'Verified' WHERE id = ?`, [id]);
    
    // Find the student linked to this payment log to send email
    const record = await dbGet(`
      SELECT a.full_name, a.email, a.transaction_id 
      FROM admissions a
      INNER JOIN payment_logs p ON a.transaction_id = p.transaction_id
      WHERE p.id = ?
    `, [id]);
    
    if (record) {
      sendVerificationEmail(record.email, record.full_name, record.transaction_id);
    }

    res.json({ status: 'Verified' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: Force Match
app.post('/api/v1/admin/force-match', async (req, res) => {
  const { transaction_id, amount, currency, source } = req.body;
  try {
    await dbRun(`INSERT INTO payment_logs (transaction_id, amount, currency, payment_source, status) VALUES (?, ?, ?, ?, ?)`,
      [transaction_id, amount, currency || 'PKR', source || 'Manual', 'Verified']);
    
    const admission = await dbGet(`SELECT full_name, email FROM admissions WHERE transaction_id = ?`, [transaction_id]);
    if (admission) {
      sendVerificationEmail(admission.email, admission.full_name, transaction_id);
    }

    res.json({ status: 'Verified' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Transaction already verified' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// SPA Fallback
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
