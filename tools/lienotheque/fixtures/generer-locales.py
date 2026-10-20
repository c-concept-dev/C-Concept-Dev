#!/usr/bin/env python3
"""Fabrique les fixtures locales du prototype Tauri dans fixtures/fichiers/ (ignoré par Git).

Aucune œuvre sous droits (CLAUDE.md, règle 5) : tout est synthétique et régénérable.

    python3 fixtures/generer-locales.py

Produit :
  500-pages.pdf        PDF natif de 500 pages, une ligne de texte par page
  500-pages-scan.pdf   PDF de 500 pages numérisées (JPEG gris 100 ppp) — cas réel du CDC (F2)
  couche-fautive.pdf   8 pages portant **une image ET une couche texte sans accents** — le cas
                       que l'inversion de BAS-02 doit corriger, et le seul que les fixtures
                       existantes ne savaient pas poser
  page-ocr.png         Image 1240 x 1754 (A4 à 150 ppp) avec du texte français à reconnaître
  piste.mp3            MP3 de trois minutes, 128 kb/s (`lame` s'il est là, sinon silence synthétique)
"""

from __future__ import annotations

import io
import math
import pathlib
import shutil
import struct
import subprocess
import sys
import wave
import zlib

RACINE = pathlib.Path(__file__).resolve().parent
SORTIE = RACINE / "fichiers"
PAGES = 500
PHRASE_OCR = "Liénothèque reconnaît cette page."

# Le texte de `couche-fautive.pdf`. Du français ordinaire, et **rien du domaine** (règle 1) :
# ces phrases ne nomment ni ce que la bibliothèque contient ni ce qu'elle sert.
#
# Deux propriétés le rendent capable de poser le problème, et il faut les deux :
#   — beaucoup d'**accents**, qui sont ce que la couche fautive perd et ce que l'image garde ;
#   — beaucoup de **mots outils** (le, la, de, que, les, dans, pour), qui font qu'une couche sans
#     accents reste « lisible » au sens de `lisible()` et franchissait donc l'ancien arbitrage.
# Sans la seconde, la fixture serait attrapée par le contrôle de lisibilité et ne prouverait rien.
LIGNES_FAUTIVES = (
    "Le présent récit décrit une méthode éprouvée que les élèves",
    "répètent très régulièrement, dans la pièce où la lumière",
    "arrive dès le matin. Il ne s'agit pas de mémoire, mais de",
    "la régularité : celle qui révèle, après quelques années,",
    "ce que la hâte avait caché. Les êtres les plus âgés le",
    "répètent à qui veut l'entendre, et c'est très à propos.",
)
PAGES_FAUTIVES = 8
# Trois fois le passage : le bloc remplit alors la feuille et le folio se tient juste dessous,
# comme sur un vrai livre numérisé. Voir la docstring de `pdf_couche_fautive`.
LIGNES_PAGE = LIGNES_FAUTIVES * 3


