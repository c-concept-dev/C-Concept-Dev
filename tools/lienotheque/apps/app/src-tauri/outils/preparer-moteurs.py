#!/usr/bin/env python3
"""Embarque Tesseract et ses bibliothèques dans src-tauri/moteurs/ (dossier ignoré par Git).

    python3 outils/preparer-moteurs.py [langues…]      par défaut : fra eng

Les deux systèmes ne se ressemblent pas :

* **macOS** — les binaires Homebrew citent leurs bibliothèques par chemin absolu ou par @rpath.
  On copie la fermeture des dépendances, on réécrit chaque référence en @rpath/.., on ajoute deux
  LC_RPATH (développement et agencement du paquet), puis on resigne : toute modification invalide
  la signature sur arm64.
* **Windows** — le chargeur cherche d'abord dans le dossier de l'exécutable. Aucune réécriture
  n'est nécessaire, mais les DLL doivent être posées à côté du binaire. On suit la table d'imports
  des fichiers PE pour n'embarquer que les DLL réellement atteintes : l'installateur de Tesseract
  en livre bien plus (99 Mo contre une quinzaine utiles).

Contrôle du lecteur PE, sans Windows : `python outils/preparer-moteurs.py --autotest`.

Résultat identique des deux côtés : moteurs/bin, moteurs/lib (macOS) et moteurs/tessdata.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import struct
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


def _offset_pe(sections: list[tuple[int, int, int]], rva: int) -> int | None:
    for virtuelle, taille, brut in sections:
        if virtuelle <= rva < virtuelle + taille:
            return brut + (rva - virtuelle)
    return None


def imports_pe(chemin: pathlib.Path) -> list[str]:
    """Noms des DLL citées par la table d'imports d'un fichier PE. Liste vide si illisible."""
    try:
        donnees = chemin.read_bytes()
        if donnees[:2] != b"MZ":
            return []
        pe = struct.unpack_from("<I", donnees, 0x3C)[0]
        if donnees[pe : pe + 4] != b"PE\0\0":
            return []
        coff = pe + 4
        nb_sections = struct.unpack_from("<H", donnees, coff + 2)[0]
        taille_opt = struct.unpack_from("<H", donnees, coff + 16)[0]
        opt = coff + 20
        magic = struct.unpack_from("<H", donnees, opt)[0]
        # PE32 : 96 octets avant les répertoires ; PE32+ : 112.
        avant_repertoires = 96 if magic == 0x10B else 112
        if struct.unpack_from("<I", donnees, opt + avant_repertoires - 4)[0] < 2:
            return []
        rva_imports = struct.unpack_from("<I", donnees, opt + avant_repertoires + 8)[0]
        if rva_imports == 0:
            return []

        sections = []
        base = opt + taille_opt
        for i in range(nb_sections):
            entree = base + i * 40
            taille_virt, virtuelle, taille_brute, brut = struct.unpack_from("<IIII", donnees, entree + 8)
            sections.append((virtuelle, max(taille_virt, taille_brute), brut))

        offset = _offset_pe(sections, rva_imports)
        noms: list[str] = []
        while offset is not None and offset + 20 <= len(donnees):
            descripteur = donnees[offset : offset + 20]
            if descripteur == bytes(20):
                break
            rva_nom = struct.unpack_from("<I", descripteur, 12)[0]
            if rva_nom == 0:
                break
            debut = _offset_pe(sections, rva_nom)
            if debut is None:
                break
            fin = donnees.index(b"\0", debut)
            noms.append(donnees[debut:fin].decode("ascii", "replace"))
            offset += 20
        return noms
    except (OSError, ValueError, struct.error, IndexError):
        return []


def embarquer_windows(source: pathlib.Path, cible: pathlib.Path) -> int:
    """Les DLL atteintes par Tesseract vont à côté du binaire : Windows les y cherche d'abord.

    Seules celles que la table d'imports désigne sont reprises ; les DLL du système vivent dans
    System32 et ne sont donc pas dans le dossier de Tesseract."""
    voisines = {d.name.lower(): d for d in source.parent.glob("*.dll")}

    retenues: dict[str, pathlib.Path] = {}
    a_voir = [source]
    while a_voir:
        courant = a_voir.pop()
        for nom in imports_pe(courant):
            voisine = voisines.get(nom.lower())
            if voisine is None or voisine.name.lower() in retenues:
                continue
            retenues[voisine.name.lower()] = voisine
            a_voir.append(voisine)

    if not retenues:
        print("table d'imports illisible : repli sur toutes les DLL du dossier", file=sys.stderr)
        retenues = voisines

    for chemin in retenues.values():
        shutil.copy(chemin, cible.parent / chemin.name)
    return len(retenues)


def _pe_synthetique(chemin: pathlib.Path, dlls: list[str]) -> None:
    """Fabrique un PE32+ minimal dont la table d'imports cite `dlls`. Sert au contrôle du lecteur."""
    taille_opt = 112 + 16 * 8
    base_sections = 0x80 + 4 + 20 + taille_opt
    debut_brut, rva_section = 0x400, 0x1000

    fichier = bytearray(0x600)
    fichier[0:2] = b"MZ"
    struct.pack_into("<I", fichier, 0x3C, 0x80)
    fichier[0x80:0x84] = b"PE\0\0"
    struct.pack_into("<HH", fichier, 0x84, 0x8664, 1)  # machine, une section
    struct.pack_into("<H", fichier, 0x84 + 16, taille_opt)
    opt = 0x84 + 20
    struct.pack_into("<H", fichier, opt, 0x20B)  # PE32+
    struct.pack_into("<I", fichier, opt + 108, 16)  # nombre de répertoires
    struct.pack_into("<II", fichier, opt + 112 + 8, rva_section, 0x100)  # répertoire des imports
    struct.pack_into("<IIII", fichier, base_sections + 8, 0x200, rva_section, 0x200, debut_brut)

    noms = debut_brut + 20 * (len(dlls) + 1)
    for rang, nom in enumerate(dlls):
        struct.pack_into("<I", fichier, debut_brut + rang * 20 + 12, rva_section + (noms - debut_brut))
        octets = nom.encode() + b"\0"
        fichier[noms : noms + len(octets)] = octets
        noms += len(octets)
    chemin.write_bytes(bytes(fichier))


def autotest() -> int:
    """Vérifie le lecteur PE sans Windows, sur un fichier fabriqué pour l'occasion."""
    import tempfile

    with tempfile.TemporaryDirectory() as dossier:
        attendus = ["libtesseract-5.dll", "KERNEL32.dll", "libleptonica-6.dll"]
        chemin = pathlib.Path(dossier) / "faux.exe"
        _pe_synthetique(chemin, attendus)
        lus = imports_pe(chemin)
        if lus != attendus:
            print(f"lecteur PE en défaut : {lus} au lieu de {attendus}", file=sys.stderr)
            return 1

        pas_un_pe = pathlib.Path(dossier) / "texte.txt"
        pas_un_pe.write_text("ceci n'est pas un exécutable")
        if imports_pe(pas_un_pe) != []:
            print("un fichier quelconque ne doit rien produire", file=sys.stderr)
            return 1

    print("lecteur PE : contrôle réussi")
    return 0


def main(argv: list[str]) -> int:
    if "--autotest" in argv:
        return autotest()
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
