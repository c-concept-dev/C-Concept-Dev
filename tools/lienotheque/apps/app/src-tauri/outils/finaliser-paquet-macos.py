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
"""

from __future__ import annotations

import pathlib
import subprocess
import sys


TAURI = pathlib.Path(__file__).resolve().parents[1]
DROITS = TAURI / "moteur.entitlements"
PAQUET_PAR_DEFAUT = TAURI / "target/release/bundle/macos/Liénothèque.app"


def executer(*commande: str | pathlib.Path) -> subprocess.CompletedProcess[str]:
    fait = subprocess.run([str(partie) for partie in commande], capture_output=True, text=True)
    if fait.returncode != 0:
        detail = "\n".join(partie for partie in [fait.stdout.strip(), fait.stderr.strip()] if partie)
        raise SystemExit(f"échec de « {' '.join(map(str, commande))} » :\n{detail}")
    return fait


def finaliser(paquet: pathlib.Path) -> None:
    if not paquet.is_dir():
        raise SystemExit(f"paquet macOS introuvable : {paquet}")
    node = paquet / "Contents/MacOS/node"
    if not node.is_file():
        raise SystemExit(f"moteur Node introuvable dans le paquet : {node}")

    droits = ["--options", "runtime", "--entitlements", str(DROITS)]
    executer("codesign", "--force", "--sign", "-", *droits, node)
    # Surtout pas `--deep` ici : cette option re-signerait Node sans ses droits particuliers.
    executer("codesign", "--force", "--sign", "-", *droits, paquet)
    executer("codesign", "--verify", "--deep", "--strict", paquet)

    # La validité cryptographique ne prouve pas qu'un binaire démarre. Signer, vérifier et ne
    # jamais lancer, c'est la faute du 22 octobre avec le PATH de Tesseract : le paquet et le
    # banc n'exécutaient pas la même chose, et les deux mesures se faisaient au terminal.
    executer(node, "--max-old-space-size=2048", "-e", "console.log('moteur du paquet vivant')")


def main() -> int:
    paquet = pathlib.Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else PAQUET_PAR_DEFAUT
    finaliser(paquet)
    print(f"paquet macOS vérifié, moteur JIT vivant : {paquet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
