"""Consolide les lectures et apparie exercices <-> MP3, puis évalue contre la vérité terrain
contenue dans les noms des MP3 (« 1-41 Latin Riffs - 400 Pg.127.mp3 »).
Usage : python3 westwood_apparier.py brut2.jsonl <dossier_mp3> sortie.json"""
import sys, json, re, os, glob, collections

brut = sorted((json.loads(l) for l in open(sys.argv[1])), key=lambda r: r['index'])

# MP3 : le nombre de fichiers est connu dans tous les cas ; la vérité terrain est un bonus d'évaluation
mp3 = {}
for f in glob.glob(os.path.join(glob.escape(sys.argv[2]), '*.mp3')):
    b = os.path.basename(f)
    m = re.match(r'(\d+)-(\d+) (.+?) - (\d+) Pg\.(\d+)', b)
    if m: mp3[int(m.group(2))] = {'fichier': b, 'style': m.group(3).replace('_', '/'), 'ex_vt': int(m.group(4)), 'page_vt': int(m.group(5))}
N = max(mp3)

# 1) Pages : double page par image, page gauche paire ; décalage voté
cands = []
for r in brut:
    if r['page_g'] and r['page_g'] % 2 == 0: cands.append(r['page_g'] - 2*r['index'])
    if r['page_d'] and r['page_d'] % 2 == 1: cands.append(r['page_d'] - 1 - 2*r['index'])
K = collections.Counter(cands).most_common(1)[0][0]
for r in brut:
    loc = [v for v in ((r['page_g'] - 2*r['index']) if r['page_g'] and r['page_g'] % 2 == 0 else None,
                       (r['page_d'] - 1 - 2*r['index']) if r['page_d'] and r['page_d'] % 2 == 1 else None) if v is not None and abs(v - K) <= 4]
    r['page_gauche'] = 2*r['index'] + (collections.Counter(loc).most_common(1)[0][0] if loc else K)

seq = []
for r in brut:
    for e in r['exercices']:
        e['page'] = r['page_gauche'] + (e['cote'] == 'd'); seq.append(e)

# 2) Numéros d'exercice : plus longue suite croissante (sauts <= 12) = ancres ; réparation des autres
n = len(seq); best = [1]*n; prev = [-1]*n
for i in range(n):
    for j in range(max(0, i-40), i):
        if 0 < seq[i]['n'] - seq[j]['n'] <= 12 and best[j] + 1 > best[i]: best[i], prev[i] = best[j] + 1, j
i = max(range(n), key=lambda k: best[k]); anc = set()
while i != -1: anc.add(i); i = prev[i]
anc = sorted(anc)
for k in range(n): seq[k]['num'] = seq[k]['n'] if k in anc else None
for a, b in zip(anc, anc[1:]):
    trous = list(range(a + 1, b)); libres = list(range(seq[a]['n'] + 1, seq[b]['n']))
    if trous and len(trous) == len(libres):
        for k, v in zip(trous, libres): seq[k]['num'] = v; seq[k]['repare'] = 'interpolation'
    else:
        for k in trous:
            s = str(seq[k]['n']); c = [v for v in libres if str(v).endswith(s[-2:]) or str(v).endswith(s)]
            if len(c) == 1: seq[k]['num'] = c[0]; seq[k]['repare'] = 'suffixe'
ex = [e for e in seq if e['num']]

# 3) Pistes : programmation dynamique sur les exercices porteurs de pastille
#    pas de 0 (même piste), 1 (piste suivante) ou 2 (une pastille manquée, pénalisé)
box_all = [e for e in ex if e.get('presence', 0) >= 0.6]
# Changement de disque : une lecture sûre (>= 3 votes concordants) <= 3 alors que l'on a déjà dépassé 20
box, maxi, bas = [], 0, []
for e in box_all:
    v = e.get('votes3', []) + e.get('votes2', []) + e.get('votes_piste', [])
    top, c = collections.Counter(v).most_common(1)[0] if v else (None, 0)
    if c >= 3 and top <= 5 and maxi >= 20:
        bas.append(e)
        if len(bas) >= 3: box = box[:len(box) - 2]; break   # 3 lectures sûres consécutives qui repartent de 1
    else:
        bas = []
        if c >= 3: maxi = max(maxi, top)
    box.append(e)
