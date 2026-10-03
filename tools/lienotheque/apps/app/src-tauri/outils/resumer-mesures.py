#!/usr/bin/env python3
"""Résume les mesures du prototype dans le résumé d'exécution de GitHub Actions.

    python3 outils/resumer-mesures.py --journal <sortie-des-tests> --systeme <nom>

Lit le journal de `cargo test -- --nocapture`, pèse le paquet construit et écrit un tableau
Markdown sur la sortie standard. Ne décide rien : il rapporte.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

SRC_TAURI = pathlib.Path(__file__).resolve().parent.parent
CIBLE = SRC_TAURI / "target" / "release"
MOTEURS = SRC_TAURI / "moteurs"

# Chaque ligne que les tests d'intégration impriment, dans l'ordre des critères du CDC.
# Sans ancre de début : cargo colle la mesure à la suite de « test <nom> ... ».
CRITERES = (
    ("PDF natif de 500 pages", r"PDF : (.+)$"),
    ("Livre numérisé de 500 pages", r"PDF numérisé : (.+)$"),
    ("Sidecar Tesseract embarqué", r"Sidecar : (.+)$"),
    ("Reprise après arrêt forcé (JOB-02)", r"Reprise : (.+)$"),
    ("Lecture d'un MP3 par plages", r"Lecture par plages : (.+)$"),
)


def peser(chemin: pathlib.Path) -> int:
    if not chemin.exists():
        return 0
    if chemin.is_file():
        return chemin.stat().st_size
    return sum(f.stat().st_size for f in chemin.rglob("*") if f.is_file() and not f.is_symlink())


def mo(octets: int) -> str:
    return f"{octets / 1_000_000:.2f} Mo"


def paquet() -> tuple[str, int, list[tuple[str, int]]]:
    """Ce qui a été construit, et comment on le pèse selon le système."""
    paquets = sorted((CIBLE / "bundle" / "macos").glob("*.app"))
    if paquets:
        app = paquets[0]
        parties = [
            ("Moteurs embarqués", peser(app / "Contents" / "Resources" / "moteurs")),
            ("Binaire de l'application", peser(app / "Contents" / "MacOS" / "lienotheque-bureau")),
            ("Icône", peser(app / "Contents" / "Resources" / "icon.icns")),
        ]
        return f"paquet `{app.name}`", peser(app), parties

    executable = next((CIBLE.glob("lienotheque-bureau.exe")), None)
    if executable is not None:
        parties = [
            ("Moteurs embarqués", peser(MOTEURS)),
            ("Binaire de l'application", peser(executable)),
            ("Icônes", peser(SRC_TAURI / "icons")),
        ]
        return "taille installée estimée (exécutable + moteurs + icônes)", sum(t for _, t in parties), parties

    return "aucun paquet construit", 0, []


def main(argv: list[str]) -> int:
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--journal", required=True, type=pathlib.Path)
    arguments.add_argument("--systeme", required=True)
    options = arguments.parse_args(argv[1:])

    journal = options.journal.read_text(encoding="utf-8", errors="replace") if options.journal.exists() else ""

    lignes = [f"## Prototype bureau — {options.systeme}", ""]

    if not journal:
        lignes += ["Les tests n'ont produit aucun journal : l'étape a échoué avant de mesurer.", ""]

    lignes += ["| Critère du CDC | Mesure |", "|---|---|"]
    for intitule, motif in CRITERES:
        trouve = re.search(motif, journal, re.MULTILINE)
        lignes.append(f"| {intitule} | {trouve.group(1) if trouve else '**non mesuré**'} |")

    # Les totaux viennent des lignes de synthèse de cargo, une par binaire de test.
    totaux = re.findall(r"test result: \w+\. (\d+) passed; (\d+) failed", journal)
    reussites = sum(int(p) for p, _ in totaux)
    echecs = sum(int(e) for _, e in totaux)
    noms = re.findall(r"test (\S+) \.\.\..*FAILED", journal)
    lignes += ["", f"**Tests** : {reussites} réussis, {echecs} en échec."]
    if noms:
        lignes += ["", "En échec :"] + [f"- `{nom}`" for nom in noms]

    intitule, total, parties = paquet()
    lignes += ["", f"### Taille d'installation — {intitule}", ""]
    if total:
        lignes += ["| Partie | Taille |", "|---|---|"]
        lignes += [f"| {nom} | {mo(taille)} |" for nom, taille in parties if taille]
        lignes += [f"| **Total** | **{mo(total)}** |"]
    else:
        lignes.append("Rien à peser : la construction n'a pas abouti.")

    lignes += ["", "_Mesures brutes, aucune décision : voir `docs/decisions.md`._"]
    print("\n".join(lignes))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
