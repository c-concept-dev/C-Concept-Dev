# Machine d'état conversationnelle cible

## États

- `clarification_required` : une information non substituable reste nécessaire ; route nulle.
- `execution_ready` : aucune clarification indispensable ne reste ; route Rapide ou Architecte.
- `blocked` : aucune question nouvelle utile ne permet de progresser ; route nulle.

## Transition universelle

```text
demande + réponses + matériau
          ↓
analyse sémantique
          ↓
nextConversationAction(...)
  ├─ clarification_required → une question → réponse → réanalyse
  ├─ blocked                → arrêt explicite
  └─ execution_ready        → routing → exécution
```

Le même historique et la même fonction sont utilisés, que le mode demandé soit Rapide ou Architecte. Le mode ne détermine jamais le nombre de questions.

## Anti-boucle

- aucune comparaison avec un compteur maximal ;
- comparaison sémantique légère avec les questions précédentes ;
- une reformulation répétée devient `blocked` ;
- « À vous de choisir » vaut délégation ;
- « Je ne sais pas » déclenche une réanalyse et interdit la répétition mécanique ;
- la panne provider produit un fallback proportionné, jamais une preuve de complexité.
