// routes/auth.js — vérification et changement du mot de passe manager.
// Le mot de passe est stocké haché (bcrypt), jamais en clair.

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const router = express.Router();

function getPasswordHash() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('manager_password_hash');
  return row ? row.value : null;
}

// POST /api/auth/login — { password } -> { ok }
router.post('/login', (req, res) => {
  const { password } = req.body;
  const hash = getPasswordHash();
  const ok = !!hash && bcrypt.compareSync(password || '', hash);
  res.json({ ok });
});

// POST /api/auth/change-password — { currentPassword, newPassword } -> { ok }
router.post('/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const hash = getPasswordHash();
  const ok = !!hash && bcrypt.compareSync(currentPassword || '', hash);

  if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 4 caractères.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(newHash, 'manager_password_hash');
  res.json({ ok: true });
});

module.exports = router;
