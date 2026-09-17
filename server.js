const express = require('express');
const path = require('path');

const app = express();

// Configuration pour lire le JSON
app.use(express.json());

// Servir les fichiers statiques (CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// Route explicite pour la page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Export indispensable pour Vercel
module.exports = app;
