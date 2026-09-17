# MONO-10 v0.19 — registre des verdicts d'audit (v0.12 à v0.19)

Ce fichier est un **registre** : il consigne, lot par lot, ce que chaque audit
final indépendant a rendu, et ce que le lot suivant en a fait. Il ne porte
aucune mesure nouvelle — chaque chiffre renvoie au document qui le mesure. Son
nom contient volontairement des points (`AUDIT-VERDICTS.v0.12-v0.19.md`) : le
balayage documentaire doit atteindre un fichier racine à nom pointé (`SCAN-04`),
et un chiffre de cadre injecté ici sans son cadre est un témoin de `DOC-05`.

## Verdicts, dans l'ordre

| Lot audité | Verdict | Bloqueurs runtime | Bloqueurs documentaires | Réponse |
|---|---|---|---|---|
| v0.11 | `NON_GELABLE` (audits A et B) | 0 | affirmations fausses ; mesures de sceaux fausses (4 chiffres) | v0.12, strictement documentaire |
| v0.12 | `NON_GELABLE` | 0 | 2 affirmations résiduelles (B1, B2 de v0.12) + 5 glissements | v0.13 |
| v0.13 | `NON_GELABLE` | 0 | 8 affirmations fausses (KF-1 à KF-8) + 4 détecteurs insuffisants (F1 à F4) | v0.14 |
| v0.14 | `NON_GELABLE` | 0 | R4 sans cadre ; fenêtre de construction saisie ; lacunes de détecteurs | v0.15 |
| v0.15 | `NON_GELABLE` | 0 | `DOC-03` aveugle au quantificateur post-verbal ; heading/colonne périmés dans la matrice | v0.16 |
| v0.16 | `NON_GELABLE` | 0 | deux titres d'origine faux (contenu de v0.10 sous un H1 v0.7, `RT-08` ne comparant qu'à v0.11) ; un statut périmé (le token `NOT_FIXED_IN_V015` suivi du mot « depuis ») | v0.17 |
| v0.17 | `NON_GELABLE` | 0 | `DOC-19` non causal contre la faute réelle de v0.16 réinjectée verbatim (« à l'époque » blanchissait avant le couplage de version et « depuis ») ; quatre claims fausses sur son comportement | v0.18 |
| v0.18 | `NON_GELABLE` | 0 | `DOC-19` avant-token 26/32 (`\b` et Unicode, « depuis » manquant) ; claim correspondante ; clé `fixLocation` inexistante ; « 94 témoins » saisi ; `documentHistoryNote` périmée | v0.19 |
| v0.19 | *à rendre par l'audit final de v0.19* | — | — | — |

## Ce que chaque lot documentaire a en commun

- runtime byte-identique à v0.11 (`NON-REGRESSION.md` §1, rejoué) ;
- aucune réserve R1 à R5 fermée (`OPEN-FINDINGS.md`) ;
- aucun run réel, aucun appel réseau ;
- les neuf divergences de `MONO-07` et `MONO-08/v0.6`, antérieures à v0.11,
  intactes et documentées (`OPEN-FINDINGS.md` R4, cadre nommé).

## Ce que la séquence a appris aux détecteurs

| Version | Leçon inscrite dans le test documentaire |
|---|---|
| v0.13 | balayage récursif ; témoins par mutation du document réel, pas par extrait |
| v0.14 | portée à la **phrase** ; `.json` balayés ; nombres **dérivés** (hypothèses, champs) ; commandes imprimées **rejouées** ; structure markdown |
| v0.15 | chiffres de cadre refusés sans cadre ; fenêtre de construction dérivée ; structure **déclarée** ; flexions ; quantificateurs |
| v0.16 | quantificateur **post-verbal** ; registre multi-versions borné par ses headings ; statut de **chaque** réserve ; chiffre cadré mais faux ; titres de version ; sujet de décision dérivé du code |
| v0.17 | provenance **mesurée** contre le lot nommé (origine conceptuelle ≠ origine de contenu) ; historique de chaque document mesuré ; bornes de heading et de colonne indépendantes ; énumérations comparées comme ensembles ; négation lue comme négation |
| v0.18 | un détecteur se valide contre la **faute réelle réinjectée verbatim** ; ordre des contrôles : continuité → couplage de version → citation, jamais l'inverse ; « à l'époque » n'est pas une exemption ; contrôles `PASS` explicites à côté des témoins `FAIL` |
| v0.19 | un motif se teste sur **chaque** forme qu'il promet, des deux côtés, avec des frontières Unicode ; les nombres du `MANIFEST` sont **dérivés du run**, jamais saisis ; toute clé citée existe |
