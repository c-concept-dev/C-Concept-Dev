"""Prototype : repère numéros de page et d'exercices sur une méthode scannée,
puis les associe aux MP3.
Usage : python3 ocr_methode.py <dossier_images_pages> <dossier_mp3> <sortie.json>
  (images extraites du PDF à leur résolution d'origine : pdfimages -j methode.pdf dossier/p)
  Dépendances : tesseract, pytesseract, Pillow, ffprobe (ffmpeg).

Principe : plusieurs lectures OCR indépendantes par page (libellé « Pattern N »,
pastille noire inversée, échelles et modes différents), puis consolidation par
vote et par contraintes de cohérence (numéros croissants, pages consécutives)."""
import sys, re, json, glob, os, subprocess, collections
from PIL import Image, ImageOps
import pytesseract

IMG_DIR, MP3_DIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
TESS = f"--tessdata-dir {os.environ['TESSDATA']}" if os.environ.get('TESSDATA') else ''
DIGITS = '-c tessedit_char_whitelist=0123456789'

def num(t):
    t = t.strip()
    return int(t) if t.isdigit() else None

def lire_numero_page(im):
    w, h = im.size
    for box in [(0, int(h*.93), int(w*.2), h), (int(w*.8), int(h*.93), w, h)]:
        n = num(pytesseract.image_to_string(im.crop(box), config=f'{TESS} --psm 7 {DIGITS}'))
        if n and n < 400:
            return n
    return None

def lire_pastille(im, x, y, h):
    """Losange noir, chiffre blanc, juste à droite du libellé.
    On cherche la boîte englobante des pixels noirs, on recadre au cœur du losange,
    puis on inverse pour obtenir des chiffres noirs sur fond blanc."""
    zone = im.crop((x, y - int(h*1.5), x + int(h*5), y + int(h*2.5))).point(lambda p: 0 if p < 110 else 255)
    bbox = ImageOps.invert(zone).getbbox()
    if not bbox:
        return None
    l, t, r, b = bbox
    if r - l < h:  # pas de losange
        return None
    dx, dy = int((r - l) * .2), int((b - t) * .22)
    coeur = ImageOps.invert(zone.crop((l + dx, t + dy, r - dx, b - dy)))
    coeur = ImageOps.expand(coeur.resize((coeur.width*4, coeur.height*4)), 25, fill=255)
    return num(pytesseract.image_to_string(coeur, config=f'{TESS} --psm 7 {DIGITS}'))

def passes(im):
    """Renvoie une liste de lectures (y_normalisé, n_libelle, n_pastille)."""
    lectures = []
    for scale, psm in [(1, 3), (1, 11), (2, 3)]:
        img = im if scale == 1 else im.resize((im.width*scale, im.height*scale), Image.LANCZOS)
        d = pytesseract.image_to_data(img, lang='eng', config=f'{TESS} --psm {psm}',
                                      output_type=pytesseract.Output.DICT)
        for k, w in enumerate(d['text']):
            if re.fullmatch(r'[Pp]att?ern', w.strip()) and k + 1 < len(d['text']):
                m = re.match(r'(\d+)', d['text'][k+1])
                if not m:
                    continue
                x2 = d['left'][k+1] + d['width'][k+1]
                p = lire_pastille(img, x2 + 6*scale, d['top'][k+1], d['height'][k+1])
                suite_txt = ' '.join(d['text'][k+2:k+5]).lower()
                lectures.append((d['top'][k] / img.height, int(m.group(1)), p, 'cont' in suite_txt))
    return lectures

def consolider(lectures):
    """Regroupe les lectures par position verticale. Deux votes séparés :
    le numéro d'exercice (libellé) et le numéro de piste (pastille)."""
    groupes = []
    for y, a, b, cont in sorted(lectures, key=lambda t: t[0]):
        if not (groupes and abs(groupes[-1]['y'] - y) < 0.03):
            groupes.append({'y': y, 'ex': [], 'pi': [], 'cont': False})
        g = groupes[-1]
        g['ex'].append(a); g['cont'] |= cont
        if b: g['pi'].append(b)
    out = []
    for g in groupes:
        ex, nex = collections.Counter(g['ex']).most_common(1)[0]
        pi = collections.Counter(g['pi']).most_common(1)[0] if g['pi'] else (None, 0)
        out.append({'exercice': ex, 'piste_lue': pi[0], 'suite_de_piste': g['cont'],
                    'accord_ex': round(nex / len(g['ex']), 2),
                    'accord_piste': round(pi[1] / max(1, len(g['pi'])), 2) if g['pi'] else 0,
                    'y': round(g['y'], 3)})
    return out

