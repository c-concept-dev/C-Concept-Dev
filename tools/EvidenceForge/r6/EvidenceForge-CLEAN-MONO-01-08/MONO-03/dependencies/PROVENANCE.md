# Provenance — MONO-02 (copie gelée, nesting MONO-01.x)

**MISE À JOUR REBASE R1** (régression MONO02-CORPUS-BY-REF-MAP) : ce
dossier contient désormais **EvidenceForge-MONO-02-R1** (correctif
`lib/node-runners.js::corpusByRefOf()` — Map au lieu d'Object, voir
`dependencies/MONO-02/VERSION-R1.md`), en remplacement de la copie
MONO-02 v1 précédente. Aucun changement de code dans MONO-03 lui-même :
rebase de dépendance uniquement (voir CDC-TRACE.md de MONO-03-R1).
Manifeste vérifié : **152/152 OK** (MONO-02-R1) + **106/106 OK**
(MONO-01.x imbriqué, inchangé). Tests : **334/334** (MONO-02-R1, dont 10
nouveaux tests de régression) + **172/172** (MONO-01.x, inchangé).

---

Ce dossier est une **copie intégrale et bytewise** du paquet MONO-02 gelé
(qui contient lui-même sa propre copie bytewise de MONO-01.x). Historique
avant rebase R1 : manifeste 44/44 (MONO-02 v1) + 106/106 (MONO-01.x
imbriqué), tests 324/324 (MONO-02 v1) + 172/172 (MONO-01.x), jamais
modifiée à l'époque.

MONO-03 ne `require()` jamais un port MONO-01.x ni un fichier gelé
directement — il ne connaît que : le graphe MONO-02
(`graph/mono-02-orchestration-graph-v1.json`, pour lire `resumePolicy`/
`retryPolicy` par nœud) et les identifiants/statuts que l'orchestrateur lui
transmet (jamais les checkpoints internes d'EF-ORCH, jamais un appel direct
à un port). MONO-03 ne pilote rien — il persiste et calcule un plan de
reprise ; c'est à l'appelant (l'orchestrateur, hors périmètre de ce lot)
d'exécuter ce plan via MONO-02/MONO-01.x.

Vérification effectuée au moment de la rebase R1 :
`sha256sum -c manifest/SHA256SUMS` → **152/152 OK** (MONO-02-R1),
**106/106 OK** (MONO-01.x imbriqué).
