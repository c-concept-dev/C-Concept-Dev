#!/bin/sh
# MONOLITH v1.0 — tools/package.sh : MANIFEST.json + SHA256SUMS.txt puis zip du paquet (hors runs/, scratch/, zip precedent).
set -e
cd "$(dirname "$0")/.."
node tools/build-manifest.js
rm -f EvidenceForge-MONOLITH-v1.0.1.zip
zip -q -r -X EvidenceForge-MONOLITH-v1.0.1.zip . -x "runs/*" "scratch/*" "*.zip" ".DS_Store" "*/.DS_Store"
shasum -a 256 EvidenceForge-MONOLITH-v1.0.1.zip
