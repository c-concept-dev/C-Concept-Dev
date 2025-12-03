#!/bin/bash

# ============================================================================
# CORRECTION FINALE - ACTIVER WORKER GOOGLE TTS
# ============================================================================

echo "🔧 Activation du Worker Google TTS..."
echo ""

FILE="tools/clone-interview-pro/clone-interview-pro.html"

# Backup
cp "$FILE" "${FILE}.backup-final2"
echo "✅ Backup créé: ${FILE}.backup-final2"
echo ""

# Correction ligne 3582 : Vérifier Worker en plus de la clé
echo "🔄 Modification ligne 3582..."

sed -i '' 's|const hasGoogleKey = !!state\.googleTTSApiKey;|const hasGoogleKey = !!(config.workerEndpoints?.googleTTS) || !!state.googleTTSApiKey;|g' "$FILE"

echo "✅ Ligne 3582 modifiée"
echo ""

# Vérifier
echo "═══ VÉRIFICATION ═══"
sed -n '3580,3590p' "$FILE"
echo ""

echo "✅ MODIFICATION TERMINÉE"
echo ""
echo "📝 PROCHAINES ÉTAPES :"
echo ""
echo "1. Commit et push :"
echo "   git add $FILE"
echo "   git commit -m '🔧 Fix: Activer Worker Google TTS'"
echo "   git push"
echo ""
echo "2. Tester en navigation privée (après 2-3 min) :"
echo "   https://c-concept-dev.github.io/C-Concept-Dev/tools/clone-interview-pro/clone-interview-pro.html"
echo ""
echo "3. Vérifier les logs (DevTools F12) :"
echo "   [TTSQueue] 🎯 Mode: \"google-journey\" | isGoogleMode: true | hasKey: true"
echo "   [TTSQueue] 🌐 Calling Google Cloud TTS..."
echo ""
