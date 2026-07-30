#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Lancer Persona Builder.command
# Double-clic dans le Finder → lance un serveur local et ouvre le navigateur.
# Aucune installation requise si Python 3 est présent (cas par défaut sur Mac
# avec les outils de ligne de commande installés) ; sinon essaie Node ou PHP.
# ═══════════════════════════════════════════════════════════════════

# Se placer dans le dossier où SE TROUVE CE FICHIER, quel que soit l'endroit
# d'où le Finder le lance (nécessaire : un double-clic ne place pas le
# terminal dans le bon dossier par défaut).
cd "$(dirname "$0")" || exit 1

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Persona Builder — démarrage du serveur local"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Dossier : $(pwd)"

if [ ! -f "shell.html" ]; then
  echo ""
  echo "⚠ shell.html introuvable dans ce dossier."
  echo "Ce fichier .command doit rester À CÔTÉ de shell.html"
  echo "(dans le même dossier que brain/ et domains/)."
  echo ""
  read -p "Appuyez sur Entrée pour fermer..."
  exit 1
fi

# Choisir un port libre en partant de 8000 (au cas où déjà utilisé)
PORT=8000
while lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:$PORT/shell.html"

# Le micro (getUserMedia) exige un "contexte sécurisé" : localhost convient,
# contrairement à l'ouverture directe du fichier (file://).
open_browser_delayed() {
  sleep 1.2
  open "$URL" 2>/dev/null
}

echo ""
echo "Serveur : http://localhost:$PORT"
echo "Page    : $URL"
echo ""
echo "Le navigateur va s'ouvrir automatiquement dans un instant..."
echo "Pour ARRÊTER le serveur : fermez cette fenêtre ou appuyez sur Ctrl+C."
echo ""
echo "───────────────────────────────────────────────────"
echo ""

# Essaie plusieurs serveurs dans l'ordre, selon ce qui est installé sur la machine.
if command -v python3 >/dev/null 2>&1; then
  open_browser_delayed &
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  open_browser_delayed &
  exec python -m SimpleHTTPServer "$PORT"
elif command -v npx >/dev/null 2>&1; then
  open_browser_delayed &
  exec npx --yes serve -l "$PORT" .
elif command -v php >/dev/null 2>&1; then
  open_browser_delayed &
  exec php -S "localhost:$PORT"
else
  echo "⚠ Aucun outil de serveur trouvé (Python, Node/npx ou PHP)."
  echo ""
  echo "Installez Python 3 depuis python.org, ou les outils de ligne de"
  echo "commande Xcode via : xcode-select --install"
  echo ""
  read -p "Appuyez sur Entrée pour fermer..."
  exit 1
fi
