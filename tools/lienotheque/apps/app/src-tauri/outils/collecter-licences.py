#!/usr/bin/env python3
"""Rassemble les textes de licence de tout ce que le paquet redistribue.

POURQUOI

Le paquet embarque des programmes et des bibliothèques écrits par d'autres. Les redistribuer sans
leur texte de licence n'est pas permis, et la règle 3.6 du cahier de pilotage le dit : l'application
« embarque les textes de licence de tout ce qu'elle redistribue ». C'est la dette D2.

COMMENT ON SAIT À QUI APPARTIENT UN FICHIER

On ne le devine pas, et on n'écrit pas de table à la main : on retrouve le fichier sous le Cellar de
Homebrew, et c'est le chemin qui nomme la formule et sa version. Ce qui ne s'y retrouve pas —
Node.js, Siegfried, et le texte de Leptonica, que sa formule ne livre pas — se télécharge depuis
l'amont, à version figée et empreinte vérifiée, comme Siegfried lui-même.

CE QUI FAIT ROUGIR

Un fichier redistribué sans texte de licence arrête le script. Une empreinte qui ne correspond pas
arrête le script. On ne « complète plus tard » pas un paquet qu'on s'apprête à distribuer.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parent.parent
MOTEURS = RACINE / "moteurs"
LICENCES = MOTEURS / "licences"
PROJET = RACINE.parent.parent.parent
EPINGLES = PROJET / "fixtures" / "licences-des-moteurs.json"

CELLAR = pathlib.Path("/opt/homebrew/Cellar")
MOTIFS = ("LICENSE*", "LICENCE*", "COPYING*", "NOTICE*")

# Ce qui n'est pas livré par une formule Homebrew. Les adresses sont figées sur une étiquette de
# version, jamais sur une branche : le texte d'une branche change sous les pieds.
AMONT: dict[str, dict[str, str]] = {
    "leptonica": {
        "version": "1.86.0",
        "url": "https://raw.githubusercontent.com/DanBloomberg/leptonica/1.86.0/leptonica-license.txt",
        "nom": "leptonica-license.txt",
        "couvre": ["libleptonica"],
        "pourquoi": "la formule Homebrew de leptonica ne livre aucun texte de licence",
    },
    "node": {
        "version": "24.11.1",
        "url": "https://raw.githubusercontent.com/nodejs/node/v24.11.1/LICENSE",
        "nom": "LICENSE",
        "couvre": ["node"],
        "pourquoi": "node est installé hors Homebrew ; son texte n'est pas sur la machine",
    },
    "siegfried": {
        "version": "1.11.9",
        "url": "https://raw.githubusercontent.com/richardlehane/siegfried/v1.11.9/LICENSE.txt",
        "nom": "LICENSE.txt",
        "couvre": ["sf", "default.sig"],
        "pourquoi": "siegfried vient d'une version publiée sur GitHub, pas d'une formule",
    },
}


def couvert_par_l_amont(nom: str) -> str | None:
    """Le composant amont qui porte la licence de ce fichier, s'il y en a un."""
    for composant, quoi in AMONT.items():
        for debut in quoi["couvre"]:
            if nom == debut or nom.startswith(f"{debut}."):
                return composant
    return None

# Les binaires annexes de Tauri portent le triplet de compilation en suffixe : c'est le même
# programme, et donc la même licence.
def sans_triplet(nom: str) -> str:
    try:
        triplet = (
            subprocess.run(["rustc", "-vV"], capture_output=True, text=True, check=True)
            .stdout.split("host: ")[1]
            .split("\n")[0]
            .strip()
        )
    except (OSError, subprocess.CalledProcessError, IndexError):
        return nom
    return nom[: -len(f"-{triplet}")] if nom.endswith(f"-{triplet}") else nom


