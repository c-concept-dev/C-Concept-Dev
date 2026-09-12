# RAPPORT LOT 10G.3B.3C — ADN State Engine v1

## Objet

Transformer les cinq propriétés fondamentales de l'ADN Atelier en état runtime explicite, universel et testable, sans hardcoding métier et sans brancher encore la sélection adaptative des 13 verrous ni le nouveau routing.

## Implémentation

Création de `core/adn/adn-state.js` et `core/adn/index.js`.

Le moteur produit cinq blocs runtime :

- intentionalité : demande originale immuable, objectif/livrable seulement lorsqu'ils sont disponibles, contraintes explicites tracées ;
- exécutabilité : état, confiance, manques critiques, manques substituables et question hérités de l'autorité de décision ;
- discipline : activation automatique de l'exécution immédiate et de la technique 9 uniquement après exploitabilité ;
- complétude : obligations et quantités traçables ;
- conformité : contrat de sortie et contrôles disponibles.

Les cinq propriétés et les neuf techniques sont dérivées de l'état et ne constituent pas une seconde autorité éditable.

## Technique 9

Le lot corrige au niveau du nouveau moteur la lacune architecturale identifiée en 3A :

```text
exploitable
→ execute_now = true
→ comfort_questions_forbidden = true
→ final_injunction_active = true

clarification_necessaire
→ execute_now = false
→ final_injunction_active = false
```

Cette règle est validée comme invariant transversal dans `validateAdnState()`.

## Universalité

Le moteur ne contient aucune catégorie métier. Il ne sait pas ce qu'est un voyage, un CV, un ordinateur, un domaine médical ou juridique. Il manipule uniquement : intention, livrable, contrainte, fait, matériau, déduction, hypothèse, manque, obligation, quantité, format, structure, contrôle et route héritée.

Lorsqu'aucune interprétation sémantique fiable n'est fournie, l'intention reste `preserved_raw` au lieu d'être inventée.

## Compatibilité ExecutionContract v1

`adnStateToExecutionContractSnapshot()` projette ADN State vers le builder shadow de 3B sans nouvelle interprétation. Cela établit la chaîne :

```text
runtime existant
→ ADN State
→ snapshot canonique
→ ExecutionContract v1
```

La sélection des verrous reste extérieure à 3C et sera traitée en 3D.

## Sécurité / éthique

Les neuf invariants éthiques sont présents et non désactivables. La vue d'audit expurgée ne contient ni demande originale, ni faits, ni preuves.

## Frontière volontaire du lot

3C ne :

- modifie pas Decision Provider ;
- ne change pas le routing ;
- ne sélectionne pas encore les 13 verrous ;
- ne modifie pas Rapide, Architecte ou Atelier ;
- ne modifie pas ARCH_SYSTEM / ARCH_SCHEMA / FORMATS / VERROUS ;
- ne fait aucun appel réseau ;
- ne déploie rien.

Le prochain lot 3D pourra utiliser cet état comme autorité d'entrée pour la sélection adaptative des verrous.
