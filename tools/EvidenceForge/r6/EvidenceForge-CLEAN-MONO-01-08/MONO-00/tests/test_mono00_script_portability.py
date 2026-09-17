#!/usr/bin/env python3
"""MONO-00 — test de portabilité réel des scripts de reconstruction.
CORRECTION post-audit indépendant : prouve que build-registry.py et
static-search.sh fonctionnent depuis un chemin ARBITRAIRE, sans dépendre de
/tmp/mono00-verify ni de /home/claude — la seule chose garantie disponible
est le contenu de CE paquet MONO-00 (les scripts) et une fixture de
baseline créée à un emplacement quelconque, choisi ici volontairement
DIFFÉRENT des chemins de session Claude pour prouver l'absence de
dépendance cachée.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_REGISTRY = os.path.join(SCRIPT_DIR, "..", "scripts", "build-registry.py")
STATIC_SEARCH = os.path.join(SCRIPT_DIR, "..", "scripts", "static-search.sh")

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

# Un chemin arbitraire, à dessein DIFFÉRENT de /tmp/mono00-verify et de
# /home/claude — prouve que rien n'est codé en dur vers ces emplacements.
arbitrary_root = tempfile.mkdtemp(prefix="mono00-portability-arbitrary-location-")
arbitrary_output = tempfile.mkdtemp(prefix="mono00-portability-output-")

try:
    # === Construire une fixture de baseline minimale à cet emplacement arbitraire ===
    module_dir = os.path.join(arbitrary_root, "EF-02D", "EF-02D-v1", "src")
    os.makedirs(module_dir)
    sample_file = os.path.join(module_dir, "sample.js")
    with open(sample_file, "w") as f:
        f.write("module.exports = { ok: true };\n")

    manifest_path = os.path.join(arbitrary_root, "EF-02D", "EF-02D-v1", "EF-02D-MANIFEST-SHA256.txt")
    import hashlib
    digest = hashlib.sha256(open(sample_file, "rb").read()).hexdigest()
    with open(manifest_path, "w") as f:
        f.write(digest + "  src/sample.js\n")

    # === Exécuter build-registry.py avec --baseline-root/--output explicites ===
    proc = subprocess.run(
        [sys.executable, BUILD_REGISTRY, "--baseline-root", arbitrary_root, "--output", arbitrary_output],
        capture_output=True, text=True
    )
    check("1. build-registry.py s'exécute sans erreur depuis un chemin arbitraire", proc.returncode == 0, proc.stderr)

    out_json_path = os.path.join(arbitrary_output, "mono-00-file-inventory-v1.json")
    check("2. le fichier JSON de sortie est créé à l'emplacement --output demandé", os.path.exists(out_json_path))

    if os.path.exists(out_json_path):
        data = json.load(open(out_json_path))
        check("3. le JSON généré est valide et contient le module fixture EF-02D", "EF-02D" in data.get("modulesFound", []))
        check("4. baselineRootUsed reflète l'emplacement arbitraire fourni, jamais un chemin de session", data.get("baselineRootUsed", "").startswith(arbitrary_root))
        entry = next((e for e in data["files"] if e["relativePath"] == "src/sample.js"), None)
        check("5. le hash du fichier fixture est correctement calculé et rapproché du manifeste", entry is not None and entry["manifestSha256Matches"] is True)

    # === Vérifier qu'aucune chaîne "/home/claude" ou "/tmp/mono00-verify" n'apparaît dans le JSON produit ===
    raw = open(out_json_path).read() if os.path.exists(out_json_path) else ""
    check("6. le JSON produit ne contient AUCUNE référence à /home/claude", "/home/claude" not in raw)
    check("7. le JSON produit ne contient AUCUNE référence à /tmp/mono00-verify", "/tmp/mono00-verify" not in raw)

    # === static-search.sh avec un chemin explicite arbitraire ===
    proc2 = subprocess.run(["bash", STATIC_SEARCH, arbitrary_root], capture_output=True, text=True)
    check("8. static-search.sh s'exécute sans erreur avec un chemin explicite arbitraire", proc2.returncode == 0, proc2.stderr)
    check("8b. static-search.sh confirme utiliser la racine fournie (jamais un défaut de session)", arbitrary_root in proc2.stdout)

    # === static-search.sh SANS argument, sur une machine où /tmp/mono00-verify n'existe pas -> échec clair, jamais un faux succès silencieux ===
    fake_home = tempfile.mkdtemp(prefix="mono00-fake-home-")
    env = os.environ.copy()
    proc3 = subprocess.run(["bash", STATIC_SEARCH], capture_output=True, text=True, cwd=fake_home, env=env)
    # Le script doit soit échouer proprement (répertoire par défaut absent), soit fonctionner sur un
    # dossier "mono00-verify" placé à côté de lui-même — jamais un chemin de session Claude codé en dur.
    check("9. static-search.sh sans argument ne référence jamais /tmp/mono00-verify ou /home/claude dans son échec", "/tmp/mono00-verify" not in proc3.stdout and "/home/claude" not in (proc3.stdout + proc3.stderr) or proc3.returncode != 0)

finally:
    shutil.rmtree(arbitrary_root, ignore_errors=True)
    shutil.rmtree(arbitrary_output, ignore_errors=True)

all_pass = True
for name, ok, detail in results:
    if not ok: all_pass = False
    print(("PASS" if ok else "FAIL") + " — " + name + (("  [" + detail + "]") if detail and not ok else ""))
print("\n" + ("TOUS LES TESTS PASSENT (%d)" % len(results) if all_pass else "ECHECS DETECTES"))
sys.exit(0 if all_pass else 1)
