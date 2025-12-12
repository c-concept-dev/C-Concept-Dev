#!/bin/bash

# 🧪 Script de Test des Workers Cloudflare
# Version: 2.0
# Date: 10 décembre 2025

echo "═══════════════════════════════════════════════════════════"
echo "🧪 TEST DES 4 WORKERS CLOUDFLARE - Mode WORKER_MODE"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SUCCESS_COUNT=0
FAIL_COUNT=0

# Fonction de test
test_worker() {
    local NAME=$1
    local URL=$2
    local PROVIDER=$3
    local MODEL=$4
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔍 Test: $NAME"
    echo "   URL: $URL"
    echo "   Provider: $PROVIDER | Model: $MODEL"
    echo ""
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$URL" \
      -H "Content-Type: application/json" \
      -d "{
        \"apiKey\": \"WORKER_MODE\",
        \"payload\": {
          \"provider\": \"$PROVIDER\",
          \"model\": \"$MODEL\",
          \"max_tokens\": 50,
          \"temperature\": 0.3,
          \"messages\": [{\"role\": \"user\", \"content\": \"Say: Test OK\"}]
        }
      }")
    
    # Extraire le code HTTP
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "   HTTP Status: $HTTP_CODE"
    
    # Vérifier le statut
    if [ "$HTTP_CODE" = "200" ]; then
        # Vérifier qu'il n'y a pas d'erreur de clé
        if echo "$BODY" | grep -q "WORKER_MODE"; then
            echo -e "   ${RED}❌ ÉCHEC${NC} - Le worker utilise encore le dummy WORKER_MODE"
            echo "   Erreur: La clé WORKER_MODE a été envoyée à l'API"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        elif echo "$BODY" | grep -q "Incorrect API key"; then
            echo -e "   ${RED}❌ ÉCHEC${NC} - Clé API incorrecte"
            echo "   Erreur: Le worker n'utilise pas env.API_KEY"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        elif echo "$BODY" | grep -q "error"; then
            echo -e "   ${YELLOW}⚠️  ATTENTION${NC} - Erreur dans la réponse"
            echo "   Body: $(echo "$BODY" | head -c 200)..."
            FAIL_COUNT=$((FAIL_COUNT + 1))
        else
            echo -e "   ${GREEN}✅ SUCCÈS${NC} - Worker fonctionne correctement"
            echo "   Preview: $(echo "$BODY" | head -c 150)..."
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        fi
    else
        echo -e "   ${RED}❌ ÉCHEC${NC} - Code HTTP $HTTP_CODE"
        echo "   Body: $(echo "$BODY" | head -c 200)..."
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    
    echo ""
}

# Tests des 4 workers
test_worker \
    "OpenAI Worker" \
    "https://openai-proxy.11drumboy11.workers.dev" \
    "openai" \
    "gpt-4o-mini"

test_worker \
    "Anthropic Worker" \
    "https://ocr-universel-proxy.11drumboy11.workers.dev" \
    "anthropic" \
    "claude-3-5-sonnet-20241022"

test_worker \
    "Google Gemini Worker" \
    "https://gemini-proxy.11drumboy11.workers.dev" \
    "google" \
    "gemini-2.0-flash-exp"

test_worker \
    "Groq Worker" \
    "https://groq-proxy.11drumboy11.workers.dev" \
    "groq" \
    "llama-3.3-70b-versatile"

# Résumé
echo "═══════════════════════════════════════════════════════════"
echo "📊 RÉSUMÉ DES TESTS"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "   ${GREEN}✅ Succès: $SUCCESS_COUNT/4${NC}"
echo -e "   ${RED}❌ Échecs: $FAIL_COUNT/4${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 TOUS LES WORKERS FONCTIONNENT PARFAITEMENT !${NC}"
    echo ""
    echo "✅ Vous pouvez maintenant utiliser OCR_V6_8_2_FINAL.html"
    echo "   en Mode Worker avec les 4 providers."
    exit 0
else
    echo -e "${RED}⚠️  CERTAINS WORKERS ONT DES PROBLÈMES${NC}"
    echo ""
    echo "📋 Actions à prendre:"
    echo "   1. Vérifier que les variables d'environnement sont configurées"
    echo "   2. Relire le guide: GUIDE_FIX_WORKERS_CLOUDFLARE.md"
    echo "   3. Redéployer les workers en échec"
    echo ""
    exit 1
fi
