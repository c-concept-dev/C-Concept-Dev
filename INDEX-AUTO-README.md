# 📋 Système d'Index Automatique - C Concept&Dev

**Génération automatique d'un index HTML de tous les outils et pages du repo**

---

## 🎯 Qu'est-ce que c'est ?

Le système d'index automatique scanne tous les fichiers `.html` du repo et génère un **index.html** élégant qui liste tous les outils, templates, exemples et pages disponibles.

**Features** :
- ✅ Auto-génération à chaque push de fichier HTML
- ✅ Catégorisation automatique (Outils, Templates, Exemples, Docs)
- ✅ Recherche en temps réel
- ✅ Branding C Concept&Dev intégré
- ✅ Responsive et animations
- ✅ Statistiques en temps réel

---

## 🚀 Comment ça marche ?

### Déclenchement Automatique

À chaque fois que tu push un fichier `.html` :
1. GitHub Actions détecte le changement
2. Lance le script `generate-index.js`
3. Scanne tous les HTML du repo
4. Génère un nouvel `index.html`
5. Commit et push automatiquement

### Workflow

```
Push fichier.html
    ↓
GitHub Actions (.github/workflows/generate-index.yml)
    ↓
generate-index.js (Node.js)
    ↓
index.html généré
    ↓
Commit auto + push
    ↓
GitHub Pages mis à jour
```

---

## 🛠️ Utilisation Locale

### Prérequis
- Node.js 14+ installé

### Générer l'index manuellement

```bash
# À la racine du repo
node generate-index.js
```

Ou avec npm :
```bash
npm run generate
```

---

## 📂 Fichiers du Système

```
C-Concept-Dev/
├── generate-index.js          ← Script Node.js
├── package.json               ← Config Node.js
├── index.html                 ← Généré automatiquement (ne pas éditer !)
├── .github/
│   └── workflows/
│       └── generate-index.yml ← GitHub Actions
└── tools/                     ← Fichiers HTML scannés
    ├── clone-interview-pro/
    │   └── clone-interview-pro.html
    └── ...
```

---

## ⚙️ Configuration

Tu peux modifier la config dans `generate-index.js` (lignes 5-30) :

```javascript
const CONFIG = {
  title: 'C Concept&Dev - Framework Clone Complet',
  header: 'C Concept&Dev',
  tagline: 'Framework de Clonage Psychologique...',
  author: 'Christophe BONNET',
  colors: {
    primary: '#8FAFB1',    // Couleur principale
    secondary: '#C8D0C3',  // Couleur secondaire
    // ...
  },
  excludeFiles: [
    // Fichiers à ignorer
  ],
  excludeDirs: [
    'node_modules',
    '.git',
    'json-user',  // Dossiers privés
    'output'
  ]
};
```

---

## 🎨 Branding

**Couleurs C Concept&Dev** :
- Primaire : `#8FAFB1`
- Secondaire : `#C8D0C3`
- Tertiaire : `#E6D7C3`
- Accent : `#D8CDBB`

**Typo** : Montserrat (Google Fonts)

---

## 📊 Catégories Automatiques

Le script catégorise automatiquement les fichiers :

| Dossier         | Catégorie   | Icône |
|-----------------|-------------|-------|
| `tools/`        | 🛠️ Outils   | 🛠️    |
| `templates/`    | 📋 Templates | 📋    |
| `examples/`     | 🎯 Exemples  | 🎯    |
| `docs/`         | 📚 Docs      | 📚    |
| Autres          | 📄 Autres    | 📄    |

---

## 🔍 Fonctionnalités de l'Index

### Recherche
Barre de recherche en temps réel qui filtre par :
- Nom du fichier
- Titre de la page
- Chemin
- Catégorie

### Statistiques
- Nombre total de pages
- Pages par catégorie
- Date de dernière mise à jour

### Navigation
- Cartes cliquables
- Liens directs vers chaque page
- Design responsive (mobile-friendly)

---

## 🚦 Fichiers Exclus

Par défaut, le script **ignore** :
- `index.html` (pour éviter boucle)
- `node_modules/`
- `.git/`, `.github/`
- `json-user/` (données privées)
- `output/` (données générées)
- Fichiers de config (package.json, etc.)

---

## 🔄 Mise à Jour

Le workflow GitHub Actions se déclenche sur :
- Push de fichiers `**/*.html`
- Modification de `generate-index.js`
- Déclenchement manuel (workflow_dispatch)

**Note** : `index.html` est dans `.gitignore` des déclencheurs pour éviter les boucles infinies.

---

## 📝 Exemple de Structure Générée

```html
<!-- index.html généré -->
<!DOCTYPE html>
<html>
<head>
  <title>C Concept&Dev - Framework Clone Complet</title>
  <!-- Branding C Concept&Dev -->
</head>
<body>
  <header>
    <h1>🧠 C Concept&Dev</h1>
    <p>Framework de Clonage Psychologique...</p>
    <stats>
      <stat>12 Pages</stat>
      <stat>5 Outils</stat>
      <!-- ... -->
    </stats>
  </header>
  
  <search>
    <input placeholder="🔍 Rechercher..."/>
  </search>
  
  <section>🛠️ Outils</section>
  <section>📋 Templates</section>
  <section>🎯 Exemples</section>
  <!-- ... -->
</body>
</html>
```

---

## ✅ Tests

### Test local
```bash
# Générer l'index
node generate-index.js

# Ouvrir dans navigateur
open index.html
```

### Test GitHub Actions
1. Push un fichier `.html`
2. Aller sur GitHub → Actions tab
3. Vérifier workflow "🔄 Generate Index"
4. Vérifier que `index.html` a été commit

---

## 🆘 Troubleshooting

**Problème** : Index ne se génère pas  
**Solution** : Vérifier que Node.js est installé (`node --version`)

**Problème** : Workflow échoue sur GitHub  
**Solution** : Vérifier logs dans Actions tab

**Problème** : Fichiers manquants dans l'index  
**Solution** : Vérifier qu'ils ne sont pas dans `excludeFiles` ou `excludeDirs`

**Problème** : Boucle infinie de commits  
**Solution** : Vérifier que `index.html` est bien dans les paths exclus du workflow

---

## 📚 Ressources

- **Script** : `generate-index.js`
- **Workflow** : `.github/workflows/generate-index.yml`
- **Package** : `package.json`

---

## 🎊 Résultat Final

**URL live** : https://c-concept-dev.github.io/C-Concept-Dev/

L'index généré sera accessible à la racine du site GitHub Pages !

---

**Made with ❤️ by Christophe BONNET - C Concept&Dev**

*"Un index qui se met à jour tout seul."* 📋✨
