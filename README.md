# Registre des achats — Le Jardin des Sens

Application de digitalisation des listes d'achats de la cuisine.
Deux espaces : **Cuisine** (créer des demandes) et **Manager**
(valider, suivre, historique, calendrier).

Contrairement à la version précédente (fichier HTML unique livré par
Claude), cette version a un **vrai serveur avec une vraie base de
données**. Résultat concret :

- Le mot de passe manager se sauvegarde réellement et pour de bon.
- Tous les téléphones et ordinateurs qui ouvrent l'adresse du serveur
  voient **exactement les mêmes données**, mises à jour automatiquement
  (rafraîchissement toutes les 15 secondes, et immédiatement après
  chaque action).
- L'historique est stocké dans une vraie base de données (SQLite),
  sans limite de durée.
- Cette application est **indépendante de Claude** : une fois
  hébergée, elle fonctionne sur n'importe quel navigateur, sans
  compte Claude, sans lien Claude, comme un site web classique.

## Structure du projet

```
riad-purchase-app/
├── backend/                  ← LE SERVEUR (API + base de données)
│   ├── server.js             point d'entrée : démarre le serveur
│   ├── db.js                 connexion à la base SQLite + schéma
│   ├── routes/
│   │   ├── requests.js       endpoints CRUD des demandes d'achat
│   │   └── auth.js           vérification / changement du mot de passe
│   ├── package.json          dépendances du serveur
│   └── data/                 (créé automatiquement) fichier de base de données
│
├── frontend/                 ← L'INTERFACE (ce que les gens voient)
│   ├── index.html            structure de la page
│   ├── styles.css            tout le style visuel (palette or/crème)
│   ├── app.js                toute la logique de l'application
│   └── assets/
│       └── logo.jpg          logo Le Jardin des Sens
│
├── .gitignore
└── README.md                 ce fichier
```

**Où mettre quoi si tu modifies quelque chose plus tard :**
- Un nouveau champ dans le formulaire, une nouvelle vue, un nouveau
  texte → `frontend/app.js` (et `frontend/styles.css` pour l'apparence).
- Une nouvelle règle métier, un nouveau filtre côté serveur, une
  nouvelle colonne en base → `backend/routes/requests.js` et
  `backend/db.js`.
- Le logo ou une image → `frontend/assets/`.

## Installation et lancement en local

Il faut [Node.js](https://nodejs.org) installé (version 18 ou plus récente).

```bash
cd backend
npm install
npm start
```

Le serveur démarre sur **http://localhost:3000**. Ouvre cette adresse
dans un navigateur : c'est l'application complète (le frontend est
servi automatiquement par le même serveur).

Le mot de passe manager par défaut est **1234** — à changer dès la
première connexion depuis le bouton "Changer le mot de passe".

## Où sont stockées les données ?

Dans un fichier `backend/data/riad.db` (base SQLite), créé
automatiquement au premier démarrage. C'est ce fichier qu'il faut
sauvegarder régulièrement (copie de sécurité) une fois en production.

## Rendre l'application accessible depuis les téléphones (hébergement)

Pour que la cuisine et le manager y accèdent depuis leurs téléphones,
le serveur doit tourner quelque part accessible sur Internet (ou au
minimum sur le réseau Wi-Fi du riad). Quelques options simples,
du plus facile au plus robuste :

1. **Un hébergeur gratuit/pas cher clé en main** (recommandé pour
   démarrer) : Render.com, Railway.app ou Fly.io. Il suffit de
   connecter le dossier `backend/` (le `frontend/` est servi par le
   même serveur) à un compte Git (GitHub) et de suivre leur
   assistant de déploiement Node.js. Ils donnent une adresse du type
   `https://tonapp.onrender.com` que tu partages avec l'équipe.
2. **Un petit serveur Wi-Fi local** : faire tourner l'application sur
   un ordinateur ou un mini-PC connecté au Wi-Fi du riad, et que
   cuisine + manager ouvrent l'adresse IP locale de cet ordinateur
   depuis leur téléphone (utile si tu ne veux pas exposer l'app sur
   Internet).
3. **Un vrai hébergement (VPS)** pour une utilisation plus intensive
   à long terme, avec un nom de domaine dédié — à envisager si l'outil
   devient central dans l'exploitation quotidienne.

Dans tous les cas, une fois hébergé, il n'y a qu'**une seule adresse**
à retenir et à ouvrir depuis n'importe quel navigateur — pas
d'application à installer, pas de compte à créer.

## Sécurité — à savoir

- Le mot de passe manager est haché (bcrypt) avant d'être stocké : il
  n'est jamais lisible en clair dans la base de données.
- Il n'y a en revanche pas de compte individuel par membre du
  personnel : un seul mot de passe partagé pour l'espace Manager.
  Si tu veux des comptes nominatifs plus tard, c'est une évolution
  possible du backend.
- Si l'application est exposée sur Internet, utilise de préférence un
  hébergeur qui fournit du HTTPS automatiquement (c'est le cas de
  Render, Railway et Fly.io) pour que le mot de passe circule chiffré.
