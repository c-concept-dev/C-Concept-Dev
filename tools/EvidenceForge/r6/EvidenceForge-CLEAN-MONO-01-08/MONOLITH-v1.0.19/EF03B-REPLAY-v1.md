# EF-03B REPLAY v1 (hors ligne) — run `efm-20260918-a64167c0`

0 appel fournisseur. Trois niveaux de preuve distingués.

## OLD (mesuré)

| attendues | VALID | ERROR | coût EF-03B tentative finale | coût EF-03B toutes tentatives | appels réels (tentative finale) |
|---|---|---|---|---|---|
| 18 | 10 | 8 | 11.2744 USD | 20.9451 USD | 49 |

## ACTUALLY_PROVEN (démontré hors ligne, déterministe)

- 10 revues VALID réutilisées à coût 0 au replay (registre : cle = sha256 du prompt EF-03B de passe 1 (jumeau + preuves + document + schema) + sceau + contrat ; candidat accepte re-valide par le validateur gele et le parseur EF-03B gele (T-EF03B-11)).
- 2 revue(s) en ERROR dont un candidat VALID d'une tentative précédente est **re-validé aujourd'hui** par le validateur gelé ET le parseur EF-03B gelé (0 appel) : https://openalex.org/A5015262154 (t7 p2), https://openalex.org/A5076883985 (t7 p2)
- 2 revue(s) en ERROR avec un candidat VALID historique **non réutilisable** (preuves du jumeau changées entre tentatives) : https://openalex.org/A5031631835, https://openalex.org/A5084194176
- sorties tronquées : findings complets par sortie = 9, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 8, 9, 9, 9, 9, 9, 9, 8, 9, 9 (sur 10).
- citations rejetées : correspondance exacte déterministe (Markdown / espaces / items joints) : {"PARTIAL_LITERAL":41,"JOINED_LIST_ITEMS":87,"MARKDOWN_MARKERS_STRIPPED":37,"WHITESPACE_LINEBREAK_ONLY":6,"PARAPHRASE_OR_ABSENT":2}.

## SIMULATED (unités mesurées, mécanisme v1.0.10)

| candidates au replay | famille troncature | famille littéralité | appels estimés | coût estimé | coût OLD des mêmes revues | régénérations complètes évitées |
|---|---|---|---|---|---|---|
| 6 | 3 | 3 | 6–18 | 1.5888–2.5914 USD | 4.4923 USD | 16 |

Unités mesurées : passe 1 complète 0.2648 USD ; complétion / réparation ciblée 0.1491 USD ; littéralisation sur extraits ≈ 0.018 USD ; régénération complète 0.2669 USD. estimation par unites MESUREES (passe 1, reparation ciblee) ; le taux de reussite des 8 revues n'est PAS invente : EXPECTED_NOT_YET_PROVEN

## EXPECTED_NOT_YET_PROVEN

- revues nécessitant des appels réels : https://openalex.org/A5031631835, https://openalex.org/A5034919242, https://openalex.org/A5084194176, https://openalex.org/A5067779338, https://openalex.org/A5081732198, https://openalex.org/A5072236225
- récupération théorique : troncature : 8 a 9 findings sur 10 deja complets dans chaque sortie tronquee (completion de 1 a 2 dimensions) ; litteralite : 75.1445 % des citations rejetees ont une correspondance exacte deterministe dans le document
- un run réel autorisé (après audit indépendant) reste requis pour prouver la réussite de ces revues.