def empreinte(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()


def proprietaire(nom: str) -> tuple[str, str] | tuple[None, None]:
    """La formule et la version qui portent un fichier de ce nom, s'il est sous le Cellar."""
    for sous in ("lib", "bin"):
        for candidat in CELLAR.glob(f"*/*/{sous}/{nom}"):
            parties = candidat.relative_to(CELLAR).parts
            return parties[0], parties[1]
    return None, None


def textes_de(formule: str, version: str) -> list[pathlib.Path]:
    """Les textes de licence d'une formule, un par NOM de fichier.

    Une formule peut poser le même texte deux fois — à sa racine et sous share/doc. Dédoublonner
    par chemin ne suffit pas : les deux copies sont deux chemins, et l'inventaire annoncerait alors
    plus de textes que le dossier n'en porte. On dédoublonne donc par nom, la racine d'abord."""
    racine = CELLAR / formule / version
    trouves: dict[str, pathlib.Path] = {}
    for motif in MOTIFS:
        for chemin in sorted(racine.glob(motif)) + sorted(racine.glob(f"share/doc/{formule}/{motif}")):
            if chemin.is_file() and chemin.name not in trouves:
                trouves[chemin.name] = chemin
    return list(trouves.values())


def telecharger(url: str, attendue: str | None) -> bytes:
    with urllib.request.urlopen(url) as reponse:  # noqa: S310 — adresse figée ci-dessus
        octets: bytes = reponse.read()
    obtenue = empreinte(octets)
    if attendue is not None and obtenue != attendue:
        raise SystemExit(
            f"empreinte inattendue pour {url}\n  attendue : {attendue}\n  obtenue  : {obtenue}\n"
            "Le texte d'une licence ne change pas tout seul : relever le nouveau, le comparer, et "
            "décider — jamais ajuster l'attendu pour faire passer la collecte."
        )
    return octets


MACHO = (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xfe\xed\xfa\xce", b"\xca\xfe\xba\xbe")


def est_macho(chemin: pathlib.Path) -> bool:
    """Un Mach-O se reconnait a ses quatre premiers octets, jamais a son extension."""
    try:
        with chemin.open("rb") as fichier:
            return fichier.read(4) in MACHO
    except OSError:
        return False


def redistribues() -> list[pathlib.Path]:
    """Tout ce que le paquet emporte et dont quelqu'un d'autre est l'auteur."""
    fichiers: list[pathlib.Path] = []
    for sous in ("bin", "lib", "tessdata", "siegfried"):
        dossier = MOTEURS / sous
        if dossier.exists():
            fichiers += [f for f in sorted(dossier.rglob("*")) if f.is_file() and not f.is_symlink()]
    return fichiers


def main(argv: list[str]) -> int:
    if not MOTEURS.exists():
        raise SystemExit(f"{MOTEURS} absent : lancer preparer-moteurs.py d'abord")

    # Un paquet incomplet se refuse, il ne se sous-compte pas. La chaîne porte neuf textes de
    # licence : collecter avant qu'elle existe les annoncerait à zéro, et le contrôle du dépôt
    # n'y verrait rien — il vérifie que chaque texte ANNONCÉ est là, pas qu'aucun ne manque à
    # l'annonce. D'où ce refus, au lieu d'une collecte qui rassure.
    for indispensable in ("bin", "lib", "tessdata", "chaine"):
        if not (MOTEURS / indispensable).exists():
            raise SystemExit(
                f"moteurs/{indispensable} absent : le paquet n'est pas complet, et une collecte "
                "sur un paquet incomplet compte moins de textes qu'il n'en faut.\n"
                "Lancer preparer-moteurs.py puis preparer-moteur-node.py, dans cet ordre."
            )

    epingles = json.loads(EPINGLES.read_text(encoding="utf-8")) if EPINGLES.exists() else {}
    attendues: dict[str, str] = {
        nom: valeur["empreinte_sha256"] for nom, valeur in epingles.get("amont", {}).items()
    }
    relever = "--relever" in argv

    shutil.rmtree(LICENCES, ignore_errors=True)
    LICENCES.mkdir(parents=True)

    inventaire: dict[str, dict] = {}
    sans_licence: list[str] = []

    # 1. Ce que Homebrew livre, formule par formule.
    for fichier in redistribues():
        nom = sans_triplet(fichier.name)
        if fichier.parent.name in ("tessdata", "siegfried"):
            continue
        if couvert_par_l_amont(nom) is not None:
            continue
        formule, version = proprietaire(nom)
        if formule is None:
            continue
        if formule in inventaire:
            inventaire[formule]["redistribue"].append(fichier.name)
            continue
        trouves = textes_de(formule, version)
        if not trouves:
            sans_licence.append(f"{fichier.name} ({formule} {version}) : aucun texte sous le Cellar")
            continue
        cible = LICENCES / f"{formule}-{version}"
        cible.mkdir(parents=True, exist_ok=True)
        poses = []
        for texte in trouves:
            shutil.copy(texte, cible / texte.name)
            poses.append({"fichier": texte.name, "empreinte_sha256": empreinte(texte.read_bytes())})
        inventaire[formule] = {
            "version": version,
            "source": f"formule Homebrew {formule} {version}",
            "textes": poses,
            "redistribue": [fichier.name],
        }

    # 2. Les fichiers de langue : leur texte est livré avec eux.
    brew = CELLAR.parent
    texte_tessdata = brew / "share" / "tessdata" / "LICENSE"
    if (MOTEURS / "tessdata").exists():
        if not texte_tessdata.exists():
            sans_licence.append("tessdata : aucun texte à côté des fichiers de langue")
        else:
            cible = LICENCES / "tessdata"
            cible.mkdir(parents=True, exist_ok=True)
            shutil.copy(texte_tessdata, cible / "LICENSE")
            inventaire["tessdata"] = {
                "version": "livré avec les formules tesseract et tesseract-lang",
                "source": str(texte_tessdata),
                "textes": [{"fichier": "LICENSE", "empreinte_sha256": empreinte(texte_tessdata.read_bytes())}],
                "redistribue": sorted(f.name for f in (MOTEURS / "tessdata").iterdir() if f.is_file()),
            }

    # 3. Ce qui vient de l'amont, à empreinte vérifiée.
    for formule, quoi in AMONT.items():
        emporte = sorted(
            f.name for f in redistribues() if couvert_par_l_amont(sans_triplet(f.name)) == formule
        )
        octets = telecharger(quoi["url"], None if relever else attendues.get(formule))
        cible = LICENCES / f"{formule}-{quoi['version']}"
        cible.mkdir(parents=True, exist_ok=True)
        (cible / quoi["nom"]).write_bytes(octets)
        if not emporte:
            raise SystemExit(
                f"« {formule} » est téléchargé pour rien : aucun fichier redistribué ne lui "
                "correspond. Une licence collectée sans objet masque celle qui manque."
            )
        inventaire[formule] = {
            "version": quoi["version"],
            "source": quoi["url"],
            "pourquoi_l_amont": quoi["pourquoi"],
            "textes": [{"fichier": quoi["nom"], "empreinte_sha256": empreinte(octets)}],
            "redistribue": emporte,
        }

    # 4. Ce que la chaîne porte déjà : on ne le recopie pas, on l'inscrit.
    chaine = sorted((MOTEURS / "chaine").rglob("LICENSE*")) if (MOTEURS / "chaine").exists() else []
    inventaire["chaine"] = {
        "version": "livrés dans la chaîne elle-même",
        "source": "moteurs/chaine",
        "textes": [
            {
                "fichier": str(t.relative_to(MOTEURS)),
                "empreinte_sha256": empreinte(t.read_bytes()),
            }
            for t in chaine
        ],
        "redistribue": ["chaine"],
    }

    if sans_licence:
        raise SystemExit(
            "des fichiers seraient redistribués SANS leur texte de licence :\n"
            + "\n".join(f"  {ligne}" for ligne in sans_licence)
        )

    # L'avis de modification, produit et non ecrit a la main : il nomme les fichiers reellement
    # reecrits, releves sur le paquet. L'Apache-2.0 le demande a son § 4(b) pour les fichiers
    # modifies ; les autres licences presentes ne l'exigent pas, mais le dire ne coute rien et
    # ferme la question pour toutes.
    reecrits: list[str] = []
    tels_quels: list[str] = []
    for fichier in redistribues():
        if fichier.parent.name not in ("bin", "lib") or not est_macho(fichier):
            continue
        nom = f"{fichier.parent.name}/{fichier.name}"
        # Mesure, et non supposition : un fichier dont une reference pointe DANS le paquet
        # (@rpath, @loader_path, @executable_path) a vu ses references reecrites. Les autres sont
        # copies tels quels — node et sf en sont, et la premiere version de cet avis les comptait
        # a tort parmi les reecrits.
        try:
            sortie = subprocess.run(
                ["otool", "-L", str(fichier)], capture_output=True, text=True, check=True
            ).stdout
        except (OSError, subprocess.CalledProcessError):
            tels_quels.append(nom)
            continue
        (reecrits if "@rpath" in sortie or "@loader_path" in sortie else tels_quels).append(nom)

    (LICENCES / "MODIFICATIONS.txt").write_text(
        "AVIS DE MODIFICATION\n"
        "====================\n\n"
        "Les programmes et bibliotheques de ce paquet viennent de leurs auteurs d'origine. AUCUN\n"
        "code n'a ete change : ni source, ni comportement, ni donnees. Deux choses seulement ont\n"
        "ete faites, et cet avis dit laquelle a chaque fichier.\n\n"
        "1. REFERENCES DE CHARGEMENT REECRITES (install names et rpath des Mach-O), pour que le\n"
        "   paquet se charge entierement depuis lui-meme, sans dependre de bibliotheques\n"
        "   installees ailleurs sur la machine :\n"
        + "".join(f"     {nom}\n" for nom in sorted(reecrits))
        + "\n2. COPIES TELS QUELS, aucune reference touchee :\n"
        + "".join(f"     {nom}\n" for nom in sorted(tels_quels))
        + "\nTous sont ensuite re-signes : toute modification d'un Mach-O, et la copie elle-meme\n"
        "sur cette architecture, invalide la signature precedente.\n\n"
        "Fait par apps/app/src-tauri/outils/preparer-moteurs.py et\n"
        "apps/app/src-tauri/outils/preparer-moteur-node.py, dont le code est public.\n\n"
        f"Soit {len(reecrits)} fichiers reecrits et {len(tels_quels)} copies tels quels. Les textes\n"
        "de licence de chacun sont dans ce dossier.\n",
        encoding="utf-8",
    )

    (LICENCES / "INVENTAIRE.json").write_text(
        json.dumps(
            {
                "description": (
                    "Ce que le paquet redistribue, et où est le texte de licence de chacun. "
                    "Produit par outils/collecter-licences.py, jamais à la main."
                ),
                "composants": dict(sorted(inventaire.items())),
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    if relever:
        print(
            json.dumps(
                {
                    nom: {"version": q["version"], "url": q["url"], "empreinte_sha256": empreinte(telecharger(q["url"], None))}
                    for nom, q in AMONT.items()
                },
                ensure_ascii=False,
                indent=1,
            )
        )
        return 0

    nombre = sum(len(c["textes"]) for c in inventaire.values())
    print(f"{len(inventaire)} composants, {nombre} textes de licence dans {LICENCES.relative_to(RACINE)}")
    for nom, c in sorted(inventaire.items()):
        print(f"  {nom:<12} {len(c['textes'])} texte(s)  {len(c['redistribue'])} fichier(s) redistribué(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
