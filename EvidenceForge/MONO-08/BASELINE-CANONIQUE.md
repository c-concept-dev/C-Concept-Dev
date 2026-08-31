# EvidenceForge MONO-08 — Baseline canonique arbitrée (MONO-07 / MONO-08 v0.5)

**Statut : ARBITRAGE PROPRIÉTAIRE RENDU — 2026-08-31.**

Ce document est la référence à utiliser pour **tout contrôle d'intégrité gelée futur**
portant sur MONO-07 et sur le checkpoint MONO-08 v0.5, dans ce dépôt comme dans tout
kit d'exécution local dérivé.

Il ne modifie, ne repack, ni ne fait correspondre artificiellement aucun artefact. Il
documente une décision d'arbitrage rendue par le propriétaire produit après audit
indépendant, et fixe la référence pour la suite.

## 1. Contexte

Un audit indépendant (voir `real-smoke-preflight-2026-08-31/AUDIT-REPORT.md` et
`real-smoke-preflight-2026-08-31-worker-config/AUDIT-REPORT.md`) a mis en évidence une
divergence de SHA-256 sur deux artefacts précis entre :

- le kit `EvidenceForge-Claude-Code-Real-Smoke-Kit` fourni localement (handoff
  `EvidenceForge-HANDOFF-pre-REAL-SMOKE-2026-08-31.zip`, assemblé 2026-08-31 08:37,
  auto-cohérent en interne — `07-VERIFICATION/SHA256SUMS` et
  `06-INVENTAIRES/hash-inventory.json` s'accordent tous deux sur les mêmes valeurs) ;
- le rapport `reports/frozen-integrity-before-v1.json` /
  `reports/frozen-integrity-after-v1.json` contenu dans
  `inputs/EvidenceForge-MONO-08-pre-Real-Smoke-Evidence.zip` (capturé 2026-08-31
  11:44–11:45), qui déclare des empreintes différentes pour ces deux mêmes artefacts
  logiques.

Les 7 autres empreintes canoniques (MONO-00 → MONO-06) étaient strictement identiques
entre les deux sources — seuls MONO-07 et MONO-08 v0.5 divergeaient, et le nom de
fichier de MONO-08 diffère lui aussi entre les deux sources
(`EvidenceForge-MONO-08-REAL-SMOKE-KIT-v0.5.zip` contre
`EvidenceForge-MONO-08-v0.5-checkpoint.zip`).

Diagnostic complet, chemins absolus, tailles et horodatages : voir la réponse d'audit
indépendant datée du 2026-08-31 dans la conversation de reprise MONO-08 (résumée
ci-dessous).

## 2. Arbitrage rendu

Le propriétaire produit a tranché la divergence. Décision :

### Baseline canonique officielle (à utiliser pour tout contrôle futur)

```text
MONO-07 (EvidenceForge-MONO-07-v1.zip) :
  SHA-256 = 967735259b3e512340b6086e547ee16b61444694afe6ef2c5121982b239cdf4b

MONO-08 v0.5 checkpoint (EvidenceForge-MONO-08-v0.5-checkpoint.zip) :
  SHA-256 = 42b10a0b984aba3828e74ec86565ef2d1ffab0f457b90ba57d310d927af31d49
```

### Paire reclassée — NON canonique pour les contrôles futurs

```text
MONO-07 (EvidenceForge-MONO-07-v1.zip, copie du kit Claude Code local) :
  SHA-256 = 5014421b9e8e9d6ccb91b27f736af6797d2108e3c6db0351058e3fce84e458ac

MONO-08 v0.5 (EvidenceForge-MONO-08-REAL-SMOKE-KIT-v0.5.zip, copie du kit Claude Code local) :
  SHA-256 = 17a9cc14c606e6c775b92db64bcd71085e04990d5b621b8804818752c1e29aec
```

Classification retenue : **VERSION / LIGNÉE DE PACKAGING ANTÉRIEURE, NON CANONIQUE
pour les contrôles d'intégrité futurs.** Cette paire reste celle physiquement présente
et interne-cohérente dans le kit `EvidenceForge-Claude-Code-Real-Smoke-Kit` fourni
localement pour l'exécution du preflight ; elle n'est simplement plus la référence à
utiliser pour juger de l'intégrité gelée.

## 3. Portée de cet arbitrage

- Aucun ZIP canonique n'a été modifié, recompressé, ni remplacé pour produire cette
  décision.
- Aucune tentative n'a été faite pour faire correspondre artificiellement les deux
  jeux de hash.
- Les dossiers de preuve déjà produits et committés
  (`real-smoke-preflight-2026-08-31/`, `real-smoke-preflight-2026-08-31-worker-config/`)
  restent inchangés dans leur contenu mesuré (rapports JSON, logs, hashes originaux) —
  ce sont des enregistrements factuels de ce qui a été réellement mesuré à l'instant T,
  contre le jeu d'artefacts alors physiquement disponible. Un erratum a été ajouté dans
  chacun de ces deux dossiers (nouveau fichier, aucune ligne existante modifiée) pointant
  vers ce document.
- Cet arbitrage ne change ni le statut du preflight déjà mesuré
  (`MONO-08 — ENVIRONMENT_BLOCKED`, dans les deux tours), ni le fait que
  `bin/run-real-smoke.js` n'a jamais été lancé.

## 4. Statut inchangé après cet arbitrage

```text
MONO-00 → MONO-07              = GELÉS / INCHANGÉS
MONO-08 Real Smoke Kit v0.5    = CHECKPOINT TECHNIQUE FIGÉ / IMPLEMENTATION READY / INCHANGÉ
MISSION REAL SMOKE             = VALIDÉE, 11/11
REAL SMOKE                     = NOT_RUN (les deux tours : ENVIRONMENT_BLOCKED avant lancement)
MONO-08                        = ENVIRONMENT_BLOCKED / NON GELÉ
MONO-09 / JMMJS                = INTERDIT
```

Aucun preflight ni Real Smoke n'a été relancé pour produire ce document. Cet arbitrage
est une mise à jour documentaire uniquement.

## 5. À faire dans tout tour futur

Tout contrôle d'intégrité gelée futur (`frozen-before`/`frozen-after`, comparaison
inter-tours, etc.) doit comparer les ZIP effectivement utilisés contre la **baseline
canonique officielle** de la section 2, pas contre la paire reclassée. Si un futur tour
mesure à nouveau `5014421b...`/`17a9cc14...` (lignée de packaging antérieure) plutôt que
`967735...`/`42b10a0b...` (baseline officielle), cela doit être signalé explicitement
comme un écart à la baseline officielle, pas silencieusement accepté comme « intégrité
confirmée ».
