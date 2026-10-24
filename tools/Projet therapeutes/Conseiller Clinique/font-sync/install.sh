#!/bin/sh
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RUNTIME_DIR="$HOME/Library/Application Support/StudioCliniqueFontSync"
AGENT="$HOME/Library/LaunchAgents/dev.cconcept.studioclinique.fontsync.plist"
mkdir -p "$RUNTIME_DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$RUNTIME_DIR"

swiftc "$HERE/FontList.swift" -o "$RUNTIME_DIR/font-list"
cp "$HERE/server.py" "$RUNTIME_DIR/server.py"
if [ ! -f "$RUNTIME_DIR/localhost.crt" ] || [ ! -f "$RUNTIME_DIR/localhost.key" ]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
    -keyout "$RUNTIME_DIR/localhost.key" -out "$RUNTIME_DIR/localhost.crt" \
    -subj '/CN=Studio Clinique local font sync' \
    -addext 'subjectAltName=IP:127.0.0.1,DNS:localhost' \
    -addext 'basicConstraints=critical,CA:FALSE' \
    -addext 'extendedKeyUsage=serverAuth' >/dev/null 2>&1
fi
chmod 600 "$RUNTIME_DIR/localhost.key"

python3 - "$RUNTIME_DIR/server.py" "$AGENT" "$RUNTIME_DIR" <<'PY'
import plistlib, sys
server, destination, runtime = sys.argv[1:]
value = {
    'Label': 'dev.cconcept.studioclinique.fontsync',
    'ProgramArguments': ['/usr/bin/python3', server],
    'RunAtLoad': True,
    'KeepAlive': True,
    'StandardOutPath': runtime + '/stdout.log',
    'StandardErrorPath': runtime + '/stderr.log',
}
with open(destination, 'wb') as file:
    plistlib.dump(value, file)
PY

if [ "${1:-}" = "--activate" ]; then
  security add-trusted-cert -r trustRoot -p ssl \
    -k "$HOME/Library/Keychains/login.keychain-db" "$RUNTIME_DIR/localhost.crt"
  launchctl bootout "gui/$(id -u)" "$AGENT" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENT"
  echo "Compagnon Studio Clinique actif sur https://127.0.0.1:43839"
else
  echo "Compagnon préparé. Pour l'activer : sh '$HERE/install.sh' --activate"
fi
