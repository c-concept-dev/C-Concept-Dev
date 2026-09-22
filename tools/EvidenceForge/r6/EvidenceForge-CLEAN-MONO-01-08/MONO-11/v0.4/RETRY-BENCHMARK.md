# RETRY-BENCHMARK — MONO-11 v0.3 (hors ligne, aucun appel)

> Erratum v0.3-r1 (P2-04) : le décompte « 7 séquences multi-passes / 12 passes de reprise » de v0.3 était inexact ; les fixtures R1–R6 et les traces donnent **6 séquences / 9 passes de reprise** (R1 3 passes, R2 2, R3 3, R4 3, R5 2, R6 2). Les positions des fragments du cas R1 sont **101 / 211** (le second fragment commence par une espace) et **86** caractères sautés, non 101/212 et 88. v0.3-r1 ajoute au rejeu : 5 prompts ciblés construits, 0 collision, 5 contextes de réparation distincts (empreinte portée par chaque prompt).

Base : 189 revues historiques (H1 36, H1-monolithe-v1.0.1 45, P0.1 108), **6 séquences multi-passes (9 passes de reprise)**, 12 occurrences `TARGET_REF_NOT_LITERAL`, 3 `DOCUMENTED_WITHOUT_TWIN_REF`. Fixtures dans `benchmark/fixtures/` (R1–R6 multi-passes, S1–S5 réussites passe 1), résultats `benchmark/replay-results.json` (`node benchmark/replay.js`).

## Métriques

| Métrique | Valeur | Statut |
|---|---|---|
| Occurrences `TARGET_REF_NOT_LITERAL` rejouées | 12 | OBSERVED |
| Collages de fragments non contigus (`literalFragments` ≥ 2 fragments) | 12 / 12 (inventions : 0, troncatures : 0) | DETERMINISTICALLY_REPLAYABLE |
| Exact repeat detection rate | 5 / 5 répétitions historiques détectées (100 %) — R1 ×2, R3 ×2, R4 ×1 | DETERMINISTICALLY_REPLAYABLE |
| Historical wasted retry count (passes byte-identiques à la précédente) | 5 passes ; 22401 in / 17193 out tokens | OBSERVED |
| Troisièmes passes sans valeur (passe 3 refusée) | 3 passes (R1, R3, R4) ; 13022 in / 9917 out tokens | OBSERVED |
| Cas R1 (A5065832154) : 3 passes | 16691 in / 12117 out tokens, dont 2 passes recopiées (10 174 in / 8 078 out) | OBSERVED |
| Targeted-repair eligible rate | 5 / 5 séquences TARGET_REF (100 %) ; 0 / 1 pour l'autre code (R5, comportement v0.2) | DETERMINISTICALLY_REPLAYABLE |
| Corrections historiques acceptées par recomposition ciblée | 2 / 2 (R2, R6) | DETERMINISTICALLY_REPLAYABLE |
| False acceptance count | **0** | DETERMINISTICALLY_REPLAYABLE |
| Regression count | **0** | DETERMINISTICALLY_REPLAYABLE |
| Retries potentiellement évités (v0.3) | passes identiques à la précédente après changement de stratégie : interdites (0 appel) ; avec `maxPasses = 3`, v0.3 n'économise pas d'**appel** sur R1/R3/R4 (la passe 3 devient un changement de stratégie) mais en change la nature ; sur le chemin v0.2 des autres codes, une répétition exacte supprime la passe 3 | DETERMINISTICALLY_REPLAYABLE |
| Nombre maximal théorique d'appels économisés sur les runs historiques | 0 appel (maxPasses 3, toutes les séquences TARGET_REF ont une stratégie différente disponible) ; **tokens** : les passes ciblées remplacent une réponse complète (~4 000 tokens de sortie) par une réparation (~50–300 tokens) | PROJECTED |
| Probabilité de correction de R1 par v0.3 | non mesurable hors ligne (nouveau prompt ⇒ nouvelle génération) ; indice : le seul retry réussi sur cette faute (R2) a produit exactement les fragments que v0.3 propose | PROJECTED |

## Coût (tokens réels, `claude-opus-4-8`, tarif absent des artefacts — formule coût = in/1e6 × P_in + out/1e6 × P_out)
- Retries exacts inutiles (5 passes) : 22401 in / 17193 out.
- Troisièmes passes sans valeur (3) : 13022 in / 9917 out.
- R1 seul : 16691 in / 12117 out (dont 10 174 / 8 078 recopiés).
- Projection v0.3 par passe de reprise ciblée : entrée ≈ document + consigne + citations (≈ 1 000–2 000 tokens au lieu de ≈ 5 400), sortie ≈ 50–300 tokens (au lieu de ≈ 4 100) ⇒ **≈ −70 % entrée, ≈ −95 % sortie par reprise** ; nombre de reprises inchangé (≤ 2 par revue).

## Lecture
v0.3 n'augmente ni le nombre de passes ni la tolérance ; elle rend chaque reprise différente, plus courte et plus spécifique, interdit la répétition d'une stratégie qui vient de se répéter, et conserve le fail-closed. L'effet sur le taux de correction réel ne pourra être mesuré qu'en exécution réelle bornée (hors de ce chantier).
