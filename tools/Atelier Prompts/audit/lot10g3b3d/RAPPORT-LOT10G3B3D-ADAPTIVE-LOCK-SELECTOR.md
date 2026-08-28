# RAPPORT LOT 10G.3B.3D — Adaptive Lock Selector v1

## Verdict

**PASS**

## Résultat

Création du premier sélecteur universel des 13 verrous Atelier dans `core/adn/adaptive-lock-selector.js`.

Le sélecteur travaille à partir d'`ADN State` et ne dépend d'aucun domaine métier. Il combine :

1. des activations déterministes fondées sur des propriétés structurelles ;
2. une interface de signaux sémantiques génériques pour les besoins qui ne peuvent pas être déduits honnêtement de la structure seule ;
3. une justification et une traçabilité de chaque verrou ;
4. une vue des 13 décisions permettant d'auditer aussi les verrous non sélectionnés.

## Proportionnalité

Le système n'active pas les 13 verrous par défaut. Une demande exploitable minimale de test active seulement `forbidden` et `final_check`. Un état riche peut atteindre 13/13 si chaque verrou possède un besoin réel.

## Universalité

Aucune règle `voyage`, `CV`, `ordinateur`, `médical`, etc. n'existe. Un identifiant métier inventé est explicitement rejeté.

## ExecutionContract

La sélection peut être projetée sans perte vers `ExecutionContract v1`. Le lot ne branche pas encore cette sélection dans Rapide ou Architecte ; cette intégration reste réservée aux adapters ultérieurs.

## Frontière volontaire

3D ne modifie pas :
- Decision Provider ;
- routage ;
- Rapide ;
- Architecte ;
- Atelier ;
- FORMATS ;
- VERROUS historiques ;
- ARCH_SYSTEM ;
- ARCH_SCHEMA ;
- HTML produit.

## Validation

- `npm test` : **65/65 PASS**
- `npm run guard` : **PASS**
- hashes gelés : **inchangés**

## Suite

LOT 10G.3B.3E peut maintenant utiliser `ADN State + ExecutionContract + Adaptive Lock Selector` pour construire un Routing Engine fondé sur le besoin réel de préparation, avant les adapters moteurs.
