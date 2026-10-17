# EvidenceForge MONOLITH-v1.0.19 — Audit indépendant EF-01 Transport

Date : 2026-10-09

## Verdict

**EF01_TRANSPORT_POLICY_V1 = VALIDATED**

**MONOLITH-v1.0.19 = GELABLE_WITH_RESERVATIONS**

Cet audit ne prononce ni gel, ni activation, ni intégration Desktop, ni autorisation de smoke réel.

## Pièces examinées

- `V1019-EF01-TRANSPORT-REPORT.md`
- `EVIDENCEFORGE-v1.0.19-CANDIDATE-RECORD.json`
- `diff-v1018-v1019.patch`

Empreintes des pièces reçues :

- rapport : `130d0917ea055e202acfbd86f39b2874d2e5356cdc0c0f5c108d8b1d404fa3c5`
- candidate record : `8c1effe613b77956b2fe10bbc648debbf41fd0464d7282d7618ad83f8a93a253`
- diff : `39c9f450c78f3d35efdbded6ac14e3278130596067253a14d9db20752ae87134`

Le hash du diff correspond à celui déclaré dans le candidate record.

## 1. Identité et périmètre

Le record déclare une candidate `MONOLITH-v1.0.19`, non gelée, non activée, basée sur `MONOLITH-v1.0.18 FROZEN_WITH_RESERVATIONS`, avec :

- 218 fichiers scellés ;
- `contentHash = 48af5e2629d93cdd4005bb7920a13dad3b8272789df5f27153727269785774ed` ;
- `ACTIVE_VERSION = MONOLITH-v1.0.16` ;
- 0 appel fournisseur réel ;
- 0 USD réel ;
- aucune modification Desktop ;
- aucun nouveau smoke.

Le diff de production est limité à :
- `config/monolith.config.json` ;
- `lib/ef01-transport-policy.js` ;
- `lib/mono04-fence-adapter.js` ;
- `lib/cost-ledger.js`.

Les autres changements sont documentation, tests, résultats et manifeste/provenance.

## 2. Fermeture du défaut 8000 ms

La candidate supprime, pour EF-01B et EF-01C1 uniquement, l'héritage implicite du timeout générique MONO-08 de 8000 ms.

La composition est appliquée à la frontière monolithe existante et laisse les lots gelés inchangés.

La politique déclarée est :

- `responseStartTimeoutMs = 180000`
- `bodyReadTimeoutMs = 90000`
- `maxAttempts = 2`
- `backoffMs = 2000`
- `issueUnknown = STOP_NO_RETRY`

Le test de frontière reproduit le défaut historique à 8000 ms et démontre qu'une réponse après 8500 ms passe dans la candidate avec un seul départ réseau.

Le correctif couvre EF-01B **et** EF-01C1 ; il n'est pas limité à DISCIPLINES.

## 3. Issue distante ambiguë

Le point le plus important du chantier est correctement traité : après un départ réseau dont l'issue distante n'est plus démontrable, la candidate classe l'issue `EXTERNAL_OUTCOME_UNKNOWN` et n'autorise pas un second départ automatique.

Le Gateway gelé est composé avec `retryPolicy.maxAttempts = 1`; les seules répétitions physiques ajoutées par la nouvelle composition sont réservées au refus HTTP 429 explicitement typé `rate_limit_error`, complet et sans contenu/usage/id indiquant une réponse productive.

Les 5xx, 504, erreurs réseau, timeouts de réponse, timeouts de body et réponses ambiguës ne sont pas rejoués automatiquement par cette politique.

Cette règle ferme le défaut principal du smoke v1.0.18 : deux départs après timeout local potentiellement déjà acceptés à distance.

## 4. Borne du corps

Le chantier ne se contente pas d'allonger l'attente des en-têtes.

`bodyReadTimeoutMs` borne séparément la lecture du corps et les tests couvrent :
- en-têtes rapides + corps bloqué ;
- absence de succès partiel ;
- classement de l'issue comme inconnue ;
- absence de second départ automatique.

