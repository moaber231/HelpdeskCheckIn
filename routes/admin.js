const express = require("express");
const router = express.Router();
const db = require("../utils/db");
const bcrypt = require("bcrypt");
const QRCode = require("qrcode");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');


function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: "Not authorized" });
}

// Admin login
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM admin WHERE username = ?", [username], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!row) return res.status(401).json({ error: "Invalid credentials" });
    bcrypt.compare(password, row.password_hash, (err, ok) => {
      if (ok) {
        // ensure admin has a personnel record (auto-create on first login)
        db.get("SELECT * FROM personnel WHERE name = ?", [row.username], (err, person) => {
          if (err) return res.status(500).json({ error: 'DB error' });
          if (!person) {
            db.run("INSERT INTO personnel (name, is_active) VALUES (?, 1)", [row.username], function () {
              const pid = this.lastID;
              req.session.admin = { id: row.id, username: row.username, personnel_id: pid };
              return res.json({ success: true });
            });
          } else {
            req.session.admin = { id: row.id, username: row.username, personnel_id: person.id };
            return res.json({ success: true });
          }
        });
        return;
      }
      return res.status(401).json({ error: "Invalid credentials" });
    });
  });
});

// Admin logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// List checkins (protected)
router.get("/checkins", requireAdmin, (req, res) => {
  const from = req.query.from; // YYYY-MM-DD
  const to = req.query.to; // YYYY-MM-DD
  let params = [];
  let where = '';
  if (from && to) {
    where = 'WHERE checkins.checked_in_at BETWEEN ? AND ?';
    params = [`${from} 00:00:00`, `${to} 23:59:59`];
  } else if (from) {
    where = 'WHERE checkins.checked_in_at >= ?';
    params = [`${from} 00:00:00`];
  }

  const sql = `
    SELECT checkins.id, personnel.name, personnel.rank, checkins.checked_in_at
    FROM checkins
    JOIN personnel ON personnel.id = checkins.personnel_id
    ${where}
    ORDER BY checkins.checked_in_at DESC
  `;
  db.all(sql, params, (err, rows) => {
    res.json(rows || []);
  });
});