disque2_debut = box_all[len(box)]['num'] if len(box) < len(box_all) else None
def appui(v, t):
    # 1 si identique ; appui partiel si un chiffre a été perdu ou ajouté (bordure lue comme « 1 »)
    sv, st = str(v), str(t)
    if v == t: return 1.0
    if len(sv) < len(st) and (st.endswith(sv) or st.startswith(sv)): return 0.45
    if len(sv) > len(st) and (sv.startswith(st) or sv.endswith(st)): return 0.3
    return 0.0
def score(e, t):
    # relecture précise (votes3) pondérée double ; lectures antérieures en appoint
    v3 = e.get('votes3', []); v = e.get('votes2', []) + e.get('votes_piste', [])
    s3 = sum(appui(x, t) for x in v3) / len(v3) * 4 if v3 else 0
    s2 = sum(appui(x, t) for x in v) / len(v) * 1.5 if v else 0
    return s3 + s2
NEG = -1e9; m = len(box)
dp = [[NEG]*(N+3) for _ in range(m)]; bk = [[0]*(N+3) for _ in range(m)]
for t in range(1, 4): dp[0][t] = score(box[0], t) - (t-1)
for i in range(1, m):
    for t in range(1, N+1):
        for st, pen in ((0, 0.3), (1, 0), (2, 1.5)):
            p = t - st
            if p >= 1 and dp[i-1][p] > NEG and dp[i-1][p] - pen + score(box[i], t) > dp[i][t]:
                dp[i][t], bk[i][t] = dp[i-1][p] - pen + score(box[i], t), p
t = max(range(1, N+1), key=lambda v: dp[m-1][v] + (2 if v == N else 0))
for i in range(m-1, -1, -1):
    box[i]['piste'] = t; t = bk[i][t] if i else t
    v = box[i].get('votes3', []) or box[i].get('votes2', [])
    box[i]['source'] = 'lue' if v and box[i]['piste'] == max(set(v), key=v.count) else 'deduite_par_sequence'

app = [{'exercice': e['num'], 'page': e['page'], 'piste': e.get('piste') if e in box else None,
        'mp3': mp3.get(e.get('piste'), {}).get('fichier') if e in box else None,
        'source_piste': e.get('source') if e in box else None, 'repare': e.get('repare')} for e in ex]

# 4) Évaluation : premier exercice de chaque piste = celui du nom de fichier
premier = {}
for a in app:
    if a['piste'] and a['piste'] not in premier: premier[a['piste']] = a
ev = {'pistes': N, 'exercice_ok': 0, 'page_ok': 0, 'erreurs': []}
for t, v in sorted(mp3.items()):
    a = premier.get(t)
    ok_e = bool(a) and a['exercice'] == v['ex_vt']; ok_p = bool(a) and a['page'] == v['page_vt']
    ev['exercice_ok'] += ok_e; ev['page_ok'] += ok_p
    if not (ok_e and ok_p): ev['erreurs'].append({'piste': t, 'attendu': [v['ex_vt'], v['page_vt']], 'obtenu': [a['exercice'], a['page']] if a else None})
multi = collections.defaultdict(list)
for a in app:
    if a['piste']: multi[a['piste']].append(a['exercice'])
json.dump({'appariements': app, 'pistes': {t: {'exercices': multi.get(t, []), **mp3[t]} for t in sorted(mp3)}, 'evaluation': ev},
          open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
print('début disque 2 détecté à l\'exercice', disque2_debut)
print(f"exercices={len(ex)} (réparés {sum(1 for e in ex if e.get('repare'))}) pastilles={len(box)} "
      f"| pistes OK exercice {ev['exercice_ok']}/{N} page {ev['page_ok']}/{N} "
      f"| pistes lues {sum(1 for b in box if b['source']=='lue')} déduites {sum(1 for b in box if b['source']!='lue')}")
for e in ev['erreurs'][:25]: print(e)