C'est une amélioration nécessaire par rapport au timer MONO-04 historique, qui était effacé à la réception des en-têtes.

## 5. Compatibilité et non-régression

Les preuves déclarées sont cohérentes avec le diff :

- historique : 377/377 ;
- transport : 31/31 ;
- chunking : 21/21 ;
- navigateur : 75/75 ;
- CREATE_ONLY : PASS ;
- process restart : PASS ;
- mutants transport : 8/8 tués ;
- mutants CREATE_ONLY : 6/6 tués ;
- 2430 fichiers protégés : 0 divergence ;
- secret scan : 0 hit ;
- anti-hardcoding : 0 hit.

Les modifications visibles des anciens tests portent sur le numéro de version attendu. Aucun relâchement de seuil ou d'invariant métier n'a été observé dans les changements examinés.

## 6. Ledger / coût inconnu

Le changement de `lib/cost-ledger.js` est opt-in : il n'altère les anciens appels que lorsqu'un `KIT_CALL` porte explicitement `transportOutcome = EXTERNAL_OUTCOME_UNKNOWN` et une absence d'usage.

Dans ce cas :
- `usage = null` ;
- `cost = null` ;
- `priced = false`.

La candidate évite ainsi de transformer l'absence d'usage en coût nul certain.

Le comportement historique reste inchangé pour les appels existants et les usages connus.

### Réserve sémantique R1

Sur un **succès** EF-01 sans champ `usage`, l'adaptateur emploie également `transportOutcome = EXTERNAL_OUTCOME_UNKNOWN` afin d'obtenir un ledger non tarifé.

Ce choix est fail-closed et couvert par test, mais le nom mélange deux notions :
- issue d'exécution réellement inconnue ;
- succès connu dont seul le coût/usage est inconnu.

Ce n'est pas bloquant pour le gel, mais cette distinction devrait rester documentée et ne pas être interprétée par l'UI comme un échec transport.

## 7. Politique de timeout

Le choix `180000 / 90000 ms` est versionné, borné et validé strictement ; il ne dépend plus d'une variable globale affectant OpenAlex/Crossref.

### Réserve R2

Ces valeurs sont une politique technique hors ligne, pas une validation de la latence du Worker déployé. Un Worker ou edge distant peut imposer une borne plus courte. Le prochain smoke réel reste nécessaire pour valider le chemin réel.

## 8. Retry sûr

La candidate ne désactive pas tous les retries.

Un retry est conservé uniquement pour le 429 explicitement typé `rate_limit_error`. Les tests couvrent :
- reprise sûre ;
- épuisement de reprise ;
- refus terminal ;
- issue inconnue après un premier refus sûr.

### Réserve R3

Il n'existe toujours ni idempotency distante, ni annulation distante prouvée, ni transaction distribuée trace/ledger. La politique locale réduit le risque de double départ ambigu mais ne peut certifier le coût bancaire distant.

## 9. Mutations

Les huit mutants ciblent correctement les risques majeurs :

- retour du fallback 8000 ms EF-01B ;
- oubli EF-01C1 ;
- retry après issue inconnue ;
- suppression du body timeout ;
- coût inconnu transformé en zéro ;
- pollution OpenAlex/Crossref ;
- modification du payload scientifique ;
- double ledger.

Les 8/8 sont déclarés tués.

## 10. Points non validés par cet audit

Cet audit ne valide pas :
- la configuration/latence du Worker réellement déployé ;
- une annulation distante ;
- la facturation réelle ;
- l'intégration Desktop de v1.0.19 ;
- un nouveau smoke APP-04B ;
- PLAN réel ;
- APP-05 ;
- l'activation globale de v1.0.19.

## Conclusion

Aucun blocker indépendant n'est identifié dans les pièces examinées pour le chantier EF-01 Transport.

**EF01_TRANSPORT_POLICY_V1 = VALIDATED**

**MONOLITH-v1.0.19 = GELABLE_WITH_RESERVATIONS**

Étape suivante autorisée : **gel canonique séparé de MONOLITH-v1.0.19**, sans activation, sans intégration Desktop et sans nouveau smoke dans le même acte.
