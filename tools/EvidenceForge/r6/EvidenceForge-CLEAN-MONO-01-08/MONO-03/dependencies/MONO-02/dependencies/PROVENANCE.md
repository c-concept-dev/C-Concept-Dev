# Provenance — MONO-01 (copie gelée)

Ce dossier est une **copie intégrale et bytewise** du paquet **MONO-01.x**
(révision post-audit incluant `EFOrchExecutionPort` avec durabilité
cross-process réelle — backend injecté explicitement, `resume()` réhydraté
depuis le backend durable, jamais une `Map` locale comme autorité — et
`EligibilityPanelPort.selectUsableRecords()`), manifeste 105/105, tests
159/159, jamais modifiée ici. MONO-02 la `require()` pour appeler les 16
ports MONO-01 — jamais pour en copier la logique, jamais pour la réécrire.

Vérification effectuée au moment de la copie :
`sha256sum -c manifest/SHA256SUMS` → **105/105 OK**, identique au manifeste
MONO-01.x d'origine.

`package/` (le ZIP livré) et `node_modules/` (absent, MONO-01 n'a aucune
dépendance npm externe) ont été omis de la copie — ils ne font pas partie
de la surface consommée par MONO-02.

MONO-02 accède aux ports via :
```js
const { createMono01 } = require("../dependencies/MONO-01/index.js");
```
