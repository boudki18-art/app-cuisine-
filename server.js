const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());

// Définir explicitement le dossier racine pour les fichiers statiques
app.use(express.static(__dirname));

// Route explicite pour renvoyer index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;
