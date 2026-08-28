# Contrat des signaux sémantiques

Les besoins non déterminables structurellement peuvent être fournis sous forme d'un signal générique :

```json
{
  "id": "scope",
  "needed": true,
  "reason": "Une frontière explicite du livrable est nécessaire.",
  "priority": "mandatory",
  "source": "runtime",
  "source_ids": ["REQ-001"],
  "associated_checks": []
}
```

Contraintes :
- `id` appartient obligatoirement aux 13 verrous canoniques ;
- aucune nouvelle catégorie n'est créée ;
- `needed=false` n'active rien ;
- la raison est auditée ;
- les signaux peuvent compléter une activation déterministe sans la dupliquer.
