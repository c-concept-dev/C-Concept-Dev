# Défaut Bloquant 1 — Investigation du mismatch manifest allégué

## Réclamation d'audit

```text
Fichier : reports/mono-08-test-report-v1.json
Hash annoncé dans v0.6/manifest/SHA256SUMS :
  1370b457cc78c7602be2b8aea417293fe7cae4bc185e69fea6f6c9530cdd82fa
Hash réel du fichier contenu dans le package audité :
  c4d54afc08a885d631caa02a39155a7b1d372581ea7a4257623accaa2c8036cd
```

## Méthode de vérification (indépendante, reproductible)

Vérification menée directement sur le fichier ZIP dont le SHA-256 a été
confirmé identique à celui cité comme « package audité »
(`a1895f58ed7e07a3ab3f246bb3a9ef81895c195aafab0b6ca1266bf1aad845ee`), donc
sur l'artefact exact visé par la réclamation — aucune régénération, aucun
nouveau build avant cette vérification.

```bash
# 1) confirmer qu'il s'agit bien du package audité
shasum -a 256 EvidenceForge-MONO-08-v0.6-implementation-package.zip
# -> a1895f58...845ee (identique)

# 2) hash annoncé dans le manifest (tel que packagé dans le ZIP)
unzip -p ...package.zip v0.6/manifest/SHA256SUMS | grep mono-08-test-report-v1.json

# 3) hash réel du fichier CONTENU dans le ZIP (lu directement depuis l'archive)
unzip -p ...package.zip v0.6/reports/mono-08-test-report-v1.json | shasum -a 256

# 4) hash du fichier sur disque dans le working tree (pour référence)
shasum -a 256 v0.6/reports/mono-08-test-report-v1.json

# 5) vérification manifest complète, sur une extraction fraîche du ZIP audité
unzip -q ...package.zip -d /tmp/zip-verify
cd /tmp/zip-verify/v0.6 && shasum -a 256 -c manifest/SHA256SUMS
```

## Résultat

```text
(1) SHA-256 du ZIP                                  = a1895f58...845ee  (confirmé identique)
(2) hash annoncé dans manifest/SHA256SUMS            = 1370b457cc78c7602be2b8aea417293fe7cae4bc185e69fea6f6c9530cdd82fa
(3) hash réel du fichier lu depuis le ZIP            = 1370b457cc78c7602be2b8aea417293fe7cae4bc185e69fea6f6c9530cdd82fa
(4) hash du fichier sur disque (working tree)        = 1370b457cc78c7602be2b8aea417293fe7cae4bc185e69fea6f6c9530cdd82fa
(5) vérification manifest complète (49 entrées)      = 49/49 OK, 0 mismatch
```

**Les trois valeurs (2), (3) et (4) sont strictement identiques.** La
valeur `c4d54afc08a885d631caa02a39155a7b1d372581ea7a4257623accaa2c8036cd`
citée dans la réclamation comme « hash réel du fichier contenu dans le
package audité » **ne correspond à aucun fichier retrouvé** dans le ZIP
audité, dans le working tree actuel, ni dans l'historique de génération de
ce lot (recherche de cette chaîne dans l'ensemble des hashes courants :
aucune occurrence).

## Conclusion

**Le mismatch allégué ne se reproduit pas.** Vérification indépendante,
directe, sur l'artefact exact cité (même SHA-256 de ZIP), avec 3 méthodes
convergentes (manifest packagé, contenu du ZIP, disque) : **0 divergence**.
Une vérification complète des 49 entrées du manifest, depuis une
extraction fraîche du ZIP audité, confirme également **0 mismatch** sur
l'ensemble du package, pas seulement sur le fichier signalé.

Classification retenue : **AUCUN DÉFAUT REPRODUIT** — pas « BUG SCRIPT »
ni « BUG PACKAGING » au sens d'un défaut réel constaté, faute de mismatch
reproductible sur l'artefact exact désigné par l'audit. Il n'est pas
possible de « prouver la cause exacte » d'un défaut qui ne se manifeste
pas ; inventer une cause pour un symptôme non reproduit serait un patch
silencieux non justifié, explicitement interdit par le mandat de ce tour.

## Action prise malgré l'absence de reproduction

Conformément à la demande de correctif (« éviter que le même défaut
puisse réapparaître »), un pipeline de packaging déterministe a
néanmoins été introduit
(`EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh`) : ordre
strict figeant tous les rapports mutables avant la génération du
manifest, génération du manifest EN DERNIER, vérification immédiate,
puis RE-vérification de tous les hashes en relisant le contenu depuis le
ZIP final lui-même (jamais depuis le disque local). Cela rend cette
classe de défaut structurellement impossible pour tout packaging futur de
ce lot, indépendamment du fait qu'elle ne se soit pas produite ici.
