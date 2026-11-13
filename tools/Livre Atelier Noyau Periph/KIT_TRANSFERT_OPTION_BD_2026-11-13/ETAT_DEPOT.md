# État du dépôt au 13 novembre 2026

Chemin :

`/Users/christophebonnet/Documents/GitHub/C-Concept-Dev/tools/Livre Atelier Noyau Periph`

État observé avant création du kit :

```text
branche : main
suivi : origin/main
avance locale : 1 commit
remote : https://github.com/c-concept-dev/C-Concept-Dev.git
élément non suivi hors périmètre : tools/lienotheque/.claude/
```

Règles :

- aucun push sans demande explicite de Christophe ;
- préserver l’élément non suivi hors périmètre ;
- ne pas réécrire l’historique ;
- inspecter le statut avant toute branche ou commit ;
- commits locaux limités aux fichiers de l’option BD.

## Référence de test existante

Le fichier `integration.js` est actuellement placé à la racine de l’outil, mais
ses imports relatifs correspondent à une exécution depuis un sous-dossier
`tests/`. Il ne faut pas corriger ce défaut historique dans le lot BD sans
autorisation explicite.

La référence a été vérifiée sans modifier le dépôt, dans une arborescence
temporaire reproduisant l’emplacement attendu :

```sh
repertoire_test="$(mktemp -d '/Volumes/Macbook Pro/ldv-bd-integration.XXXXXX')"
mkdir "$repertoire_test/tests"
cp integration.js "$repertoire_test/tests/integration.js"
cp atelier-auteur-core.js "$repertoire_test/atelier-auteur-core.js"
cp atelier-editeur-core.js "$repertoire_test/atelier-editeur-core.js"
node "$repertoire_test/tests/integration.js"
```

Résultat de départ observé le 13 novembre 2026 : **76 tests réussis sur 76**.

Cette vérification prouve la non-régression des noyaux dans l’environnement
Node. Elle ne remplace pas la future recette visuelle du pilote BD dans un
navigateur.

