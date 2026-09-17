const express = require('express');
const cors = require('cors');
const path = require('path');

const requestsRouter = require('./requests');
const authRouter = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir explicitement les fichiers statiques de la racine
app.use(express.static(__dirname));

// Routes API
app.use('/api/requests', requestsRouter);
app.use('/api/auth', authRouter);

// IMPORTANT : Ne renvoyer index.html QUE pour les routes web, pas pour les fichiers manquants
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
