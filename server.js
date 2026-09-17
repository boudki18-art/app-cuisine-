const express = require('express');
const cors = require('cors');
const path = require('path');

const requestsRouter = require('./requests');
const authRouter = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Indiquer à Express où trouver les fichiers statiques (CSS, JS, images)
app.use(express.static(__dirname));

// Routes API
app.use('/api/requests', requestsRouter);
app.use('/api/auth', authRouter);

// Rediriger toutes les autres pages vers index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
