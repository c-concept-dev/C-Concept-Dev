# Cause racine

## Verdict

Le défaut n'est pas l'absence de 3F.1. Il vient de deux autorités conversationnelles successives et non coordonnées.

```text
Decision Provider
→ exploitable
→ route choisie
→ sortie immédiate de la boucle initiale
→ Architecte
→ Readiness Gate seulement après une analyse LLM externe
```

Le prompt provider définissait « exploitable » comme « pouvoir commencer utilement » et ordonnait d'arrêter immédiatement les questions dès qu'une réponse générale devenait possible. Cette règle contredisait la distinction 3F.1 entre contractualisable et `EXECUTION_READY`.

## Réponses aux questions techniques

1. La première question était décidée par le Decision Provider.
2. Le Readiness Gate pouvait décider des questions suivantes, mais seulement après une analyse Architecte ; deux couches concurrentes existaient donc.
3. Rapide quittait le dialogue parce que la seconde décision provider était valide, exploitable et Architecte.
4. Architecte ne reprenait pas naturellement avant son aller-retour API ou fichier.
5. `assessAnalysisReadiness()` n'était pas appelé avant la création du fichier dans le chemin reproduit.
6. Lorsqu'il est appelé, il reçoit l'analyse Architecte et les questions déjà stockées dans `state.answers`.
7. Le provider rendait déjà `exploitable`; la tendance éventuelle d'Architecte à rendre `continuer` intervient à une étape ultérieure.
8. ARCH_SYSTEM favorise historiquement `continuer` dès qu'un livrable globalement utile est possible.
9. Le bloc Readiness est ajouté après ARCH_SYSTEM, mais son effet pratique dépend encore de la réponse Architecte.
10. Oui : `provider => exploitable => route => fin du dialogue provider`.
11. Le passage ne perd pas `state.answers`; le JSON le prouve. En revanche, l'enveloppe et le readiness ne pilotaient plus le dialogue initial.
12. L'UI sait afficher une question Architecte via `showQuestion()`, mais seulement après réception de l'analyse.
13. API et copier/coller appliquent le même Readiness après analyse, avec des transports différents. Aucun des deux ne corrigeait l'arrêt préalable du provider.

## Décision architecturale

La correction reste extérieure aux moteurs : une autorité unique traduit désormais les décisions du provider et du Readiness Gate vers `clarification_required`, `execution_ready` ou `blocked`.
