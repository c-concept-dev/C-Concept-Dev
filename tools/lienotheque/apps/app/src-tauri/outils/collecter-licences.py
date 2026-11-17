#!/usr/bin/env python3
"""Rassemble les textes de licence de tout ce que le paquet redistribue.

POURQUOI

Le paquet embarque des programmes et des bibliothèques écrits par d'autres. Les redistribuer sans
leur texte de licence n'est pas permis, et la règle 3.6 du cahier de pilotage le dit : l'application
« embarque les textes de licence de tout ce qu'elle redistribue ». C'est la dette D2.

DEUX MODES, ET POURQUOI (lot 0u ter)

Par défaut, LES LICENCES DES MOTEURS VIENNENT DE L'ARCHIVE et la chaîne seule est recollectée.
C'est la suite de la décision du 14 novembre 2026 — « l'archive publiée fait foi » — appliquée aux
licences comme elle l'est aux programmes.

Ce script faisait l'inverse, et cela a cassé la course du 16 novembre 2026 : il commençait par
EFFACER `moteurs/licences`, que l'archive venait de déposer, puis cherchait les textes sous le
Cellar de Homebrew. Le lot 0u ayant retiré `brew install tesseract tesseract-lang`, il n'y avait
plus rien à trouver : « tessdata : aucun texte à côté des fichiers de langue ». Le garde-fou avait
raison de refuser — il ne pouvait pas prouver les licences d'un paquet qu'on s'apprêtait à
distribuer.

Et recollecter depuis Homebrew aurait été PIRE que vérifier : Homebrew livre aujourd'hui tesseract
5.5.4 quand l'archive embarque 5.5.1. Le paquet serait parti avec des textes décrivant une autre
version que ses binaires — une licence qui parle d'autre chose ne couvre rien.

Avec `--fabriquer`, et seulement là, les textes se retrouvent sous le Cellar de Homebrew — c'est le
chemin qui nomme la formule et sa version — et ce qui ne s'y trouve pas (Node.js, Siegfried, et le
texte de Leptonica, que sa formule ne livre pas) se télécharge depuis l'amont, à version figée et
empreinte vérifiée. Ce mode sert à FABRIQUER une nouvelle archive, acte volontaire, et il refuse si
les versions trouvées ne sont pas celles épinglées : changer de moteur est une décision à part, qui
se prend avec une mesure, pas un effet de bord d'une collecte.

LA CHAÎNE N'EST PAS UN MOTEUR

`preparer-moteur-node.py` la reconstruit depuis les sources du dépôt à chaque préparation. Celle de
l'archive a cinq jours ; celle du paquet vient du commit sous essai. Son entrée est donc toujours
recollectée, et elle DIT DE QUEL COMMIT elle vient. Si `git rev-parse HEAD` ne répond pas, la
collecte refuse : une entrée « chaine » sans commit rassurerait sans rien dire.

CE QUI FAIT ROUGIR

Un fichier redistribué sans texte de licence arrête le script. Une empreinte qui ne correspond pas
arrête le script. On ne « complète plus tard » pas un paquet qu'on s'apprête à distribuer.
"""

from __future__ import annotations

import hashlib
import json
import os
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
EPINGLES_MOTEURS = PROJET / "fixtures" / "moteurs-de-lecture.json"

# POINT D'ENTRÉE DE CONTRÔLE, et rien d'autre. En service la variable n'est jamais posée : la
# racine est celle de Homebrew sur macOS arm64, le seul système que le CDC vise. Elle existe parce
# qu'un contrôle doit pouvoir fabriquer un faux Cellar dans un dossier temporaire pour éprouver le
# refus de `--fabriquer` ; sans elle, ce refus ne serait vérifiable que sur une machine où Homebrew
# livre la mauvaise version, c'est-à-dire par accident.
CELLAR = pathlib.Path(os.environ.get("LIENOTHEQUE_CELLAR_DE_CONTROLE", "/opt/homebrew/Cellar"))
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



# ─────────────────────────────────────────────────────────────────────────────────────────────
# Le juge des versions : un seul, appelé par les DEUX modes
# ─────────────────────────────────────────────────────────────────────────────────────────────
#
# Exigé par Christophe le 17 novembre 2026 : « la comparaison des versions avec les épingles vaut
# dans les deux modes. En --fabriquer, une version différente (Homebrew livre 5.5.4) refuse :
# changer de moteur est une décision à part, avec mesure. »
#
# DEUX SOURCES, ET AUCUNE N'EST TAUTOLOGIQUE. C'est le piège qu'il fallait fermer : en
# `--fabriquer`, les versions des composants d'AMONT sont écrites dans ce fichier même. Les
# comparer aux épingles serait comparer une constante à elle-même — vert par construction, et
# muet. On compare donc aussi CE QUE LES PROGRAMMES EMBARQUÉS ANNONCENT, qui est une mesure, et
# c'est elle qui répond littéralement à l'exigence : chaque texte doit décrire la version
# embarquée.


