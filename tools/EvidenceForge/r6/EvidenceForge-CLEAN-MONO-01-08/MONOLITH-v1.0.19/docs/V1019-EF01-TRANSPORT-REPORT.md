# MONOLITH-v1.0.19 — rapport de candidate transport EF-01

**V1.0.19_EF01_TRANSPORT_GELABLE** — sur preuves hors ligne, pour audit indépendant. Ni gel, ni activation, ni intégration Desktop, ni nouveau smoke.

Base : MONOLITH-v1.0.18 FROZEN_WITH_RESERVATIONS, 205 fichiers scellés, contentHash `720bb6820422becbfc9b3de093684c2f321ad4f10963da2393702e608737c913`. Copie séparée dans le même bundle ; source et lots protégés inchangés. ACTIVE_VERSION reste MONOLITH-v1.0.16.

## Résultat

Le vrai chemin stage-ef01 → builder inchangé → kit EF-01B/C1 → Gateway MONO-04 reproduit l'abandon à 8000ms sur v1.0.18. Les mêmes réponses JSON, arrivant après 8500ms, réussissent sur la candidate avec **un seul départ** sous politique explicite. Les prompts, payloads et hashes de provenance sont comparés entre baseline et candidate.

La composition applique EF01_TRANSPORT_POLICY_V1 dans l'adaptateur monolithe existant. La configuration dédiée définit les bornes response-start/lecture du corps, sans variable globale ni mutation du registre gelé. Le corps bloqué expire ; une issue ambiguë ne produit aucun deuxième départ ni succès partiel. Le refus rate-limit explicitement reconnu reste repris, avec maximum 2 départs et backoff 2000ms dans une fenêtre totale non réarmée.

Une découverte des tests a nécessité l'extension opt-in du ledger : usage null sur modèle tarifé donnait zéro dans la baseline. Pour le chemin EF-01 marqué comme non mesuré, la candidate conserve null/priced=false. Usage connu et anciennes écritures ledger restent identiques. Le garde LIMITED existant bloque les coûts non tarifés. Aucune règle scientifique ni budget propriétaire changé.

## Preuves exécutées

| Vérification | Résultat |
|---|---:|
| Suite historique, comprenant transports/SSE/lineage/reuse/gates/missionDeliverables | 377/377 |
| Suite transport dédiée, vrais kits et Gateway, horloge virtuelle | 31/31 |
| Mutants transport M19-01..08 | 8/8 tués |
| CREATE_ONLY : persistance, parité HTTP/SSE, refus et budget | PASS |
| Mutants CREATE_ONLY historiques | 6/6 tués |
| Redémarrage serveur : état créé identique | PASS |
| Chunking | 21/21 |
| Navigateurs : suites v105/v106/v107/v108/v1017 | 33/33 + 12/12 + 11/11 + 9/9 + 10/10 = 75/75 |
| Secret scan | 0 hit |
| Anti-hardcoding canonique | 0 hit |
| Arbres protégés, inventaire exhaustif | 2430 fichiers, 0 divergence |
| Runtime Desktop comparé à l'inventaire du smoke | 1118 entrées, 0 divergence |
| Appels fournisseur réels / coût réel de cette mission | 0 / 0 USD |

Les montants des ledgers de test sont simulés. Le coût historique connu de 0,01201 USD et l'inconnu des timeouts du run efm-20261009-d16ac129 ne sont pas modifiés ni réinterprétés.

La suite dédiée inclut les seize axes TP-01..16, configuration stricte, HTTP ambigu/refus terminal, reprise sûre épuisée, succès sans usage, répétition d'identité sans double ledger, coût connu malgré HTTP en échec, parité de sorties et **pipeline réel arrêté à DISCIPLINES** (preflight simulé, aucune gate PLAN confirmée). Le test sans objet cost couvre également les deux kits : l'absence optionnelle de ledger ne désactive pas la politique.

TP-13/14/15 contrôlent les fichiers pipeline/serveur/stop byte-identiques ; la suite CREATE_ONLY exerce réellement leurs routes locales, transitions historiques simulées et redémarrage. Les autres transports restent couverts par les suites historiques et le passage au Gateway original pour OpenAlex/Crossref/diagnostic.

