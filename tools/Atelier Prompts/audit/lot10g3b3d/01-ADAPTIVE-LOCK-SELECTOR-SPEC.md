# LOT 10G.3B.3D — Adaptive Lock Selector v1

## Objectif

Sélectionner les treize verrous Atelier à partir des propriétés structurelles de l'ADN State et de signaux sémantiques génériques, sans domaine métier, sans modifier le routage ni les moteurs historiques.

## Règle d'architecture

```text
ADN State
  → règles déterministes universelles
  → signaux sémantiques génériques optionnels
  → sélection proportionnée des verrous
  → métadonnées raison/source/contrôles
  → projection ExecutionContract v1
```

Le sélecteur ne connaît aucun domaine. Il accepte uniquement les 13 IDs canoniques : `role`, `recipient`, `data`, `provenance`, `scope`, `plan`, `format`, `volume`, `opening_closing`, `forbidden`, `assumptions`, `length`, `final_check`.

## Déterminisme

Les activations déterministes reposent uniquement sur des états structurels déjà disponibles : livrable, destinataire, matériau, provenance, structure, format, quantité, bornes, interdits, hypothèses, longueur et exécutabilité.

`scope` reste volontairement pilotable par signal sémantique générique lorsqu'aucune donnée structurelle n'établit à elle seule un besoin de frontière.

## Proportionnalité

Une demande exploitable minimale active actuellement `forbidden` et `final_check`. Les autres verrous ne sont ajoutés que lorsqu'un besoin observable ou un signal générique le justifie.

## Technique 9

Le sélecteur ne redéfinit pas la technique 9. Il hérite de l'ADN State : les verrous de conduite d'exécution ne sont activés qu'après exploitabilité.
