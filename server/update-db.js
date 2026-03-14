const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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
  `, (err) => {
    if (err) {
      console.error('Error creating admissions table:', err.message);
    } else {
      console.log('admissions table ready.');
    }
  });
});

db.close();
