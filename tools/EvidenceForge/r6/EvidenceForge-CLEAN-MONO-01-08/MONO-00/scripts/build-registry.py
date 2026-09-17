#!/usr/bin/env python3
"""MONO-00 — construction de l'inventaire fichier par fichier.

CORRECTION post-audit indépendant : ce script codait en dur
BASE="/tmp/mono00-verify" comme unique source et la destination sous
/home/claude/MONO-00/... — non portable depuis le ZIP livré. Il accepte
désormais --baseline-root et --output explicitement, avec un repli sur des
chemins RELATIFS À L'EMPLACEMENT DU SCRIPT LUI-MÊME (jamais un chemin
absolu de session Claude), pour qu'un environnement neuf puisse
reconstruire le registre sans dépendre de /tmp/mono00-verify ni de
/home/claude.

Usage :
  python3 build-registry.py --baseline-root <dossier contenant les paquets extraits> --output <dossier de sortie>

Si --baseline-root est omis, le script cherche un dossier "mono00-verify"
à côté de lui-même (fallback relatif, jamais un chemin de session codé en dur).
"""
import json, os, hashlib, argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BASELINE_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "mono00-verify"))
DEFAULT_OUTPUT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "registry"))

# Chemins RELATIFS à --baseline-root — jamais absolus, jamais codés en dur
# vers un répertoire de session.
MODULES = {
    "EF-ORCH": ("EF-ORCH/EF-ORCH-RELEASE-v0.1", "SHA256SUMS.txt"),
    "EF-PR-GEN-01": ("EF-PR-GEN-01/EF-PR-GEN-01", None),
    "EF-02ABC": ("EF-02ABC/EF-02ABC-v1", None),
    "EF-02D": ("EF-02D/EF-02D-v1", "EF-02D-MANIFEST-SHA256.txt"),
    "EF-02E": ("EF-02E/EF-02E-v1", "EF-02E-MANIFEST-SHA256.txt"),
    "EF-03": ("EF-03/EF-03-v1", "EF-03-MANIFEST-SHA256.txt"),
    "EF-04": ("EF-04/EF-04-v1", "EF-04-MANIFEST-SHA256.txt"),
}
SOURCE_PACKAGES = {
    "EF-ORCH": "EF-ORCH-RELEASE-v0.1.zip", "EF-PR-GEN-01": "EF-PR-GEN-01-FINAL.zip",
    "EF-02ABC": "EF-02ABC-v1.zip", "EF-02D": "EF-02D-v1.zip", "EF-02E": "EF-02E-v1.zip",
    "EF-03": "EF-03-v1.zip", "EF-04": "EF-04-v1.zip"
}

EXCLUDE_DIRS = {"node_modules", "__MACOSX"}
EXCLUDE_NAMES = {".DS_Store"}

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def role_of(relpath):
    if relpath.endswith(".md"): return "documentation"
    if "/test/" in relpath or relpath.startswith("test/") or "test_" in os.path.basename(relpath): return "test"
    if "/fixtures/" in relpath or relpath.startswith("fixtures/"): return "fixture"
    if "/contracts/" in relpath or relpath.startswith("contracts/"): return "contract_doc"
    if "/dependencies/" in relpath or relpath.startswith("dependencies/"): return "frozen_dependency_copy"
    if "/tools/" in relpath or relpath.startswith("tools/"): return "historical_html_tool"
    if relpath.endswith(".json") and "MANIFEST" in relpath.upper(): return "manifest"
    if relpath.endswith("package.json") or relpath.endswith("package-lock.json"): return "package_metadata"
    if relpath.endswith(".js"): return "source"
    return "other"

def build(baseline_root, output_dir, modules=MODULES):
    entries = []
    modules_found = []
    modules_missing = []
    for module_id, (rel_root, manifest_name) in modules.items():
        root = os.path.join(baseline_root, rel_root)
        if not os.path.isdir(root):
            modules_missing.append({"moduleId": module_id, "expectedPath": root})
            continue
        modules_found.append(module_id)

        manifest_hashes = {}
        if manifest_name:
            mpath = os.path.join(root, manifest_name)
            if os.path.exists(mpath):
                for line in open(mpath):
                    parts = line.strip().split(None, 1)
                    if len(parts) == 2:
                        manifest_hashes[parts[1]] = parts[0]

        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fn in filenames:
                if fn in EXCLUDE_NAMES: continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root)
                size = os.path.getsize(full)
                digest = sha256_of(full)
                expected = manifest_hashes.get(rel)
                entries.append({
                    "moduleId": module_id, "relativePath": rel, "role": role_of(rel),
                    "sizeBytes": size, "sha256": digest,
                    "manifestSha256Expected": expected,
                    "manifestSha256Matches": (expected == digest) if expected else None,
                    "canonical": role_of(rel) not in ("historical_html_tool",),
                    "sourcePackage": SOURCE_PACKAGES.get(module_id, "unknown")
                })

    os.makedirs(output_dir, exist_ok=True)
    out = {
        "schema": "EvidenceForge.FileInventory", "schemaVersion": "MONO-00-v1",
        "baselineRootUsed": os.path.abspath(baseline_root),
        "modulesFound": modules_found, "modulesMissing": modules_missing,
        "totalFiles": len(entries), "files": entries
    }
    out_path = os.path.join(output_dir, "mono-00-file-inventory-v1.json")
    json.dump(out, open(out_path, "w"), indent=2, ensure_ascii=False)
    return out, out_path

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="MONO-00 — reconstruit l'inventaire fichier par fichier, portable.")
    p.add_argument("--baseline-root", default=DEFAULT_BASELINE_ROOT, help="Dossier contenant les paquets extraits (ex. EF-ORCH/, EF-02D/, ...). Par défaut : mono00-verify/ à côté de ce script.")
    p.add_argument("--output", default=DEFAULT_OUTPUT_DIR, help="Dossier de sortie pour le registre JSON. Par défaut : registry/ à côté de ce script.")
    args = p.parse_args()

    out, out_path = build(args.baseline_root, args.output)
    print("Fichiers inventoriés :", out["totalFiles"])
    print("Modules trouvés :", out["modulesFound"])
    if out["modulesMissing"]:
        print("MODULES MANQUANTS (chemin attendu introuvable) :", out["modulesMissing"])
    mismatches = [e for e in out["files"] if e["manifestSha256Matches"] is False]
    print("Incohérences de hash détectées :", len(mismatches))
    for m in mismatches: print(" -", m["moduleId"], m["relativePath"])
    print("Écrit :", out_path)
