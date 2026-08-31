# MONO-08 v0.6 — Intégrité gelée avant/après implémentation

## Portée du snapshot

Snapshot SHA-256 des 9 ZIP canoniques physiquement présents dans le kit
local (`EvidenceForge-Claude-Code-Real-Smoke-Kit`, handoff
`EvidenceForge-HANDOFF-pre-REAL-SMOKE-2026-08-31.zip`) : MONO-00 à MONO-07
+ le checkpoint MONO-08 v0.5 embarqué.

**Note de transparence sur la baseline canonique** : ces hashes
correspondent à la lignée de packaging déjà documentée dans
`EvidenceForge/MONO-08/BASELINE-CANONIQUE.md` comme *non canonique*
(`5014421b...`/`17a9cc14...` pour MONO-07/MONO-08 v0.5). La baseline
officiellement arbitrée (`967735...`/`42b10a0b...`) n'est pas physiquement
présente dans ce kit local — je ne peux donc mesurer que la stabilité des
ZIP réellement disponibles, pas re-vérifier la baseline officielle
elle-même (déjà signalé dans les tours précédents, sujet non rouvert ici).
Ce qui compte pour ce lot : **aucun ZIP, quelle que soit sa lignée, n'a été
modifié pendant l'implémentation.**

## Avant implémentation

Capturé avant toute création/modification de fichier pour ce lot.

```text
MONO-00  63bf8e5354ccea4b6da0c03adc192710273b3d69ba2051839d83fd919c109bb0
MONO-01  d4d9d2af760f8a67b06c12641180d5be2e9b51a8c5b1c045d04aed58621af737
MONO-02  40ccc3c6b4b8af75ce57d305d579e0bb34fc3f9aaeed511a93533b2b7699a23d
MONO-03  3ad62071ea6c129d60725b666944af9b98afd0a2e9f7b63e9273f3e0ef94c199
MONO-04  ff230ccb9474242d8a625a301bd058e805e019c927687bf5385d0d66b30f8afc
MONO-05  a97fff4f396155352affe64fc7f809bb37d17921f39f9ab9ac86d6b97e16111c
MONO-06  fbf11c7f01ade8e6a4534f4d1c893abed1f242bf3fa3012ffc27ff7ee9fd234c
MONO-07  5014421b9e8e9d6ccb91b27f736af6797d2108e3c6db0351058e3fce84e458ac
MONO-08 v0.5  17a9cc14c606e6c775b92db64bcd71085e04990d5b621b8804818752c1e29aec
```

Fichier complet : `frozen-before-implementation.sha256`.

## Après implémentation

Capturé après création du Worker, modification de `lib/preflight.js` et
`lib/real-provider-configs.js`, exécution de tous les tests
`LOCAL_CONTROLLED` et de la suite de non-régression, mise à jour de la
documentation.

Fichier complet : `frozen-after-implementation.sha256`.

## Comparaison

```text
diff <(hashes before) <(hashes after) → AUCUNE DIFFÉRENCE
```

**Bit-identique.** Les 9 ZIP canoniques du kit local n'ont subi aucune
modification pendant l'implémentation de MONO-08 v0.6.

## MONO-04 (inspection en lecture seule)

`EvidenceForge-MONO-04-R1.zip` a été extrait en lecture seule dans une
zone de travail temporaire (`/tmp/.../v06-work/mono04-readonly/`, hors de
tout dépôt Git, jamais recopié dans ce paquet de livraison) pour
inspecter `lib/external-execution-gateway.js` (Phase 1, voir
`CDC-TRACE.md` section « Phase 1 — inspection »). Aucune écriture n'a été
effectuée dans cette extraction ni dans le ZIP source. Le ZIP MONO-04
lui-même fait partie des 9 ZIP couverts par le snapshot avant/après
ci-dessus (`ff230ccb...`, inchangé).

## Conclusion

```text
MONO-00 → MONO-07               : inchangés (confirmé par hash)
MONO-08 v0.5 checkpoint (kit local) : inchangé (confirmé par hash)
MONO-04                          : inspecté en lecture seule, inchangé (confirmé par hash), aucune modification de code
```
