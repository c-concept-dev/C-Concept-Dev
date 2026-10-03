"""Méthode photographiée en doubles pages (Paul Westwood, Bass Bible).
Repère : numéros de page imprimés, numéros d'exercice (marges extérieures),
pastilles « CD1 Piste NN » sous les numéros d'exercice. Produit un JSON brut par image.
Usage : python3 westwood_ocr.py <dossier_images> <sortie_brute.jsonl> [debut fin]"""
import sys, os, re, json, glob
import numpy as np, pytesseract
from PIL import Image, ImageOps

T = f"--tessdata-dir {os.environ['TESSDATA']}" if os.environ.get('TESSDATA') else ''
DIG = '-c tessedit_char_whitelist=0123456789'

def orienter(im):
    try:
        r = int(re.search(r'Rotate: (\d+)', pytesseract.image_to_osd(im, config=T)).group(1))
    except Exception:
        r = 270 if im.height > im.width else 0
    return im.rotate(-r, expand=True), r

def lire_pastille(im, x, y, w, h):
    """Bloc sombre à chiffres clairs sous le numéro d'exercice. Vote sur plusieurs seuils."""
    c = im.crop((x + int(w*.35), y + int(h*1.2), x + w + int(w*.05), y + int(h*2.55)))
    a = np.array(c).astype(float)
    if a.size == 0 or a.mean() > 205 or a.std() < 25:
        return None, []
    c = ImageOps.autocontrast(c, cutoff=2); a = np.array(c)
    votes = []
    for pc in (50, 60, 70):
        thr = np.percentile(a, pc)
        b = Image.fromarray(np.where(a > thr, 0, 255).astype('uint8'))
        b = ImageOps.expand(b.resize((b.width*5, b.height*5)), 30, fill=255)
        t = pytesseract.image_to_string(b, config=f'{T} --psm 7 {DIG}').strip()
        if t.isdigit() and 1 <= len(t) <= 2:
            votes.append(int(t))
    if not votes:
        return None, []
    v = max(set(votes), key=votes.count)
    return v, votes

def lire_coin(im, box):
    t = pytesseract.image_to_string(im.crop(box), config=f'{T} --psm 7 {DIG}').strip()
    return int(t) if t.isdigit() and len(t) <= 3 else None

def traiter(f):
    im, rot = orienter(Image.open(f).convert('L'))
    W, H = im.size
    d = pytesseract.image_to_data(im, config=f'{T} --psm 11', output_type=pytesseract.Output.DICT)
    exos = []
    for k, w in enumerate(d['text']):
        w = w.strip(); x, y, ww, hh, cf = d['left'][k], d['top'][k], d['width'][k], d['height'][k], float(d['conf'][k])
        if not (w.isdigit() and len(w) <= 3 and cf >= 60): continue
        if y < 0.07*H: continue
        if not (0.012*H <= hh <= 0.032*H): continue
        if not (x < 0.2*W or x + ww > 0.8*W): continue
        cote = 'g' if x < W/2 else 'd'
        piste, votes = lire_pastille(im, x, y, ww, hh)
        exos.append({'n': int(w), 'cote': cote, 'y': y, 'x': x, 'conf': cf, 'piste': piste, 'votes_piste': votes})
    exos.sort(key=lambda e: (e['cote'] != 'g', e['y']))
    pg = lire_coin(im, (0, 0, int(.16*W), int(.07*H)))
    pd = lire_coin(im, (int(.84*W), 0, W, int(.07*H)))
    return {'image': os.path.basename(f), 'rotation': rot, 'page_g': pg, 'page_d': pd, 'exercices': exos}

if __name__ == '__main__':
    fs = sorted(glob.glob(os.path.join(sys.argv[1], 'p-*.jpg')))
    a, b = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (0, len(fs))
    with open(sys.argv[2], 'a') as out:
        for i in range(a, min(b, len(fs))):
            r = traiter(fs[i]); r['index'] = i
            out.write(json.dumps(r, ensure_ascii=False) + '\n'); out.flush()
