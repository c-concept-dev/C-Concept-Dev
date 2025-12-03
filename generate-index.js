#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration C Concept&Dev
const CONFIG = {
  sourceDir: '.',
  outputFile: 'index.html',
  excludeFiles: [
    'index.html', 
    'generate-index.js', 
    'package.json', 
    'package-lock.json',
    'node_modules', 
    '.git', 
    '.github'
  ],
  excludeDirs: [
    'node_modules',
    '.git',
    '.github',
    'json-user',
    'output'
  ],
  extensions: ['.html'],
  title: 'C Concept&Dev - Framework Clone Complet',
  header: 'C Concept&Dev',
  tagline: 'Framework de Clonage Psychologique Alimenté par l\'IA',
  author: 'Christophe BONNET',
  colors: {
    primary: '#8FAFB1',
    secondary: '#C8D0C3',
    tertiary: '#E6D7C3',
    accent: '#D8CDBB'
  }
};

/**
 * Vérifie si un chemin doit être exclu
 */
function shouldExclude(filePath) {
  // Exclure les dossiers
  for (const dir of CONFIG.excludeDirs) {
    if (filePath.includes(`/${dir}/`) || filePath.includes(`\\${dir}\\`)) {
      return true;
    }
  }
  
  // Exclure les fichiers spécifiques
  const fileName = path.basename(filePath);
  return CONFIG.excludeFiles.includes(fileName);
}

/**
 * Récupère tous les fichiers HTML du dossier
 */
function getHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    
    // Ignorer si exclu
    if (shouldExclude(filePath)) {
      return;
    }

    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Récursion dans les sous-dossiers
      getHtmlFiles(filePath, fileList);
    } else {
      // Vérifier l'extension
      const ext = path.extname(file).toLowerCase();
      if (CONFIG.extensions.includes(ext)) {
        fileList.push({
          path: filePath.replace(/\\/g, '/').replace('./', ''),
          name: file,
          dir: path.dirname(filePath).replace(/\\/g, '/').replace('.', ''),
          modified: stat.mtime,
          size: stat.size
        });
      }
    }
  });

  return fileList;
}

/**
 * Extrait le titre d'un fichier HTML
 */
function extractTitle(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
  } catch (error) {
    console.warn(`Impossible de lire ${filePath}:`, error.message);
  }
  return null;
}

/**
 * Formate la taille du fichier
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Formate la date
 */
