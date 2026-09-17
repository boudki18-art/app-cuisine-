// requests.js — endpoints CRUD pour les demandes d'achat.

const express = require('express');
const { randomUUID } = require('crypto');
const db = require('./db'); // Correction du chemin ici

const router = express.Router();

function rowToApi(row) {
  return {
    id: row.id,
    date: row.date,
    product: row.product,
    quantity: row.quantity,
    unit: row.unit,
    reason: row.reason,
    mealsCount: row.meals_count,
    peopleCount: row.people_count,
    comment: row.comment,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/requests
router.get('/', (req, res) => {
  const { dateFrom, dateTo, product, reason, status, year, search } = req.query;
  let sql = 'SELECT * FROM requests WHERE 1=1';
  const params = [];

  if (dateFrom) { sql += ' AND date >= ?'; params.push(dateFrom); }
  if (dateTo) { sql += ' AND date <= ?'; params.push(dateTo); }
  if (product) { sql += ' AND product = ?'; params.push(product); }
  if (reason) { sql += ' AND reason = ?'; params.push(reason); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (year) { sql += ' AND date LIKE ?'; params.push(`${year}-%`); }
  if (search) {
    sql += ' AND (product LIKE ? OR comment LIKE ? OR created_by LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  sql += ' ORDER BY date DESC, created_at DESC';
  
  try {
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(rowToApi));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests
router.post('/', (req, res) => {
  const { date, product, quantity, unit, reason, mealsCount, peopleCount, comment, createdBy } = req.body;

  if (!date || !product || quantity === undefined || quantity === null || !unit || !reason || !createdBy) {
    return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO requests (id, date, product, quantity, unit, reason, meals_count, people_count, comment, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Demandé', ?, ?)
    `).run(id, date, product, Number(quantity), unit, reason, mealsCount || null, peopleCount || null, comment || '', createdBy, now);

    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.status(201).json(rowToApi(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/requests/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const existing = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Demande introuvable.' });

    const simpleFields = { date: 'date', product: 'product', unit: 'unit', reason: 'reason', comment: 'comment', status: 'status', createdBy: 'created_by' };
    const updates = [];
    const params = [];

    Object.entries(simpleFields).forEach(([bodyKey, column]) => {
      if (req.body[bodyKey] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(req.body[bodyKey]);
      }
    });
    if (req.body.quantity !== undefined) { updates.push('quantity = ?'); params.push(Number(req.body.quantity)); }
    if (req.body.mealsCount !== undefined) { updates.push('meals_count = ?'); params.push(req.body.mealsCount || null); }
    if (req.body.peopleCount !== undefined) { updates.push('people_count = ?'); params.push(req.body.peopleCount || null); }

    if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour.' });

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    db.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    res.json(rowToApi(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/requests/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Demande introuvable.' });
    db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