def pdf_500_pages(chemin: pathlib.Path) -> None:
    objets: list[bytes] = [b"", b"", b""]  # 1 catalogue, 2 pages, 3 police
    catalogue, racine_pages, police = 1, 2, 3

    def ajouter(contenu: bytes) -> int:
        objets.append(contenu)
        return len(objets)

    ids_pages: list[int] = []
    for n in range(1, PAGES + 1):
        texte = f"BT /F1 24 Tf 72 700 Td (Lienotheque — page {n} sur {PAGES}) Tj ET\n".encode("latin-1", "replace")
        texte += f"BT /F1 11 Tf 72 60 Td ({n}) Tj ET\n".encode("latin-1")
        flux = zlib.compress(texte)
        id_flux = ajouter(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(flux) + flux + b"\nendstream")
        ids_pages.append(
            ajouter(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (racine_pages, police, id_flux)
            )
        )

    objets[catalogue - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % racine_pages
    objets[racine_pages - 1] = b"<< /Type /Pages /Count %d /Kids [%s] >>" % (
        PAGES,
        b" ".join(b"%d 0 R" % i for i in ids_pages),
    )
    objets[police - 1] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    chemin.write_bytes(_assembler(objets, catalogue))


def _sans_accents(texte: str) -> str:
    """Le défaut, reproduit : les lettres restent, leurs accents disparaissent.

    C'est exactement ce que la mesure du 20 octobre a trouvé sur le corpus réel — « mechamment »
    pour « méchamment », « therapeute » pour « thérapeute » —, et exactement ce qu'aucun des deux
    seuils de `passages.ts` ne peut signaler."""
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", texte) if not unicodedata.combining(c))


def pdf_couche_fautive(chemin: pathlib.Path) -> None:
    """Une image qui dit vrai, une couche texte qui dit faux — sur la même page.

    **La fixture qui manquait**, et son absence était un trou de couverture reconnu le 20 octobre
    2026 : aucune fixture du dépôt ne portait à la fois une couche texte et une image de page,
    donc l'inversion de l'arbitrage (BAS-02) n'était éprouvée que par ses tests unitaires.

    Ce qu'elle pose, et qui ne s'obtient d'aucune autre façon :

    | | |
    |---|---|
    | l'image | le texte **avec** ses accents, lisible par la reconnaissance |
    | la couche | le **même** texte, accents retirés — lisible au sens de `lisible()`, et faux |

    La couche est posée en mode de rendu invisible (`3 Tr`), comme le font les vrais outils de
    reconnaissance qui déposent leur lecture sous l'image. Elle n'est donc pas visible à l'écran
    et ne salit pas la page ; seule la lecture la voit, ce qui est tout l'intérêt.

    Huit pages : assez pour que la règle se vérifie sur plusieurs, assez peu pour que la
    reconnaissance coûte une vingtaine de secondes et non dix minutes.
    Le bloc de texte **remplit la page** et le folio se tient juste dessous. Ce n'est pas de la
    décoration : mesuré, un chiffre isolé à mille pixels sous le dernier paragraphe n'est pas lu
    du tout par la reconnaissance en segmentation « page entière » — elle le traite comme une
    région à part et l'abandonne. Un vrai livre numérisé ne présente jamais cet écart, et une
    fixture qui le présenterait éprouverait un cas qui n'existe pas.
    """
    import random

    from PIL import Image, ImageDraw

    largeur, hauteur = 1240, 1754  # A4 à 150 ppp — la reconnaissance veut de la résolution
    police = _police(40)
    objets: list[bytes] = [b"", b"", b""]
    catalogue, racine_pages, police_pdf = 1, 2, 3

    def ajouter(contenu: bytes) -> int:
        objets.append(contenu)
        return len(objets)

    alea = random.Random(2026)
    ids_pages: list[int] = []
    for n in range(1, PAGES_FAUTIVES + 1):
        page = Image.new("L", (largeur, hauteur), color=252)
        dessin = ImageDraw.Draw(page)
        for rang, ligne in enumerate(LIGNES_PAGE):
            dessin.text((110, 150 + rang * 78), ligne, fill=25, font=police)
        dessin.text((largeur // 2 - 20, hauteur - 170), str(n), fill=25, font=police)
        # Un grain léger, et **léger** à dessein : cette fixture doit poser le problème de
        # l'exactitude, pas celui de la lisibilité d'un scan abîmé. Un bruit qui ferait hésiter la
        # reconnaissance mesurerait autre chose que ce qu'on veut mesurer.
        bruit = Image.frombytes("L", (largeur, hauteur), bytes(alea.randrange(240, 255) for _ in range(largeur * hauteur)))
        page = Image.blend(page, bruit, 0.05)

        tampon = io.BytesIO()
        page.save(tampon, format="JPEG", quality=85)
        jpeg = tampon.getvalue()

        id_image = ajouter(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
            b"/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n" % (largeur, hauteur, len(jpeg))
            + jpeg
            + b"\nendstream"
        )

        # L'image d'abord, la couche par-dessus et invisible : l'ordre des vrais fichiers.
        contenu = b"q %d 0 0 %d 0 0 cm /Im0 Do Q\n" % (largeur, hauteur)
        for rang, ligne in enumerate(LIGNES_PAGE):
            y = hauteur - (150 + rang * 78) - 40
            contenu += b"BT 3 Tr /F1 40 Tf 110 %d Td (%s) Tj ET\n" % (
                y,
                _sans_accents(ligne).replace("(", "").replace(")", "").encode("latin-1"),
            )
        contenu += b"BT 3 Tr /F1 40 Tf %d 130 Td (%d) Tj ET\n" % (largeur // 2 - 20, n)
        flux = zlib.compress(contenu)
        id_flux = ajouter(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(flux) + flux + b"\nendstream")
        ids_pages.append(
            ajouter(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
                b"/Resources << /XObject << /Im0 %d 0 R >> /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (racine_pages, largeur, hauteur, id_image, police_pdf, id_flux)
            )
        )

    objets[catalogue - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % racine_pages
    objets[racine_pages - 1] = b"<< /Type /Pages /Count %d /Kids [%s] >>" % (
        PAGES_FAUTIVES,
        b" ".join(b"%d 0 R" % i for i in ids_pages),
    )
    objets[police_pdf - 1] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    chemin.write_bytes(_assembler(objets, catalogue))


def _assembler(objets: list[bytes], catalogue: int) -> bytes:
    """Corps, table des références croisées et bande-annonce d'un PDF 1.4."""
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    decalages: list[int] = []
    for i, obj in enumerate(objets, start=1):
        decalages.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objets) + 1)
    for d in decalages:
        out += b"%010d 00000 n \n" % d
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objets) + 1,
        catalogue,
        xref,
    )
    return bytes(out)


def pdf_500_pages_scan(chemin: pathlib.Path) -> None:
    """Livre numérisé : une image JPEG par page, comme la fixture F2 du CDC.

    C'est le cas qui pèse réellement : le PDF natif ne dit rien du coût d'un scan."""
    import random

    from PIL import Image, ImageDraw, ImageFont

    largeur, hauteur = 827, 1169  # A4 à 100 ppp
    police = _police(28)
    objets: list[bytes] = [b"", b"", b""]
    catalogue, racine_pages, _ = 1, 2, 3

    def ajouter(contenu: bytes) -> int:
        objets.append(contenu)
        return len(objets)

    alea = random.Random(127)
    ids_pages: list[int] = []
    for n in range(1, PAGES + 1):
        page = Image.new("L", (largeur, hauteur), color=246)
        dessin = ImageDraw.Draw(page)
        for ligne in range(28):
            mots = " ".join("".join(alea.choices("abcdefghijklmnopqrstuvwxyz", k=alea.randint(2, 11))) for _ in range(9))
            dessin.text((70, 120 + ligne * 34), mots, fill=40, font=police)
        dessin.text((largeur // 2 - 20, hauteur - 70), str(n), fill=40, font=police)
        # Grain du scanner : sans lui, le JPEG se compresse hors de toute réalité.
        bruit = Image.frombytes("L", (largeur, hauteur), bytes(alea.randrange(226, 255) for _ in range(largeur * hauteur)))
        page = Image.blend(page, bruit, 0.12)

        tampon = io.BytesIO()
        page.save(tampon, format="JPEG", quality=55)
        jpeg = tampon.getvalue()

        id_image = ajouter(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
            b"/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n" % (largeur, hauteur, len(jpeg))
            + jpeg
            + b"\nendstream"
        )
        flux = zlib.compress(b"q %d 0 0 %d 0 0 cm /Im0 Do Q\n" % (largeur, hauteur))
        id_flux = ajouter(b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(flux) + flux + b"\nendstream")
        ids_pages.append(
            ajouter(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
                b"/Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>"
                % (racine_pages, largeur, hauteur, id_image, id_flux)
            )
        )

    objets[catalogue - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % racine_pages
    objets[racine_pages - 1] = b"<< /Type /Pages /Count %d /Kids [%s] >>" % (
        PAGES,
        b" ".join(b"%d 0 R" % i for i in ids_pages),
    )
    objets[2] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    chemin.write_bytes(_assembler(objets, catalogue))


# Une vraie police vectorielle, sinon les fixtures ne valent rien : avec la police bitmap de
# repli de Pillow, l'image d'OCR devient illisible et les pages numérisées pèsent trois fois moins.
POLICES = (
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
)


def _police(taille: int):
    from PIL import ImageFont

    for candidat in POLICES:
        if pathlib.Path(candidat).exists():
            return ImageFont.truetype(candidat, taille)
    raise SystemExit(
        "aucune police vectorielle trouvée parmi :\n  " + "\n  ".join(POLICES) + "\n"
        "Installez-en une, ou ajoutez son chemin à POLICES : les fixtures seraient fausses sans elle."
    )


def image_ocr(chemin: pathlib.Path) -> None:
    from PIL import Image, ImageDraw

    image = Image.new("L", (1240, 1754), color=255)
    dessin = ImageDraw.Draw(image)
    police = _police(64)
    dessin.text((120, 200), PHRASE_OCR, fill=0, font=police)
    dessin.text((120, 320), "Page 127 — piste 41", fill=0, font=police)
    image.save(chemin)


# MPEG-1 couche III, 44,1 kHz, 128 kb/s, mono : en-tête de trame et longueur fixes.
EN_TETE_MP3 = b"\xff\xfb\x90\xc4"
TRAME_MP3 = 144 * 128_000 // 44_100  # 417 octets
TRAMES_PAR_SECONDE = 44_100 / 1152


def mp3_silencieux(chemin: pathlib.Path, secondes: int) -> None:
    """Repli sans encodeur : des trames MPEG valides à charge nulle.

    Suffisant pour éprouver la lecture par plages, qui ne décode rien ; l'intégration continue
    n'a pas à installer un encodeur pour cela."""
    trame = EN_TETE_MP3 + bytes(TRAME_MP3 - len(EN_TETE_MP3))
    chemin.write_bytes(trame * round(secondes * TRAMES_PAR_SECONDE))


def mp3_trois_minutes(chemin: pathlib.Path) -> None:
    if shutil.which("lame") is None:
        mp3_silencieux(chemin, 180)
        return
    brut = chemin.with_suffix(".wav")
    taux, secondes = 44_100, 180
    with wave.open(str(brut), "wb") as piste:
        piste.setnchannels(1)
        piste.setsampwidth(2)
        piste.setframerate(taux)
        trame = bytearray()
        for i in range(taux * secondes):
            # Balayage lent : chaque minute sonne différemment, une plage s'entend.
            hauteur = 220 + 110 * (i // (taux * 60))
            trame += struct.pack("<h", int(12_000 * math.sin(2 * math.pi * hauteur * i / taux)))
        piste.writeframes(bytes(trame))
    subprocess.run(["lame", "--quiet", "-b", "128", str(brut), str(chemin)], check=True)
    brut.unlink()


def main() -> int:
    SORTIE.mkdir(parents=True, exist_ok=True)
    taches = (
        ("500-pages.pdf", pdf_500_pages),
        ("500-pages-scan.pdf", pdf_500_pages_scan),
        ("couche-fautive.pdf", pdf_couche_fautive),
        ("page-ocr.png", image_ocr),
        ("piste.mp3", mp3_trois_minutes),
    )
    for nom, fabrique in taches:
        chemin = SORTIE / nom
        fabrique(chemin)
        print(f"{chemin.relative_to(RACINE.parent)} : {chemin.stat().st_size} octets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
