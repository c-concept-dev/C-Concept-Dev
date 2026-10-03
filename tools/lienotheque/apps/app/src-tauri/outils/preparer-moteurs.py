#!/usr/bin/env python3
"""Embarque Tesseract et ses bibliothèques dans src-tauri/moteurs/ (dossier ignoré par Git).

    python3 outils/preparer-moteurs.py [langues…]      par défaut : fra eng

Les deux systèmes ne se ressemblent pas :

* **macOS** — les binaires Homebrew citent leurs bibliothèques par chemin absolu ou par @rpath.
  On copie la fermeture des dépendances, on réécrit chaque référence en @rpath/.., on ajoute deux
  LC_RPATH (développement et agencement du paquet), puis on resigne : toute modification invalide
  la signature sur arm64.
* **Windows** — le chargeur cherche d'abord dans le dossier de l'exécutable. Aucune réécriture
  n'est nécessaire, mais les DLL doivent être posées à côté du binaire. On reprend celles que
  l'installateur livre avec Tesseract : c'est son environnement d'exécution.

Résultat identique des deux côtés : moteurs/bin, moteurs/lib (macOS) et moteurs/tessdata.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys

SYSTEME = ("/usr/lib/", "/System/")
RACINE = pathlib.Path(__file__).resolve().parent.parent
MOTEURS = RACINE / "moteurs"


def executer(*commande: str) -> str:
    return subprocess.run(commande, check=True, capture_output=True, text=True).stdout


def prefixe_brew() -> pathlib.Path | None:
    chemin = shutil.which("brew")
    return pathlib.Path(executer(chemin, "--prefix").strip()) if chemin else None


def dependances(fichier: pathlib.Path) -> list[str]:
    """Noms d'installation cités par un binaire, hors bibliothèques du système."""
    lignes = executer("otool", "-L", str(fichier)).splitlines()[1:]
    noms = [ligne.split(" (compatibility")[0].strip() for ligne in lignes if ligne.strip()]
    return [n for n in noms if not n.startswith(SYSTEME)]


def resoudre(nom: str, dossiers: list[pathlib.Path]) -> pathlib.Path | None:
    """Retrouve le fichier réel derrière un nom d'installation, y compris @rpath/@loader_path."""
    if nom.startswith("@"):
        base = pathlib.Path(nom).name
        for dossier in dossiers:
            candidat = dossier / base
            if candidat.exists():
                return candidat.resolve()
        return None
    chemin = pathlib.Path(nom)
    return chemin.resolve() if chemin.exists() else None


def fermeture(depart: pathlib.Path, recherche: list[pathlib.Path]) -> dict[str, pathlib.Path]:
    """Toutes les bibliothèques non système atteignables depuis `depart`, par nom de fichier."""
    trouvees: dict[str, pathlib.Path] = {}
    a_voir = [depart]
    while a_voir:
        courant = a_voir.pop()
        for nom in dependances(courant):
            reel = resoudre(nom, [courant.parent, *recherche])
            if reel is None or reel.name in trouvees or reel == depart:
                continue
            trouvees[reel.name] = reel
            a_voir.append(reel)
    return trouvees


def reecrire(fichier: pathlib.Path, prefixe: str, connues: set[str]) -> None:
    for nom in dependances(fichier):
        base = pathlib.Path(nom).name
        if base in connues and nom != f"{prefixe}/{base}":
            subprocess.run(
                ["install_name_tool", "-change", nom, f"{prefixe}/{base}", str(fichier)],
                check=False,
                capture_output=True,
            )


def signer(fichier: pathlib.Path) -> None:
    subprocess.run(["codesign", "--force", "--sign", "-", str(fichier)], check=False, capture_output=True)


def modeles(langues: list[str], source: pathlib.Path) -> None:
    brew = prefixe_brew()
    candidats = [
        pathlib.Path(os.environ["TESSDATA_PREFIX"]) if "TESSDATA_PREFIX" in os.environ else None,
        (brew / "share" / "tessdata") if brew else None,
        source.parent.parent / "share" / "tessdata",
        source.parent / "tessdata",  # agencement de l'installateur Windows
    ]
    for langue in langues:
        for dossier in candidats:
            if dossier and (dossier / f"{langue}.traineddata").exists():
                # Homebrew éparpille les modèles entre formules et les relie par liens.
                shutil.copy((dossier / f"{langue}.traineddata").resolve(), MOTEURS / "tessdata")
                break
        else:
            raise SystemExit(
                f"modèle introuvable pour « {langue} » : `brew install tesseract-lang`, "
                f"ou déposez {langue}.traineddata dans le dossier tessdata de Tesseract"
            )


