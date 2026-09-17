# Non-régression — MONO-10 v0.2

## F-09 — table de preuve, sans sur-affirmation

Aucune baseline cryptographique tierce n'existe : `RELEASE-MANIFEST.md` ne porte
aucune empreinte par fichier et le bundle n'est pas versionné. Cette table dit
**exactement** ce qui est prouvable et ce qui ne l'est pas.

| Lot | Référence autoritative | Type | Statut |
|---|---|---|---|
| MONO-01 | `MONO-02/dependencies/MONO-01` | copie imbriquée | CONFIRMED_UNCHANGED (65 fichiers, 0 divergence) |
| MONO-02 | `MONO-03/dependencies/MONO-02` | copie imbriquée | CONFIRMED_UNCHANGED (153 fichiers, 0 divergence) |
| MONO-03 | `MONO-04/dependencies/MONO-03` | copie imbriquée | CONFIRMED_UNCHANGED (190 fichiers, 0 divergence) |
| MONO-04 | aucune | — | REFERENCE_UNAVAILABLE |
| MONO-05 | aucune | — | REFERENCE_UNAVAILABLE |
| MONO-06 | aucune | — | REFERENCE_UNAVAILABLE |
| MONO-07 | aucune | — | REFERENCE_UNAVAILABLE |
| MONO-08 v0.6 | aucune | — | REFERENCE_UNAVAILABLE |
| MONO-08 v0.7 | `SHA256SUMS.txt` du lot | manifeste propre | CONFIRMED_UNCHANGED (0 ligne non-OK) |
| MONO-08 v0.8 | paquet `FAIR-LOG-CONTRACT-v1` | paquet livré | CONFIRMED_UNCHANGED (identique) |
| MONO-09 v0.1 | paquet `PROFESSIONAL-REAL-v0.1` | paquet livré | CONFIRMED_UNCHANGED (identique) |
| MONO-09 v0.2 | paquet `PROFESSIONAL-REAL-v0.2` | paquet livré | CONFIRMED_UNCHANGED (identique) |
| MONO-10 v0.1 | paquet `SCIENTIFIC-QUALIFICATION-v0.1` | paquet livré | CONFIRMED_UNCHANGED (identique) |

### Ce que cette table permet et ne permet pas d'affirmer

**`MONO10_CAUSED_REGRESSION = NO`** — prouvable. Les empreintes agrégées
(contenu + chemin relatif) de MONO-01→MONO-08 sont identiques à celles enregistrées
**avant** tout travail MONO-09/MONO-10 dans cette session :
```
MONO-01       db6bf1b45d2ac85de3d6d34dba7bc93ee61c9d9a8cddc57d7431b5fcc1f03597
MONO-02       7fcb0432f39b62f2e091a49b5fa86f5e8c6aabed5b1409f2e6fd71391e097935
MONO-03       bf7ae5f8cc4c60296fd865599920a56c40465cc3bbca31c2d18ada31b5adb387
MONO-04       d074b5277e020b282d85d9ea69f0d9b25501f28845823e9ed99cb320b34e3901
MONO-05       a98896ae3911f145cc5475a3a4de234b98f2fc7a5fc9357a0699cbebc9a7050f
MONO-06       2aa20db5dc6446af8e9dcdf92c037f583b6b29355046573da8c6c03471ac7450
MONO-07       cae33db34ade8ce479740f04a815d67484fd36cbe283b4085c423742a06b556d
MONO-08/v0.6  b6821e044d93add12cbc7d4a8533ad9aac2c1ea780ac7702fbb9adad3a845d56
MONO-08/v0.7  286b632f633d28586445e83221cf1ffda47b5fba7d0e74728d627fa324d822a6
MONO-08/v0.8  c67d93d437c1fd11527f8efa9d14f12dde8c5aaf6a76d3058a38f42cee7cf5b4
```

**`FULL_HISTORY_BYTE_IDENTITY_CONFIRMED = NO`** — non prouvable. Pour MONO-04,
MONO-05, MONO-06, MONO-07 et MONO-08 v0.6, aucune référence indépendante n'existe
dans ce dépôt. Une divergence antérieure à MONO-10 resterait invisible.

Une divergence qui précéderait MONO-10 **ne doit pas lui être attribuée** — mais
elle doit rester visible. C'est pourquoi ces cinq lots sont marqués
`REFERENCE_UNAVAILABLE` et non `CONFIRMED_UNCHANGED`.

### Levée du doute

Publier un manifeste d'empreintes par fichier pour MONO-04→MONO-08 v0.6, ou versionner
le bundle, rendrait `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` déterminable. Cette
décision appartient au propriétaire ; elle est hors périmètre de MONO-10.

## Artefacts réels du workspace (non touchés)
```
e183295b4b2caee14fc8c95af3ad0081dad449b242b623d2fb7e7ee71679e765  retrieval-snapshot-v08.json
9558e9502a101e1ff0055f9d001d11dc695b621a54d117f802b847aaf152a171  audit-decisions-v08-confirmed.json
```

NETWORK_CALLS = 0 · REAL_LLM_CALLS = 0 · REAL_EF02_RUNS = 0 · REAL_PROFESSIONAL_RUNS = 0 · DOWNSTREAM_REAL_RUNS = 0
