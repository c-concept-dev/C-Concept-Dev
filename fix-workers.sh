#!/bin/bash

# ============================================================================
# SCRIPT AUTOMATIQUE - INTÉGRATION CLOUDFLARE WORKERS
# ============================================================================
# Christophe BONNET - C Concept&Dev
# Date: 2025-12-03
# ============================================================================

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🔧 INTÉGRATION CLOUDFLARE WORKERS - AUTOMATIQUE           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Fichier cible
FILE="tools/clone-interview-pro/clone-interview-pro.html"

# Vérifier que le fichier existe
if [ ! -f "$FILE" ]; then
    echo "❌ Erreur: $FILE introuvable"
    echo "   Assure-toi d'être à la racine du repo C-Concept-Dev"
    exit 1
fi

echo "📂 Fichier trouvé: $FILE"
echo ""

# 1. BACKUP
echo "═══ ÉTAPE 1/4 : BACKUP ═══"
BACKUP="${FILE}.backup-$(date +%Y%m%d-%H%M%S)"
cp "$FILE" "$BACKUP"
echo "✅ Backup créé: $BACKUP"
echo ""

# 2. RETIRER LA CLÉ GOOGLE TTS
echo "═══ ÉTAPE 2/4 : RETRAIT CLÉ GOOGLE TTS ═══"
sed -i '' "s/googleTTSApiKey: 'AIzaSyCo8nfkrMZWv5-7Ns1kaBlJ_0APMjeu4Ok', \/\/ 🔑 METTRE TA CLÉ ICI/googleTTSApiKey: '', \/\/ Géré par Cloudflare Worker/g" "$FILE"

# Vérifier
if grep -q "googleTTSApiKey: '', // Géré par Cloudflare Worker" "$FILE"; then
    echo "✅ Clé Google TTS retirée"
else
    echo "⚠️  Clé peut-être déjà retirée"
fi
echo ""

# 3. AJOUTER LA CONFIG WORKERS
echo "═══ ÉTAPE 3/4 : AJOUT CONFIG WORKERS ═══"

# Créer un fichier temporaire avec la config
cat > /tmp/worker_config.txt << 'EOF'
    // ═══════════════════════════════════════════════════════════════
    // CLOUDFLARE WORKERS - Proxies API sécurisés  
    // ═══════════════════════════════════════════════════════════════
    workerEndpoints: {
        googleTTS: 'https://google-tts-proxy.11drumboy11.workers.dev',
        claude: 'https://clone-proxy.11drumboy11.workers.dev'
    },
EOF

# Trouver la ligne googleTTSApiKey et insérer après
LINE_NUM=$(grep -n "googleTTSApiKey: ''.*Worker" "$FILE" | cut -d: -f1 | head -1)

if [ -n "$LINE_NUM" ]; then
    # Insérer la config après la ligne googleTTSApiKey
    sed -i '' "${LINE_NUM}r /tmp/worker_config.txt" "$FILE"
    echo "✅ Config Workers ajoutée après ligne $LINE_NUM"
else
    echo "⚠️  Ligne googleTTSApiKey introuvable, cherche une alternative..."
    LINE_NUM=$(grep -n "googleTTSApiKey:" "$FILE" | cut -d: -f1 | head -1)
    if [ -n "$LINE_NUM" ]; then
        sed -i '' "${LINE_NUM}r /tmp/worker_config.txt" "$FILE"
        echo "✅ Config Workers ajoutée après ligne $LINE_NUM"
    else
        echo "❌ Impossible de trouver googleTTSApiKey"
    fi
fi

# Nettoyer
rm /tmp/worker_config.txt
echo ""

# 4. REMPLACER L'APPEL GOOGLE TTS
echo "═══ ÉTAPE 4/4 : MODIFICATION APPEL GOOGLE TTS ═══"

# Remplacer l'URL complète par le Worker
sed -i '' 's|`https://texttospeech\.googleapis\.com/v1/text:synthesize?key=\${config\.googleTTSApiKey}`|config.workerEndpoints.googleTTS|g' "$FILE"

# Vérifier
if grep -q "config.workerEndpoints.googleTTS" "$FILE"; then
    echo "✅ Appel Google TTS modifié"
else
    echo "⚠️  Modification peut-être déjà effectuée ou syntaxe différente"
fi
echo ""

# VÉRIFICATIONS FINALES
echo "═══════════════════════════════════════════════════════════════"
echo "✅ MODIFICATIONS TERMINÉES"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📊 VÉRIFICATIONS :"
echo ""

# Vérifier workerEndpoints
if grep -q "workerEndpoints:" "$FILE"; then
    echo "✅ Config workerEndpoints présente"
else
    echo "❌ Config workerEndpoints MANQUANTE"
fi

# Vérifier que l'ancienne URL n'existe plus
if grep -q "texttospeech.googleapis.com/v1/text:synthesize" "$FILE"; then
    echo "⚠️  Ancienne URL Google encore présente (peut-être dans un commentaire)"
else
    echo "✅ Ancienne URL Google supprimée"
fi

# Vérifier que la clé n'est plus hardcodée
if grep -q "AIzaSyCo8nfkrMZWv5-7Ns1kaBlJ_0APMjeu4Ok" "$FILE"; then
    echo "⚠️  Clé Google encore présente (vérifier manuellement)"
else
    echo "✅ Clé Google retirée"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📝 PROCHAINES ÉTAPES :"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "1. Vérifier les modifications :"
echo "   diff $BACKUP $FILE | head -50"
echo ""
echo "2. Tester localement :"
echo "   open $FILE"
echo "   → Ouvrir DevTools (F12)"
echo "   → Tester le TTS"
echo ""
echo "3. Commit et push :"
echo "   git add $FILE"
echo "   git commit -m '🔒 Sécurité: Intégration Cloudflare Workers'"
echo "   git push"
echo ""
echo "4. Tester en production :"
echo "   https://c-concept-dev.github.io/C-Concept-Dev/tools/clone-interview-pro/clone-interview-pro.html"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "💾 Backup sauvegardé : $BACKUP"
echo "═══════════════════════════════════════════════════════════════"
echo ""
