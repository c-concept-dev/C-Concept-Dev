# MONO-10 v0.16 — registre des verdicts d'audit (v0.12 à v0.16)

Ce fichier est un **registre** : il consigne, lot par lot, ce que chaque audit
final indépendant a rendu, et ce que le lot suivant en a fait. Il ne porte
aucune mesure nouvelle — chaque chiffre renvoie au document qui le mesure. Son
nom contient volontairement des points (`AUDIT-VERDICTS.v0.12-v0.16.md`) : le
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
| v0.16 | *à rendre par l'audit final de v0.16* | — | — | — |

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
