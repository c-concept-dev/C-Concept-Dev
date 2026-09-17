# manifest/SHA256SUMS — exclusions documentées

Copie d'exécution : `EvidenceForge-MONO-05-R3-TESTFIX-EXEC-MANIFESTFIX.zip`.

## Entrées retirées du périmètre `manifest/SHA256SUMS`

```
reports/screenshot-desktop.png
reports/screenshot-tablet.png
reports/screenshot-mobile.png
```

## Justification

`GENERATED_TEST_OUTPUT / NON_CANONICAL_SCREENSHOT`

Ces trois captures d'écran sont régénérées comme effet de bord des tests
responsive (`T05-31`, `T05-32`, `T05-33`, dans
`test/browser/test_t05_browser_core.js`) à chaque exécution de la suite. Elles
ne constituent ni du contenu source, ni un artefact contractuel, ni une
donnée figée — leur contenu binaire (rendu Chromium) varie légitimement d'une
exécution à l'autre sans qu'aucune régression ne soit en cause. Les inclure
dans le périmètre d'intégrité `manifest/SHA256SUMS` produit un faux FAIL
déterministe du gate d'intégrité à chaque exécution réelle de la suite de
tests, alors que la suite fonctionnelle est PASS (119/119, browser R3 5/5).

## Ce qui n'a PAS changé

- Les trois fichiers `reports/screenshot-*.png` restent physiquement présents
  dans le package, comme artefacts de sortie — ils ne sont retirés que du
  périmètre de vérification `manifest/SHA256SUMS`, jamais du contenu livré.
- Aucune autre entrée du manifest n'a été retirée, ajoutée, ni modifiée.
- Aucun fichier source (`app/`, `test/`, `contracts/`, `dependencies/`) n'a
  été touché par ce correctif.
- `lib/mono06-gate.js` et tout autre fichier MONO-06/MONO-07 n'ont pas été
  modifiés — aucune exception codée dans la logique du gate.

## Portée

Cette exclusion est locale à cette copie d'exécution MONO-05. Elle ne modifie
ni le ZIP canonique MONO-05-R3, ni aucun autre lot.
