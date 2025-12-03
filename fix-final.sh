#!/bin/bash

# ============================================================================
# CORRECTION FINALE - APPEL GOOGLE TTS LIGNE 3701
# ============================================================================

echo "🔧 Correction finale de l'appel Google TTS..."
echo ""

FILE="tools/clone-interview-pro/clone-interview-pro.html"

# Backup
cp "$FILE" "${FILE}.backup-final"
echo "✅ Backup créé: ${FILE}.backup-final"
echo ""

# Correction ligne 3701
echo "🔄 Correction ligne 3701..."

# Remplacer l'ancienne syntaxe par la nouvelle
sed -i '' "s|const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + state.googleTTSApiKey,|const response = await fetch(config.workerEndpoints.googleTTS,|g" "$FILE"

# Vérifier
if grep -q "const response = await fetch(config.workerEndpoints.googleTTS," "$FILE"; then
    echo "✅ Ligne 3701 corrigée avec succès"
else
    echo "⚠️  Correction peut-être déjà effectuée ou syntaxe différente"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "📊 VÉRIFICATION FINALE"
echo "═══════════════════════════════════════════════════"
echo ""

# Vérifier les occurrences restantes
OCCURRENCES=$(grep -n "texttospeech.googleapis.com" "$FILE" | wc -l)

echo "Occurrences de 'texttospeech.googleapis.com' : $OCCURRENCES"
echo ""

if [ "$OCCURRENCES" -eq 1 ]; then
    echo "✅ PARFAIT ! Une seule occurrence restante (ligne 26541 - condition de vérification, OK)"
    grep -n "texttospeech.googleapis.com" "$FILE"
elif [ "$OCCURRENCES" -eq 0 ]; then
    echo "✅ PARFAIT ! Toutes les occurrences corrigées"
else
    echo "⚠️  $OCCURRENCES occurrences restantes :"
    grep -n "texttospeech.googleapis.com" "$FILE"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ CORRECTION TERMINÉE"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📝 PROCHAINES ÉTAPES :"
echo ""
echo "1. Commit et push :"
echo "   git add $FILE"
echo "   git commit -m '🔧 Fix: Correction appel Google TTS ligne 3701'"
echo "   git push"
echo ""
echo "2. Tester en production (après 2-3 min) :"
echo "   https://c-concept-dev.github.io/C-Concept-Dev/tools/clone-interview-pro/clone-interview-pro.html"
echo ""
