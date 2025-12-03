#!/bin/bash

# ============================================================================
# SCRIPT DE MISE À JOUR - INTÉGRATION CLOUDFLARE WORKERS
# ============================================================================
# Ce script met à jour clone-interview-pro.html pour utiliser les Workers
# au lieu des clés API hardcodées.
#
# Christophe BONNET - C Concept&Dev
# Date: 2025-12-03
# ============================================================================

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   🔧 MISE À JOUR CLOUDFLARE WORKERS - C CONCEPT&DEV         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Variables
FILE="tools/clone-interview-pro/clone-interview-pro.html"
BACKUP="${FILE}.backup-$(date +%Y%m%d-%H%M%S)"

# Vérifier que le fichier existe
if [ ! -f "$FILE" ]; then
    echo "❌ Erreur: $FILE introuvable"
    exit 1
fi

# Backup
echo "📦 Création backup: $BACKUP"
cp "$FILE" "$BACKUP"

echo ""
echo "═══ MODIFICATIONS ═══"
echo ""

# 1. Retirer la clé Google TTS hardcodée
echo "1️⃣  Retrait clé Google TTS hardcodée..."
sed -i '' "s/googleTTSApiKey: 'AIzaSyCo8nfkrMZWv5-7Ns1kaBlJ_0APMjeu4Ok'/googleTTSApiKey: '' \/\/ Géré par Cloudflare Worker/g" "$FILE"
echo "   ✅ Clé retirée"

# 2. Ajouter la configuration des Workers (après la ligne googleTTSApiKey)
echo ""
echo "2️⃣  Ajout configuration Workers Cloudflare..."

# Créer le texte de configuration
WORKER_CONFIG="
    \/\/ ═══════════════════════════════════════════════════════════════
    \/\/ CLOUDFLARE WORKERS - Proxies API sécurisés
    \/\/ ═══════════════════════════════════════════════════════════════
    workerEndpoints: {
        googleTTS: 'https:\/\/google-tts-proxy.11drumboy11.workers.dev',
        claude: 'https:\/\/clone-proxy.11drumboy11.workers.dev'
    },"

# Insérer après googleTTSApiKey
sed -i '' "/googleTTSApiKey: ''.*Worker/a\\
$WORKER_CONFIG
" "$FILE"

echo "   ✅ Configuration ajoutée"

# 3. Message de fin
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ MODIFICATIONS AUTOMATIQUES TERMINÉES"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📝 MODIFICATIONS MANUELLES RESTANTES :"
echo ""
echo "   Tu dois maintenant modifier manuellement les appels API :"
echo ""
echo "   A. Appel Google TTS (ligne ~3686) :"
echo "      ❌ ANCIEN :"
echo "         https://texttospeech.googleapis.com/v1/text:synthesize?key=\${key}"
echo ""
echo "      ✅ NOUVEAU :"
echo "         config.workerEndpoints.googleTTS"
echo ""
echo "   B. Appel Claude (si utilisé) :"
echo "      ❌ ANCIEN :"
echo "         https://api.anthropic.com/v1/messages"
echo ""
echo "      ✅ NOUVEAU :"
echo "         config.workerEndpoints.claude"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📂 Fichier modifié : $FILE"
echo "💾 Backup créé : $BACKUP"
echo ""
echo "🔍 Pour voir les différences :"
echo "   diff $BACKUP $FILE | head -50"
echo ""
echo "📝 Ouvre le fichier dans un éditeur pour les modifications manuelles :"
echo "   code $FILE"
echo ""
