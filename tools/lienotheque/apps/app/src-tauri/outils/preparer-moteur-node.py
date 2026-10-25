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
import platform
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
    machine = platform.machine().lower()
    return "arm64" if machine in {"arm64", "aarch64"} else "x86_64"


def embarquer_node(cible: pathlib.Path) -> str:
    source = shutil.which("node")
    if source is None:
        raise SystemExit("node absent du chemin : installez Node 24 ou plus.")
    # Effacer avant de copier : écrire par-dessus un binaire déjà signé laisse macOS avec une
    # signature en cache qui ne correspond plus au contenu, et les outils qui suivent — `lipo`
    # le premier — échouent sans dire pourquoi. Le script doit se rejouer sur un poste déjà
    # préparé, sinon il ne sert qu'une fois.
    cible.unlink(missing_ok=True)
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
    # Résolu par son chemin : sous Windows, `pnpm` est un `.cmd`, que Python ne sait pas lancer
    # en le nommant seulement.
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise SystemExit("pnpm absent du chemin.")
    executer(
        pnpm,
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
        # Canvas porte un binaire natif propre à chaque architecture. Esbuild ne peut pas mettre
        # un `.node` dans un fichier JavaScript ; `embarquer_canvas` le pose à côté du moteur.
        "--external:@napi-rs/canvas",
        f"--outfile={sortie}",
        dans=PROJET,
    )
    return f"{poids(sortie):.2f} Mo"


def embarquer_canvas(cible: pathlib.Path) -> str:
    """Pose le moteur de rendu PDF et son binaire natif à côté de la chaîne.

    Le repli de rendu complet est précisément destiné aux PDF que les codecs WebAssembly ne
    savent pas décoder. Il doit donc voyager dans le paquet réel, sans dépendre du `node_modules`
    du dépôt. Seule la variante de la plateforme construite est copiée.
    """
    modules = PROJET / "node_modules" / ".pnpm"
    paquet = next(iter(sorted(modules.glob("@napi-rs+canvas@*/node_modules/@napi-rs/canvas"))), None)
    if paquet is None:
        raise SystemExit("@napi-rs/canvas introuvable : lancez pnpm install avant.")

    machine = architecture()
    suffixe = {
        ("darwin", "arm64"): "darwin-arm64",
        ("darwin", "x86_64"): "darwin-x64",
        ("win32", "arm64"): "win32-arm64-msvc",
        ("win32", "x86_64"): "win32-x64-msvc",
    }.get((sys.platform, machine))
    if suffixe is None:
        raise SystemExit(f"variante de @napi-rs/canvas non prévue pour {sys.platform}/{machine}")
    natif_nom = f"@napi-rs/canvas-{suffixe}"
    natif = next(iter(sorted(modules.glob(f"@napi-rs+canvas-{suffixe}@*/node_modules/{natif_nom}"))), None)
    if natif is None:
        raise SystemExit(f"{natif_nom} introuvable : lancez pnpm install sur la plateforme cible.")

    porte = cible / "node_modules" / "@napi-rs"
    porte.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(porte / "canvas", ignore_errors=True)
    shutil.rmtree(porte / f"canvas-{suffixe}", ignore_errors=True)
    shutil.copytree(paquet, porte / "canvas")
    shutil.copytree(natif, porte / f"canvas-{suffixe}")
    return f"{suffixe}, {poids(porte / 'canvas') + poids(porte / f'canvas-{suffixe}'):.2f} Mo"



def poser_module_de_travail(cible: pathlib.Path) -> str:
    """Pose le module de travail de pdfjs à côté de la chaîne.

    Mesuré sur un livre numérisé de vingt-neuf pages : inliné dans la chaîne, il fait passer la
    pointe mémoire du moteur de 656 Mo à 1 661 Mo et le fait tuer par le système — pour un module
    qui n'est pas même exécuté. esbuild l'inline dans le fichier unique, et V8 paie l'analyse de
    trois mégaoctets et demi de code en plus.

    pdfjs le cherche à l'exécution à côté de son propre module, c'est-à-dire à côté de la chaîne
    rassemblée. On le lui pose là, pour la même raison que les WebAssembly des codecs : le paquet
    n'a pas de `node_modules`, et ce qu'un module va chercher à l'exécution doit voyager avec lui.
    """
    modules = PROJET / "node_modules"
    source = next(iter(sorted((modules / ".pnpm").glob("pdfjs-dist@*/node_modules/pdfjs-dist"))), None)
    if source is None:
        raise SystemExit("pdfjs-dist introuvable : lancez pnpm install avant.")
    fichier = source / "legacy/build/pdf.worker.mjs"
    if not fichier.exists():
        raise SystemExit(f"module de travail introuvable : {fichier}")
    cible.mkdir(parents=True, exist_ok=True)
    shutil.copy2(fichier, cible / fichier.name)
    return f"{poids(cible / fichier.name):.2f} Mo"


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

    # Sous Windows, un exécutable porte son extension, et Tauri le cherche sous ce nom-là.
    suffixe = ".exe" if sys.platform == "win32" else ""
    cible = bin_ / f"node{suffixe}"
    dit = embarquer_node(cible)

    # Tauri cherche un binaire annexe suffixé par la cible de compilation.
    triplet = executer("rustc", "-vV").split("host: ")[1].split("\n")[0].strip()
    sidecar = cible.with_name(f"node-{triplet}{suffixe}")
    shutil.copy(cible, sidecar)
    sidecar.chmod(0o755)
    if sys.platform == "darwin":
        # Signature sur place : toute modification d'un binaire invalide sa signature sur arm64.
        executer("codesign", "--force", "--sign", "-", str(sidecar))

    chaine = rassembler_chaine(MOTEURS / "chaine")
    canvas = embarquer_canvas(MOTEURS / "chaine")
    codecs = embarquer_codecs(MOTEURS / "chaine" / "codecs")
    travail = poser_module_de_travail(MOTEURS / "chaine")

    print(f"moteur        : {dit}")
    print(f"binaire annexe: {sidecar.name}")
    print(f"chaîne        : {chaine}")
    print(f"rendu PDF     : {canvas}")
    print(f"codecs        : {codecs}")
    print(f"module travail: {travail}")
    print(f"total moteurs : {poids(MOTEURS):.0f} Mo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
