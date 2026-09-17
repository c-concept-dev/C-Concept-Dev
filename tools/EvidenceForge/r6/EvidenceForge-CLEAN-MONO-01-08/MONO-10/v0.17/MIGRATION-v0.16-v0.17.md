# MONO-10 — migration v0.16 → v0.17

MONO-10 v0.16 est **HISTORIQUE / IMMUTABLE**. v0.17 est un successeur
**strictement documentaire**, comme chacun des lots depuis v0.12.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11 à v0.16 n'a rien
> à modifier.

## 0. Pourquoi ce lot existe

L'audit final indépendant de v0.16 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** : runtime byte-identique à v0.11–v0.15, delta strictement
documentaire, 25 détecteurs sur 25 causaux, 11 formes post-verbales sur 11,
sceaux et fenêtre reproduits. Restaient trois résidus documentaires :

- **B1 / B3** — `HISTORICAL-INPUT-AUTHORITY.md` et `LINEAGE.md` sont titrés
  « MONO-10 v0.7 » et étaient déclarés d'origine v0.7 ; mais leur contenu
  courant n'apparaît qu'en **v0.10** (byte-identique de v0.10 à v0.16). Le
  défaut de méthode : `RT-08` comparait à v0.11 au lieu du lot nommé, et
  `DOC-24` croyait le H1 ;
- **B2** — `MIGRATION-v0.13-v0.14.md` disait « `NOT_FIXED_IN_V015` depuis » :
  un ancien token présenté comme courant, que `DOC-19` tolérait dès qu'une
  mention « à l'époque » figurait dans le bloc.

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

## 1. B1 / B3 — origine de contenu : mesurée sur les seize lots

