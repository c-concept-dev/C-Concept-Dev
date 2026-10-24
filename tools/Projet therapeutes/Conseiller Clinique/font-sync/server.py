#!/usr/bin/env python3
"""Local, read-only HTTPS bridge for active macOS fonts.

Only the Studio origin may read active font files; the service listens on
loopback exclusively. Paths and browser credentials are never returned.
"""
import hashlib
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
cache = {"time": 0.0, "body": None, "files": {}}
lock = Lock()


def font_body():
    with lock:
        if cache["body"] is not None and time.monotonic() - cache["time"] < 2:
            return cache["body"]
        result = subprocess.run([SCANNER], capture_output=True, check=True, timeout=8)
        families = json.loads(result.stdout)
        if not isinstance(families, list):
            raise ValueError("The font scanner did not return a list")
        public = []
        files = {}
        for face in families:
            if not isinstance(face, dict):
                continue
            item = {key: face[key] for key in ("label", "family", "postscriptName")
                    if isinstance(face.get(key), str)}
            path = os.path.realpath(face.get("filePath") or "")
            if (os.path.isfile(path) and os.path.splitext(path)[1].lower()
                    in {".ttf", ".otf", ".ttc", ".otc"}
                    and os.path.getsize(path) <= 20 * 1024 * 1024):
                stat = os.stat(path)
                # A font replaced in place must get a new ID so open browsers reload it.
                fingerprint = f"{path}\0{stat.st_size}\0{stat.st_mtime_ns}"
                font_id = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
                files[font_id] = path
                item["fontId"] = font_id
            public.append(item)
        body = json.dumps({"version": 1, "families": public}, ensure_ascii=False).encode("utf-8")
        cache.update(time=time.monotonic(), body=body, files=files)
        return body


class Handler(BaseHTTPRequestHandler):
    def allowed(self):
        return (self.headers.get("Origin") == ORIGIN
                and self.headers.get("Host") in {f"127.0.0.1:{PORT}", f"localhost:{PORT}"})

    def do_GET(self):
        if not self.allowed():
            self.send_error(403)
            return
        if self.path.startswith("/v1/font/"):
            self.send_font(self.path[len("/v1/font/"):])
            return
        if self.path != "/v1/fonts":
            self.send_error(404)
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

    def send_font(self, font_id):
        if len(font_id) != 64 or any(c not in "0123456789abcdef" for c in font_id):
            self.send_error(404)
            return
        try:
            font_body()
            path = cache["files"].get(font_id)
            if not path or not os.path.isfile(path):
                self.send_error(404)
                return
            with open(path, "rb") as file:
                body = file.read(20 * 1024 * 1024 + 1)
            if len(body) > 20 * 1024 * 1024:
                self.send_error(413)
                return
        except (OSError, ValueError, subprocess.SubprocessError):
            self.send_error(503)
            return
        self.send_response(200)
        self.send_header("Content-Type", "font/otf" if path.lower().endswith((".otf", ".otc")) else "font/ttf")
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