fichiers = sorted(f for f in glob.glob(os.path.join(IMG_DIR, '*.jpg')) if re.search(r'p-\d+\.jpg$', f))
pages = []
for i, f in enumerate(fichiers):
    im = Image.open(f).convert('L')
    pages.append({'index_image': i, 'fichier': os.path.basename(f),
                  'page_lue': lire_numero_page(im), 'exercices': consolider(passes(im))})

# 1) Numéros de page : décalage (page imprimée - index d'image) voté sur une fenêtre de
#    5 pages, pour qu'une lecture isolée fausse ne casse pas la suite. Un décalage qui
#    augmente durablement signale des pages absentes du scan.
lus = {p['index_image']: p['page_lue'] - p['index_image'] for p in pages if p['page_lue'] and p['exercices']}
prec_off, trous = None, []
for p in pages:
    i = p['index_image']
    if not p['exercices'] and i == 0:
        p['page_imprimee'], p['page_statut'] = None, 'couverture'; continue
    fen = [lus[j] for j in range(i - 2, i + 3) if j in lus]
    c = collections.Counter(fen).most_common()
    off = c[0][0] if c and (len(c) == 1 or c[0][1] > c[1][1]) else (prec_off if prec_off is not None else (c[0][0] if c else 0))
    # Lecture isolée mais corroborée par un saut dans la numérotation des exercices
    if p['page_lue'] and prec_off is not None and p['page_lue'] - i > off:
        prev = pages[i - 1]['exercices'] if i > 0 else []
        if prev and p['exercices'] and p['exercices'][0]['exercice'] > prev[-1]['exercice'] + 1:
            off = p['page_lue'] - i
    if prec_off is not None and off > prec_off:
        trous.append(list(range(i - 1 + prec_off + 1, i + off)))
    p['page_imprimee'] = i + off
    p['page_statut'] = 'lue' if p['page_lue'] == p['page_imprimee'] else 'deduite'
    prec_off = off

# 2) Exercices et pistes : exercices strictement croissants, pistes croissantes au sens large.
#    Piste = pastille si lisible et cohérente ; sinon piste précédente si « (cont'd) » ; sinon n° d'exercice.
lignes, dernier_ex, derniere_piste = [], 0, 0
for p in pages:
    for e in p['exercices']:
        n = e['exercice']
        if not (dernier_ex < n <= dernier_ex + 8):
            e['rejete'] = True; continue
        pl = e['piste_lue']
        if e['suite_de_piste']:
            piste, source = derniere_piste, "suite (cont'd)"
        elif pl and derniere_piste < pl <= derniere_piste + 8:
            piste, source = pl, 'pastille'
        else:
            piste, source = n, 'numero_exercice'
        conf = e['accord_ex'] if source != 'pastille' else min(1, (e['accord_ex'] + e['accord_piste']) / 2 + (0.25 if pl == n else 0))
        lignes.append({'exercice': n, 'page_imprimee': p['page_imprimee'], 'piste': piste,
                       'source_piste': source, 'confiance': round(conf, 2)})
        dernier_ex, derniere_piste = n, piste

# 3) MP3
mp3 = {}
for f in glob.glob(os.path.join(MP3_DIR, '*.mp3')):
    fmt = json.loads(subprocess.run(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', f],
                                    capture_output=True, text=True).stdout)['format']
    tr = fmt.get('tags', {}).get('track') or os.path.basename(f)
    mp3[int(re.search(r'(\d+)', tr).group(1))] = {'fichier': os.path.basename(f), 'duree_s': round(float(fmt['duration']), 1)}

# 4) Appariement piste -> MP3
for l in lignes:
    l['mp3'] = mp3.get(l['piste'], {}).get('fichier')
    l['statut'] = 'auto' if l['mp3'] and l['confiance'] >= 0.6 else 'a_verifier'
pistes_utilisees = {l['piste'] for l in lignes}
orphelins = sorted(n for n in mp3 if n not in pistes_utilisees)

json.dump({'pages_absentes_du_scan': trous, 'pages': pages, 'appariements': lignes,
           'mp3_orphelins': orphelins, 'mp3': mp3}, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(f"pages={len(pages)} exercices={len(lignes)} auto={sum(l['statut']=='auto' for l in lignes)} "
      f"a_verifier={sum(l['statut']!='auto' for l in lignes)} mp3_orphelins={orphelins} pages_absentes={trous}")
