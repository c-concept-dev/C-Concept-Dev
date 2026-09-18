#!/usr/bin/env python3
"""
EvidenceForge — bin/freeze-package.py : PACKAGING ADMINISTRATIF DETERMINISTE (gel).
Outil hors runtime : il ne modifie aucun comportement produit. Il construit un ZIP byte-reproductible d'un dossier de version
(par defaut MONOLITH-v1.0.5) a partir du contenu SUIVI PAR GIT (git archive du tree : jamais les fichiers non suivis, runs/, scratch/),
avec une racine unique <version>/ dans l'archive.

Determinisme (independant de l'horloge, de l'ordre du systeme de fichiers et du chemin local) :
  - liste des fichiers triee par nom (ordre des octets UTF-8) ;
  - aucune entree de repertoire ;
  - horodatage ZIP fixe (1980-01-01 00:00:00, minimum DOS) ;
  - attributs externes fixes (0100644, create_system = 3 Unix), aucun champ extra ;
  - compression DEFLATE niveau 9 (zlib) ;
  - exclusions : *.zip, *.sha256, .DS_Store, __MACOSX, .git, node_modules, *.log, .env*, runs/, scratch/.
Sortie : chemin du zip, taille, SHA-256, nombre d'entrees. Deux constructions depuis deux copies independantes du meme tree git
donnent des octets identiques (verifie par le rapport de gel avec cmp).

Usage :
  python3 bin/freeze-package.py --repo <repo> --tree <git tree-ish ou chemin git du dossier> --root MONOLITH-v1.0.5 --out <zip>
  ex. : python3 tools/EvidenceForge/bin/freeze-package.py --repo . \
          --tree HEAD:tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.5 --root MONOLITH-v1.0.5 --out /tmp/ef-freeze-a/EvidenceForge-MONOLITH-v1.0.5.zip
"""
import argparse, hashlib, io, os, subprocess, sys, tarfile, zipfile

EXCLUDED_SUFFIXES = (".zip", ".sha256", ".log")
EXCLUDED_NAMES = (".DS_Store",)
EXCLUDED_DIRS = ("__MACOSX", ".git", "node_modules", "runs", "scratch")
FIXED_DATE = (1980, 1, 1, 0, 0, 0)

def excluded(rel):
    parts = rel.split("/")
    if any(p in EXCLUDED_DIRS for p in parts[:-1]): return True
    name = parts[-1]
    if name in EXCLUDED_NAMES or name.startswith(".env"): return True
    return any(name.endswith(s) for s in EXCLUDED_SUFFIXES)

def files_from_git(repo, tree):
    """Contenu canonique = tree git (git archive --format=tar), lu en memoire ; rend {relpath: bytes}."""
    data = subprocess.run(["git", "-C", repo, "archive", "--format=tar", tree], check=True, stdout=subprocess.PIPE).stdout
    out = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        for m in tf.getmembers():
            if not m.isfile(): continue
            rel = m.name[2:] if m.name.startswith("./") else m.name
            if excluded(rel): continue
            out[rel] = tf.extractfile(m).read()
    return out

def build(files, root, out_path):
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=False) as zf:
        for rel in sorted(files.keys(), key=lambda s: s.encode("utf-8")):
            zi = zipfile.ZipInfo(root.rstrip("/") + "/" + rel, date_time=FIXED_DATE)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.create_system = 3
            zi.external_attr = (0o100644 << 16)
            zi.extra = b""
            zi.comment = b""
            zf.writestr(zi, files[rel], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    h = hashlib.sha256()
    with open(out_path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return {"zip": os.path.abspath(out_path), "bytes": os.path.getsize(out_path), "sha256": h.hexdigest(), "entries": len(files)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True); ap.add_argument("--tree", required=True); ap.add_argument("--root", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    files = files_from_git(a.repo, a.tree)
    r = build(files, a.root, a.out)
    print("{sha256}  {zip}  bytes={bytes}  entries={entries}".format(**r))
    return 0

if __name__ == "__main__":
    sys.exit(main())
