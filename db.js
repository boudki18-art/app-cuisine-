// db.js — connexion à la base de données SQLite et création du schéma.
// La base est un simple fichier (data/riad.db) : aucune installation de
// serveur de base de données séparé n'est nécessaire.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'riad.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    product TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    reason TEXT NOT NULL,
    meals_count INTEGER,
    people_count INTEGER,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'Demandé',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Mot de passe manager par défaut : "1234" (haché). Modifiable ensuite
// depuis l'application (bouton "Changer le mot de passe").
const DEFAULT_PASSWORD = '1234';
const existingPwd = db.prepare('SELECT value FROM settings WHERE key = ?').get('manager_password_hash');
if (!existingPwd) {
  const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('manager_password_hash', hash);
  console.log(`Mot de passe manager initialisé par défaut à "${DEFAULT_PASSWORD}" — à changer dès la première connexion.`);
}

module.exports = db;
