#!/usr/bin/env python3
"""Minimum macOS exigé par les moteurs embarqués.

    python outils/minimum-macos.py             affiche le minimum à déclarer
    python outils/minimum-macos.py --ecrire    l'inscrit dans tauri.conf.json s'il est plus haut

Homebrew compile ses bouteilles pour le macOS de la machine : `tesseract` exige 26.0 sur un Mac
en 26.3 et 26.4 sur le runner de l'intégration continue. Le minimum d'un paquet dépend donc de
là où il est construit, tant que Tesseract n'est pas compilé avec un `MACOSX_DEPLOYMENT_TARGET`
fixe (voir docs/decisions.md). Ce script aligne la déclaration sur ce qui est réellement
embarqué : un paquet ne promet jamais de tourner là où ses moteurs ne se chargeraient pas.
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

SRC_TAURI = pathlib.Path(__file__).resolve().parent.parent
CONFIGURATION = SRC_TAURI / "tauri.conf.json"
MOTEURS = SRC_TAURI / "moteurs"


def version(texte: str) -> tuple[int, int] | None:
    parties = texte.strip().split(".")
    if not parties or not parties[0].isdigit():
        return None
    mineur = parties[1] if len(parties) > 1 and parties[1].isdigit() else "0"
    return int(parties[0]), int(mineur)


def minimum_binaire(fichier: pathlib.Path) -> tuple[int, int] | None:
    sortie = subprocess.run(["otool", "-l", str(fichier)], capture_output=True, text=True)
    if sortie.returncode != 0:
        return None
    trouve = re.search(r"^\s*minos ([0-9.]+)", sortie.stdout, re.MULTILINE)
    if trouve is None:
        trouve = re.search(r"LC_VERSION_MIN_MACOSX.*?^\s*version ([0-9.]+)", sortie.stdout, re.MULTILINE | re.DOTALL)
    return version(trouve.group(1)) if trouve else None


def minimum_des_moteurs() -> tuple[int, int] | None:
    minimums = [
        trouve
        for dossier in ("bin", "lib")
        if (MOTEURS / dossier).is_dir()
        for fichier in sorted((MOTEURS / dossier).iterdir())
        if fichier.is_file() and (trouve := minimum_binaire(fichier)) is not None
    ]
    return max(minimums) if minimums else None


def minimum_declare(configuration: dict) -> tuple[int, int] | None:
    declare = configuration.get("bundle", {}).get("macOS", {}).get("minimumSystemVersion")
    return version(declare) if isinstance(declare, str) else None


def main(argv: list[str]) -> int:
    if sys.platform != "darwin":
        print("Ce contrôle n'a de sens que sur macOS.", file=sys.stderr)
        return 0

    configuration = json.loads(CONFIGURATION.read_text(encoding="utf-8"))
    plancher = minimum_declare(configuration)
    if plancher is None:
        print("bundle.macOS.minimumSystemVersion absent de tauri.conf.json", file=sys.stderr)
        return 1

    moteurs = minimum_des_moteurs()
    if moteurs is None:
        print(f"aucun moteur dans {MOTEURS} : lancez d'abord preparer-moteurs.py", file=sys.stderr)
        return 1

    retenu = max(plancher, moteurs)
    texte = f"{retenu[0]}.{retenu[1]}"

    if "--ecrire" in argv:
        if retenu == plancher:
            print(f"minimum inchangé : {texte} (moteurs à {moteurs[0]}.{moteurs[1]})", file=sys.stderr)
        else:
            configuration["bundle"]["macOS"]["minimumSystemVersion"] = texte
            CONFIGURATION.write_text(json.dumps(configuration, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(
                f"minimum relevé de {plancher[0]}.{plancher[1]} à {texte} : "
                f"les moteurs de cette machine l'exigent",
                file=sys.stderr,
            )

    print(texte)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
