// server.js — point d'entrée du serveur.
// Sert l'API (/api/...) ET les fichiers du frontend, pour n'avoir
// qu'une seule adresse à ouvrir sur ordinateur ou téléphone.

const express = require('express');
const cors = require('cors');
const path = require('path');

const requestsRouter = require('./routes/requests');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/requests', requestsRouter);
app.use('/api/auth', authRouter);

// Fichiers statiques du frontend (index.html, styles.css, app.js, logo...)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`Registre des achats — serveur démarré sur http://localhost:${PORT}`);
});
