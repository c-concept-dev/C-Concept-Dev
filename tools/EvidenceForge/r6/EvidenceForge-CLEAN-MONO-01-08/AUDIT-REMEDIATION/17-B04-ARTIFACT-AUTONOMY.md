# 17 — B-04 : Bundle Artifact Autonomy (R3)

## Constat de l'audit indépendant (round 2) et du contre-audit Claude LLM

`MONO-07/lib/harness-env.js::extractFrozenMono05()` (gelé, jamais
modifié) attend un layout historique
`KIT_ROOT/04-ARTEFACTS-CANONIQUES/MONO/EvidenceForge-MONO-05-*.zip`. Le
paquet remédié livre `MONO-05/` en clair (dossier, jamais un ZIP dans
ce layout précis). `lib/kit-root-adapter.js` (introduit en r2) résout
cet écart en reconstruisant, à la demande, un `KIT_ROOT` temporaire
depuis le contenu canonique du bundle lui-même — jamais depuis un ancien
kit externe.

## Correction du rapport r2 (mandat R3, section 20)

Le rapport r2 (`12-R2-CLOSURE.md`, section « Vérification finale »)
affirmait :

> « aucune ressource externe à l'extraction utilisée »

Cette formulation était **surqualifiée** : elle pouvait laisser croire à
une autonomie totale de la toolchain (Node.js/npm/`zip` inclus), alors
que ces outils système restent, et ont toujours été, externes au ZIP.

**Formulation corrigée (r3)**, à substituer dans la lecture de ce
document historique (celui-ci n'a pas été réécrit — mandat R3, section
20 : « ne falsifie pas l'historique ») :

> « zéro dépendance à un ancien artefact EvidenceForge externe au
> bundle » — et séparément — « les prérequis système Node/npm/
> Playwright/zip restent externes au bundle, documentés explicitement
> dans `18-RUNTIME-PREREQUISITES.md`, jamais revendiqués offline par
> défaut. »

## Définition adoptée (mandat R3, section 16)

| Axe | Définition |
|---|---|
| `BUNDLE_ARTIFACT_AUTONOMY` | Tous les artefacts EvidenceForge MONO nécessaires au runtime sont présents dans le bundle ; aucun ancien kit EvidenceForge externe n'est nécessaire. |
| `RUNTIME_TOOLCHAIN_AUTONOMY` | Autonomie de la toolchain système (Node/npm/zip/Chromium) — **NOT_CLAIMED** par ce paquet, jamais confondue avec la précédente. |

## Preuve — `BUNDLE_ARTIFACT_AUTONOMY = PASS`

1. **Statique** : `lib/kit-root-adapter.js` ne référence AUCUN nom de
   fichier d'un ancien layout HANDOFF (`EvidenceForge-MONO-05-v*.zip`,
   `EvidenceForge-MONO-XX-R*.zip`) — vérifié par
   `test_t08_r3_closure.js::B04-R3-04` (grep du code source). Il
   construit exclusivement `EvidenceForge-<LOT>-clean.zip` à partir des
   dossiers `MONO-00/`…`MONO-07/` réellement présents dans le bundle
   (`execFileSync("zip", ...)`), jamais depuis un chemin externe.
2. **Dynamique** (`test_t08_r2_closure.js::B04-01..05`, réexécutée sans
   régression en r3) : extraction fraîche du ZIP livré dans un
   répertoire neuf, reconstruction du `KIT_ROOT` temporaire, extraction
   de `MONO-05` par `extractFrozenMono05()` (gelé, non modifié) depuis
   CE `KIT_ROOT` reconstruit, exécution intégrale de
   `test_t08_eforch.js` (26/26 assertions) depuis cette extraction —
   voir le rapport terminal de cette mission pour la commande exacte et
   le résultat littéral obtenu sur le ZIP r3 final.
3. **`test_t08_r3_closure.js::B04-R3-05`** : le `MONO-05` réellement
   utilisé par le `KIT_ROOT` reconstruit provient d'un chemin **sous**
   le répertoire de travail jetable de l'adaptateur (`adapterOutDir`/
   `mono05ExtractWork`), jamais d'un chemin externe préexistant —
   vérifié programmatiquement (pas seulement déclaré).

## Verdict

```
BUNDLE_ARTIFACT_AUTONOMY = PASS
RUNTIME_TOOLCHAIN_AUTONOMY = NOT_CLAIMED
OLD_EVIDENCEFORGE_KIT_REQUIRED = NO
SYSTEM_PREREQUISITES = Node.js, npm (pour node_modules/Playwright si ces
  suites sont exécutées), zip/unzip (CLI système) — detail complet et
  besoins reseau/cache par outil : voir 18-RUNTIME-PREREQUISITES.md
```

## Limite honnêtement disclosed (héritée de r2, inchangée)

Le gate MONO-06 COMPLET (`assertMono06GatePasses()`) exige, au-delà du
layout `04-ARTEFACTS-CANONIQUES/MONO/*.zip` que l'adaptateur reconstruit,
des artefacts `04-ARTEFACTS-CANONIQUES/HISTORIQUES/*.zip` (EF-ORCH,
EF-PR-GEN-01, EF-02ABC, EF-02D, EF-02E, EF-03, EF-04) — des fixtures de
test historiques EXTERNES à MONO-00→08, jamais incluses dans ce paquet
de remédiation (hors périmètre : ni MONO-08, ni un lot MONO-00→07
lui-même). Le `KIT_ROOT` reconstruit permet donc aux suites qui
dépendent réellement de `harness-env.js`/`extractFrozenMono05()`
(`test_t08_eforch.js`, `test_t08_cross_process.js`, `test_t08_r2_
closure.js`, `test_t08_r3_closure.js`) de tourner de façon totalement
autonome, mais PAS au premier pas (`baseline-gate`) de
`bin/run-real-smoke.js` lui-même ni à `test_t08_matrix.js::T08-01`, qui
restent conçus pour un `KIT_ROOT` de production complet (13 artefacts
canoniques). Ceci correspond exactement au périmètre du mandat R3
(section 18 : « exécuter au minimum une suite qui n'exige pas de
download réseau » — jamais présenté comme davantage).
