# Politique de fallback proportionnée

Anomalie 3A : S07, S08 et S09 ont été sur-routés vers Architecte après double échec provider, uniquement parce que `local-prudent` signifiait historiquement `architecte`.

3E sépare désormais deux faits :

```text
provider indisponible ≠ demande complexe
```

Politique du nouveau Routing Engine :
- provider disponible + décision valide : décision conservée ;
- provider indisponible + préparation prouvée : Architecte ;
- provider indisponible + aucune préparation prouvée : Rapide ;
- demande non exploitable : aucune route.

Cette logique n'est pas encore injectée dans le HTML produit ; elle sera branchée via les adapters.
