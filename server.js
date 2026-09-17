const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());

// Servir les fichiers statiques (CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// Route d'accueil explicite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;
