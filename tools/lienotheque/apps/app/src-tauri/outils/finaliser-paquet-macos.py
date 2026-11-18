#!/usr/bin/env python3
"""Signe le paquet macOS, que `tauri build` laisse sans signature.

Mesuré sur un paquet fraîchement construit le 30 octobre 2026, avant cette passe :

    paquet  flags=0x20002(adhoc,linker-signed)   allow-jit absent
    paquet  codesign --verify --deep --strict → « code has no resources but
            signature indicates they must be present »
    node    flags=0x10002(adhoc,runtime)         allow-jit présent

Aucune étape de signature n'apparaît dans le journal de `tauri build` : faute d'identité
configurée, il empaquette sans signer, et le binaire principal ne garde que la signature que le
lieur a posée — ni runtime renforcé, ni droits. Le paquet ne se vérifie donc pas.

**Ce n'est pas ce qu'on croyait.** La première écriture de ce script affirmait que Tauri retirait
les droits JIT du moteur ; la mesure dit le contraire — `node` sort du paquet avec son runtime et
son `allow-jit` intacts, parce que `preparer-moteur-node.py` signe aussi le sidecar que Tauri
recopie. Ce qui manquait n'était pas les droits du moteur, c'était la signature du paquet.

Elle affirmait aussi que ce manque tuait V8 par EXC_BREAKPOINT / signal 5. Ce n'était pas la
cause : la pile des rapports d'arrêt donne `Heap::SetUp` → `FatalProcessOutOfMemory` →
`OS::Abort()`, c'est-à-dire une famine de mémoire de la machine, traitée ailleurs.

La passe reste donc utile, pour ce qu'elle fait réellement : signer le moteur avec ses droits,
puis la racine du paquet — sans `--deep`, qui re-signerait le moteur sans eux —, vérifier le tout
en profondeur, et prouver que le moteur démarre pour de bon.

ET ELLE REFUSE UN PAQUET QUI NE DIT PAS D'OÙ IL VIENT (lot 0u quater)

Demandé par Christophe le 17 novembre 2026 : « la fabrication du paquet à installer refuse une
copie modifiée, pour qu'aucune licence ne décrive un état introuvable. »

C'est ici que le refus tombe, et **la place a été mesurée avant d'être choisie**. La chaîne de
fabrication a cinq maillons : la construction web, les deux préparations de moteurs, `tauri build`,
puis cette passe. Les trois premiers servent aussi aux **mesures** — la course du prototype les
lance à chaque fois, et une copie modifiée y est la règle de travail, pas une faute. `tauri build`
sert aux deux. Cette passe-ci, elle, ne sert qu'au paquet qu'on **installe** : rien ne l'appelle
dans l'intégration continue, vérifié le 18 novembre 2026 sur les deux workflows — seul
`tauri build` y figure. Le refus y tombe donc sans gêner aucune mesure, et un paquet d'**essai**
reste fabricable sans commiter : `tauri build` seul le produit, et `--essai` permet même de le
signer et de l'éprouver, en le **marquant** pour qu'on ne le prenne pas plus tard pour un autre.

TROIS RAISONS DE REFUSER, ET CE QUE CHACUNE ATTRAPE

1. L'inventaire des licences du paquet ne nomme **pas** un commit — il est absent, ou il porte
   « copie modifiée au moment de la collecte », que `collecter-licences.py` y écrit lui-même.
   C'est la raison de Christophe, mot pour mot : les textes de licence du paquet répondent alors
   de sources que personne ne peut retrouver.
2. Le commit qu'il nomme est **inconnu de ce dépôt**. Un paquet peut citer une empreinte qui n'a
   jamais existé ici, ou qui a quitté l'historique : elle rassure sans rien désigner.
3. La copie de travail est modifiée **maintenant**. Les licences sont collectées au troisième
   maillon, et `tauri build` compile au quatrième : un paquet dont l'inventaire est propre peut
   donc embarquer du code écrit entre les deux. Même définition de « modifiée » que la collecte
   — ce que `git status --porcelain` nomme —, pour que les deux ne se contredisent jamais.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys


TAURI = pathlib.Path(__file__).resolve().parents[1]
DROITS = TAURI / "moteur.entitlements"
PAQUET_PAR_DEFAUT = TAURI / "target/release/bundle/macos/Liénothèque.app"
PROJET = TAURI.parent.parent.parent
#  Là où `collecter-licences.py` pose son inventaire, vu de l'intérieur du paquet : `moteurs/` est
#  une ressource de Tauri, et Tauri la recopie sous `Contents/Resources/`.
INVENTAIRE = "Contents/Resources/moteurs/licences/INVENTAIRE.json"
MARQUE = "Contents/Resources/PAQUET-D-ESSAI.txt"


def executer(*commande: str | pathlib.Path) -> subprocess.CompletedProcess[str]:
    fait = subprocess.run([str(partie) for partie in commande], capture_output=True, text=True)
    if fait.returncode != 0:
        detail = "\n".join(partie for partie in [fait.stdout.strip(), fait.stderr.strip()] if partie)
        raise SystemExit(f"échec de « {' '.join(map(str, commande))} » :\n{detail}")
    return fait


def commit_de_l_inventaire(paquet: pathlib.Path) -> tuple[str | None, str]:
    """Ce que l'inventaire du paquet dit du commit de sa chaîne : l'empreinte, et ce qu'il en dit.

    Rend `(None, raison)` quand il ne nomme pas de commit lisible. On lit **l'inventaire du
    paquet**, et non l'état du dépôt, parce que c'est le paquet qu'on s'apprête à installer qui
    doit dire d'où ses licences répondent."""
    annonce = paquet / INVENTAIRE
    if not annonce.is_file():
        return None, f"aucun inventaire de licences dans le paquet ({INVENTAIRE})"
    try:
        chaine = json.loads(annonce.read_text(encoding="utf-8"))["composants"]["chaine"]
    except (OSError, ValueError, KeyError, TypeError) as souci:
        return None, f"inventaire illisible ou sans entrée « chaine » : {souci}"
    dit = chaine.get("commit")
    if not isinstance(dit, str) or dit == "":
        return None, (
            "l'inventaire ne nomme aucun commit pour la chaîne — le paquet a été fabriqué avant "
            "que la collecte ne l'inscrive (lot 0u ter, 17 novembre 2026)"
        )
    if len(dit) != 40 or any(c not in "0123456789abcdef" for c in dit):
        return None, f"l'inventaire dit « {dit} » au lieu d'un commit nu"
    return dit, dit


