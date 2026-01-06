const express = require("express");
const router = express.Router();
const db = require("../utils/db");
const path = require('path');

// Serve the checkin page when a QR link is opened in a browser
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'checkin.html'));
});

router.post('/', (req, res) => {
  const { personnel_id, device_id } = req.body;
  const io = req.app.get('io');

  // choose finder based on provided device_id or personnel_id
  const finder = device_id ? 'SELECT * FROM personnel WHERE device_id = ? AND is_active = 1' : 'SELECT * FROM personnel WHERE id = ? AND is_active = 1';
  const finderParam = device_id ? device_id : personnel_id;

  db.get(finder, [finderParam], (err, person) => {
    if (!person) return res.status(400).json({ error: 'Invalid device or personnel' });

    // enforce cooldown: one checkin per ~18 hours (~64800000 ms)
    db.get(
      'SELECT checked_in_at FROM checkins WHERE personnel_id = ? ORDER BY checked_in_at DESC LIMIT 1',
      [person.id],
      (err, last) => {
        const now = new Date();
        const cooldownMs = 18 * 60 * 60 * 1000; // 18 hours
        if (last && last.checked_in_at) {
          const lastDate = new Date(last.checked_in_at);
          if (now - lastDate < cooldownMs) {
            return res.status(429).json({ error: 'You can only check in once per 18 hours' });
          }
        }

        db.run('INSERT INTO checkins (personnel_id) VALUES (?)', [person.id], function () {
          const checkinData = { id: this.lastID, name: person.name, rank: person.rank, time: new Date().toISOString() };
          io.emit('new_checkin', checkinData);
          res.json({ success: true, checkin: checkinData });
        });
      }
    );
  });
});

module.exports = router;

