# 04 — Contract Impacts

## Total : 0 CONTRACT_IMPACT

Aucun fichier de MONO-00→MONO-07 (lots gelés) n'a été modifié pendant
cette mission. Aucun `CONTRACT_IMPACT` n'a donc été nécessaire.

## Justification par point de tension identifié

Trois points où une modification d'un lot gelé aurait été *possible*
ont été identifiés pendant l'analyse ; dans les trois cas, l'Option A
(composition externe, injection via une frontière déjà prévue par le lot
gelé lui-même) s'est avérée suffisante, rendant l'Option B (modification
additive du lot gelé, nécessitant un `CONTRACT_IMPACT`) inutile :

### 1. Persistance durable (F-09 / F-05 audit condensé)

**Tension** : `MONO-05/app/server/config.js::createOperatorBackends()`
construit des backends en mémoire sans paramètre d'injection.

**Option B envisagée et REJETÉE** : ajouter un paramètre optionnel
`durableBackends` à `createOperatorBackends()` pour permettre l'injection
d'un backend de production — aurait nécessité un `CONTRACT_IMPACT` sur
MONO-05 (lot gelé), pour un bénéfice marginal (MONO-08 n'a jamais besoin
d'appeler cette fonction précise elle-même).

**Option A retenue** : MONO-08 ne passe JAMAIS par
`createOperatorBackends()` pour la preuve CROSS_PROCESS. Il appelle
directement `createMono01(registry, {efOrchDurableBackend})` et
`createMono03({persistenceBackend})` — la frontière d'injection déjà
définie et documentée comme telle par MONO-01
(`ef-orch-durable-backend-v0.1.js`) et MONO-03
(`persistence-backend.js`) eux-mêmes, dans leur propre commentaire d'en-tête
(« la fourniture d'une implémentation de production est hors périmètre
[…] injection externe »). Aucune ligne de MONO-01/03/05 modifiée.

### 2. Réhydratation des dépendances vivantes (F-08 audit condensé)

**Tension** : `MONO-05/app/server/run-registry.js::
buildContextFromState()` ne reconstruit pas `connectorRunners`/`adapter`/
`workerCallFn` correctement pour un usage générique.

**Option B envisagée et REJETÉE** : corriger `buildContextFromState()`
dans MONO-05 — aurait nécessité un `CONTRACT_IMPACT`.

**Option A retenue** : ce chemin MONO-05 n'est simplement jamais emprunté
par MONO-08. `lib/real-e2e-driver.js::rehydrateRealMissionRun()`
(fichier MONO-08, pas MONO-05) reconstruit lui-même `connectorRunners` à
neuf à chaque réhydratation, exactement comme `adapter`/`workerCallFn` —
déjà le cas AVANT cette mission, revérifié par la nouvelle preuve
CROSS_PROCESS. `MONO-05/app/server/operator-api.js`/`run-registry.js`
non modifiés.

### 3. `acteur:"human"` requis littéralement par le contrat gelé EF-01D

**Tension** : `MONO-01/dependencies/ef-orch-ef01d-screening-artifact-
v0.1.js::assertScreeningArtifactComplete` exige exactement
`decision.acteur === "human"`, sans échappatoire `"system_test"`
(contrairement à EF-01E).

**Option B envisagée et REJETÉE** : étendre ce validateur MONO-01 pour
accepter un acteur alternatif en mode test/synthétique — aurait
nécessité un `CONTRACT_IMPACT` sur MONO-01 (lot gelé, dépendance de
TOUS les autres lots).

**Option A retenue** : conserver `acteur:"human"` comme valeur littérale
dans les deux modes (c'est une contrainte de vocabulaire du STAGE, pas
en soi la fabrication dénoncée par F-02), et résoudre le vrai problème
(l'absence de distinction entre une décision réellement prise par un
humain et une décision synthétique) via un champ ADDITIF
(`evidenceProvenance`) porté par l'objet MONO-08 lui-même, jamais par le
schéma validé par MONO-01. Le mode `REAL` exige désormais que cette
décision soit RÉELLEMENT fournie par l'appelant (sinon
`OPERATOR_INPUT_REQUIRED`) — la question n'était donc jamais « quelle
valeur autoriser dans `acteur` » mais « qui a le droit de fixer cette
valeur, et à quelles conditions ».

## Conclusion

Les trois tensions se résolvent toutes par composition externe au
niveau de MONO-08, exactement comme le mandat de cette mission le
requiert (« Option A prioritaire »). Aucune des trois ne justifiait le
coût d'un `CONTRACT_IMPACT` sur un lot gelé.
