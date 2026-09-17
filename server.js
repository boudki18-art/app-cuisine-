// server.js - point d'entrée du serveur.

const express = require('express');
const cors = require('cors');
const path = require('path');

const requestsRouter = require('./requests');
const authRouter = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. Servir les fichiers statiques (index.html, styles.css, app.js, etc.)
app.use(express.static(__dirname));

// 2. Définir les routes API
app.use('/api/requests', requestsRouter);
app.use('/api/auth', authRouter);

// 3. Renvoyer index.html pour toutes les requêtes de pages principales
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