| Document | Mesure (premier lot scellé où le contenu courant apparaît à l'identique) | H1 |
|---|---|---|
| `HISTORICAL-INPUT-AUTHORITY.md` | **v0.10** — existe depuis v0.7, réécrit en v0.10, inchangé depuis | v0.7 |
| `LINEAGE.md` | **v0.10** — existe depuis v0.1, modifié jusqu'en v0.7 puis en v0.10, inchangé depuis | v0.7 |
| `CONTRACT-GUARD.md`, `HUMAN-ACT-AUTHENTICATION.md`, `KEY-MANAGEMENT.md`, `RUN-ORDER.md`, `UPSTREAM-EVIDENCE-BINDING.md` | v0.7 | v0.7 |
| `ARCHITECTURE.md`, `CONTRACT-MAPPING.md` | v0.11 | v0.11 |

Décision : les deux documents ne sont **pas réécrits** — les retitrer aurait
fait de v0.17 l'origine de leur contenu et effacé la mesure. Leur H1 « v0.7 »
est déclaré pour ce qu'il est, un **ancêtre conceptuel**, distinct de
l'**origine de contenu** v0.10 :

| | |
|---|---|
| `MANIFEST.originTitledDocuments[f]` | `h1Version`, `conceptualOriginVersion` (== H1), `currentContentOriginVersion` (premier lot identique), `originPath`, `currentSha256`, `originSha256`, `byteIdentical`, `note` quand les deux origines diffèrent — **calculés par le constructeur** sur les lots scellés, jamais recopiés du H1 |
| `DOC-24` | pour chaque entrée : empreintes égales, `byteIdentical = YES`, H1 == origine conceptuelle, note explicite si origine conceptuelle ≠ origine de contenu ; lots joignables : byte-identité avec **le lot nommé** (`currentContentOriginVersion/originPath`) et re-mesure du **premier** lot identique ; v0.11 n'est jamais un substitut. Tout autre H1 non courant est périmé |
| `RT-08` | byte-identité de chaque document à titre d'origine avec le lot **nommé** par son entrée |
| Témoins | **A** : `HISTORICAL-INPUT-AUTHORITY.md` déclaré contenu v0.7 (byte-identique à v0.10) → `FAIL` ; **B** : `LINEAGE.md` sans distinction (conceptuel = contenu = v0.7, note retirée) → `FAIL` ; note seule retirée → `FAIL` ; **D** : `originSha256` altéré → `FAIL` ; `ARCHITECTURE.md` déclaré v0.10 (lot différent) → `FAIL` ; déclaré v0.12 (identique mais pas le premier) → `FAIL` ; H1 d'`ARCHITECTURE.md` mis à v0.7 → `FAIL` ; H1 de `README.md` ramené à v0.16 → `FAIL`. **C** (cas livré) : conceptuel v0.7 + contenu v0.10, documenté → `PASS_CLEAN` |

Les témoins qui exigent les lots historiques sont marqués `needsLots` : sur
une extraction isolée du zip ils sont **SKIP**, explicitement, jamais `PASS`.

## 2. Historique de chaque document : mesuré (`DOC-27`)

Les parenthèses « (contenu de vX, corrigé en vY) » que v0.14 à v0.16 écrivaient
à la main dans les H1 étaient fausses pour `TRUST-MODEL.md` et
`ARTIFACT-REGISTRY-TRUST.md` (modifiés aussi en v0.13 — en fait à chaque lot).
Elles sont retirées de tous les H1. `MANIFEST.documentHistory[f]` =
`{ firstAppearedIn, changedIn[] }` est mesuré par le constructeur sur les lots
scellés pour **chaque** `.md`, re-mesuré par `DOC-27`, et rendu lisible dans
`NON-REGRESSION.md` §8. Témoins : v0.13 retiré de l'historique de
`TRUST-MODEL.md` → `FAIL` ; une parenthèse réintroduite dans un H1 → `FAIL`.

## 3. B2 — statut périmé : « à l'époque de v0.NN »

`MIGRATION-v0.13-v0.14.md`, `MIGRATION-v0.14-v0.15.md` et
`MIGRATION-v0.15-v0.16.md` disent désormais « à l'époque de v0.NN :
`NOT_FIXED_IN_V0NN` ; le statut courant est dans `OPEN-FINDINGS.md` ». Aucune
valeur passée au présent, aucun « depuis ».

`DOC-19` : un ancien token n'est toléré que dans une phrase « à l'époque de
v0.NN » nommant le **même** NN, ou cité ; « `NOT_FIXED_IN_V0NN` depuis » est
une fausseté quel que soit le contexte. Témoins : `NOT_FIXED_IN_V015` dans
`OPEN-FINDINGS.md` → `FAIL` ; phrase « Les réserves sont `NOT_FIXED_IN_V015`. »
dans `README.md` → `FAIL` ; « à l'époque de v0.16 : `NOT_FIXED_IN_V016` »
ramené à « `NOT_FIXED_IN_V016` depuis » → `FAIL` ; « à l'époque de v0.14 »
recadré sur v0.15 → `FAIL` ; `NOT_FIXED_IN_V017` → `PASS`.

## 4. Lacunes non bloquantes fermées

| Détecteur | Lacune | Fermeture | Témoins |
|---|---|---|---|
| `DOC-22` | un heading faux était masqué par une colonne « Statut en v0.NN » juste | borne du heading et borne de la colonne vérifiées **séparément** | heading §11 ramené à « v0.14 et v0.15 » (colonne juste) → `FAIL` ; colonne ramenée à v0.15 → `FAIL` ; ligne v0.15 recollée sous §10 → `FAIL` |
| `DOC-25` | satisfait tant que chaque mot figurait quelque part dans la section | les énumérations `SUBJECT_FIELDS` et `REQUIRED` sont lues comme des **listes** et comparées **exactement** au code ; « plus `executionMode` » exigé après l'énumération | `artifactHash` retiré de l'énumération (mot conservé ailleurs) → `FAIL` ; « plus `executionMode` » retiré → `FAIL` ; idem dans R1 |
| `DOC-06` | « imputables » suffisait | la non-imputabilité est une **négation** (« ne sont imputables ni à v0.11… », « non imputables ») ; « sont imputables à v0.11 » est refusé | phrase inversée, mot-clé conservé → `FAIL` |
| H1 | « corrigé en v0.14 » faux pour deux documents | parenthèses retirées, historique mesuré (§2) | — |

## 5. Règle des témoins causaux

Inchangée : `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT` (une faute, un document,
un seul fichier changé), `PASS_AFTER_REVERT`, sur le document réel, en mémoire,
sans écriture. Vingt-six détecteurs (DOC-01 à DOC-25, DOC-27), `DOCUMENTARY_CHECKS_CAUGHT =
DOCUMENTARY_CHECKS_TOTAL`.

## 6. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11, v0.12, v0.13, v0.14, v0.15 **et**
v0.16. `tools/seal-inventory.js` est identique à v0.12 et à tous les lots
depuis. La commande et son résultat attendu sont dans `NON-REGRESSION.md` §1,
rejoués par `DOC-13`.

Delta v0.16 → v0.17, classé :

| Classe | Fichiers |
|---|---|
| `DOCUMENTATION` | `README.md`, `governance/README.md`, `OPEN-FINDINGS.md`, `THREAT-MODEL.md`, `AUDIT-REMEDIATION-MATRIX.md`, `LLM-CAPABILITY-BOUNDARY.md`, `TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md`, `READINESS.md`, `CAPABILITY-AUTHORITIES.md`, `REPLAY-PROTECTION.md` (H1 sans parenthèse), `MIGRATION-v0.13-v0.14.md`, `MIGRATION-v0.14-v0.15.md`, `MIGRATION-v0.15-v0.16.md` (statut recadré), `MIGRATION-v0.16-v0.17.md` (nouveau), `AUDIT-VERDICTS.v0.12-v0.17.md` (renommé depuis `AUDIT-VERDICTS.v0.12-v0.16.md`, ligne v0.16 ajoutée) |
| `NON_REGRESSION` | `NON-REGRESSION.md` |
| `MANIFEST` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `DOCUMENTARY_TEST` | `test/test-mono10-v0.17-documentary.js` (remplace `test/test-mono10-v0.16-documentary.js`) |
| `READ_ONLY_AUDIT_TOOL` | aucun ajout ; `tools/seal-inventory.js` inchangé |
| `RUNTIME` / `TEST_RUNTIME` / `OTHER` | **0** |

`HISTORICAL-INPUT-AUTHORITY.md` et `LINEAGE.md` ne changent pas d'un octet.

## 7. Ce que v0.17 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 (`NOT_FIXED_IN_V017`, statut courant de ce lot) ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API, n'implémente pas P0.2 ;
- il ne réécrit aucun lot historique, v0.16 compris ;
- il ne lance aucun run réel : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0` ;
- il ne déclare pas v0.17 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
