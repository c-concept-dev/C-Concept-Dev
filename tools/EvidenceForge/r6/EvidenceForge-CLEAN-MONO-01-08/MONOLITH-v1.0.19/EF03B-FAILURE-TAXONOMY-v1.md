# EF-03B FAILURE TAXONOMY v1 — run `efm-20260918-a64167c0`

Une passe = une catégorie principale (première erreur ; `max_tokens` prime). « Récupérée à la passe suivante » = la passe suivante de la même revue a été VALID ; « terminale » = dernière passe de la revue, revue en ERROR.

| Cat. | Nom | Cas (passes) | USD | Passes concernées | Récupérées à la passe suivante | Terminales | Correction déterministe possible ? | Correction par prompt ? | Impact scientifique |
|---|---|---|---|---|---|---|---|---|---|
| A | MAX_TOKENS_TRUNCATED | 21 | 5.6768 | p1:11 p2:5 p3:5 | 0 | 5 | sauvetage STRUCTUREL des findings complets (framing JSON) + complétion des dimensions manquantes par le modèle ; max_tokens dimensionné au contrat | budget de sortie explicite (longueurs par champ, ≤ 3 citations courtes, aucune prose) | aucun (contenu manquant régénéré, findings complets conservés byte-identiques) |
| G | TARGET_REF_NOT_LITERAL | 18 | 4.0386 | p1:6 p2:9 p3:3 | 9 | 3 | NON (jamais réparer une citation) ; DÉTECTION déterministe du span exact (Markdown/espaces) proposé comme feedback | OUI : citer les octets bruts (marqueurs Markdown, puces, sauts de ligne inclus), une ligne, ≤ 200 caractères, jamais joindre des items | aucun : le validateur reste byte-exact ; seule la forme de la citation change |
| B | JSON_INCOMPLETE | 0 | 0 | — | — | — | — | — | non observé |
| C | SCHEMA_DRIFT | 0 | 0 | — | — | — | — | — | non observé |
| D | CARDINALITY | 0 | 0 | — | — | — | — | — | non observé |
| E | DIMENSION_MISSING | 0 | 0 | — | — | — | — | — | non observé |
| F | DIMENSION_DUPLICATE | 0 | 0 | — | — | — | — | — | non observé |
| H | PROVENANCE_INVALID | 0 | 0 | — | — | — | — | — | non observé |
| I | MISSING_KEY | 0 | 0 | — | — | — | — | — | non observé |
| J | ENUM_INVALID | 0 | 0 | — | — | — | — | — | non observé |
| K | EXCESSIVE_BUT_VALID | 0 | 0 | — | — | — | — | — | non observé |
| L | REPAIR_MISTARGETED | 0 | 0 | — | — | — | — | — | non observé |
| M | OTHER | 0 | 0 | — | — | — | — | — | non observé |

Sous-classes de G (citations rejetées, déterministe) : PARTIAL_LITERAL 41 · JOINED_LIST_ITEMS 87 · MARKDOWN_MARKERS_STRIPPED 37 · WHITESPACE_LINEBREAK_ONLY 6 · PARAPHRASE_OR_ABSENT 2