def versions_epinglees() -> dict[str, str]:
    """Les versions attendues. LUES, jamais écrites ici : `fixtures/moteurs-de-lecture.json` pour
    le programme de lecture, et les `version` d'AMONT pour le reste."""
    programme = json.loads(EPINGLES_MOTEURS.read_text(encoding="utf-8"))["programme"]
    attendues = {
        "tesseract": programme["version_tesseract"],
        "leptonica": programme["version_leptonica"],
    }
    for nom, quoi in AMONT.items():
        attendues.setdefault(nom, quoi["version"])
    return attendues


def version_annoncee_par(programme: pathlib.Path, *arguments: str) -> str | None:
    """Ce qu'un binaire embarqué dit de lui-même, ou None s'il ne répond pas."""
    if not programme.exists():
        return None
    try:
        sortie = subprocess.run(
            [str(programme), *arguments], capture_output=True, text=True, timeout=60
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return f"{sortie.stdout}\n{sortie.stderr}"


def versions_annoncees() -> dict[str, str]:
    """Les versions que les programmes du paquet annoncent. Mesure, et non lecture d'un fichier.

    Vide quand les binaires sont absents — sur un coureur Linux, il n'y a rien à interroger, et un
    juge qui inventerait une version y serait plus faux que silencieux. Le silence est dit par
    l'appelant, jamais tu."""
    vues: dict[str, str] = {}

    dit = version_annoncee_par(MOTEURS / "bin" / "tesseract", "--version")
    if dit is not None:
        for ligne in dit.splitlines():
            if ligne.startswith("tesseract "):
                vues["tesseract"] = ligne.split()[1]
            if "leptonica-" in ligne:
                # « leptonica-1.86.0 (…) » : on prend le numéro, pas la parenthèse.
                vues["leptonica"] = ligne.split("leptonica-")[1].split()[0].split(")")[0]

    dit = version_annoncee_par(MOTEURS / "bin" / "node", "--version")
    if dit is not None and dit.strip().startswith("v"):
        vues["node"] = dit.strip().lstrip("v").split()[0]

    sf = MOTEURS / "bin" / "sf"
    dit = version_annoncee_par(sf, "-sig", str(MOTEURS / "siegfried" / "default.sig"), "-version")
    if dit is not None:
        for ligne in dit.splitlines():
            if ligne.lower().startswith("siegfried "):
                vues["siegfried"] = ligne.split()[1].lstrip("v")
    return vues


def versions_du_cellar() -> dict[str, str]:
    """Les versions que les formules de Homebrew portent, pour les seuls noms épinglés.

    Troisième source du juge, et la seule disponible AVANT de télécharger ou d'effacer quoi que ce
    soit. C'est là que le `5.5.4` de Homebrew se voit, et le voir tôt permet de refuser tôt.

    Interrogé par `proprietaire`, c'est-à-dire par LA MÊME mécanique que la collecte elle-même.
    Mon premier jet parcourait les dossiers du Cellar et gardait le dernier par ordre alphabétique
    — où « 5.5.10 » passe avant « 5.5.4 » —, donc il pouvait juger une version que la collecte
    n'emploierait pas. Deux chemins pour la même question divergent toujours un jour."""
    vues: dict[str, str] = {}
    for nom in versions_epinglees():
        formule, version = proprietaire(nom)
        if formule is not None and version is not None:
            vues[nom] = version
    return vues


def ecarts_de_version(
    epinglees: dict[str, str],
    *,
    inventaire: dict[str, dict] | None = None,
    annoncees: dict[str, str] | None = None,
    cellar: dict[str, str] | None = None,
) -> list[str]:
    """Tout désaccord entre les épingles et les sources fournies. Vide quand tout concorde.

    UN SEUL JUGE, TROIS SOURCES, toutes facultatives — c'est ce qui permet de l'appeler tôt, avec
    la seule source alors connue, puis tard avec les trois. Deux juges se seraient contredits un
    jour, et le plus indulgent aurait eu le dernier mot.

    Les composants qu'aucune épingle ne nomme ne sont pas jugés : les bibliothèques d'image suivent
    la formule qui les livre, et leur version n'est épinglée nulle part — l'inventer ici serait
    écrire une donnée dans du code."""
    ecarts: list[str] = []
    for nom, attendue in sorted(epinglees.items()):
        if inventaire is not None:
            composant = inventaire.get(nom)
            if composant is None:
                ecarts.append(f"{nom} : épinglé à {attendue}, absent de l'inventaire des licences")
            elif str(composant.get("version", "")) != attendue:
                ecarts.append(
                    f"{nom} : l'inventaire annonce « {composant.get('version')} », l'épingle dit "
                    f"{attendue}"
                )
        if annoncees is not None and (vue := annoncees.get(nom)) is not None and vue != attendue:
            ecarts.append(f"{nom} : le paquet ANNONCE {vue}, l'épingle dit {attendue}")
        if cellar is not None and (vue := cellar.get(nom)) is not None and vue != attendue:
            ecarts.append(f"{nom} : Homebrew livre {vue}, l'épingle dit {attendue}")
    return ecarts


def refuser_les_ecarts(ecarts: list[str], mode: str) -> None:
    if not ecarts:
        return
    raise SystemExit(
        f"les versions ne concordent pas ({mode}) :\n"
        + "\n".join(f"  {ligne}" for ligne in ecarts)
        + "\n\nChanger de moteur est une DÉCISION À PART, qui se prend avec une mesure : relever la\n"
        "nouvelle version, vérifier ce que l'application embarque, et l'inscrire aux épingles.\n"
        "Jamais ajuster l'attendu pour faire passer une collecte, et jamais distribuer un texte de\n"
        "licence qui décrit une autre version que le binaire qu'il accompagne."
    )


# ─────────────────────────────────────────────────────────────────────────────────────────────
# La chaîne, et le commit d'où elle vient
# ─────────────────────────────────────────────────────────────────────────────────────────────


def commit_de_la_chaine() -> str:
    """Le commit dont la chaîne a été reconstruite, et un refus si git ne répond pas.

    Exigé par Christophe le 17 novembre 2026 : « Si git rev-parse échoue pendant la collecte, la
    collecte refuse en le disant ; jamais d'entrée chaine sans commit. »"""
    try:
        sortie = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=PROJET, capture_output=True, text=True, check=True
        )
    except (OSError, subprocess.CalledProcessError) as souci:
        raise SystemExit(
            "la collecte refuse : « git rev-parse HEAD » n'a pas répondu, et l'entrée « chaine »\n"
            "de l'inventaire dirait alors venir d'un commit sans dire lequel.\n"
            f"  dossier interrogé : {PROJET}\n"
            f"  cause : {souci}"
        ) from souci
    commit = sortie.stdout.strip()
    if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
        raise SystemExit(
            f"la collecte refuse : « git rev-parse HEAD » a répondu « {commit} », qui n'est pas une\n"
            "empreinte de commit. Une entrée « chaine » sans commit lisible ne dit rien."
        )
    etat = subprocess.run(
        ["git", "status", "--porcelain"], cwd=PROJET, capture_output=True, text=True
    )
    if etat.returncode != 0:
        return f"{commit} (état de la copie inconnu : git status n'a pas répondu)"
    return commit if not etat.stdout.strip() else f"{commit} (copie modifiée au moment de la collecte)"


