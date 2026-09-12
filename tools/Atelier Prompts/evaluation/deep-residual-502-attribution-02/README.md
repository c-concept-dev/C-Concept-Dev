# DEEP-RESIDUAL-502-ATTRIBUTION-02 — preuves

Deux campagnes, séparées par une mutation externe. Le rapport distingue les deux.

## EVIDENCE_PRE_MUTATION — sur `f220099`

| Fichier | Contenu |
| --- | --- |
| `a8f0131-audit.json` | Phase A — matrice des 25 fichiers, surface sémantique hachée aux deux révisions, gardes, clé, magasin durable |
| `correlation-runs.jsonl` · `correlation-proof.json` | Phase B — 3 tours contrôlés, jointure 1:1 |
| `campaign-runs.jsonl` · `campaign-correlation.json` · `attribution-campaign.json` | Phase C — 20 tours, 20/20 corrélés, 0 × 502 |

## FINAL_EVIDENCE_800BCB2 — sur `800bcb2`

| Fichier | Contenu |
| --- | --- |
| `800bcb2-delta-audit.json` | audit court du delta + 15 tests négatifs de `journal_complete` |
| `final-campaign-runs.jsonl` · `final-campaign-800bcb2.json` | 20 tours, 20/20 corrélés, **1 × 502 attribué** |

## Ce que ces preuves établissent, et ce qu'elles n'établissent pas

Le 502 est **attribué** : phase `critic`, `TypeError`, `untagged_exception`, empreinte sûre,
`journal_complete = true`. Il n'est **pas root-causé** : l'empreinte est un hachage, et 200 candidats
de message testés n'y correspondent pas.

`B01B_VIOLATION_COUNT = 0` est mesuré à l'aveugle depuis que le message brut a été remplacé par son
empreinte — voir `final-campaign-800bcb2.json`, section `limite_de_mesure_declaree`.

Aucun code de production modifié par ce lot. Métadonnées uniquement, aucun matériau brut, aucune
valeur de secret.
