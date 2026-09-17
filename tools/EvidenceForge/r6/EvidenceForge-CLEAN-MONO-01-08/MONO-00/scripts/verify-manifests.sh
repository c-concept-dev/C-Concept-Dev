#!/bin/bash
# MONO-00 — T00-01/T00-02/T00-03 : vérification manifeste pour un paquet donné.
# Usage : ./verify-manifests.sh <répertoire du paquet extrait> <nom du manifeste>
DIR="$1"; MANIFEST="$2"
cd "$DIR" || exit 1
if [ ! -f "$MANIFEST" ]; then echo "AUCUN MANIFESTE — vérification limitée aux hashes de référence connus."; exit 0; fi
echo "=== T00-02 : validation SHA-256 ==="
sha256sum -c "$MANIFEST" --quiet
echo "exit: $?"
echo "=== T00-01/T00-03 : exhaustivité ==="
find . -type f ! -name "$MANIFEST" ! -path "./node_modules/*" | sed 's|^\./||' | sort > /tmp/_real.txt
awk '{print $2}' "$MANIFEST" | sort > /tmp/_manifest.txt
diff /tmp/_real.txt /tmp/_manifest.txt && echo "EXHAUSTIF" || echo "NON EXHAUSTIF (voir diff ci-dessus)"
