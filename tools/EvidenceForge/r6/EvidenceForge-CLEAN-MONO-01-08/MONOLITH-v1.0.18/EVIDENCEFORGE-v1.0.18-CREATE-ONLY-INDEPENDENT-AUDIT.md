# EvidenceForge MONOLITH-v1.0.18 — Audit indépendant CREATE-ONLY

Date : 2026-10-09

## Verdict

**CREATE_ONLY = VALIDATED**  
**MONOLITH-v1.0.18 = GELABLE_WITH_RESERVATIONS**

Aucun gel ni activation n'est prononcé par cet audit.

## Périmètre audité

Pièces reçues :
- base canonique MONOLITH-v1.0.17 précédemment fournie ;
- `diff-v1017-v1018.patch` (deux copies identiques) ;
- preuves `MONOLITH-v1.0.18-create-only.zip` ;
- `SHA256SUMS` candidate ;
- autopsie, rapport, mutants et preuves de tests.

La candidate v1.0.18 a été reconstruite indépendamment en appliquant le patch fourni à la base v1.0.17 canonique.

## Contrôles indépendants

### 1. Reconstruction et identité

- Patch appliqué proprement, sans rejet.
- Arbre reconstruit : 207 fichiers physiques = 205 fichiers scellés + `MANIFEST.json` + `SHA256SUMS.txt`.
- 205/205 fichiers du `SHA256SUMS.txt` vérifiés indépendamment : 0 divergence.
- 205/205 entrées de `MANIFEST.json` vérifiées contre les octets reconstruits : 0 divergence.
- `SHA256SUMS.txt` et `MANIFEST.json` portent la même liste ordonnée de 205 fichiers.
- `contentHash` recalculé indépendamment :
  `720bb6820422becbfc9b3de093684c2f321ad4f10963da2393702e608737c913`.
- Le hash recalculé est identique au hash déclaré.
- Les deux copies du diff reçues sont byte-identiques : SHA-256 `cce09057e2d63e70a85a11e0ee3d8831759b7c877e53e8dd2d7658ac6f842202`.
- Les 13 sidecars d'evidence présents dans le ZIP de preuves passent leur fichier `EVIDENCE-SHA256SUMS.txt` : 13/13 conformes.

### 2. Diff de production

Le changement métier est limité à :
- `lib/pipeline.js` : ajout de `createRunOnly` + export ;
- `server.js` : ajout exact de `POST /api/runs/create` ;
- `config/monolith.config.json` : version/provenance candidate.

Les routes historiques de `server.js` sont conservées ; le test fourni reconstruit le fichier historique en retirant uniquement le bloc additif et compare l'octet.

`createRunOnly` :
- valide la question ;
- exécute l'intake documentaire canonique ;
- respecte l'acquittement des rejets ;
- valide le budget avant création d'artefact ;
- crée le run et persiste documents/chunks/budget/state/event ;
- retourne `store.publicState(store.read())` ;
- n'appelle ni `assertProviderReady`, ni `advance`, ni preflight, ni reformulation.

L'état persistant observé est l'état canonique pré-advance existant : `CREATED / MISSION`, `attempts=0`, étapes `PENDING`, `reformulated=null`.

### 3. Compatibilité historique

Les deux tests historiques modifiés (`test-stream.js`, `test-v1012-lineage-parity.js`) ne changent que l'attente de version `MONOLITH-v1.0.17` vers `MONOLITH-v1.0.18`; aucun seuil, invariant ou assertion métier n'est relâché.

Le diff de `tools/build-manifest.js` ajoute de la provenance v1.0.18 et la lecture des résultats CREATE-ONLY ; aucune suppression d'un contrôle existant n'a été observée.

La preuve différentielle fournie couvre 31 échanges HTTP/SSE historiques entre v1.0.17 et v1.0.18, avec normalisation limitée aux identifiants et métadonnées temporelles/processus et contrôle séparé de la version.

### 4. CREATE-ONLY et mutations

Les contrôles fournis couvrent :
- création HTTP 201 sans fournisseur ;
- runId réel ;
- store persistant ;
- GET liste/détail ;
- absence de preflight/reformulation/advance ;
- absence d'appel fournisseur et de coût réel ;
- rejets documentaires ;
- budget ;
- question invalide ;
- redémarrage de processus ;
- comportement historique de `POST /api/runs` conservé.

Matrice de mutation : 6/6 tués.
- M-CO-01 : garde fournisseur ajoutée à create-only ;
- M-CO-02 : advance ajouté ;
- M-CO-03 : preflight ajouté ;
- M-CO-04 : state non persisté ;
- M-CO-05 : route historique détournée ;
- M-CO-06 : faux statut retourné.

### 5. Régression et réseau

Preuves fournies :
- suite historique : 377/377 PASS ;
- CREATE_ONLY : PASS ;
- redémarrage processus : PASS ;
- network guard : `externalAttempts=0` ;
- preuves opérateur : 0 appel fournisseur réel, 0 USD.

Le rejeu complet 377/377 n'a pas pu être reproduit dans l'environnement d'audit, car les lots frères runtime (notamment MONO-11 et autres dépendances) ne sont pas fournis avec le seul ZIP canonique v1.0.17 de cette conversation. Ce point est conservé comme réserve, pas comme contradiction : le code candidate a néanmoins été reconstruit byte-for-byte à partir de la base canonique + patch, et les journaux/empreintes de la campagne sont scellés et cohérents.

## Réserves non bloquantes

1. Le diagnostic fournisseur au démarrage reste historique : avec des credentials configurés, le serveur peut effectuer sa sonde indépendamment de CREATE-ONLY. La nouvelle route elle-même ne déclenche pas cette sonde.
2. `resume` accepte un run `CREATED` mais lance ensuite le pipeline complet ; `publicState.resumable` reste `false` pour `CREATED`. APP-04B devra respecter cette asymétrie et ne pas déduire la capacité de démarrage depuis `resumable` seul.
3. `createRunOnly` duplique volontairement une courte séquence de `startRun`. La parité est couverte différentiellement, mais cette duplication reste une dette de maintenance.
4. Aucune transaction filesystem globale n'est ajoutée ; en cas d'erreur disque tardive, les garanties restent celles du store historique.
5. L'audit valide le chantier CREATE-ONLY. Il ne valide pas encore l'intégration Desktop APP-04A, ni APP-04B, ni l'activation de v1.0.18.

## Décision d'audit

Aucun blocker indépendant n'a été trouvé dans le périmètre CREATE-ONLY.

**CREATE_ONLY = CLOSED / VALIDATED**  
**MONOLITH-v1.0.18 = GELABLE_WITH_RESERVATIONS**

Étape suivante autorisée : gel canonique séparé de MONOLITH-v1.0.18, sans activation et sans reprise de l'application dans le même acte.
