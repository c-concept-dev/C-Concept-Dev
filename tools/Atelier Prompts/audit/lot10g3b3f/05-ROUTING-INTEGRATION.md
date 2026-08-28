# Intégration du Routing Engine

Le Decision Provider continue à recevoir exactement son entrée minimale.

Après sa réponse, `adpDecideRapide()` construit désormais une enveloppe ADN et utilise `envelope.routing.route` quand le runtime est disponible.

Conséquence :

```text
source = local-prudent
≠
route = Architecte automatique
```

En cas de double panne provider, le Routing Engine applique son fallback structurel. Sans preuve positive de préparation, la route est Rapide.

## Limite connue

3F n'ajoute aucun nouvel appel LLM ni aucun classifieur local de complexité. En cas de panne totale des providers, le produit ne dispose donc pas encore de signaux sémantiques de préparation supplémentaires. Une demande complexe lancée depuis le parcours Rapide peut alors rester en Rapide ; l'utilisateur peut toujours choisir Architecte explicitement.

Cette limite est volontaire : introduire une heuristique lexicale métier aurait violé l'universalité et l'anti-hardcoding.
