const express = require('express');
const path = require('path');

const app = express();

// Configuration pour lire les données envoyées en JSON
app.use(express.json());

// Indiquer à Express de servir tous les fichiers (HTML, CSS, JS) directement
app.use(express.static(path.join(__dirname)));

// Vos routes API (gardez vos routes existantes si vous en aviez d'autres plus bas, 
// ou laissez ce fichier ainsi pour tester)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT}`);
});
