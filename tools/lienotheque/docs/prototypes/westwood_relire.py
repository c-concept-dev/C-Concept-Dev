"""3e passe : relecture précise des pastilles détectées (présence >= 0.6).
On localise le bloc sombre du numéro de piste (plus grande zone sombre à droite de « CD1 Piste »),
on l'isole, on l'inverse et on lit avec plusieurs seuils.
Usage : python3 westwood_relire.py <dossier_images> brut2.jsonl brut3.jsonl"""
import sys, os, json, numpy as np, pytesseract
from PIL import Image, ImageOps, ImageFilter
from scipy import ndimage
T = f"--tessdata-dir {os.environ['TESSDATA']}" if os.environ.get('TESSDATA') else ''
DIG = '-c tessedit_char_whitelist=0123456789'

def bloc(im, e):
    h = 34; x, y = e['x'], e['y']
    zone = im.crop((x - int(h*1.8), y + int(h*0.9), x + int(h*3.3), y + int(h*3.0)))
    a = np.array(zone).astype(float)
    sombre = a < min(130, np.percentile(a, 35))
    sombre = ndimage.binary_closing(sombre, iterations=3)
    lab, n = ndimage.label(sombre)
    if n == 0: return None
    tailles = ndimage.sum(sombre, lab, range(1, n + 1))
    k = int(np.argmax(tailles)) + 1
    ys, xs = np.where(lab == k)
    if tailles[k-1] < 150: return None
    return zone.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def lire(b):
    votes = []
    b = ImageOps.autocontrast(b, cutoff=1)
    big = b.resize((b.width*6, b.height*6), Image.LANCZOS).filter(ImageFilter.MedianFilter(3))
    s = np.array(big)
    for pc in (50, 62, 75):
        m = np.where(s > np.percentile(s, pc), 0, 255).astype('uint8')
        img = ImageOps.expand(Image.fromarray(m), 40, fill=255)
        for psm in (7, 8, 13):
            t = pytesseract.image_to_string(img, config=f'{T} --psm {psm} {DIG}').strip()
            if t.isdigit() and 1 <= len(t) <= 2 and int(t) > 0: votes.append(int(t))
    return votes

src = sorted((json.loads(l) for l in open(sys.argv[2])), key=lambda r: r['index'])
with open(sys.argv[3], 'w') as out:
    for r in src:
        im = None
        for e in r['exercices']:
            if e.get('presence', 0) >= 0.6:
                im = im or Image.open(os.path.join(sys.argv[1], r['image'])).convert('L').rotate(-r['rotation'], expand=True)
                b = bloc(im, e)
                e['votes3'] = lire(b) if b is not None else []
        out.write(json.dumps(r, ensure_ascii=False) + '\n'); out.flush()
