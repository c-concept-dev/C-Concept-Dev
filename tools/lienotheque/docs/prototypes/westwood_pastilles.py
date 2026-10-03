"""2e passe ciblée : pour chaque numéro d'exercice détecté, mesure la présence d'une pastille
CD (bloc sombre sous le numéro) et relit son chiffre avec plusieurs recadrages.
Usage : python3 westwood_pastilles.py <dossier_images> brut.jsonl brut2.jsonl [debut fin]"""
import sys, os, json, numpy as np, pytesseract
from PIL import Image, ImageOps, ImageFilter
T = f"--tessdata-dir {os.environ['TESSDATA']}" if os.environ.get('TESSDATA') else ''
DIG = '-c tessedit_char_whitelist=0123456789'

def analyse(im, e, h_est):
    x, y, w, h = e['x'], e['y'], int(h_est*2.2), h_est
    # zone sous le numéro, alignée sur son bord droit (les numéros sont fer à droite)
    r = x + e.get('w', w)
    zone = im.crop((r - int(h*2.6), y + int(h*1.05), r + int(h*.3), y + int(h*2.7)))
    a = np.array(zone).astype(float)
    if a.size == 0: return 0.0, []
    # présence : présence d'une large plage sombre (le bloc du numéro de piste)
    colmean = a.mean(0)
    dark_cols = (colmean < np.percentile(colmean, 100) - 45).mean()
    presence = float(np.clip((235 - a.min(0).mean()) / 120, 0, 1)) * 0.5 + float(dark_cols > 0.15) * 0.5
    votes = []
    for frac in (0.40, 0.50, 0.58):          # partie droite = bloc chiffre
        sub = zone.crop((int(zone.width*frac), 0, zone.width, zone.height))
        sub = ImageOps.autocontrast(sub, cutoff=2).resize((sub.width*6, sub.height*6), Image.LANCZOS).filter(ImageFilter.MedianFilter(3))
        s = np.array(sub)
        for pc in (45, 60):
            b = Image.fromarray(np.where(s > np.percentile(s, pc), 0, 255).astype('uint8'))
            b = ImageOps.expand(b, 30, fill=255)
            for psm in (7, 8):
                t = pytesseract.image_to_string(b, config=f'{T} --psm {psm} {DIG}').strip()
                if t.isdigit() and 1 <= len(t) <= 2 and int(t) > 0: votes.append(int(t))
    return round(presence, 2), votes

src = [json.loads(l) for l in open(sys.argv[2])]
src.sort(key=lambda r: r['index'])
a, b = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (0, len(src))
with open(sys.argv[3], 'a') as out:
    for r in src[a:b]:
        im = Image.open(os.path.join(sys.argv[1], r['image'])).convert('L').rotate(-r['rotation'], expand=True)
        hs = [36] 
        for e in r['exercices']:
            e['presence'], e['votes2'] = analyse(im, e, 34)
        out.write(json.dumps(r, ensure_ascii=False) + '\n'); out.flush()
