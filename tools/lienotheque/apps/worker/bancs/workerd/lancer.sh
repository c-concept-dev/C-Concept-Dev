#!/bin/zsh
# workerd seul, en local : aucun déploiement, aucun secret, la configuration figée intouchée.
# À lancer hors bac à sable, depuis n'importe où.
set -e
ICI=${0:a:h}
cd "$ICI"

WRANGLER_SEND_METRICS=false pnpm exec wrangler dev --local \
  --config wrangler.banc.toml --port 8788 --ip 127.0.0.1 > "$ICI/.moteur.log" 2>&1 &
MOTEUR=$!

for i in {1..60}; do
  if curl -s -m 2 http://127.0.0.1:8788/ > "$ICI/.sante.json" 2>/dev/null; then break; fi
  sleep 1
done

echo "=== le moteur se nomme ==="
cat "$ICI/.sante.json"; echo ""
echo "=== la vérification, dans workerd ==="
curl -s -m 15 -X POST -H 'content-type: application/json' \
  --data-binary "@$ICI/../ceremonie-mesuree.json" http://127.0.0.1:8788/
echo ""

kill $MOTEUR 2>/dev/null || true
wait $MOTEUR 2>/dev/null || true
rm -f "$ICI/.sante.json"
echo "=== journal du moteur ==="
tail -4 "$ICI/.moteur.log"