def inscrire_la_chaine(inventaire: dict[str, dict]) -> None:
    """Remplace l'entrée « chaine » par celle du paquet présent. On ne recopie pas ses textes : ils
    voyagent dans la chaîne elle-même."""
    chaine = sorted((MOTEURS / "chaine").rglob("LICENSE*")) if (MOTEURS / "chaine").exists() else []
    inventaire["chaine"] = {
        "version": "livrés dans la chaîne elle-même",
        "source": "moteurs/chaine",
        "commit": commit_de_la_chaine(),
        "pourquoi_le_commit": (
            "La chaîne est reconstruite depuis les sources du dépôt à chaque préparation, alors que "
            "les moteurs viennent de l'archive publiée. Sans ce commit, l'inventaire ne dirait pas "
            "de quelles sources ses neuf textes répondent."
        ),
        "textes": [
            {"fichier": str(t.relative_to(MOTEURS)), "empreinte_sha256": empreinte(t.read_bytes())}
            for t in chaine
        ],
        "redistribue": ["chaine"],
    }


# ─────────────────────────────────────────────────────────────────────────────────────────────
# Le mode par défaut : les licences des moteurs viennent de l'archive
# ─────────────────────────────────────────────────────────────────────────────────────────────


def dossier_du_composant(nom: str, version: str) -> pathlib.Path | None:
    """Où l'archive a posé les textes d'un composant, ou None si nulle part."""
    for candidat in (LICENCES / f"{nom}-{version}", LICENCES / nom):
        if candidat.is_dir():
            return candidat
    return None


