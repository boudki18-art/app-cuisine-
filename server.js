const express = require('express');
const path = require('path');

const app = express();

// Configuration pour lire le JSON
app.use(express.json());

// Servir les fichiers statiques (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Export indispensable pour Vercel (PAS de app.listen ici)
module.exports = app;
