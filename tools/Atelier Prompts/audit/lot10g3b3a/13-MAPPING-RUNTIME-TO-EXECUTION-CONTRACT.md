# Mapping du runtime vers ExecutionContract v1

Ce document ne fige pas le schéma ; il qualifie la disponibilité des données pour le futur lot.

| Champ cible | Source runtime actuelle | Conversion | Disponibilité | Risque |
|---|---|---|---|---|
| `version` | aucune | constante future | Absente | migration/versioning |
| `request_id` | `exchangeId` Architecte seulement | ID commun dès l'entrée | Partielle | collisions entre routes |
| `intent.objective` | provider interne non exposé ; `intention_principale` Architecte | conserver une seule autorité | Partielle | double interprétation |
| `intent.deliverable` | format détecté / `livrable.nature` | normalisation neutre | Partielle | lexique vs sémantique |
| `intent.user_constraints` | demande brute / déclarations contraintes | obligations sourcées | Partielle | extraction absente en Rapide |
| `intent.recipient` | champ destinataire | projection directe | Présente si saisie | impact non évalué uniformément |
| `evidence.user_facts` | déclarations Architecte | projection | Architecte seulement | coût de l'analyse |
| `evidence.material_facts` | matériau + citations | projection | Architecte seulement | contenu non analysé par provider |
| `evidence.deductions` | fondements déduction | projection | Architecte seulement | mélange avec choix |
| `external_knowledge_needed` | évaluation Architecte | booléen | Présent Architecte | absent Rapide |
| `freshness_needed` | `actualite_requise` | booléen | Présent Architecte | absent Rapide |
| `executability.state` | Decision Provider | renommage | Présent | perdu après route |
| `executability.confidence` | Decision Provider | haute/moyenne | Présent | perdu après route |
| `critical_missing` | question provider / manques bloquants | consolider | Partiel | deux autorités |
| `substitutable_missing` | seulement raisonnement interne/pilotage | rendre explicite sans chaîne privée | Partiel | sur-questionnement |
| `assumptions` | verrou/hypothèses Architecte | normaliser et sourcer | Partiel | duplication |
| `obligations[]` | aucune liste canonique ; critères Architecte | IDs + source + vérifiabilité | Absente comme contrat | lacune majeure |
| `quantities[]` | détecteur + `livrable.quantites` | unité/bornes/source | Partielle | cohérence unité |
| `output` | `FORMATS`, réglages, `livrable` | projection commune | Présente mais divergente | format conflictuel |
| `locks[]` | liste d'actifs Rapide/Atelier | ajouter raison/priorité | Partielle | Architecte hors catalogue |
| `execution_policy` | techniques dispersées | invariants explicites | Absente | technique 9 |
| `checks[]` | `CONTROLES` + critères Architecte | typer et lier aux obligations | Partielle | post-exécution Architecte |
| `routing` | décision provider | projection directe | Présente | fallback prudent non proportionné |
| `ethics` | règles dispersées | invariants non désactivables | Absente comme objet | régression silencieuse |

## Ordre de construction recommandé pour 10G.3B.3B

1. Préserver demande, matériau, réponses et réglages sous un `request_id`.
2. Importer l'exécutabilité et le routing existants sans changer leur comportement.
3. Extraire intention, obligations et quantités avec provenance.
4. Résoudre les conflits entre réglage explicite, demande et inférence.
5. Sélectionner les verrous par propriétés avec raison.
6. Attacher techniques et éthique comme politiques non ambiguës.
7. Produire les projections moteurs en shadow mode avant toute substitution.

## Invariants de migration

- Demande originale immuable.
- Aucune information absente ne devient un fait.
- Toute contrainte explicite reste traçable.
- Contrat immuable après lancement, sauf nouvelle version/delta.
- Les moteurs gelés restent comparables à leur projection historique.

