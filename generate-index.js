#!/usr/bin/env node
/**
 * Generate Index - Structure Hierarchique
 * C Concept&Dev - Christophe BONNET
 * Generate index.html avec dossiers expandables
 */

const fs = require('fs');
const path = require('path');

console.log('Generation de l\'index C Concept&Dev en cours...\n');

// Configuration
const ROOT_DIR = process.cwd();
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /^index\.html$/,
  /\.DS_Store/,
  /^\..*$/
];

// Fonction pour parser le titre HTML
function extractTitle(htmlPath) {
  try {
    const content = fs.readFileSync(htmlPath, 'utf-8');
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].replace(/ - C Concept&Dev$/, '').trim();
    }
    return path.basename(htmlPath, '.html');
  } catch (err) {
    return path.basename(htmlPath, '.html');
  }
}

// Scanner récursif
function scanDirectory(dir, baseDir = ROOT_DIR) {
  const structure = {};
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      // Ignorer patterns
      if (IGNORE_PATTERNS.some(pattern => pattern.test(item))) {
        continue;
      }
      
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (stats.isDirectory()) {
        // Dossier : scanner récursivement
        const subStructure = scanDirectory(fullPath, baseDir);
        if (Object.keys(subStructure.files || {}).length > 0 || Object.keys(subStructure.folders || {}).length > 0) {
          structure[item] = subStructure;
        }
      } else if (stats.isFile() && item.endsWith('.html')) {
        // Fichier HTML
        if (!structure.files) structure.files = [];
        structure.files.push({
          name: item,
          path: relativePath.replace(/\\/g, '/'),
          title: extractTitle(fullPath),
          size: stats.size,
          modified: stats.mtime
        });
      }
    }
  } catch (err) {
    console.error('Erreur lecture ' + dir + ':', err.message);
  }
  
  return structure;
}

// Générer HTML pour un fichier
function generateFileHTML(file) {
  const sizeKB = (file.size / 1024).toFixed(1);
  const dateStr = file.modified.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return `
    <div class="file-item">
      <div class="file-icon">&#128196;</div>
      <div class="file-info">
        <h4><a href="${file.path}" target="_blank">${file.title}</a></h4>
        <div class="file-meta">
          <span>&#128197; ${dateStr}</span>
          <span>&#128190; ${sizeKB} KB</span>
        </div>
      </div>
    </div>`;
}

// Générer HTML pour un dossier
function generateFolderHTML(folderName, folderData, level = 0) {
  const files = folderData.files || [];
  const subfolders = Object.keys(folderData).filter(k => k !== 'files');
  
  const totalFiles = files.length;
  const folderId = 'folder-' + folderName.replace(/[^a-zA-Z0-9]/g, '-') + '-' + level;
  
  let html = `
    <div class="folder-container" data-level="${level}">
      <div class="folder-header" onclick="toggleFolder('${folderId}')">
        <span class="folder-icon">&#128193;</span>
        <span class="folder-name">${folderName}/</span>
        <span class="folder-count">(${totalFiles} fichier${totalFiles > 1 ? 's' : ''})</span>
        <span class="folder-toggle" id="${folderId}-toggle">&#9660;</span>
      </div>
      <div class="folder-content" id="${folderId}" style="display: block;">`;
  
  // Sous-dossiers
  for (const subfolder of subfolders) {
    html += generateFolderHTML(subfolder, folderData[subfolder], level + 1);
  }
  
  // Fichiers
  if (files.length > 0) {
    html += '<div class="files-list">';
    for (const file of files) {
      html += generateFileHTML(file);
    }
    html += '</div>';
  }
  
  html += `
      </div>
    </div>`;
  
  return html;
}

// Compter statistiques
function countStats(structure) {
  let stats = { files: 0, folders: 0 };
  
  function count(obj) {
    if (obj.files) {
      stats.files += obj.files.length;
    }
    for (const key in obj) {
      if (key !== 'files' && typeof obj[key] === 'object') {
        stats.folders++;
        count(obj[key]);
      }
    }
  }
  
  count(structure);
  return stats;
}

