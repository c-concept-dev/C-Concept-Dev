#!/usr/bin/env python3
"""Embarque le moteur de traitement dans le paquet (lot D2, étape 1, point 10).

Deux choses à poser : le binaire Node, et la chaîne compilée en JavaScript qu'il exécutera.

Le binaire est **réduit à l'architecture de la machine** avant d'être embarqué. Le Node officiel de
macOS est universel — 227 Mo pour deux architectures —, alors qu'un paquet n'en sert qu'une. On
descend ainsi à environ 104 Mo, mesuré, sans rien perdre de ce qui tourne ici.

La chaîne est rassemblée en un seul fichier par esbuild. Un moteur qui irait chercher ses modules
dans `node_modules` dépendrait du dépôt ; un fichier unique voyage avec le paquet.

    python3 outils/preparer-moteur-node.py
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys

RACINE = pathlib.Path(__file__).resolve().parents[1]
MOTEURS = RACINE / "moteurs"
PROJET = RACINE.parents[2]


def executer(*commande: str, dans: pathlib.Path | None = None) -> str:
    fait = subprocess.run(commande, capture_output=True, text=True, cwd=dans)
    if fait.returncode != 0:
        raise SystemExit(f"échec de « {' '.join(commande)} » :\n{fait.stderr.strip()}")
    return fait.stdout


def poids(chemin: pathlib.Path) -> float:
    if chemin.is_dir():
        return sum(f.stat().st_size for f in chemin.rglob("*") if f.is_file()) / 1_000_000
    return chemin.stat().st_size / 1_000_000


def architecture() -> str:
    """L'architecture de cette machine, telle que `lipo` la nomme."""
    return "arm64" if executer("uname", "-m").strip() == "arm64" else "x86_64"


def embarquer_node(cible: pathlib.Path) -> str:
    source = shutil.which("node")
    if source is None:
        raise SystemExit("node absent du chemin : installez Node 24 ou plus.")
    shutil.copy(source, cible)

    avant = poids(cible)
    if sys.platform == "darwin":
        formes = executer("lipo", "-archs", str(cible)).split()
        if len(formes) > 1:
            # Un paquet ne sert qu'une architecture : embarquer l'autre, c'est doubler le poids
            # pour une machine qui ne l'exécutera jamais.
            executer("lipo", "-thin", architecture(), str(cible), "-output", str(cible) + ".mince")
            shutil.move(str(cible) + ".mince", cible)
        executer("strip", "-S", str(cible))
        # Toute modification invalide la signature sur arm64, et un binaire dont la signature est
        # invalide ne démarre pas du tout : on resigne avant même d'essayer de le lancer.
        executer("codesign", "--force", "--sign", "-", str(cible))
    cible.chmod(0o755)

    version = executer(str(cible), "--version").strip()
    return f"{version}, {avant:.0f} Mo réduits à {poids(cible):.0f} Mo"


def rassembler_chaine(cible: pathlib.Path) -> str:
    """Rassemble la chaîne en un seul fichier JavaScript, que Node exécute sans rien chercher."""
    cible.mkdir(parents=True, exist_ok=True)
    sortie = cible / "moteur.js"
    executer(
        "pnpm",
        "--filter",
        "@lienotheque/ingestion",
        "exec",
        "esbuild",
        "src/moteur.ts",
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--target=node24",
        # Les modules natifs de Node ne s'embarquent pas : ils viennent du moteur lui-même.
        "--external:node:*",
        f"--outfile={sortie}",
        dans=PROJET,
    )
    return f"{poids(sortie):.2f} Mo"


def embarquer_codecs(cible: pathlib.Path) -> str:
    """Range les WebAssembly des codecs à côté de la chaîne.

    Le paquet n'a pas de `node_modules` : ces fichiers, que les codecs vont chercher à
    l'exécution, doivent voyager avec lui. Sans eux, le paquet lit un lot déjà lu — le cache lui
    épargne tout décodage — et échoue sur le premier document neuf.
    """
    attendus = {
        "@jsquash/jpeg": ["codec/dec/mozjpeg_dec.wasm", "codec/enc/mozjpeg_enc.wasm"],
        "@jsquash/webp": ["codec/enc/webp_enc.wasm", "codec/dec/webp_dec.wasm"],
        "@jsquash/avif": ["codec/enc/avif_enc.wasm"],
        "@jsquash/resize": ["lib/resize/pkg/squoosh_resize_bg.wasm"],
    }
    modules = PROJET / "node_modules"
    poses = 0
    for paquet, fichiers in attendus.items():
        source = (modules / ".pnpm").glob(f"{paquet.replace('/', '+')}@*/node_modules/{paquet}")
        racine_paquet = next(iter(sorted(source)), None)
        if racine_paquet is None:
            raise SystemExit(f"{paquet} introuvable : lancez `pnpm install`.")
        for relatif in fichiers:
            depuis = racine_paquet / relatif
            if not depuis.exists():
                continue
            vers = cible / paquet / relatif
            vers.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(depuis, vers)
            poses += 1
    if poses == 0:
        raise SystemExit("aucun codec embarqué : le paquet échouerait sur le premier document neuf")
    return f"{poses} fichiers, {poids(cible):.2f} Mo"


def main() -> int:
    bin_ = MOTEURS / "bin"
    bin_.mkdir(parents=True, exist_ok=True)

    cible = bin_ / "node"
    dit = embarquer_node(cible)

    # Tauri cherche un binaire annexe suffixé par la cible de compilation.
    triplet = executer("rustc", "-vV").split("host: ")[1].split("\n")[0].strip()
    sidecar = cible.with_name(f"node-{triplet}")
    shutil.copy(cible, sidecar)
    sidecar.chmod(0o755)
    if sys.platform == "darwin":
        # Signature sur place : toute modification d'un binaire invalide sa signature sur arm64.
        executer("codesign", "--force", "--sign", "-", str(sidecar))

    chaine = rassembler_chaine(MOTEURS / "chaine")
    codecs = embarquer_codecs(MOTEURS / "chaine" / "codecs")

    print(f"moteur        : {dit}")
    print(f"binaire annexe: {sidecar.name}")
    print(f"chaîne        : {chaine}")
    print(f"codecs        : {codecs}")
    print(f"total moteurs : {poids(MOTEURS):.0f} Mo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