// Download PDF for a specific day (date=YYYY-MM-DD)
router.get('/download', requireAdmin, (req, res) => {
  const date = req.query.date; // expected YYYY-MM-DD
  if (!date) return res.status(400).json({ error: 'Missing date query param' });
  const start = `${date} 00:00:00`;
  const end = `${date} 23:59:59`;
  db.all(
    `SELECT personnel.name, personnel.rank, checkins.checked_in_at
     FROM checkins JOIN personnel ON personnel.id = checkins.personnel_id
     WHERE checkins.checked_in_at BETWEEN ? AND ?
     ORDER BY checkins.checked_in_at ASC`,
    [start, end],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });

      // generate PDF (table layout)
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="checkins-${date}.pdf"`);
      doc.pipe(res);

      // Header (include logo if provided in utils/logog.png)
      const logoPath = path.join(__dirname, '..', 'utils', 'logog.png');
      if (fs.existsSync(logoPath)) {
        try {
          const logoWidth = 100;
          const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
          const x = doc.page.margins.left + (pageWidth - logoWidth) / 2;
          doc.image(logoPath, x, doc.y, { width: logoWidth });
          doc.moveDown(1);
        } catch (e) {
          // ignore if image can't be embedded
        }
      }
      doc.fontSize(20).text('HelpDesk Check-ins', { align: 'left' });
      doc.fontSize(12).fillColor('gray').text(`Date: ${date}`, { align: 'right' });
      doc.moveDown(1);

      // Table header
      const tableTop = doc.y + 8;
      const columnWidths = { no: 30, name: 240, rank: 80, time: 180 };
      doc.fontSize(11).fillColor('black');
      doc.rect(doc.x - 2, tableTop - 4, columnWidths.no + columnWidths.name + columnWidths.rank + columnWidths.time + 10, 20).fillOpacity(0.03).fill('#000');
      doc.fillColor('black').text('#', doc.x, tableTop);
      doc.text('Name', doc.x + columnWidths.no, tableTop);
      doc.text('Rank', doc.x + columnWidths.no + columnWidths.name, tableTop);
      doc.text('Time', doc.x + columnWidths.no + columnWidths.name + columnWidths.rank, tableTop);
      doc.moveDown();

      // Rows
      doc.fontSize(10);
      rows.forEach((r, i) => {
        const y = doc.y;
        doc.text(String(i + 1), doc.x, y, { width: columnWidths.no });
        doc.text(r.name, doc.x + columnWidths.no, y, { width: columnWidths.name });
        doc.text(r.rank || '-', doc.x + columnWidths.no + columnWidths.name, y, { width: columnWidths.rank });
        doc.text(r.checked_in_at, doc.x + columnWidths.no + columnWidths.name + columnWidths.rank, y, { width: columnWidths.time });
        doc.moveDown();
      });

      doc.end();
    }
  );
});

// Change admin password
router.post('/change-password', requireAdmin, (req, res) => {
  const { current, password } = req.body;
  if (!current || !password) return res.status(400).json({ error: 'Missing fields' });
  // server-side password strength enforcement: at least 10 chars, letters, numbers, symbols
  const strong = /(?=.{10,})(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
  if (!strong.test(password)) return res.status(400).json({ error: 'Password must be at least 10 characters and include letters, numbers and symbols' });
  const adminId = req.session.admin.id;
  db.get('SELECT * FROM admin WHERE id = ?', [adminId], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'DB error' });
    bcrypt.compare(current, row.password_hash, (err, ok) => {
      if (!ok) return res.status(401).json({ error: 'Invalid current password' });
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Hash error' });
        db.run('UPDATE admin SET password_hash = ? WHERE id = ?', [hash, adminId], () => {
          res.json({ success: true });
        });
      });
    });
  });
});

// Personnel management
router.get("/personnel", requireAdmin, (req, res) => {
  // return personnel and include a computed `name` from first + last
  db.all("SELECT id, COALESCE(first_name || ' ' || last_name, name) as name, first_name, last_name, rank, device_id, is_active FROM personnel ORDER BY name", (err, rows) => {
    res.json(rows || []);
  });
});

router.post("/personnel", requireAdmin, (req, res) => {
  const { name, rank, device_id, first_name, last_name } = req.body;
  const fn = first_name || (name ? name.split(' ')[0] : '');
  const ln = last_name || (name ? name.split(' ').slice(1).join(' ') : '');
  // check device uniqueness and insert
  const insertAndMaybeGenerate = (devId) => {
    db.run('INSERT INTO personnel (name, first_name, last_name, rank, device_id) VALUES (?, ?, ?, ?, ?)', [ (fn + ' ' + ln).trim(), fn || null, ln || null, rank || null, devId || null], function () {
      const newId = this.lastID;
      if (devId) {
        return res.json({ success: true, id: newId });
      }
      // no device id provided: auto-generate registration token + QR for admin to hand to user
      const token = require('crypto').randomBytes(8).toString('hex');
      // ensure token is unique
      db.get('SELECT id FROM personnel WHERE device_id = ?', [token], (err, existing) => {
        if (existing) {
          // extremely unlikely, but respond without token
          return res.json({ success: true, id: newId });
        }
        db.run('UPDATE personnel SET device_id = ? WHERE id = ?', [token, newId], function (err) {
          // generate QR file
          const protocol = req.protocol; const host = req.get('host');
          const registerUrl = `${protocol}://${host}/register.html?token=${encodeURIComponent(token)}`;
          const qdir = path.join(__dirname, '..', 'public', 'qrcodes');
          try { fs.mkdirSync(qdir, { recursive: true }); } catch (e) {}
          const filePath = path.join(qdir, `register-${newId}.png`);
          QRCode.toFile(filePath, registerUrl, { errorCorrectionLevel: 'H', type: 'png' }, (err) => {
            if (err) return res.json({ success: true, id: newId });
            res.json({ success: true, id: newId, token, file: `/qrcodes/register-${newId}.png`, registerUrl });
          });
        });
      });
    });
  };

  if (device_id) {
    db.get('SELECT id FROM personnel WHERE device_id = ?', [device_id], (err, existing) => {
      if (existing) return res.status(400).json({ error: 'Device ID already in use' });
      insertAndMaybeGenerate(device_id);
    });
  } else {
    insertAndMaybeGenerate(null);
  }
});