def licences_de_l_archive() -> dict[str, dict]:
    """Ce que l'archive a déposé, vérifié texte par texte.

    On ne fait pas confiance à l'inventaire sur parole : chaque texte qu'il annonce doit être là,
    et porter l'empreinte inscrite. Un inventaire qui annonce un texte absent est pire qu'un
    inventaire vide — il fait croire la question réglée."""
    annonce = LICENCES / "INVENTAIRE.json"
    if not annonce.exists():
        raise SystemExit(
            f"{annonce.relative_to(RACINE)} absent : les licences des moteurs viennent de l'archive\n"
            "publiée, et l'archive ne semble pas avoir été déployée. Déployer l'archive épinglée dans\n"
            "fixtures/moteurs-de-lecture.json, ou, pour fabriquer de nouveaux moteurs, lancer cette\n"
            "collecte avec --fabriquer."
        )
    composants: dict[str, dict] = dict(
        json.loads(annonce.read_text(encoding="utf-8"))["composants"]
    )
    manques: list[str] = []
    for nom, composant in sorted(composants.items()):
        if nom == "chaine":
            continue  # reconstruite depuis le commit, donc recollectée plus bas
        dossier = dossier_du_composant(nom, str(composant.get("version", "")))
        if dossier is None:
            manques.append(f"{nom} : aucun dossier de textes sous licences/")
            continue
        for texte in composant.get("textes", []):
            chemin = dossier / texte["fichier"]
            if not chemin.is_file():
                manques.append(f"{nom} : {texte['fichier']} annoncé, absent du paquet")
            elif empreinte(chemin.read_bytes()) != texte["empreinte_sha256"]:
                manques.append(
                    f"{nom} : {texte['fichier']} présent, mais son empreinte diffère de celle "
                    "que l'inventaire annonce"
                )
    if manques:
        raise SystemExit(
            "les licences déposées par l'archive ne sont pas celles qu'elle annonce :\n"
            + "\n".join(f"  {ligne}" for ligne in manques)
            + "\n\nUn paquet dont on ne peut pas prouver les licences ne se distribue pas."
        )
    composants.pop("chaine", None)
    return composants


def licences_depuis_homebrew(
    relever: bool, attendues: dict[str, str]
) -> tuple[dict[str, dict], list[str]]:
    """Les textes retrouvés sous le Cellar et téléchargés depuis l'amont — mode `--fabriquer`.

    C'était le seul chemin de ce script jusqu'au lot 0u ter. Il ne sert plus qu'à FABRIQUER une
    nouvelle archive : en service, les licences des moteurs viennent de l'archive publiée. Il
    efface `licences/` et le reconstruit, ce qui est juste ici — on fabrique — et ce qui était
    exactement le défaut quand ce chemin servait par défaut, puisqu'il détruisait alors ce que
    l'archive venait de déposer."""
    # AVANT d'effacer et AVANT de télécharger : une version qu'on n'a pas le droit d'embarquer se
    # refuse pendant que rien n'est encore détruit ni rapatrié. Mon premier jet ne jugeait qu'à la
    # fin, après les trois téléchargements de l'amont — le refus arrivait juste, mais trop tard.
    refuser_les_ecarts(
        ecarts_de_version(versions_epinglees(), cellar=versions_du_cellar()), "--fabriquer"
    )
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

    return inventaire, sans_licence


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
    # `--relever` télécharge les textes d'amont pour en publier les empreintes : c'est un geste de
    # fabrication, pas une collecte de service.
    fabriquer = "--fabriquer" in argv or relever

    if fabriquer:
        inventaire, sans_licence = licences_depuis_homebrew(relever, attendues)
    else:
        inventaire, sans_licence = licences_de_l_archive(), []

    # 4. La chaîne vient du commit sous essai, jamais de l'archive : son entrée est toujours
    #    recollectée, et elle dit de quel commit elle répond.
    inscrire_la_chaine(inventaire)

    # 5. Les versions, dans les deux modes. Placé ici, après la chaîne et avant toute écriture
    #    d'inventaire : un paquet dont les licences décrivent une autre version que ses binaires
    #    ne doit pas même produire son inventaire, qui ferait foi à tort.
    refuser_les_ecarts(
        ecarts_de_version(
            versions_epinglees(), inventaire=inventaire, annoncees=versions_annoncees()
        ),
        "--fabriquer" if fabriquer else "licences de l'archive",
    )

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