def embarquer_macos(source: pathlib.Path, cible: pathlib.Path) -> int:
    brew = prefixe_brew()
    recherche = [p for p in [brew / "lib" if brew else None, source.parent.parent / "lib"] if p and p.exists()]

    bibliotheques = fermeture(source, recherche)
    for nom, reel in bibliotheques.items():
        copie = MOTEURS / "lib" / nom
        shutil.copy(reel, copie)
        copie.chmod(0o755)

    connues = set(bibliotheques)
    # @rpath plutôt qu'un chemin fixe : le binaire sert en développement (moteurs/bin) comme
    # dans le paquet macOS (Contents/MacOS), où les bibliothèques vivent dans Resources.
    reecrire(cible, "@rpath", connues)
    for chemin_rpath in ("@executable_path/../lib", "@executable_path/../Resources/moteurs/lib"):
        subprocess.run(
            ["install_name_tool", "-add_rpath", chemin_rpath, str(cible)], check=False, capture_output=True
        )
    for nom in connues:
        copie = MOTEURS / "lib" / nom
        subprocess.run(["install_name_tool", "-id", f"@loader_path/{nom}", str(copie)], check=False, capture_output=True)
        reecrire(copie, "@loader_path", connues)
    for fichier in [cible, *(MOTEURS / "lib" / n for n in connues)]:
        signer(fichier)
    return len(connues)


def embarquer_windows(source: pathlib.Path, cible: pathlib.Path) -> int:
    """Les DLL livrées avec Tesseract vont à côté du binaire : c'est là que Windows les cherche."""
    dlls = sorted(source.parent.glob("*.dll"))
    for dll in dlls:
        shutil.copy(dll, cible.parent / dll.name)
    return len(dlls)


def main(argv: list[str]) -> int:
    langues = argv[1:] or ["fra", "eng"]
    windows = sys.platform == "win32"
    binaire = shutil.which("tesseract")
    if binaire is None:
        raise SystemExit(
            "tesseract absent : `choco install tesseract` sous Windows, `brew install tesseract` sinon"
        )
    source = pathlib.Path(binaire).resolve()

    shutil.rmtree(MOTEURS, ignore_errors=True)
    for sous in ("bin", "lib", "tessdata"):
        (MOTEURS / sous).mkdir(parents=True)

    cible = MOTEURS / "bin" / ("tesseract.exe" if windows else "tesseract")
    shutil.copy(source, cible)
    cible.chmod(0o755)

    nombre = embarquer_windows(source, cible) if windows else embarquer_macos(source, cible)

    # Tauri cherche un binaire annexe suffixé par la cible de compilation.
    triplet = executer("rustc", "-vV").split("host: ")[1].split("\n")[0].strip()
    sidecar = cible.with_name(f"tesseract-{triplet}" + (".exe" if windows else ""))
    shutil.copy(cible, sidecar)
    sidecar.chmod(0o755)
    if not windows:
        signer(sidecar)

    modeles(langues, source)

    controle = subprocess.run(
        [str(cible), "--version"],
        env={**os.environ, "TESSDATA_PREFIX": str(MOTEURS / "tessdata")},
        capture_output=True,
        text=True,
    )
    if controle.returncode != 0:
        raise SystemExit(f"le moteur embarqué ne démarre pas :\n{controle.stderr.strip()}")

    print(controle.stdout.splitlines()[0])
    print(f"{nombre} bibliothèques embarquées, langues : {', '.join(langues)}")
    print(f"binaire annexe : {sidecar.name}")
    for sous in ("bin", "lib", "tessdata"):
        octets = sum(f.stat().st_size for f in (MOTEURS / sous).rglob("*") if f.is_file())
        print(f"  {sous:<9} {octets / 1_000_000:7.2f} Mo")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
