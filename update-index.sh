#!/bin/bash
# 🔄 UPDATE INDEX - Script de test local
# Usage: ./update-index.sh

set -e  # Arrêter si erreur

echo "═══════════════════════════════════════════════════"
echo "🔄 C Concept&Dev - Update Index Local"
echo "═══════════════════════════════════════════════════"
echo ""

# Vérifier qu'on est dans le bon repo
if [ ! -f "generate-index.js" ]; then
    echo "❌ Erreur: generate-index.js introuvable"
    echo "Assurez-vous d'être dans le dossier C-Concept-Dev"
    exit 1
fi

# 1. Pull derniers changements
echo "📥 1/4 - Pull des derniers changements..."
git pull --rebase origin main || {
    echo "⚠️ Conflit détecté, résolution..."
    git checkout --theirs index.html 2>/dev/null || true
    git add index.html 2>/dev/null || true
    git rebase --continue || git rebase --skip
}

# 2. Générer index
echo ""
echo "🔄 2/4 - Génération de l'index..."
node generate-index.js

if [ ! -f "index.html" ]; then
    echo "❌ Erreur: index.html non généré"
    exit 1
fi

echo "✅ Index généré avec succès"

# 3. Vérifier changements
echo ""
echo "📊 3/4 - Vérification des changements..."
if git diff --quiet index.html; then
    echo "ℹ️ Aucun changement détecté dans index.html"
    echo "✅ Déjà à jour !"
    exit 0
fi

# 4. Commit et push
echo ""
echo "💾 4/4 - Commit et push..."
git add index.html
git commit -m "🔄 Update index - $(date '+%Y-%m-%d %H:%M')"

# Push avec retry
for attempt in {1..3}; do
    echo "📤 Tentative de push ($attempt/3)..."
    
    if git push origin main; then
        echo ""
        echo "═══════════════════════════════════════════════════"
        echo "✅ SUCCÈS !"
        echo "═══════════════════════════════════════════════════"
        echo ""
        echo "🔗 Vérifie ton site dans 2-3 minutes :"
        echo "   https://c-concept-dev.github.io/C-Concept-Dev/"
        echo ""
        exit 0
    else
        if [ $attempt -lt 3 ]; then
            echo "⚠️ Push échoué, nouvelle tentative..."
            sleep 3
            git pull --rebase origin main || true
        else
            echo ""
            echo "❌ Échec après 3 tentatives"
            echo "Vérifie manuellement avec: git status"
            exit 1
        fi
    fi
done
