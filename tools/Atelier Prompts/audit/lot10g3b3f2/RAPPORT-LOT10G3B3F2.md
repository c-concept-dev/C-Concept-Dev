# RAPPORT LOT 10G.3B.3F.2 — Dialogue adaptatif transversal

## Statut

**Implémentation et validation locale : PASS. Validation produit publiée : EN ATTENTE.**

## Cause racine

Le Decision Provider déclarait la demande exploitable dès qu'une réponse générale pouvait commencer. Cette décision choisissait la route et terminait la boucle avant que le Readiness Gate Architecte ne puisse intervenir. Architecte sélectionné directement contournait en outre le provider.

## Ancien flux

```text
provider → une clarification → exploitable → route Architecte
→ fichier/API Architecte → Readiness éventuel plus tard
```

## Nouveau flux

```text
provider ou Readiness
→ nextConversationAction
→ clarification unique → réponse → réanalyse, autant que nécessaire
→ execution_ready → route → exécution
```

## Garanties

- Rapide et Architecte utilisent la même boucle et le même historique.
- Aucun plafond de questions.
- Aucune question minimale.
- Aucune taxonomie métier.
- Répétition sémantique détectée.
- Stagnation explicite `blocked`.
- Panne provider distincte de la complexité.
- Audit dix champs sans contenu utilisateur brut.
- Aucun moteur gelé modifié.

## Validation

- 125/125 tests PASS.
- Garde PASS.
- Diff-check PASS.
- Deux dry-runs Cloudflare PASS.
- Recette publiée avant correction : FAIL reproduit et expliqué.
- Recette publiée après correction : à exécuter après déploiement/synchronisation.

Le lot ne doit être déclaré totalement clos qu'après vérification navigateur du cas Italie et d'un parcours Architecte multi-tour sur la version publiée.
