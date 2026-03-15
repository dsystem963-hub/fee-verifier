const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : null;
const supabaseKey = process.env.SUPABASE_KEY ? process.env.SUPABASE_KEY.trim() : null;

console.log('--- Initializing Supabase ---');
console.log('URL defined:', !!supabaseUrl);
console.log('Key defined:', !!supabaseKey);

let supabase;
try {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing. Check Render Environment Variables.');
  }
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client created successfully.');
} catch (error) {
  console.error('FAILED to initialize Supabase:', error.message);
}

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

// Health Check
app.get('/health', async (req, res) => {
  let dbConnection = false;
  let writeTest = false;
  let writeError = null;
  
  try {
    if (supabase) {
      // 1. Test Read
      const { data, error: readError } = await supabase.from('admissions').select('count', { count: 'exact', head: true });
      if (!readError) dbConnection = true;

      // 2. Test Realistic Write (No ID provided, relies on DB default)
      const { data: insertedData, error: insertError } = await supabase.from('admissions').insert([{ 
        full_name: 'HEALTH_CHECK_TEST_' + Date.now(), 
        email: 'test@healthcheck.com' 
      }]).select();
      
      if (!insertError) {
        writeTest = true;
        // Cleanup
        if (insertedData && insertedData[0]) {
          await supabase.from('admissions').delete().eq('id', insertedData[0].id);
        }
      } else {
        writeError = insertError;
      }
    }
  } catch (e) {
    writeError = { message: e.message, stack: e.stack };
  }

  res.json({ 
    status: 'ok', 
    supabase_initialized: !!supabase,
    supabase_connected: dbConnection,
    write_test: writeTest,
    write_error: writeError,
    env_vars: {
      url: !!process.env.SUPABASE_URL,
      key: !!process.env.SUPABASE_KEY,
      gateway: !!process.env.GATEWAY_SECRET_KEY
    }
  });
});

// (SQLite initialization removed - using Supabase)

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
  const payload = req.body;
  console.log(`[${new Date().toISOString()}] Incoming SMS:`, payload);

  const getField = (obj, variations) => {
    if (!obj) return null;
    const keys = Object.keys(obj);
    for (const v of variations) {
      const match = keys.find(k => k.toLowerCase() === v.toLowerCase());
      if (match && obj[match]) return obj[match];
    }
    return null;
  };

  const bodyFields = ['message_body', 'message', 'msg', 'body', 'text', 'sms', 'messageBody'];
  const message_body = getField(req.body, bodyFields) || getField(req.query, bodyFields);
  
  if (!message_body) return res.status(400).json({ error: 'No message body' });

  let tid = null;
  let amt = null;
  let source = 'SMS Gateway';

  const tidMatch = message_body.match(/(?:TID|Ref|Trans ID)[:\s]*([A-Z0-9]+)/i);
  const amtMatch = message_body.match(/(?:Rs\.?|Amount|PKR)[:\s]*([\d,.]+)/i);

  if (tidMatch && amtMatch) {
    tid = tidMatch[1];
    amt = parseFloat(amtMatch[1].replace(/,/g, ''));

    try {
      const { error: logError } = await supabase
        .from('payment_logs')
        .upsert({
          transaction_id: tid,
          amount: amt,
          currency: 'PKR',
          payment_source: source,
          status: 'Verified',
          timestamp: new Date().toISOString()
        }, { onConflict: 'transaction_id' });

      if (logError) throw logError;

      // Check for admission (maybeSingle won't throw if not found)
      const { data: student } = await supabase
        .from('admissions')
        .select('*')
        .eq('transaction_id', tid)
        .maybeSingle();

      if (student) {
        await sendVerificationEmail(student.email, student.full_name, tid);
      }

      res.json({ success: true, tid, amt });
    } catch (err) {
      console.error('Supabase Gateway Error:', err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.json({ status: 'Ignored', reason: 'No TID/Amount found' });
  }
});

// --- Task 3: International Payment / Admin ---

