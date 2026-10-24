#!/usr/bin/env python3
"""Local, read-only HTTPS bridge for active macOS font names.

No font file, document, or browser credential crosses this bridge. Only the
Studio origin may read it; the service listens on loopback exclusively.
"""
import json
import os
import ssl
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

HOST = "127.0.0.1"
PORT = 43839
ORIGIN = "https://c-concept-dev.github.io"
APP_DIR = os.path.dirname(os.path.realpath(__file__))
RUNTIME_DIR = os.environ.get("STUDIO_FONT_SYNC_RUNTIME_DIR") or os.path.expanduser(
    "~/Library/Application Support/StudioCliniqueFontSync")
CERT = os.path.join(RUNTIME_DIR, "localhost.crt")
KEY = os.path.join(RUNTIME_DIR, "localhost.key")
SCANNER = os.path.join(RUNTIME_DIR, "font-list")
cache = {"time": 0.0, "body": None}
lock = Lock()


def font_body():
    with lock:
        if cache["body"] is not None and time.monotonic() - cache["time"] < 2:
            return cache["body"]
        result = subprocess.run([SCANNER], capture_output=True, check=True, timeout=8)
        families = json.loads(result.stdout)
        if not isinstance(families, list):
            raise ValueError("The font scanner did not return a list")
        body = json.dumps({"version": 1, "families": families}, ensure_ascii=False).encode("utf-8")
        cache.update(time=time.monotonic(), body=body)
        return body


class Handler(BaseHTTPRequestHandler):
    def allowed(self):
        return (self.headers.get("Origin") == ORIGIN
                and self.headers.get("Host") in {f"127.0.0.1:{PORT}", f"localhost:{PORT}"})

    def do_GET(self):
        if self.path != "/v1/fonts" or not self.allowed():
            self.send_error(403)
            return
        try:
            body = font_body()
        except (OSError, ValueError, subprocess.SubprocessError):
            self.send_error(503)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Status only: never log the font list or browser request headers.
        sys.stderr.write("font-sync: " + (format % args) + "\n")


if __name__ == "__main__":
    if not all(os.path.isfile(path) for path in (CERT, KEY, SCANNER)):
        sys.exit("font-sync: run install.sh first")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(CERT, KEY)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()
