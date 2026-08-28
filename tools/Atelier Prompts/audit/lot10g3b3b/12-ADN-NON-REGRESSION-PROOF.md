# Preuve ADN de non-régression — 27/27

## Méthode

Chaque élément constitutionnel est relié à une représentation du contrat, à sa source runtime et à une transformation shadow. « Perte 0 » signifie que la langue v1 peut conserver l'information disponible ; cela ne prétend pas corriger une lacune du runtime historique. « Comportement modifié : Non » signifie qu'aucun moteur, prompt, contrôle, route ou sortie utilisateur ne consomme le contrat.

## 5 propriétés fondamentales — 5/5

| Élément | Représentation ExecutionContract | Source runtime actuelle | Transformation | Perte | Comportement modifié |
|---|---|---|---|---:|---|
| P1 Intentionalité | `original_request`, `intent.*`, `adn_summary.intentionality` | demande conservée ; compréhension Architecte si disponible | copie et normalisation sans nouvelle interprétation | 0 | Non |
| P2 Exécutabilité | `executability.*`, `routing.*`, résumé | Decision Provider | traduction fermée haute/moyenne vers high/medium | 0 | Non |
| P3 Discipline | `execution_policy.*`, résumé | état d'exploitabilité + techniques historiques | dérivation booléenne, sans injection prompt | 0 | Non |
| P4 Complétude | `obligations`, `quantities`, résumé | contraintes, contrat de prompt, analyse Architecte | IDs et références génériques | 0 | Non |
| P5 Conformité | `output`, `checks`, résumé | `contratDuPrompt`, contrôles, critères Architecte | normalisation des contrôles existants | 0 | Non |

## 9 techniques historiques — 9/9

| Élément | Représentation ExecutionContract | Source runtime actuelle | Transformation | Perte | Comportement modifié |
|---|---|---|---|---:|---|
| T1 Contrat préalable | racine v1 + intent + obligations + checks | prompts/contrats actuels | langue commune shadow | 0 | Non |
| T2 Blocage des échappatoires | `evasion_blocked`, verrou `forbidden/scope/data` | interdits et périmètres actuels | booléen dérivé après exploitabilité | 0 | Non |
| T3 Questions inutiles interdites | `comfort_questions_forbidden`, manques | Decision Provider et clarification | état hérité, aucune question nouvelle | 0 | Non |
| T4 Format strict / bordures | `output`, verrous format/opening_closing, checks | FORMATS/contrat/Architecte | projection sans sélection | 0 | Non |
| T5 Démarrage forcé | `output.opening`, `execute_now` | amorce actuelle + exploitabilité | représentation seulement | 0 | Non |
| T6 Interdictions explicites | verrou `forbidden`, `meta_discussion_forbidden` | VERROUS/interdits Architecte | projection | 0 | Non |
| T7 Obligations absolues | `obligations[].mandatory` | contraintes explicites et critères | REQ → OBL, source conservée | 0 | Non |
| T8 Règles quantifiées | `quantities[]`, liens OBL et checks | quantité runtime/Architecte | cible, unité et bornes conservées | 0 | Non |
| T9 Injonction finale | `execute_now`, `final_injunction_active`, `evasion_blocked` | exploitabilité héritée + référentiel ADN | équivalence stricte, aucune injection moteur | 0 | Non |

## 13 verrous opérationnels — 13/13

| Élément | Représentation ExecutionContract | Source runtime actuelle | Transformation | Perte | Comportement modifié |
|---|---|---|---|---:|---|
| V1 Rôle | lock `role` | VERROUS / rôle adaptatif Architecte | enum exacte, raison/source/checks | 0 | Non |
| V2 Destinataire | lock `recipient` | champ/profil/réglage Architecte | renommage générique | 0 | Non |
| V3 Données | lock `data` | matériau et verrou données | projection | 0 | Non |
| V4 Provenance | lock `provenance` | provenance Atelier et preuves Architecte | projection | 0 | Non |
| V5 Périmètre | lock `scope` | verrou périmètre/composants | renommage générique | 0 | Non |
| V6 Plan / gabarit | lock `plan` | gabarit, structure et composants | renommage générique | 0 | Non |
| V7 Format | lock `format` | FORMATS / livrable Architecte | projection | 0 | Non |
| V8 Volume | lock `volume` | quantité/volume actuels | projection + références OBL/Q/check | 0 | Non |
| V9 Amorce / clôture | lock `opening_closing` | amorce, clôture, format | renommage générique | 0 | Non |
| V10 Interdits | lock `forbidden` | verrou interdits/hypothèses interdites | renommage générique | 0 | Non |
| V11 Hypothèses | lock `assumptions` | hypothèses/pilotage Architecte | projection sans transformer en fait | 0 | Non |
| V12 Longueur | lock `length` | politique de longueur/plafond | projection | 0 | Non |
| V13 Contrôle final | lock `final_check` | contrôle final et critères | projection + `associated_checks` | 0 | Non |

## Résultat constitutionnel

| Mesure | Résultat |
|---|---:|
| Propriétés représentées | 5/5 |
| Techniques représentées | 9/9 |
| Verrous représentés | 13/13 |
| **Total ADN** | **27/27** |
| Perte de représentation | **0** |
| Modification comportementale | **0** |
| Hardcoding métier | **0** |
| Moteur gelé modifié | **0** |

## Éthique et limites

Les neuf invariants éthiques sont des booléens obligatoires à `true`. Ils sont au-dessus des verrous et de la technique 9. La vue d'audit omet demande originale, texte des obligations, faits et hypothèses ; elle n'expose que provenance structurelle, raisons, routes, états, contrôles, résumé ADN et invariants.

