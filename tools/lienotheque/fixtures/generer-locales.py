#!/usr/bin/env python3
"""Fabrique les fixtures locales du prototype Tauri dans fixtures/fichiers/ (ignoré par Git).

Aucune œuvre sous droits (CLAUDE.md, règle 5) : tout est synthétique et régénérable.

    python3 fixtures/generer-locales.py

Produit :
  500-pages.pdf        PDF natif de 500 pages, une ligne de texte par page
  500-pages-scan.pdf   PDF de 500 pages numérisées (JPEG gris 100 ppp) — cas réel du CDC (F2)
  page-ocr.png         Image 1240 x 1754 (A4 à 150 ppp) avec du texte français à reconnaître
  piste.mp3            MP3 de trois minutes, 128 kb/s (nécessite `lame`)
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


def _police(taille: int):
    from PIL import ImageFont

    for candidat in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"):
        if pathlib.Path(candidat).exists():
            return ImageFont.truetype(candidat, taille)
    return ImageFont.load_default()


def image_ocr(chemin: pathlib.Path) -> None:
    from PIL import Image, ImageDraw

    image = Image.new("L", (1240, 1754), color=255)
    dessin = ImageDraw.Draw(image)
    police = _police(64)
    dessin.text((120, 200), PHRASE_OCR, fill=0, font=police)
    dessin.text((120, 320), "Page 127 — piste 41", fill=0, font=police)
    image.save(chemin)


def mp3_trois_minutes(chemin: pathlib.Path) -> None:
    if shutil.which("lame") is None:
        raise SystemExit("lame est absent : `brew install lame`")
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
