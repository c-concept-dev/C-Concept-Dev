# Mapping runtime → ExecutionContract

| Source existante | Champ cible | Règle shadow | Recalcul sémantique |
|---|---|---|---|
| demande / `original_request` | `original_request`, repli `intent.objective` | copie intégrale | Non |
| Decision Provider `etat_demande` | `executability.state` | copie | Non |
| Decision Provider `confiance` | confiances | traduction haute/moyenne → high/medium | Non |
| Decision Provider `route` | `routing.engine` | copie exacte | Non |
| question indispensable | `critical_missing` | copie comme manque | Non |
| `comprehension.intention_principale` | `intent.objective` | priorité si disponible | Non |
| contraintes Architecte sourcées utilisateur | `explicit_constraints`, `obligations` | IDs `REQ-*` stables puis obligations `OBL-*` référant leur `constraint_id` | Non |
| déclarations Architecte | `evidence.*_facts` | mapping par statut existant | Non |
| déductions Architecte | `evidence.deductions` | conserve statut déduction | Non |
| hypothèses autorisées | `assumptions` | étiquette `assumption` | Non |
| manques Architecte | `critical_missing` | seulement `bloquant=true` | Non |
| `livrable` Architecte | intent/output/quantities | projection directe | Non |
| format Rapide | `output.format` | projection | Non |
| verrous actifs Rapide/Atelier | `locks` | renommage vers enum, raison, source, contrôles associés et état actif/inactif | Non |
| `contratDuPrompt` | `output`, `quantities`, `checks` | projection | Non |
| critères Architecte | `checks` | contrôles sémantiques | Non |
| contrat canonique validé | `buildExecutionContractAuditView()` | vue d'audit dérivée sans demande, preuve, hypothèse ni texte d'obligation | Non |

## Précédence

1. Donnée explicitement passée au snapshot shadow.
2. Analyse Architecte existante.
3. Contrat Rapide/Atelier existant.
4. Demande originale comme conservation minimale, jamais comme invention d'un détail absent.

Le builder ne lit pas le HTML, ne reproduit pas `detecterFormat`, n'analyse pas les mots de la demande et n'appelle pas le Decision Provider.
