# MONO-10 — migration v0.13 → v0.14

MONO-10 v0.13 est **HISTORIQUE / IMMUTABLE**. v0.14 est un successeur
**strictement documentaire**, comme v0.13 l'était de v0.12 et v0.12 de v0.11.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11, v0.12 ou v0.13
> n'a rien à modifier.

## 1. Pourquoi ce lot existe

L'audit final indépendant de v0.13 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** : `RUNTIME_BYTE_IDENTICAL_TO_V011 = YES`,
`RUNTIME_BYTE_IDENTICAL_TO_V012 = YES`, aucun risque de sécurité critique
nouveau. La cause était double : **huit affirmations documentaires connues
fausses** subsistaient (KF-1 à KF-8), et **plusieurs détecteurs documentaires
étaient incomplets ou contournables** (F1 à F4) — c'est-à-dire que le
mécanisme censé empêcher le retour des faussetés ne l'empêchait pas.

Ce lot n'a donc qu'un objectif : éliminer ces affirmations, et rendre les
détecteurs assez forts pour empêcher leur retour.

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

## 2. Les huit affirmations fausses corrigées

| # | Où | Ce que v0.13 affirmait | Ce que v0.14 dit | Vérifié par |
|---|---|---|---|---|
| **KF-1** | `governance/README.md` §24 | « cinq hypothèses déclarées » | **six** — README, `MANIFEST.declaredAssumptions` et `governance/README.md` sont harmonisés, et le nombre est **compté** dans README | `DOC-11`, `COH-03` |
| **KF-2** | `README.md`, `THREAT-MODEL.md`, `TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md` (« treize ») contre `MANIFEST` R3 (« douze ») | deux nombres pour une même liste | **douze** champs nommés, dans une énumération **canonique** (`LLM-CAPABILITY-BOUNDARY.md`, bloc `CANONICAL:NON_ATTESTED_FIELDS`) dont tout nombre est dérivé. Le « treize » comptait la ligne « champs additionnels arbitraires », propriété du schéma et non champ | `DOC-02`, `DOC-12`, `COH-06` |
| **KF-3** | `NON-REGRESSION.md` §2 | « 35 sceaux / 3 127 références », tous sceaux confondus | c'était le total de l'arbre de **v0.12** ; dans l'arbre de v0.13 la mesure donnait 37 / 3 270. v0.14 mesure **après scellement**, nomme le cadre (arbre complet, v0.14 scellé) et rejoue la commande : **38 / 3 343 / 9** | `DOC-05`, `DOC-13` |
| **KF-4** | `NON-REGRESSION.md` §2 | `seal-inventory.js <racine> MONO-10/v0.11` → « 24 / 1 577 » | cette commande rend 26 / 1 720 dans l'arbre de v0.13 (v0.12 et v0.13 y sont historiques). La commande imprimée exclut désormais **tous** les lots MONO-10 postérieurs ; chaque bloc porte une ligne `# attendu` que le contrôle **exécute et compare** | `DOC-13` |
| **KF-5** | `THREAT-MODEL.md` | « la section de correction devient §7 » | seuls les titres avaient été renumérotés : six puces de « Ce que le lot ne prétend pas » restaient **sous §7**, collées au dernier paragraphe. Elles sont réellement déplacées sous §6 ; la structure est vérifiée (liste terminée avant le heading, aucune puce de §6 sous §7, ligne vide correcte) | `DOC-14` |
| **KF-6** | `MANIFEST.json` `runtimeIdentityProof.paths` | contenait `governance/` | contredisait la décision de périmètre du même `MANIFEST` (`governance/README.md` hors périmètre, différent de v0.11). Les chemins sont désormais **exactement** `runtimePerimeterDecision.inPerimeter` : la Charte y est, `governance/` n'y est pas | `DOC-16` |
| **KF-7** | `MANIFEST.json` | référençait `test/test-mono10-v0.12-documentary.js` | ce fichier n'existe pas dans v0.13 ni v0.14. Tout chemin référencé par le `MANIFEST` doit exister | `DOC-15`, `MAN-01`, `MAN-02` |
| **KF-8** | `MANIFEST.json` | `knownFalseStatementsRemaining = 0`, pré-rempli | la valeur est **dérivée après** l'exécution de tous les détecteurs, et le contrôle échoue si elle diffère du total mesuré | `DOC-17` |

Deux imprécisions supplémentaires, trouvées par le balayage de v0.14 et dites
telles quelles :

- `NON-REGRESSION.md` §1 de v0.13 annonçait « douze commandes » puis
  « vingt-quatre comparaisons » pour la même boucle. v0.14 dit **trente-six**
  comparaisons (douze chemins × trois lots), et la boucle est rejouée ;
- `MIGRATION-v0.12-v0.13.md` §5 et l'en-tête du test de v0.13 décrivaient les
  témoins négatifs comme « recopiés dans un répertoire temporaire ». Le code
  les mutait **en mémoire**. C'est plus sûr, et c'est désormais ce qui est écrit.

## 3. Les quatre détecteurs corrigés (F1 à F4)

