# Mapping des treize verrous

Enum stable :

| ADN français | ID v1 |
|---|---|
| rôle | `role` |
| destinataire | `recipient` |
| données | `data` |
| provenance | `provenance` |
| périmètre | `scope` |
| plan/gabarit | `plan` |
| format | `format` |
| volume | `volume` |
| amorce/clôture | `opening_closing` |
| interdits | `forbidden` |
| hypothèses | `assumptions` |
| longueur | `length` |
| contrôle final | `final_check` |

Chaque verrou porte `reason`, `priority`, `source`, `source_ids`, `associated_checks` et `active`. L'enum ne contient aucun domaine, format métier, profil ou moteur. Le builder projette uniquement les états reçus ; il ne sélectionne ni n'active lui-même aucun verrou.