function formatDate(date) {
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Catégorise les fichiers par type
 */
function categorizeFiles(files) {
  const categories = {
    tools: [],
    templates: [],
    examples: [],
    docs: [],
    other: []
  };

  files.forEach(file => {
    const pathLower = file.path.toLowerCase();
    
    if (pathLower.includes('tools/')) {
      categories.tools.push(file);
    } else if (pathLower.includes('templates/')) {
      categories.templates.push(file);
    } else if (pathLower.includes('examples/')) {
      categories.examples.push(file);
    } else if (pathLower.includes('docs/')) {
      categories.docs.push(file);
    } else {
      categories.other.push(file);
    }
  });

  return categories;
}

/**
 * Génère une carte de fichier HTML
 */
function generateFileCard(file) {
  const title = extractTitle(file.path) || file.name.replace('.html', '');
  const dirLabel = file.dir ? `📁 ${file.dir}` : '📄 Racine';
  
  // Icône selon catégorie
  let icon = '📄';
  if (file.path.includes('tools/')) icon = '🛠️';
  if (file.path.includes('templates/')) icon = '📋';
  if (file.path.includes('examples/')) icon = '🎯';
  if (file.path.includes('docs/')) icon = '📚';
  
  return `
    <div class="file-card">
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <h3><a href="${file.path}" target="_blank">${title}</a></h3>
        <p class="file-path">${dirLabel}</p>
        <div class="file-meta">
          <span>📅 ${formatDate(file.modified)}</span>
          <span>💾 ${formatSize(file.size)}</span>
        </div>
      </div>
    </div>`;
}

/**
 * Génère le HTML de l'index
 */
function generateIndexHtml(files) {
  const categories = categorizeFiles(files);
  
  // Générer sections par catégorie
  let sectionsHtml = '';
  
  if (categories.tools.length > 0) {
    sectionsHtml += `
    <section class="category-section">
      <h2 class="category-title">🛠️ Outils</h2>
      <div class="files-grid">
        ${categories.tools.map(generateFileCard).join('\n')}
      </div>
    </section>`;
  }
  
  if (categories.templates.length > 0) {
    sectionsHtml += `
    <section class="category-section">
      <h2 class="category-title">📋 Templates</h2>
      <div class="files-grid">
        ${categories.templates.map(generateFileCard).join('\n')}
      </div>
    </section>`;
  }
  
  if (categories.examples.length > 0) {
    sectionsHtml += `
    <section class="category-section">
      <h2 class="category-title">🎯 Exemples</h2>
      <div class="files-grid">
        ${categories.examples.map(generateFileCard).join('\n')}
      </div>
    </section>`;
  }
  
  if (categories.docs.length > 0) {
    sectionsHtml += `
    <section class="category-section">
      <h2 class="category-title">📚 Documentation</h2>
      <div class="files-grid">
        ${categories.docs.map(generateFileCard).join('\n')}
      </div>
    </section>`;
  }
  
  if (categories.other.length > 0) {
    sectionsHtml += `
    <section class="category-section">
      <h2 class="category-title">📄 Autres</h2>
      <div class="files-grid">
        ${categories.other.map(generateFileCard).join('\n')}
      </div>
    </section>`;
  }

  // Template HTML complet avec branding C Concept&Dev
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Auto-generated index - C Concept&Dev">
  <meta name="last-updated" content="${new Date().toISOString()}">
  <meta name="author" content="${CONFIG.author}">
  <title>${CONFIG.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, ${CONFIG.colors.primary} 0%, ${CONFIG.colors.secondary} 100%);
      min-height: 100vh;
      padding: 40px 20px;
      color: #333;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      background: white;
      padding: 60px 40px;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      margin-bottom: 40px;
      text-align: center;
    }

    h1 {
      color: ${CONFIG.colors.primary};
      font-size: 3.5rem;
      margin-bottom: 15px;
      font-weight: 700;
    }

    .tagline {
      color: #666;
      font-size: 1.3rem;
      margin-bottom: 10px;
      font-weight: 500;
    }

    .author {
      color: #888;
      font-size: 1rem;
      margin-top: 15px;
    }

    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 30px;
      flex-wrap: wrap;
    }

    .stat {
      background: linear-gradient(135deg, ${CONFIG.colors.tertiary} 0%, ${CONFIG.colors.accent} 100%);
      padding: 20px 30px;
      border-radius: 15px;
      border-top: 4px solid ${CONFIG.colors.primary};
      transition: transform 0.3s;
    }

    .stat:hover {
      transform: translateY(-5px);
    }

    .stat-number {
      color: ${CONFIG.colors.primary};
      font-size: 2.5rem;
      font-weight: 700;
    }

    .stat-label {
      color: #666;
      font-size: 0.9rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 5px;
    }

    .search-box {
      background: white;
      padding: 25px;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      margin-bottom: 40px;
    }

    .search-box input {
      width: 100%;
      padding: 18px 25px;
      border: 2px solid ${CONFIG.colors.secondary};
      border-radius: 12px;
      font-size: 1.1rem;
      font-family: 'Montserrat', sans-serif;
      transition: all 0.3s;
    }

    .search-box input:focus {
      outline: none;
      border-color: ${CONFIG.colors.primary};
      box-shadow: 0 0 0 4px rgba(143, 175, 177, 0.1);
    }

    .category-section {
      margin-bottom: 50px;
    }

    .category-title {
      color: ${CONFIG.colors.primary};
      font-size: 2rem;
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 3px solid ${CONFIG.colors.secondary};
      font-weight: 600;
    }

    .files-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 25px;
    }

    .file-card {
      background: white;
      border-radius: 15px;
      border-left: 5px solid ${CONFIG.colors.primary};
      padding: 25px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      transition: all 0.3s;
      display: flex;
      gap: 20px;
      align-items: start;
    }

    .file-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 15px 40px rgba(143, 175, 177, 0.3);
    }

    .file-icon {
      font-size: 2.5rem;
      flex-shrink: 0;
    }

    .file-info {
      flex: 1;
      min-width: 0;
    }

    .file-info h3 {
      margin-bottom: 8px;
      font-size: 1.2rem;
    }

    .file-info h3 a {
      color: #333;
      text-decoration: none;
      transition: color 0.3s;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-info h3 a:hover {
      color: ${CONFIG.colors.primary};
    }

    .file-path {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-meta {
      display: flex;
      gap: 15px;
      font-size: 0.85rem;
      color: #999;
      flex-wrap: wrap;
    }

    footer {
      background: white;
      padding: 30px;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      text-align: center;
      color: #666;
      margin-top: 60px;
    }

    .no-results {
      text-align: center;
      padding: 80px 40px;
      background: white;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      display: none;
    }

    .no-results.show {
      display: block;
    }

    .no-results h2 {
      color: ${CONFIG.colors.primary};
      font-size: 2rem;
      margin-bottom: 10px;
    }

    @media (max-width: 768px) {
      .files-grid {
        grid-template-columns: 1fr;
      }
      
      h1 {
        font-size: 2.5rem;
      }
      
      .stats {
        gap: 15px;
      }

      .stat {
        padding: 15px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧠 ${CONFIG.header}</h1>
      <p class="tagline">${CONFIG.tagline}</p>
      <p class="author">${CONFIG.author}</p>
      <div class="stats">
        <div class="stat">
          <div class="stat-number">${files.length}</div>
          <div class="stat-label">Pages HTML</div>
        </div>
        <div class="stat">
          <div class="stat-number">${categories.tools.length}</div>
          <div class="stat-label">Outils</div>
        </div>
        <div class="stat">
          <div class="stat-number">${categories.templates.length}</div>
          <div class="stat-label">Templates</div>
        </div>
        <div class="stat">
          <div class="stat-number">${categories.examples.length}</div>
          <div class="stat-label">Exemples</div>
        </div>
      </div>
    </header>

    <div class="search-box">
      <input 
        type="text" 
        id="searchInput" 
        placeholder="🔍 Rechercher un outil, template, exemple..."
        autocomplete="off"
      >
    </div>

    <div id="contentContainer">
      ${sectionsHtml}
    </div>

    <div class="no-results" id="noResults">
      <h2>😕 Aucun résultat</h2>
      <p>Essayez avec d'autres mots-clés</p>
    </div>

    <footer>
      <p><strong>C Concept&Dev</strong> - Framework de Clonage Psychologique</p>
      <p style="margin-top: 10px;">Par ${CONFIG.author}</p>
      <p style="margin-top: 15px; font-size: 0.9em;">
        ✨ Index généré automatiquement • ${files.length} pages • 
        Dernière mise à jour : ${formatDate(new Date())}
      </p>
      <p style="margin-top: 10px; font-size: 0.85em; color: #999;">
        <a href="https://github.com/c-concept-dev/C-Concept-Dev" style="color: ${CONFIG.colors.primary}; text-decoration: none;">
          📦 Voir sur GitHub
        </a>
      </p>
    </footer>
  </div>

  <script>
    // Fonction de recherche
    const searchInput = document.getElementById('searchInput');
    const contentContainer = document.getElementById('contentContainer');
    const noResults = document.getElementById('noResults');
    const allCards = document.querySelectorAll('.file-card');
    const allSections = document.querySelectorAll('.category-section');

    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      let totalVisible = 0;

      // Chercher dans toutes les cartes
      allCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          card.style.display = 'flex';
          totalVisible++;
        } else {
          card.style.display = 'none';
        }
      });

      // Cacher les sections vides
      allSections.forEach(section => {
        const visibleCards = section.querySelectorAll('.file-card[style="display: flex;"]');
        if (visibleCards.length === 0 || searchTerm) {
          section.style.display = searchTerm && visibleCards.length === 0 ? 'none' : 'block';
        } else {
          section.style.display = 'block';
        }
      });

      // Afficher "aucun résultat" si nécessaire
      if (totalVisible === 0) {
        contentContainer.style.display = 'none';
        noResults.classList.add('show');
      } else {
        contentContainer.style.display = 'block';
        noResults.classList.remove('show');
      }
    });

    // Animation au chargement
    allCards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.transition = 'all 0.5s';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, index * 30);
    });
  </script>
</body>
</html>`;
}

/**
 * Fonction principale
 */
function main() {
  console.log('🚀 Génération de l\'index C Concept&Dev en cours...\n');

  // Scanner les fichiers
  const files = getHtmlFiles(CONFIG.sourceDir);
  console.log(`✅ ${files.length} fichier(s) HTML trouvé(s)`);

  if (files.length === 0) {
    console.log('⚠️  Aucun fichier HTML trouvé !');
    return;
  }

  // Générer le HTML
  const html = generateIndexHtml(files);

  // Écrire le fichier
  fs.writeFileSync(CONFIG.outputFile, html, 'utf-8');
  console.log(`\n✨ Index généré avec succès : ${CONFIG.outputFile}`);
  console.log(`📊 Statistiques :`);
  
  const categories = categorizeFiles(files);
  console.log(`   - Outils : ${categories.tools.length}`);
  console.log(`   - Templates : ${categories.templates.length}`);
  console.log(`   - Exemples : ${categories.examples.length}`);
  console.log(`   - Docs : ${categories.docs.length}`);
  console.log(`   - Autres : ${categories.other.length}`);
}

// Exécution
main();
