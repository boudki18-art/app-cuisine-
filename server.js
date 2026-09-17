const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());

// C'est cette ligne magique qui permet à Express de servir index.html, styles.css et app.js tout seul
app.use(express.static(path.join(__dirname)));

module.exports = app;