| # | Défaut | Correction en v0.14 | Témoin |
|---|---|---|---|
| **F1** | `DOC-04` (inscription du transport) mordait sur la **section** : la section §3 visée contenant déjà les mots de qualification, une phrase trompeuse ajoutée seule ne le faisait pas échouer | portée à la **phrase** : l'affirmation doit être qualifiée dans la phrase qui la porte | test d'isolement : paquet propre, une seule phrase nue ajoutée dans §3, la section gardant toutes ses qualifications → `FAIL` |
| **F2** | `DOC-08` (code de refus) était satisfait par la **présence d'un mot** (« inatteignable ») n'importe où dans la section | portée à la **phrase** qui contient le code ; une phrase qui le présente comme observé est une fausseté même si le mot figure ailleurs | trois faux positifs adversariaux, dont « Codes réellement observés : …, `LLM_SUBJECT_OUT_OF_ALLOWLIST`, … Une autre branche est inatteignable » → `FAIL` |
| **F3** | aucun `.json` balayé : `MANIFEST.json` échappait à tous les détecteurs — c'est par là que KF-6, KF-7 et KF-8 ont survécu | balayage récursif des `.md` **et** des `.json` : `MANIFEST.json`, `governance/`, migrations, `contracts/`, `schemas/` | `SCAN-02`, et six témoins négatifs portant sur `MANIFEST.json` |
| **F4** | `DOC-03` (sur-promesse d'attestation) reconnaissait une tournure et se laissait contourner | huit variantes réalistes, chacune un témoin distinct, citées ici telles qu'injectées : « tous les champs », « tous des champs », « chaque champ », « l'ensemble des champs », « tous les attributs », « chaque propriété », « tout le payload », « l'artefact entier est attesté » | `ATTESTATION_OVERCLAIM_VARIANTS_CAUGHT = ALL` (8 / 8) |

## 4. Les quatre détecteurs nouveaux (D-A à D-D)

| # | Contrôle | Ce qu'il fait | Témoin négatif |
|---|---|---|---|
| **D-A** | `DOC-11` | **compte** les hypothèses numérotées de README et compare à `MANIFEST.declaredAssumptions` et à toute mention « N hypothèses » du lot | « six » → « cinq » dans `governance/README.md` ; une hypothèse retirée du `MANIFEST` |
| **D-B** | `DOC-02`, `DOC-12` | dérive le nombre de champs non attestés de l'énumération canonique ; exige que le tableau R3 porte les mêmes champs ; compare toute mention « N champs » | une ligne retirée du tableau R3 ; « douze » → « treize » dans README ; titre R3 du `MANIFEST` altéré |
| **D-C** | `DOC-13` | **exécute** chaque commande imprimée suivie d'un `# attendu` (inventaires de sceaux, boucle de diff d'identité) et compare la sortie au chiffre imprimé | un chiffre attendu altéré ; la commande altérée à chiffre inchangé |
| **D-D** | `DOC-14` | structure markdown : heading collé à une liste ou à du texte, heading sans ligne vide après, puce collée à un paragraphe qui ne l'introduit pas ; et vérification nommée des six puces de `THREAT-MODEL` §6 | la faute KF-5 exacte réinjectée ; un heading inséré au milieu de la liste des hypothèses |

## 5. Règle des témoins causaux

Chaque détecteur est validé par **trois états**, sur le document réel du
paquet, jamais sur un extrait :

1. `PASS_CLEAN` — paquet livré → 0 fausseté ;
2. `FAIL_SINGLE_TARGET_FAULT` — **une** faute cible injectée dans **un**
   document → au moins une fausseté (le harnais vérifie qu'un seul fichier a
   changé) ;
3. `PASS_AFTER_REVERT` — ce seul document restauré → 0 fausseté.

Un détecteur dont l'un des trois manque n'est pas validé, et la suite échoue.
Dix-neuf détecteurs, trente-quatre témoins, `DOCUMENTARY_CHECKS_CAUGHT =
DOCUMENTARY_CHECKS_TOTAL`.

## 6. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11, à v0.12 **et** à v0.13.
`tools/seal-inventory.js` est identique à v0.12 et v0.13. La commande et son
résultat attendu sont dans `NON-REGRESSION.md` §1, et rejoués par `DOC-13`.

Delta v0.13 → v0.14, classé :

| Classe | Fichiers |
|---|---|
| `DOCUMENTATION` | `README.md`, `governance/README.md`, `THREAT-MODEL.md`, `TRUST-MODEL.md`, `LLM-CAPABILITY-BOUNDARY.md`, `ARTIFACT-REGISTRY-TRUST.md`, `AUDIT-REMEDIATION-MATRIX.md`, `OPEN-FINDINGS.md`, `MIGRATION-v0.10-v0.11.md` (une phrase qualifiée sur place), `MIGRATION-v0.11-v0.12.md`, `MIGRATION-v0.12-v0.13.md`, `MIGRATION-v0.13-v0.14.md` (nouveau) |
| `NON_REGRESSION` | `NON-REGRESSION.md` |
| `MANIFEST` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `DOCUMENTARY_TEST` | `test/test-mono10-v0.14-documentary.js` (remplace `test/test-mono10-v0.13-documentary.js`) |
| `READ_ONLY_AUDIT_TOOL` | aucun ajout ; `tools/seal-inventory.js` inchangé |
| `RUNTIME` / `TEST_RUNTIME` / `OTHER` | **0** |

## 7. Ce que v0.14 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 (statut `NOT_FIXED_IN_V014` à l'époque de v0.14 ; `NOT_FIXED_IN_V015` depuis) ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API, n'implémente pas P0.2 ;
- il ne lance aucun run réel : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0` ;
- il ne déclare pas v0.14 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