Les assertions historiques ne sont pas affaiblies : seules les attentes de numéro de produit ont été adaptées. Les contraintes d'identité byte à byte sur stage-ef01 et le builder sont conservées et satisfaites. Les échecs initiaux de browser venaient du garde DNS de test qui bloquait aussi 127.0.0.1 (page chrome-error DNS_PROBE_FINISHED_NXDOMAIN, reproduite aussi sur baseline) ; correction du garde **de test seulement**, puis 75/75 avec les assertions existantes. Aucune correction UI.

## Diff de production

- `lib/ef01-transport-policy.js` : nouvelle composition technique, validation stricte, borne de lecture, reprise sûre, issue inconnue, trace et cache de résultat enrichi.
- `lib/mono04-fence-adapter.js` : branche EF-01 sur Gateway canonique, intégration de la composition, déduplication comptable des résultats EF-01 identiques, usage absent non converti en zéro.
- `lib/cost-ledger.js` : opt-in KIT_CALL/EXTERNAL_OUTCOME_UNKNOWN/usage absent → usage et coût null ; aucune modification pour les appels historiques ou usages connus.
- `config/monolith.config.json` : version et politique technique EF-01 explicite ; toutes les autres valeurs inchangées.

Tout autre changement est TEST, DOC ou MANIFEST/PROVENANCE. `diff-v1018-v1019.patch` et `changes.json` sont les autorités exhaustives de comparaison ; les résultats de tests copiés du prédécesseur sont remplacés par ceux de cette campagne. Le dossier contient des records de gel de versions historiques : aucun ne gèle v1.0.19.

## Limites à conserver pour l'audit

- Délais produit = choix technique versionné aligné sur les tolérances existantes, pas une latence fournisseur validée. Le Worker déployé peut imposer une limite plus courte. Aucun changement Worker justifié ou effectué.
- « Reprise sûre » est limitée au refus HTTP429 typé défini dans le contrat. Un 5xx, un 504 ou une exception DNS textuelle ne suffit pas. Aucun idempotency distant ni garantie d'annulation/facturation.
- Circuit-breaker du Gateway composé compte les appels logiques ; départs physiques détaillés séparément. Cache local au processus, pas de déduplication distribuée.
- Trace et ledger ne constituent pas une transaction distribuée. Un crash brutal avant persistance reste hors garantie. Reprise explicite et règles scientifiques du kit inchangées ; aucun mécanisme de réconciliation de facture ajouté.
- Les totaux du ledger restent une somme connue ; coût inconnu signalé par null/priced=false/unpriced, pas total fournisseur certifié. Aucun écran Desktop modifié.
- Les tests traversent le code réel avec transport simulé et secrets factices injectés ; ils ne prouvent ni disponibilité réelle ni performance réelle du Worker. L'audit indépendant et le gel séparé précèdent toute nouvelle intégration/smoke.

## Reproduction et livrables

Depuis la candidate, environnement vierge, exemple :

```sh
env -i PATH=/usr/local/bin:/usr/bin:/bin node --require ./test/v1018-network-guard.cjs test/test-v1019-transport.js
env -i PATH=/usr/local/bin:/usr/bin:/bin node --require ./test/v1018-network-guard.cjs test/test-monolith.js
```

Les suites HTTP locales utilisent le même garde. Les navigateurs utilisent `NODE_OPTIONS='--require ./test/v1019-browser-network-guard.cjs'` : sockets Node loopback uniquement ; Chrome neuf, proxy local sans sortie externe et résolution externe refusée.

Dans la candidate : autopsie, politique, contrat UNKNOWN, présent rapport, tests/résultats, MANIFEST.json et SHA256SUMS.txt. Sidecars dans `tools/EvidenceForge/reports/MONOLITH-v1.0.19-transport/` : candidate record, logs, mutations, patch, classification, inventaires protégés, preuves réseau, vérification de manifeste et empreintes. Le record est externe pour éviter un contentHash autoréférentiel.

**STOP. Aucune décision de gel/activation, aucun commit/push, aucune reprise App ou smoke, aucune confirmation PLAN, aucun APP-05.**
