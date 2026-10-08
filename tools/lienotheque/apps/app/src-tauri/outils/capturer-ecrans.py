#!/usr/bin/env python3
"""Photographie les écrans de l'application de bureau, dans l'application elle-même.

    python3 outils/capturer-ecrans.py [dossier de sortie]

Un navigateur de test suffit pour éprouver un comportement ; il ne suffit pas pour montrer un
écran. La fenêtre, ses polices, son rendu de texte et ses coins viennent du système : c'est cela
qu'on veut sur l'image. L'application s'ouvre donc pour de vrai, se place sur chaque écran et
chaque thème, dit où elle est, et attend d'avoir été photographiée avant de passer au suivant.

La prise d'image appartient à ce script et non à l'application : photographier l'écran demande
une permission du système, et macOS l'accorde au programme qu'on lance soi-même — ici le terminal
— plutôt qu'à une application qui la réclamerait au passage. La première exécution peut donc
ouvrir une demande d'autorisation « Enregistrement de l'écran » : il faut l'accepter, et
relancer.

Les écrans tirent leurs données du jeu de démonstration (`?demonstration`), qui n'existe qu'en
développement : aucune œuvre, aucune donnée réelle sur les images.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ICI = Path(__file__).resolve().parent
SRC_TAURI = ICI.parent
APP = SRC_TAURI.parent
RACINE = APP.parent.parent

SORTIE_PAR_DEFAUT = RACINE / "docs" / "captures"
PORT_DEV = 5173
SCREENCAPTURE = Path("/usr/sbin/screencapture")


def port_ouvert(port: int) -> bool:
    """Vrai si quelque chose écoute, en IPv4 comme en IPv6.

    Le serveur de développement s'annonce sur « localhost », que macOS résout d'abord en ::1 :
    frapper à la seule porte 127.0.0.1 conclut à tort qu'il n'est pas là."""
    try:
        with socket.create_connection(("localhost", port), 0.3):
            return True
    except OSError:
        return False


def attendre_le_port(port: int, secondes: float) -> bool:
    fin = time.monotonic() + secondes
    while time.monotonic() < fin:
        if port_ouvert(port):
            return True
        time.sleep(0.3)
    return False


def photographier(region: tuple[float, float, float, float], vers: Path) -> None:
    """Prend l'image d'une région de l'écran, en points, telle que la fenêtre l'a dite."""
    x, y, largeur, hauteur = region
    subprocess.run(
        [str(SCREENCAPTURE), "-x", "-t", "png", f"-R{x:.0f},{y:.0f},{largeur:.0f},{hauteur:.0f}", str(vers)],
        check=True,
    )


def main() -> int:
    if sys.platform != "darwin":
        print("Les captures ne sont prévues que sur macOS pour l'instant (phase 1).", file=sys.stderr)
        return 2
    if not SCREENCAPTURE.is_file():
        print(f"{SCREENCAPTURE} introuvable.", file=sys.stderr)
        return 2

    pnpm = shutil.which("pnpm")
    cargo = shutil.which("cargo")
    if pnpm is None or cargo is None:
        print("pnpm et cargo sont nécessaires.", file=sys.stderr)
        return 2

    sortie = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SORTIE_PAR_DEFAUT
    sortie.mkdir(parents=True, exist_ok=True)

    # Le serveur de développement : c'est lui qui sert `?demonstration`, absent de la version
    # construite. On ne le lance que s'il ne tourne pas déjà.
    serveur = None
    if port_ouvert(PORT_DEV):
        print(f"serveur déjà là sur {PORT_DEV}")
    else:
        print("démarrage du serveur de développement…")
        serveur = subprocess.Popen([pnpm, "dev"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not attendre_le_port(PORT_DEV, 60):
            serveur.terminate()
            print(f"le serveur n'a pas ouvert le port {PORT_DEV}.", file=sys.stderr)
            return 1

    print("construction et ouverture de l'application…")
    application = subprocess.Popen(
        [cargo, "run", "--quiet", "--", "--capturer"],
        cwd=SRC_TAURI,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        env={**os.environ, "TAURI_DEV": "1"},
    )

    prises: list[Path] = []
    try:
        assert application.stdout is not None and application.stdin is not None
        for ligne in application.stdout:
            morceaux = ligne.split()
            if not morceaux or morceaux[0] != "pose":
                if morceaux[:1] == ["fini"]:
                    break
                continue
            nom, *nombres = morceaux[1:]
            region = tuple(float(nombre) for nombre in nombres)  # type: ignore[assignment]
            chemin = sortie / f"{nom}.png"
            photographier(region, chemin)  # type: ignore[arg-type]
            prises.append(chemin)
            print(f"  {chemin.name} — {region[2]:.0f} x {region[3]:.0f} points")
            application.stdin.write("pris\n")
            application.stdin.flush()
        application.wait(timeout=30)
    finally:
        if application.poll() is None:
            application.terminate()
        if serveur is not None:
            serveur.terminate()

    if not prises:
        print("aucune image prise.", file=sys.stderr)
        return 1

    # Une image que macOS a refusé de prendre pèse presque rien : on le dit plutôt que de livrer
    # un dossier d'images vides.
    maigres = [chemin for chemin in prises if chemin.stat().st_size < 20_000]
    if maigres:
        print(
            "Images suspectes (trop légères) : "
            + ", ".join(chemin.name for chemin in maigres)
            + "\nAccordez « Enregistrement de l'écran » à votre terminal, puis relancez.",
            file=sys.stderr,
        )
        return 1

    print(f"{len(prises)} images dans {sortie}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