// Delete personnel
router.delete('/personnel/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM personnel WHERE id = ?', [id], function(err){
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// Generate QR data URL for a personnel id (protected)
router.get("/qrcode/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const protocol = req.protocol;
  const host = req.get("host");
  const url = `${protocol}://${host}/checkin.html?id=${encodeURIComponent(id)}`;
  // ensure qrcodes directory exists
  const qdir = path.join(__dirname, '..', 'public', 'qrcodes');
  try { fs.mkdirSync(qdir, { recursive: true }); } catch (e) {}
  const filePath = path.join(qdir, `${id}.png`);
  QRCode.toFile(filePath, url, { errorCorrectionLevel: 'H', type: 'png' }, (err) => {
    if (err) {
      // fallback to dataURL
      QRCode.toDataURL(url, { errorCorrectionLevel: 'H' }, (err2, dataUrl) => {
        if (err2) return res.status(500).json({ error: 'QR generation failed' });
        res.json({ qrcode: dataUrl, url });
      });
    } else {
      // return public file url and data url
      const publicUrl = `/qrcodes/${id}.png`;
      QRCode.toDataURL(url, { errorCorrectionLevel: 'H' }, (err2, dataUrl) => {
        res.json({ qrcode: dataUrl, url, file: publicUrl });
      });
    }
  });
});

// Generate a single shared QR for wall-mounted check-in
router.get('/qrcode/common', requireAdmin, (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  const url = `${protocol}://${host}/checkin.html`;
  const qdir = path.join(__dirname, '..', 'public', 'qrcodes');
  try { fs.mkdirSync(qdir, { recursive: true }); } catch (e) {}
  const filePath = path.join(qdir, `common.png`);
  QRCode.toFile(filePath, url, { errorCorrectionLevel: 'H', type: 'png' }, (err) => {
    if (err) return res.status(500).json({ error: 'QR generation failed' });
    res.json({ file: '/qrcodes/common.png', url });
  });
});

// Generate a device token for a personnel and return registration QR
router.post('/personnel/:id/generate-token', requireAdmin, (req, res) => {
  const id = req.params.id;
  const token = require('crypto').randomBytes(8).toString('hex');
  // ensure token not used (very unlikely, but check)
  db.get('SELECT id FROM personnel WHERE device_id = ?', [token], (err, existing) => {
    if (existing) return res.status(500).json({ error: 'Token collision, retry' });
    db.run('UPDATE personnel SET device_id = ? WHERE id = ?', [token, id], function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      // generate QR that points to registration URL containing token
      const protocol = req.protocol; const host = req.get('host');
      const registerUrl = `${protocol}://${host}/register.html?token=${encodeURIComponent(token)}`;
      const qdir = path.join(__dirname, '..', 'public', 'qrcodes');
      try { fs.mkdirSync(qdir, { recursive: true }); } catch (e) {}
      const filePath = path.join(qdir, `register-${id}.png`);
      QRCode.toFile(filePath, registerUrl, { errorCorrectionLevel: 'H', type: 'png' }, (err) => {
        if (err) return res.status(500).json({ error: 'QR generation failed' });
        res.json({ token, file: `/qrcodes/register-${id}.png`, registerUrl });
      });
    });
  });
});

// Revoke device token for a personnel (clear device_id)
router.post('/personnel/:id/revoke-token', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.run('UPDATE personnel SET device_id = NULL WHERE id = ?', [id], function(err){
    if (err) return res.status(500).json({ error: 'DB error' });
    // remove any register QR image file
    const file = path.join(__dirname, '..', 'public', 'qrcodes', `register-${id}.png`);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch(e){}
    res.json({ success: true });
  });
});

// Regenerate device token for a personnel (replace device_id)
router.post('/personnel/:id/regenerate-token', requireAdmin, (req, res) => {
  const id = req.params.id;
  const token = require('crypto').randomBytes(8).toString('hex');
  db.get('SELECT id FROM personnel WHERE device_id = ?', [token], (err, existing) => {
    if (existing) return res.status(500).json({ error: 'Token collision, retry' });
    db.run('UPDATE personnel SET device_id = ? WHERE id = ?', [token, id], function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      const protocol = req.protocol; const host = req.get('host');
      const registerUrl = `${protocol}://${host}/register.html?token=${encodeURIComponent(token)}`;
      const qdir = path.join(__dirname, '..', 'public', 'qrcodes');
      try { fs.mkdirSync(qdir, { recursive: true }); } catch (e) {}
      const filePath = path.join(qdir, `register-${id}.png`);
      QRCode.toFile(filePath, registerUrl, { errorCorrectionLevel: 'H', type: 'png' }, (err) => {
        if (err) return res.status(500).json({ error: 'QR generation failed' });
        res.json({ token, file: `/qrcodes/register-${id}.png`, registerUrl });
      });
    });
  });
});

module.exports = router;


