# MONO-10 v0.6 — matrice de remédiation

## 1. Reproduction avant correction (§2)

Chaque constat de l'audit A de v0.5 a été **reproduit sur le lot historique
v0.5, exécuté en lecture seule**, avant toute correction. Un constat non
reproduit n'est pas déclaré fermé.

| Constat | Reproduction sur v0.5 | État en v0.6 |
|---|---|---|
| B01 — `acceptanceValidator` fabriqué autorise | REPRODUIT | FERMÉ |
| B02 — `DEFER` entre au corpus | REPRODUIT (3 au corpus) | FERMÉ |
| B03 — `REJECT` entre au corpus | REPRODUIT (3 au corpus) | FERMÉ |
| B04 — artefact inséré après attestation | REPRODUIT | FERMÉ |
| B05 — le nom d'acteur suffit comme preuve d'acte | REPRODUIT | FERMÉ |
| B06 — `consumeNonce: false` | REPRODUIT | FERMÉ |
| B07 — seconde réserve de nonces | REPRODUIT | FERMÉ |
| B08 — même clé en TEST et PRODUCTION | REPRODUIT | FERMÉ |
| B09 — duplication de provenance | `STRONG` légitime sur le cas d'origine ; variante « contenu identique sous autorités réétiquetées » reproduite | FERMÉ sur la variante |
| B10 — dimensions de préparation synthétiques (`NOT_ASSESSED` exempté de source) | REPRODUIT | FERMÉ |
| B11 — arête inter-runs autorisée par l'appelant | REPRODUIT | FERMÉ |
| B12 — résolution d'inconnu par une preuve sans rapport | REPRODUIT | FERMÉ |
| B13 — transport LLM synthétique sous PRODUCTION | REPRODUIT | FERMÉ |
| B14 — `humanAcceptanceRequired: false` | REPRODUIT | FERMÉ |
| B15 — mission désappariée dans le rapport | déjà fermé en v0.5 | CONFIRMÉ FERMÉ |

**14 constats sur 15 reproduits.** B09 est le seul cas où le scénario exact de
l'audit produisait un résultat légitime ; la variante réellement exploitable a
été construite, reproduite, puis fermée. Cette nuance est déclarée, pas lissée.

## 2. Constats trouvés par ce lot, sur lui-même

| Constat | Nature | Traitement |
|---|---|---|
| C01 — le raccord amont réel n'était pas traversable | **défaut de livraison** : les `evidenceRefs` amont sont des chaînes d'identifiants, pas des références de lignée résolvables. Aucune version antérieure ne le traversait ; seules des fixtures inventant déjà des références passaient la porte. | pont livré : `adapters/upstream-evidence-binder.js`. Le garde avait raison de refuser ; c'est la livraison qui était incomplète. |
| C02 — `sanitizePolicy` ne retirait pas les clés appartenant à la frontière | l'application était correcte (la frontière décide), mais `humanAcceptanceRequired`, `consumeNonce`, `crossRunAllowedRelations`, `requireResolvableEvidence` restaient dans la politique publiée, et une clé de forme de contournement inconnue pouvait devenir un canal lors d'une évolution ultérieure. | §72 : toute clé appartenant à la frontière, et toute clé de forme `force*`/`skip*`/`allow*`/`bypass*`/`ignore*`/`disable*`/`unsafe*`/`unchecked*`/`override*`/`trust*`, est retirée **et consignée avec son motif**. |
| C03 — une arête de lignée mal étiquetée dans le code de fixture | la nouvelle table typée a attrapé une erreur de ce lot même (rapport antérieur classé sous `MISSION`). | relation `PRIOR_REPORT` ajoutée ; l'erreur corrigée dans la fixture, pas contournée dans la table. |
| C04 — la racine de registre avançait après la liaison du rapport | faux négatif chronologique, pas une faille. | `rootBeforeSequence(n)` / `sequenceOf(id)` : la vérification compare la racine telle qu'à l'enregistrement du rapport. |

## 3. Erreurs de test diagnostiquées comme erreurs de test

Quatre échecs pendant la construction se sont révélés être des erreurs dans mes
propres assertions ou fixtures, pas dans le produit. Dans chaque cas le produit a
été laissé intact :

| Symptôme | Diagnostic |
|---|---|
| `T17` comparait `prod.missionId`, champ non rendu par la fixture | erreur d'assertion |
| `M38` déclarait l'attaque non pertinente | la vérification de contrôle utilisait `consumeNonce: false`, qui produit légitimement un problème en PRODUCTION |
| six `sinkCase` échouaient au second tour avec « preuve d'acte invalide » | une fixture d'attaque provisionnait un second exploitant **dans le répertoire du premier**, réécrivant son registre d'acteurs |
| `KEY-MANAGEMENT.md` annonçait quatre statuts de clé (`ACTIVE`/`REVOKED`/`EXPIRED`/`SUSPENDED`) | le code n'en connaît que trois (`ACTIVE`/`RETIRED`/`REVOKED`). **Le document était faux, pas le code** : corrigé, et `KL-01` vérifie désormais la liste exacte à chaque passage |
| le schéma annonçait une classe de preuve `UNAUTHENTICATED` | la valeur réelle est `INTERNAL_CHAIN_CONSISTENCY_ONLY` ; schéma corrigé |
| `M09`/`M60` comptaient des mutations tautologiques | placeholders retirés ; les mutations comptent désormais une attaque réelle et un témoin positif (`APPROVE` reste admis) |

## 4. Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 170 PASS / 0 FAIL |
| Mutations | 72 / 72 |
| Intégration hors ligne | 39 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Termes de cas dans le code actif | 0 |
| Termes de fournisseur dans le code actif | 0 |
| Matière privée dans le paquet | 0 |
| Lots historiques modifiés | 0 |
