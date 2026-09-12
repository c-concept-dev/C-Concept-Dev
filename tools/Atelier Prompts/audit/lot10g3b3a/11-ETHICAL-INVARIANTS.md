# Invariants éthiques — état runtime

| Invariant | Preuves favorables | Lacune | Statut |
|---|---|---|---|
| Autonomie | intention non inventée dans Decision Provider ; préférences seulement confirmées ; décisions étiquetées | pas d'état commun prouvant la préservation de l'intention jusqu'au livrable | Partiel |
| Intégrité factuelle | statuts et citations Architecte ; matériau séparé des instructions | contrôle final du livrable absent | Fort en analyse, partiel en sortie |
| Non-invention critique | matériau requis absent → clarification ; manques bloquants Architecte | moteurs aval ne consomment pas un même registre des manques | Partiel |
| Proportionnalité | route rapide/architecte, profondeur, densité | fallback prudent et schéma Architecte surdimensionnent S07–S09 | En défaut observé |
| Transparence fonctionnelle | raisons canoniques de route ; justifications des composants | pas de raison par verrou ni trace utilisateur canonique | Partiel |
| Sécurité et légalité | le prompt ADN précise que l'anti-procrastination ne contourne pas les garde-fous ; confirmations données sensibles | invariant non représenté dans un contrat non désactivable | Partiel |
| Respect matériau/droits | séparation du matériau, provenance, périmètre et droits dans Atelier | politiques dispersées et parfois hardcodées | Partiel |
| Réversibilité | moteurs gelés, garde par hashes, corrections manuelles, comparaisons qualité | pas de version d'état/contrat au runtime | Fort côté développement, faible runtime |
| Efficacité humaine | question unique, dédoublonnage, max 3 tours | fallback et double analyse ajoutent forte latence/charge | En défaut observé |

## Invariants techniques déjà non contournables

- Entrée provider fermée à trois champs ; aucun prompt/modèle ne vient du navigateur.
- CORS fermé, tailles bornées, réponses `no-store`.
- Décision fermée à cinq champs et cohérence validée côté Worker puis navigateur.
- Une décision valide du primaire, y compris Architecte ou clarification, ne déclenche jamais le fallback.
- Une citation revendiquée comme utilisateur/matériau doit être retrouvée dans la source Architecte.
- Une préférence n'est mémorisée qu'après confirmation explicite.

## Invariants encore documentaires

- Les neuf valeurs éthiques ne forment pas un objet runtime versionné.
- La sécurité n'est pas explicitement prioritaire sur la discipline dans les projections de chaque moteur.
- La proportionnalité et l'efficacité n'ont ni seuil ni contrôle bloquant.
- La préservation des droits et de l'autonomie n'est pas vérifiée post-exécution.

## Verdict

Les garde-fous sont substantiels, mais répartis. Ils doivent devenir des invariants de contrat indépendants des verrous adaptatifs : un verrou peut être désactivé, un invariant éthique non.

