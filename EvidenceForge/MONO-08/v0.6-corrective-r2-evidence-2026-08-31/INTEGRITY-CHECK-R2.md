# Intégrité hors périmètre — MONO-00→07 / MONO-08 v0.5 / MONO-04 / EF-ORCH

## Ce qui est vérifié ici

Ce correctif ne devait toucher que 5 fichiers (voir périmètre autorisé du mandat) :
`worker/evidenceforge-llm-proxy/src/worker.js`, `.../test/worker.test.js`,
`.../README.md`, `scripts/package-and-verify.sh`, et 4 nouveaux fichiers
`*.baseline.exit`. Cette section confirme qu'aucun autre lot n'a été touché.

## Contrôle git (méthode retenue)

```text
$ git status --short -- EvidenceForge/MONO-04* EvidenceForge/MONO-00* EvidenceForge/MONO-01* \
    EvidenceForge/MONO-02* EvidenceForge/MONO-03* EvidenceForge/MONO-05* EvidenceForge/MONO-06* \
    EvidenceForge/MONO-07* EvidenceForge/EF-ORCH*
(aucune sortie — 0 changement)

$ find EvidenceForge/MONO-08 -maxdepth 1 -iname "*v0.5*"
(aucune sortie — aucun répertoire v0.5 dans l'arbre git de ce dépôt)
```

**Résultat : 0 fichier suivi par git sous ces chemins n'a été modifié pendant ce
correctif.**

## Baseline canonique (référence documentaire, pas re-mesurée ici)

Conformément à `EvidenceForge/MONO-08/BASELINE-CANONIQUE.md` (arbitrage propriétaire
rendu le 2026-08-31), la référence à citer pour tout contrôle d'intégrité gelée
futur est :

```text
MONO-07 (EvidenceForge-MONO-07-v1.zip) :
  SHA-256 = 967735259b3e512340b6086e547ee16b61444694afe6ef2c5121982b239cdf4b

MONO-08 v0.5 checkpoint (EvidenceForge-MONO-08-v0.5-checkpoint.zip) :
  SHA-256 = 42b10a0b984aba3828e74ec86565ef2d1ffab0f457b90ba57d310d927af31d49
```

**Important — distinction explicite, pour ne pas rouvrir la divergence historique :**
ces deux ZIP canoniques ne sont **pas physiquement présents** dans le système de
fichiers de cette session (confirmé par une recherche récursive infructueuse sur le
disque). Ils appartiennent à un kit d'exécution local distinct, référencé par
`BASELINE-CANONIQUE.md` mais non cloné/copié dans ce dépôt git. Il est donc
**impossible et il serait malhonnête** de recalculer un hash byte-level pour ces
artefacts depuis cette session — ce document ne le tente pas et cite uniquement la
valeur canonique déjà arbitrée, par référence.

Ceci est distinct de la « lignée physique des aides historiques » (la paire
`EvidenceForge-MONO-07-v1.zip` / `EvidenceForge-MONO-08-REAL-SMOKE-KIT-v0.5.zip` du
kit Claude Code local, explicitement reclassée **non canonique** par l'arbitrage) :
aucune des deux paires n'est physiquement présente ici, donc aucune des deux n'est
re-vérifiée byte-level dans ce correctif — seul le contrôle git ci-dessus (0 fichier
suivi modifié) constitue la preuve d'intégrité apportée par ce round.

## MONO-04 (`external-execution-gateway.js`)

`MONO-04` n'existe pas non plus comme répertoire physique dans ce dépôt (confirmé par
recherche récursive). Son inspection (Phase 1 d'implémentation v0.6, documentée dans
`worker/evidenceforge-llm-proxy/README.md` et `CDC-TRACE.md`) a eu lieu en lecture
seule dans une session antérieure disposant d'un accès à ce fichier ; ce correctif n'y
touche pas et ne pouvait de toute façon pas y toucher, le fichier n'étant pas présent
ici.

## Verdict

```text
MONO-00 → MONO-07  : 0 fichier suivi modifié (git status vide)
MONO-08 v0.5        : 0 fichier suivi modifié (aucun répertoire v0.5 dans ce dépôt)
MONO-04              : hors dépôt, non touché, non touchable
EF-ORCH               : 0 fichier suivi modifié (git status vide)
```

Aucune preuve byte-level fabriquée pour un artefact physiquement absent. Seule la
preuve réellement disponible (état git du dépôt de travail) est produite ici.