// Submit Student Admission (Immediate)
app.post('/api/v1/admission/submit', async (req, res) => {
  const { fullName, email, mobileNumber, cnic, course, tid, source, amount, currency } = req.body;
  console.log('--- Submission Received ---');
  console.log('Data:', { fullName, email, tid, amount });

  try {
    console.log('Step 1: Inserting into admissions table...');
    const { error: admError } = await supabase
      .from('admissions')
      .insert([{
        full_name: fullName || 'Unknown',
        email: email || 'No Email',
        mobile_number: mobileNumber,
        cnic,
        course,
        transaction_id: tid,
        source,
        amount: amount ? parseFloat(amount) : 0,
        currency: currency || 'PKR',
        timestamp: new Date().toISOString()
      }]);

    if (admError) {
      console.error('Step 1 FAILED:', admError);
      throw admError;
    }
    console.log('Step 1 SUCCESS');

    console.log('Step 2: Checking payment_logs...');
    const { data: log, error: logFetchError } = await supabase
      .from('payment_logs')
      .select('status')
      .eq('transaction_id', tid)
      .maybeSingle();

    if (logFetchError) {
      console.error('Step 2 FAILED:', logFetchError);
      throw logFetchError;
    }
    console.log('Step 2 SUCCESS. Log found:', !!log);

    if (log && (log.status === 'Verified' || log.status === 'verified')) {
      console.log('Step 3: Sending verification email...');
      await sendVerificationEmail(email, fullName, tid);
      console.log('Step 3 SUCCESS');
    }

    res.status(201).json({ 
      status: 'Submitted', 
      paymentStatus: (log && (log.status === 'Verified' || log.status === 'verified')) ? 'Verified' : 'Pending' 
    });
  } catch (err) {
    console.error('--- CRITICAL SUBMISSION ERROR ---');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    console.error('Full Error:', JSON.stringify(err, null, 2));

    let msg = err.message || 'Unknown Error';
    if (msg.toLowerCase().includes('fetch failed')) {
      msg = 'SUPABASE CONNECTION FAILURE: The server cannot reach your Supabase URL. This is usually a typo in the URL or a firewall issue.';
    }
    res.status(500).json({ error: msg, details: err });
  }
});

// Verify a TID (Public check)
app.get('/api/v1/verify-payment/:tid', async (req, res) => {
  const { tid } = req.params;
  try {
    const { data: log } = await supabase
      .from('payment_logs')
      .select('*')
      .eq('transaction_id', tid)
      .maybeSingle();

    if (log && (log.status === 'Verified' || log.status === 'verified')) {
      res.json({ verified: true, data: log });
    } else {
      res.json({ verified: false });
    }
  } catch (err) {
    res.json({ verified: false });
  }
});

// Submit International Payment Evidence
app.post('/api/v1/admission/international-payment', upload.single('receipt'), async (req, res) => {
  const { fullName, email, mobileNumber, cnic, course, transaction_id, amount, currency, payment_source } = req.body;
  const receipt_image_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const { error: admError } = await supabase
      .from('admissions')
      .insert([{
        full_name: fullName,
        email,
        mobile_number: mobileNumber,
        cnic,
        course,
        transaction_id,
        source: payment_source,
        amount,
        currency,
        timestamp: new Date().toISOString()
      }]);

    if (admError) throw admError;

    const { error: logError } = await supabase
      .from('payment_logs')
      .insert([{
        transaction_id,
        amount,
        currency,
        payment_source,
        status: 'Pending',
        receipt_image_url,
        timestamp: new Date().toISOString()
      }]);

    if (logError) throw logError;

    res.status(201).json({ status: 'Submitted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get All Admission Status (Joined)
app.get('/api/v1/admin/admissions-status', async (req, res) => {
  try {
    const { data: admissions } = await supabase
      .from('admissions')
      .select('*')
      .order('timestamp', { ascending: false });

    const { data: logs } = await supabase
      .from('payment_logs')
      .select('*');

    const combined = (admissions || []).map(a => {
      const log = (logs || []).find(l => l.transaction_id === a.transaction_id);
      return {
        ...a,
        log_id: log ? log.id : null,
        payment_status: log ? log.status : null,
        receipt_image_url: log ? log.receipt_image_url : null
      };
    });

    res.json(combined);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Approve Payment
app.post('/api/v1/admin/approve', async (req, res) => {
  const { id } = req.body;
  try {
    const { data: log } = await supabase
      .from('payment_logs')
      .update({ status: 'Verified' })
      .eq('id', id)
      .select()
      .single();

    if (log) {
      const { data: student } = await supabase
        .from('admissions')
        .select('*')
        .eq('transaction_id', log.transaction_id)
        .maybeSingle();

      if (student) {
        await sendVerificationEmail(student.email, student.full_name, log.transaction_id);
      }
    }
    res.json({ status: 'Verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Force Match
app.post('/api/v1/admin/force-match', async (req, res) => {
  const { transaction_id, amount, currency, source } = req.body;
  try {
    await supabase
      .from('payment_logs')
      .upsert({
        transaction_id,
        amount,
        currency: currency || 'PKR',
        payment_source: source || 'Manual',
        status: 'Verified',
        timestamp: new Date().toISOString()
      }, { onConflict: 'transaction_id' });

    const { data: student } = await supabase
      .from('admissions')
      .select('*')
      .eq('transaction_id', transaction_id)
      .maybeSingle();

    if (student) {
      await sendVerificationEmail(student.email, student.full_name, transaction_id);
    }

    res.json({ status: 'Verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
