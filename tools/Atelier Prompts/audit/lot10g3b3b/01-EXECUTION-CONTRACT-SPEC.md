# ExecutionContract v1 — spécification

## Statut

`ExecutionContract v1` est une représentation shadow, indépendante des fournisseurs et sans autorité sur le produit. Le builder reçoit exclusivement des états déjà calculés, retourne un objet validé et ne déclenche ni appel réseau, ni route, ni moteur, ni affichage.

## Autorité et immutabilité

- `version` vaut exactement `1.0`.
- `request_id` identifie la demande ; en l'absence d'ID runtime, le banc produit un identifiant déterministe à partir de la demande.
- `original_request` conserve intégralement la demande et reste obligatoire.
- Le builder clone son résultat : aucun objet runtime reçu n'est muté.
- Après sérialisation, tout changement produit un hash canonique différent.

## Structure

| Bloc | Rôle |
|---|---|
| `intent` | objectif, livrable, destinataire, contraintes explicites `REQ-*` |
| `evidence` | faits utilisateur, faits matériau, déductions, connaissance externe et fraîcheur |
| `executability` | état, confiance, manques critiques et substituables |
| `assumptions` | hypothèses explicitement étiquetées |
| `obligations` | exigences sourcées et traçables |
| `quantities` | bornes, unité/cible et obligations liées |
| `output` | format, structure, ouverture, clôture, longueur |
| `locks` | enum universelle des 13 verrous, raison, priorité, source, contrôles associés et état |
| `execution_policy` | discipline et technique 9 |
| `checks` | contrôles typés et obligations liées |
| `routing` | projection exacte de la décision actuelle |
| `ethics` | neuf invariants non désactivables |
| `adn_summary` | vue calculable des cinq propriétés |

## Améliorations justifiées par rapport à la structure minimale

1. Les contraintes deviennent des objets `REQ-*`, puis des obligations `OBL-*`, afin de prouver leur chaîne vers quantité, verrou et contrôle.
2. Faits, déductions, hypothèses et manques portent des statuts incompatibles par construction.
3. `execution_policy` ajoute `evasion_blocked` et `final_injunction_active`, pour représenter explicitement les techniques 2 et 9.
4. `ethics` couvre les neuf invariants du référentiel, pas seulement trois exemples minimaux.
5. `checks` distingue déterministe, heuristique, sémantique et manuel.
6. `adn_summary`, calculé par `deriveAdnSummary()`, rend les cinq propriétés directement inspectables sans devenir une seconde autorité.
7. `buildExecutionContractAuditView()` expose uniquement les métadonnées nécessaires à l'audit, sans demande ni texte des obligations.

## Invariants stricts

- Demande originale non vide.
- Champs racine et sous-blocs fermés.
- Toute contrainte explicite possède une obligation utilisateur identique.
- Toute obligation possède une source.
- Une déduction ou hypothèse ne peut devenir un fait.
- Un manque critique garde le statut `missing`.
- Toute quantité possède une borne et une unité ou cible.
- Tout verrou appartient à l'enum universelle, possède une raison et n'est pas dupliqué.
- Tout verrou expose sa source, son état et ses contrôles associés.
- `execute_now` et `final_injunction_active` valent vrai si et seulement si l'état est `exploitable`.
- Une clarification impose `routing.engine=null`.
- Une demande exploitable conserve la route historique Rapide ou Architecte.
- Les neuf invariants éthiques valent toujours `true`.

## API shadow

```js
buildExecutionContractShadow(runtimeSnapshot)
validateExecutionContract(contract)
serializeExecutionContract(contract)
parseExecutionContract(json)
canonicalizeExecutionContract(contract)
hashExecutionContract(contract)
deriveAdnSummary(contract)
buildExecutionContractAuditView(contract)
```

Le module est isolé dans `evaluation/lot10g3b3b/execution-contract.js` et n'est importé par aucun fichier produit.
