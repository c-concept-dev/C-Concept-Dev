# MONO-10 v0.9 — matrice de remédiation

## 1. Reproduction avant correction (§2)

Chaque résidu confirmé par l'audit A clean-room de v0.8 a été **reproduit sur le
lot historique v0.8, chargé en lecture seule**, dans un run légitime.

| Résidu | Reproduction sur v0.8 | Fermeture v0.9 |
|---|---|---|
| **R1** identité de frontière déclarative | REPRODUIT — deux configurations déclarant `operatorTrustBoundaryId = "MEME-ID"`, `configBindingHash` différents ; l'autorité de A acceptée sous l'identité de B, capacité émise sur le run de B pour une racine que B ignore (`UNRESOLVED`) | identité **composite** comparée par chaque consommateur ; `configBindingHash` obligatoire à l'émission ; engagé par le manifeste |
| **R2** ancre `path.resolve` | REPRODUIT — ancre du chemin réel ≠ ancre du symlink | `realpathSync` + identité d'inode, pour l'ancre **et** l'emplacement de la réserve |
| **R3** vérificateur fourni par l'appelant | REPRODUIT — `{operatorTrustBoundaryId, provenanceAuthority()}` → `AUTHENTICATED`, `STRONG`, `PRESENT_FOR_HUMAN_REVIEW` avec les étiquettes de l'appelant | seul un vérificateur marqué désigne l'autorité ; `policy.identity.*` refusée ; seuils narrow-only |
| **R4** `assertCapabilityUsable` hors registre | REPRODUIT en variante (c) — registre présent, artefact **non enregistré** → `usable = true` | registre authentifié + artefact enregistré + concession tracée + identité composite |
| **R5** registre de forme | REPRODUIT — `{get, has, entries}` fabriqué → `FULL` acceptée | `isAuthenticatedRegistry` + run + mission + frontière |
| **R6/R7** surface | REPRODUIT — `createAcceptanceBoundary`, `__resetProcessNamespaceRegistry` exportés, `opts.envVar` accepté | exports retirés ; `TRUST_ENV_VAR_REFUSED` |

**R4, précision honnête** : la formulation du mandat (« usable=true sur artifact
non enregistré / non lié ») ne se reproduisait pas dans la variante « sans
registre » — v0.8 y répondait déjà `usable = false`. Elle se reproduisait dans
la variante « registre présent, artefact absent », parce que le contrôle était
conditionné à la présence de sa cible. Un contrôle conditionné à l'existence de
ce qu'il doit vérifier n'est pas un contrôle.

## 2. Deux défauts trouvés dans ma propre correction

| Symptôme | Diagnostic |
|---|---|
| `T08`/`T10` échouaient après la correction R2 | `trustConfigAnchorOf` résolvait le chemin canonique, mais `reserveDirectoryFor` utilisait encore `path.resolve` : même ancre, deux **répertoires**. Corrigé des deux côtés. |
| `T04`/`M05` attendaient `AUTHORITY_CONFIG_BINDING_MISMATCH` au registre | un écart de run levait d'abord `CAPABILITY_GRANT_MISBOUND` et masquait le diagnostic. La comparaison de frontière a été placée **en premier** : une concession venue d'une autre configuration doit être nommée comme telle. |

## 3. Qualité des tests corrigée (§25)

| Test | Correction |
|---|---|
| `NR-02` dépendance externe | devient `T33`, auto-suffisant ; **SKIP motivé** si les lots amont ne sont pas joignables — aucun `PASS` n'est émis à la place |
| `I-27` libellé trompeur | devient `T34` : assertion sur la présence effective de `unauthenticatedEvidenceRefs` dans chaque évaluation |
| `I-28` assertion vacuous | devient `T35` : la clé exposée par la frontière est inspectée en profondeur — au moins un champ public présent, aucun champ privé |

Aucun de ces correctifs n'a modifié le produit.

## 4. Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 88 PASS / 0 FAIL |
| Mutations | 35 / 35 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 36 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Cas / domaine / fournisseur câblés | 0 / 0 / 0 |
| Helpers internes exposés | 0 |
| Lots historiques modifiés | 0 |