def chemins_modifies() -> list[str]:
    """Ce que `git status --porcelain` nomme dans la copie, ou un refus s'il ne répond pas.

    Même commande que `collecter-licences.py`, délibérément : deux définitions de « copie
    modifiée » finiraient par se contredire, et c'est l'inventaire qu'elles décrivent tous les
    deux.

    On rend donc des **lignes** de `git status`, et le refus les compte comme telles : mesuré le
    17 novembre 2026, `--porcelain` replie un dossier non suivi en une seule ligne et ne nomme
    aucun fichier dedans. Le refus ne s'y trompe pas — une ligne suffit à refuser — mais il ne
    prétend pas compter des fichiers."""
    try:
        vu = subprocess.run(
            ["git", "status", "--porcelain"], cwd=PROJET, capture_output=True, text=True, check=True
        )
    except (OSError, subprocess.CalledProcessError) as souci:
        raise SystemExit(
            "la finalisation refuse : « git status » n'a pas répondu, et l'état de la copie qui a\n"
            f"fabriqué ce paquet est alors inconnu.\n  dossier interrogé : {PROJET}\n  cause : {souci}"
        ) from souci
    return [ligne for ligne in vu.stdout.splitlines() if ligne.strip()]


def commit_connu(commit: str) -> bool:
    """Le dépôt porte-t-il ce commit ? Une empreinte qu'il ne connaît pas ne désigne rien."""
    vu = subprocess.run(
        ["git", "cat-file", "-e", f"{commit}^{{commit}}"], cwd=PROJET, capture_output=True, text=True
    )
    return vu.returncode == 0


def juger(paquet: pathlib.Path) -> list[str]:
    """Les raisons de refuser ce paquet comme paquet à installer. Vide quand il n'y en a pas."""
    raisons: list[str] = []
    commit, dit = commit_de_l_inventaire(paquet)
    if commit is None:
        raisons.append(f"les licences du paquet ne répondent d'aucun état retrouvable : {dit}")
    elif not commit_connu(commit):
        raisons.append(
            f"l'inventaire du paquet nomme le commit {commit}, que ce dépôt ne connaît pas : "
            "une empreinte qui ne désigne rien ne vaut pas mieux qu'une absence"
        )
    modifies = chemins_modifies()
    if modifies:
        raisons.append(
            f"la copie de travail est modifiée ({len(modifies)} ligne(s) de « git status »), et "
            f"« tauri build » a "
            "compilé depuis elle après la collecte des licences :\n"
            + "\n".join(f"      {ligne}" for ligne in modifies[:20])
            + ("\n      …" if len(modifies) > 20 else "")
        )
    return raisons