// Générer l'index complet
function generateIndex() {
  const structure = scanDirectory(ROOT_DIR);
  const stats = countStats(structure);
  
  console.log(stats.files + ' fichier(s) HTML trouve(s)');
  console.log(stats.folders + ' dossier(s) detecte(s)\n');
  
  let contentHTML = '';
  
  // Générer structure hiérarchique
  for (const topFolder in structure) {
    if (topFolder !== 'files') {
      contentHTML += generateFolderHTML(topFolder, structure[topFolder], 0);
    }
  }
  
  // Fichiers à la racine (si présents)
  if (structure.files && structure.files.length > 0) {
    contentHTML += `
    <div class="folder-container" data-level="0">
      <div class="folder-header">
        <span class="folder-icon">&#128193;</span>
        <span class="folder-name">Racine</span>
        <span class="folder-count">(${structure.files.length} fichier${structure.files.length > 1 ? 's' : ''})</span>
      </div>
      <div class="folder-content" style="display: block;">
        <div class="files-list">`;
    
    for (const file of structure.files) {
      contentHTML += generateFileHTML(file);
    }
    
    contentHTML += `
        </div>
      </div>
    </div>`;
  }
  
  const lastUpdate = new Date().toLocaleDateString('fr-FR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Auto-generated index - C Concept&Dev">
  <meta name="last-updated" content="${new Date().toISOString()}">
  <meta name="author" content="Christophe BONNET">
  <title>C Concept&Dev - Framework Clone Complet</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #8FAFB1 0%, #C8D0C3 100%);
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
      color: #8FAFB1;
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
      background: linear-gradient(135deg, #E6D7C3 0%, #D8CDBB 100%);
      padding: 20px 30px;
      border-radius: 15px;
      border-top: 4px solid #8FAFB1;
      transition: transform 0.3s;
    }

    .stat:hover {
      transform: translateY(-5px);
    }

    .stat-number {
      color: #8FAFB1;
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
      border: 2px solid #C8D0C3;
      border-radius: 12px;
      font-size: 1.1rem;
      font-family: 'Montserrat', sans-serif;
      transition: all 0.3s;
    }

    .search-box input:focus {
      outline: none;
      border-color: #8FAFB1;
      box-shadow: 0 0 0 4px rgba(143, 175, 177, 0.1);
    }

    .content {
      background: white;
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }

    .folder-container {
      margin-bottom: 20px;
      border-left: 3px solid #C8D0C3;
      padding-left: 0;
      transition: all 0.3s;
    }

    .folder-container[data-level="0"] {
      border-left-color: #8FAFB1;
      border-left-width: 4px;
    }

    .folder-container[data-level="1"] {
      margin-left: 20px;
    }

    .folder-container[data-level="2"] {
      margin-left: 40px;
    }

    .folder-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 15px 20px;
      background: #f8f9fa;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
      margin-bottom: 10px;
    }

    .folder-header:hover {
      background: #E6D7C3;
      transform: translateX(5px);
    }

    .folder-icon {
      font-size: 1.5rem;
    }

    .folder-name {
      font-size: 1.2rem;
      font-weight: 600;
      color: #8FAFB1;
      flex: 1;
    }

    .folder-count {
      font-size: 0.9rem;
      color: #999;
      font-weight: 500;
    }

    .folder-toggle {
      font-size: 1rem;
      color: #8FAFB1;
      transition: transform 0.3s;
      font-weight: bold;
    }

    .folder-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .folder-content {
      padding: 10px 20px;
      transition: all 0.3s;
    }

    .folder-content.hidden {
      display: none !important;
    }

    .files-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background: white;
      border: 2px solid #f0f0f0;
      border-radius: 10px;
      transition: all 0.3s;
    }

    .file-item:hover {
      border-color: #8FAFB1;
      transform: translateX(10px);
      box-shadow: 0 4px 15px rgba(143, 175, 177, 0.2);
    }

    .file-icon {
      font-size: 1.8rem;
      flex-shrink: 0;
    }

    .file-info {
      flex: 1;
      min-width: 0;
    }

    .file-info h4 {
      margin-bottom: 8px;
      font-size: 1.1rem;
    }

    .file-info h4 a {
      color: #333;
      text-decoration: none;
      transition: color 0.3s;
    }

    .file-info h4 a:hover {
      color: #8FAFB1;
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
      color: #8FAFB1;
      font-size: 2rem;
      margin-bottom: 10px;
    }

    @media (max-width: 768px) {
      h1 {
        font-size: 2.5rem;
      }
      
      .stats {
        gap: 15px;
      }

      .stat {
        padding: 15px 20px;
      }

      .folder-container[data-level="1"] {
        margin-left: 10px;
      }

      .folder-container[data-level="2"] {
        margin-left: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>&#129504; C Concept&Dev</h1>
      <p class="tagline">Framework de Clonage Psychologique Aliment&eacute; par l'IA</p>
      <p class="author">Christophe BONNET</p>
      <div class="stats">
        <div class="stat">
          <div class="stat-number">${stats.files}</div>
          <div class="stat-label">Fichiers HTML</div>
        </div>
        <div class="stat">
          <div class="stat-number">${stats.folders}</div>
          <div class="stat-label">Dossiers</div>
        </div>
      </div>
    </header>

    <div class="search-box">
      <input 
        type="text" 
        id="searchInput" 
        placeholder="&#128269; Rechercher un outil, template, dossier..."
        autocomplete="off"
      >
    </div>

    <div class="content" id="contentContainer">
      ${contentHTML || '<p class="no-results show"><h2>Aucun fichier trouve</h2></p>'}
    </div>

    <div class="no-results" id="noResults">
      <h2>Aucun resultat</h2>
      <p>Essayez avec d'autres mots-cles</p>
    </div>

    <footer>
      <p><strong>C Concept&Dev</strong> - Framework de Clonage Psychologique</p>
      <p style="margin-top: 10px;">Par Christophe BONNET</p>
      <p style="margin-top: 15px; font-size: 0.9em;">
        Index genere automatiquement &bull; ${stats.files} fichiers &bull; 
        Derniere mise a jour : ${lastUpdate}
      </p>
      <p style="margin-top: 10px; font-size: 0.85em; color: #999;">
        <a href="https://github.com/c-concept-dev/C-Concept-Dev" style="color: #8FAFB1; text-decoration: none;">
          &#128230; Voir sur GitHub
        </a>
      </p>
    </footer>
  </div>

  <script>
    function toggleFolder(folderId) {
      const content = document.getElementById(folderId);
      const toggle = document.getElementById(folderId + '-toggle');
      
      if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.classList.remove('collapsed');
      } else {
        content.style.display = 'none';
        toggle.classList.add('collapsed');
      }
    }

    const searchInput = document.getElementById('searchInput');
    const contentContainer = document.getElementById('contentContainer');
    const noResults = document.getElementById('noResults');
    const allFolders = document.querySelectorAll('.folder-container');
    const allFiles = document.querySelectorAll('.file-item');

    searchInput.addEventListener('input', function(e) {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      if (!searchTerm) {
        contentContainer.style.display = 'block';
        noResults.classList.remove('show');
        allFolders.forEach(function(f) { f.style.display = 'block'; });
        allFiles.forEach(function(f) { f.style.display = 'flex'; });
        return;
      }

      let visibleCount = 0;

      allFiles.forEach(function(file) {
        const text = file.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          file.style.display = 'flex';
          visibleCount++;
          
          let parent = file.closest('.folder-container');
          while (parent) {
            parent.style.display = 'block';
            const content = parent.querySelector('.folder-content');
            if (content) content.style.display = 'block';
            parent = parent.parentElement.closest('.folder-container');
          }
        } else {
          file.style.display = 'none';
        }
      });

      allFolders.forEach(function(folder) {
        const visibleFiles = folder.querySelectorAll('.file-item[style*="display: flex"]');
        if (visibleFiles.length === 0) {
          folder.style.display = 'none';
        }
      });

      if (visibleCount === 0) {
        contentContainer.style.display = 'none';
        noResults.classList.add('show');
      } else {
        contentContainer.style.display = 'block';
        noResults.classList.remove('show');
      }
    });

    document.querySelectorAll('.folder-container').forEach(function(folder, index) {
      folder.style.opacity = '0';
      folder.style.transform = 'translateY(20px)';
      setTimeout(function() {
        folder.style.transition = 'all 0.5s';
        folder.style.opacity = '1';
        folder.style.transform = 'translateY(0)';
      }, index * 50);
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(ROOT_DIR, 'index.html'), html, 'utf-8');
  
  console.log('Index genere avec succes : index.html');
  console.log('Statistiques :');
  console.log('   - Fichiers : ' + stats.files);
  console.log('   - Dossiers : ' + stats.folders);
}

try {
  generateIndex();
} catch (err) {
  console.error('Erreur:', err.message);
  process.exit(1);
}
