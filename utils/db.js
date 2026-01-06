const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./db/database.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS personnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Ensure rank column exists (safe for existing DB)
  db.all("PRAGMA table_info(personnel)", (err, cols) => {
    if (!err) {
      const hasRank = cols && cols.some(c => c.name === 'rank');
      if (!hasRank) {
        db.run("ALTER TABLE personnel ADD COLUMN rank TEXT");
      }
    }
  });
  // Ensure device_id column exists
  db.all("PRAGMA table_info(personnel)", (err2, cols2) => {
    if (!err2) {
      const hasDevice = cols2 && cols2.some(c => c.name === 'device_id');
      if (!hasDevice) {
        db.run("ALTER TABLE personnel ADD COLUMN device_id TEXT");
      }
    }
  });
  // Ensure first_name and last_name columns exist and migrate from `name` if needed
  db.all("PRAGMA table_info(personnel)", (err3, cols3) => {
    if (!err3) {
      const hasFirst = cols3 && cols3.some(c => c.name === 'first_name');
      const hasLast = cols3 && cols3.some(c => c.name === 'last_name');
      if (!hasFirst) {
        db.run("ALTER TABLE personnel ADD COLUMN first_name TEXT");
      }
      if (!hasLast) {
        db.run("ALTER TABLE personnel ADD COLUMN last_name TEXT");
      }
      // migrate existing `name` into first_name/last_name for rows where they are null
      db.all("SELECT id, name, first_name, last_name FROM personnel", (err4, rows) => {
        if (err4 || !rows) return;
        rows.forEach(r => {
          if ((!r.first_name || !r.last_name) && r.name) {
            const parts = r.name.trim().split(/\s+/);
            const first = parts.shift() || '';
            const last = parts.join(' ') || '';
            db.run('UPDATE personnel SET first_name = ?, last_name = ? WHERE id = ?', [first, last, r.id]);
          }
        });
      });
    }
  });
  // ensure uniqueness at DB level for device_id where not null
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_device ON personnel(device_id)");

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personnel_id INTEGER,
      checked_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT
    )
  `);
});

module.exports = db;