def marquer(paquet: pathlib.Path, raisons: list[str]) -> None:
    """Écrit dans le paquet d'essai ce qui aurait dû le faire refuser.

    Avant la signature, et jamais après : un fichier ajouté ensuite invaliderait ce que `codesign`
    vient de poser. La marque est un fait qu'on pourra **mesurer** plus tard sur le paquet, au lieu
    d'un souvenir — un paquet d'essai ressemble en tout au vrai."""
    (paquet / MARQUE).write_text(
        "PAQUET D'ESSAI, PAS UN PAQUET À INSTALLER\n"
        "=========================================\n\n"
        "Fabriqué avec « --essai », qui lève le refus du lot 0u quater. Ce qui aurait dû le faire\n"
        "refuser, et qui reste vrai de ce paquet :\n\n"
        + "".join(f"  - {raison}\n" for raison in raisons)
        + "\nUn paquet à installer se fabrique depuis une copie propre, dont le commit est connu du\n"
        "dépôt. Ne distribuez pas celui-ci : ses textes de licence peuvent décrire un état que\n"
        "personne ne peut retrouver.\n",
        encoding="utf-8",
    )


def finaliser(paquet: pathlib.Path, essai: bool = False) -> None:
    if not paquet.is_dir():
        raise SystemExit(f"paquet macOS introuvable : {paquet}")
    node = paquet / "Contents/MacOS/node"
    if not node.is_file():
        raise SystemExit(f"moteur Node introuvable dans le paquet : {node}")

    raisons = juger(paquet)
    if raisons and not essai:
        raise SystemExit(
            "la finalisation refuse : ce paquet ne peut pas être un paquet à installer.\n"
            + "".join(f"  - {raison}\n" for raison in raisons)
            + "\nUn paquet à installer vient d'une copie propre, dont le commit est connu du dépôt :\n"
            "commitez, puis refabriquez depuis « pnpm build » — l'ordre du README n'est pas\n"
            "interchangeable. Pour un paquet d'ESSAI, relancez avec « --essai » : il sera signé,\n"
            "vérifié, éprouvé, et marqué comme essai à l'intérieur."
        )
    if raisons:
        print("PAQUET D'ESSAI : le refus du lot 0u quater est levé par « --essai ».")
        for raison in raisons:
            print(f"  - {raison}")
        marquer(paquet, raisons)

    droits = ["--options", "runtime", "--entitlements", str(DROITS)]
    executer("codesign", "--force", "--sign", "-", *droits, node)
    # Surtout pas `--deep` ici : cette option re-signerait Node sans ses droits particuliers.
    executer("codesign", "--force", "--sign", "-", *droits, paquet)
    executer("codesign", "--verify", "--deep", "--strict", paquet)

    # La validité cryptographique ne prouve pas qu'un binaire démarre. Signer, vérifier et ne
    # jamais lancer, c'est la faute du 22 octobre avec le PATH de Tesseract : le paquet et le
    # banc n'exécutaient pas la même chose, et les deux mesures se faisaient au terminal.
    executer(node, "--max-old-space-size=2048", "-e", "console.log('moteur du paquet vivant')")


def main(arguments: list[str]) -> int:
    essai = "--essai" in arguments
    #  Le « -- » nu est jeté, et c'est une mesure, pas une précaution de style : `pnpm run x --
    #  --essai` ne retire PAS le séparateur, il le passe. Mesuré le 18 novembre 2026 — la ligne
    #  lancée était « finaliser-paquet-macos.py -- --essai », et le chemin du paquet devenait
    #  « apps/app/-- ». La consigne du README est celle-là : le séparateur doit donc disparaître ici.
    restants = [a for a in arguments if a not in ("--essai", "--")]
    paquet = pathlib.Path(restants[0]).expanduser().resolve() if restants else PAQUET_PAR_DEFAUT
    finaliser(paquet, essai)
    quoi = "paquet d'essai" if essai else "paquet macOS"
    print(f"{quoi} vérifié, moteur JIT vivant : {paquet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
