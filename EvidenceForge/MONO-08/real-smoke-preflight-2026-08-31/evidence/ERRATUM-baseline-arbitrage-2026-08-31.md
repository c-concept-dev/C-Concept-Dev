# Erratum — arbitrage baseline canonique MONO-07 / MONO-08 v0.5

Ce fichier est un ajout postérieur à ce dossier de preuve. Il ne modifie, ne retire, ni
ne réinterprète aucun contenu déjà présent dans `AUDIT-REPORT.md` ou dans `evidence/` :
tous les fichiers déjà présents restent exactement tels qu'ils ont été produits et
committés initialement (mêmes octets, mêmes hashes dans `SHA256SUMS`).

## Ce qui a changé depuis la production de ce dossier

Un audit indépendant mené après ce tour a révélé que les hashes SHA-256 mesurés
dans ce dossier pour MONO-07 et MONO-08 v0.5 (via `evidence/frozen-before.sha256` et
`evidence/frozen-after.sha256`) :

```text
MONO-07     = 5014421b9e8e9d6ccb91b27f736af6797d2108e3c6db0351058e3fce84e458ac
MONO-08 v0.5 = 17a9cc14c606e6c775b92db64bcd71085e04990d5b621b8804818752c1e29aec
```

correspondent à une **lignée de packaging antérieure**, et non à la baseline canonique
officielle arbitrée par le propriétaire produit le 2026-08-31 :

```text
MONO-07      = 967735259b3e512340b6086e547ee16b61444694afe6ef2c5121982b239cdf4b
MONO-08 v0.5 = 42b10a0b984aba3828e74ec86565ef2d1ffab0f457b90ba57d310d927af31d49
```

Référence complète de l'arbitrage : `../../BASELINE-CANONIQUE.md`.

## Ce que cela ne change pas

- Le résultat mesuré du preflight officiel de ce tour reste `overallStatus: BLOCKED`
  (`MONO-08 — ENVIRONMENT_BLOCKED`) : cette divergence de baseline n'affecte ni la cause
  du blocage (politique d'egress réseau de l'environnement) ni la conclusion de ce tour.
- La comparaison « bit-identical avant/après preflight » faite dans ce dossier
  (`evidence/frozen-before.sha256` == `evidence/frozen-after.sha256`) reste vraie et
  valable en tant que telle : elle prouve que les ZIP n'ont pas été altérés **pendant ce
  tour**, indépendamment de la question de savoir laquelle des deux lignées de packaging
  est la baseline canonique.
- `bin/run-real-smoke.js` n'a toujours pas été lancé.

## Ce que cela invalide

Toute lecture de ce dossier qui interpréterait le hash `17a9cc14...`/`5014421b...` comme
« la » preuve d'intégrité canonique de MONO-07/MONO-08 v0.5 doit être corrigée : ce sont
des hashes réels et non falsifiés d'artefacts réellement présents dans le kit local
utilisé pour ce tour, mais ils ne sont plus la référence à utiliser pour juger de
l'intégrité gelée. Voir `../../BASELINE-CANONIQUE.md` pour la référence à jour.
