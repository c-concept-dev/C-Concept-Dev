# Reconstruction sûre d'une bibliothèque

Une reconstruction ne répare jamais une bibliothèque en place. Elle construit une candidate
neuve, mesurable et révocable à côté de son corpus d'entrée.

## Invariants

1. Le corpus et la destination sont deux dossiers distincts et non imbriqués.
2. La destination n'existe pas au démarrage. Aucun contenu antérieur n'est effacé ou réutilisé.
3. Si le corpus est lui-même une bibliothèque portant `base/actives.json`, sa base entière est
   copiée dans un dossier frère `*.photographie-source` avant la création de la destination.
4. Le montage écrit `base/reconstruction-en-attente.json`, puis
   `base/rapport-reconstruction.json`. Le rapport mesure le corpus, les sources copiées, les
   versions produites et les documents actifs.
5. Le montage ne modifie jamais les réglages de l'application et ne remplace aucune bibliothèque.
   L'ouverture ou l'activation de la candidate est un geste humain distinct, après comparaison du
   rapport et contrôle de l'interface.
6. Un diagnostic sur une bibliothèque active se fait sur sa photographie ou sur une copie. Un
   script de diagnostic n'a aucune raison d'effacer `base/`, `sources/`, `derives/`,
   `base/versions/` ou `base/actives.json`.

## Outil de reconstruction

```text
cargo run --release --example monter-un-eventail -- \
  <destination nouvelle> <description.json> <manieres.json> <corpus des familles>
```

L'outil refuse avant toute écriture :

- une destination existante ;
- le corpus lui-même comme destination ;
- une destination située dans le corpus, ou l'inverse ;
- une photographie préalable déjà présente, qui doit d'abord être examinée et rangée.

La présence du rapport ne vaut pas acceptation. Avant ouverture explicite de la candidate, il faut
comparer au minimum les nombres de fichiers du corpus, de sources copiées, de versions produites et
de documents actifs, puis vérifier dans l'application des pages réelles et les abstentions.
