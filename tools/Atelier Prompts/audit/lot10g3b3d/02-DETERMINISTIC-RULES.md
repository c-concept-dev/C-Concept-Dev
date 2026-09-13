# Règles déterministes v1

| Verrou | Déclencheur structurel | Priorité |
|---|---|---|
| role | livrable explicite | useful |
| recipient | destinataire explicite | mandatory |
| data | faits matériau présents | mandatory |
| provenance | matériau/déductions/connaissance externe/fraîcheur | mandatory |
| scope | aucun déclencheur lexical ; signal générique si nécessaire | selon signal |
| plan | structure explicite | mandatory |
| format | format explicite | mandatory |
| volume | quantité explicite | mandatory |
| opening_closing | amorce ou clôture explicite | mandatory |
| forbidden | comportements interdits + demande exploitable | mandatory |
| assumptions | hypothèses/manques substituables | mandatory |
| length | politique de longueur explicite | mandatory |
| final_check | toute demande exploitable | mandatory |

Aucune règle n'utilise un domaine métier ou un mapping domaine → verrou.
