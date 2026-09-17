# MONO-10 v0.12 — non-régression

## 1. La propriété centrale de ce lot : le runtime est inchangé

v0.12 est un successeur **strictement documentaire**. La seule affirmation forte
qu'il porte est celle-ci, et elle est vérifiable en douze commandes :

| Affirmation | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** |
| `MONO10_V12_CAUSED_REGRESSION` | **NO** |
| `MONO10_V12_CHANGED_ANY_API` | **NO** |
| `MONO10_V12_CHANGED_ANY_BEHAVIOUR` | **NO** |

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, `governance/`,
les trois fichiers de test de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à ceux de v0.11.

```
cd MONO-10
for d in core adapters validators schemas contracts governance; do diff -r v0.11/$d v0.12/$d; done
for f in test/fixture-chain.js test/test-mono10-v0.11.js \
         test/test-mono10-v0.11-integration.js \
         tools/aggregate-hash.js tools/operator-provisioning.js \
         tools/reference-llm-transport.js; do diff v0.11/$f v0.12/$f; done
```

Sortie attendue : **rien**. Deux fichiers seulement sont ajoutés au périmètre
exécutable, et aucun n'y participe :

- `tools/seal-inventory.js` — outil de mesure **en lecture seule**, qui n'écrit
  aucun fichier et ne prend part à aucune décision de sécurité ;
- `test/test-mono10-v0.12-documentary.js` — contrôles documentaires.

Les fichiers de test gardent leurs **noms de v0.11**. C'est volontaire : les
renommer aurait rompu l'identité du jeu de fichiers, donc la preuve.

## 2. Les mesures de sceaux de v0.11 étaient fausses — voici les bonnes

v0.11 annonçait 14 lots scellés, 514 références, 0 divergence et 9 lots non
vérifiables. **Les quatre chiffres étaient faux**, pour une seule raison de
méthode : la mesure parcourait une **liste codée en dur** de 14 chemins et ne
cherchait que le nom `SHA256SUMS.txt`. Or de `MONO-00` à `MONO-08/v0.6`, le
sceau se trouve dans `manifest/` et s'appelle le plus souvent `SHA256SUMS`,
**sans extension**.

Mesure récursive, rejouable avec l'outil livré :

```
node tools/seal-inventory.js <racineDuPaquet> MONO-10/v0.11
```

| Mesure | v0.11 annonçait | Valeur réelle |
|---|---|---|
| `SEALED_HISTORICAL_LOTS_COUNT` | 14 | **24** |
| `SEALED_REFERENCES_COUNT` | 514 | **1 577** |
| `SEALED_DIVERGENCES` | 0 | **9** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | 9 | **0** |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | NO | **NO** (inchangé, et honnête : 9 divergences subsistent) |

**Trois populations, jamais additionnées en silence.** L'outil les sépare,
parce que les confondre est précisément ce qui fabrique un faux chiffre :

| Population | Sceaux | Références | Divergences |
|---|---|---|---|
| lots historiques distincts | 24 | 1 577 | 9 |
| copies imbriquées sous `dependencies/` | 10 | 1 483 | 0 |
| lot candidat v0.11 | 1 | 67 | 0 |
| **tous sceaux confondus** | **35** | **3 127** | **9** |

### Note de cadre, pour ne pas refaire l'erreur inverse

Les chiffres ci-dessus sont mesurés **dans le cadre de v0.11** : v0.11 est le
lot candidat, donc exclu de l'historique. Dans le cadre de **v0.12**, v0.11
devient historique : l'inventaire donne alors **25 lots** et **1 644
références**, mêmes 9 divergences. Les deux jeux de chiffres sont vrais ; ils ne
répondent pas à la même question. Le cadre doit toujours être nommé.

## 3. Les neuf divergences : réelles, et antérieures

| Lot | Divergences | Fichiers |
|---|---|---|
| `MONO-07` | 1 | `package.json` |
| `MONO-08/v0.6` | 8 | `CDC-TRACE.md`, `bin/run-real-smoke.js`, `fixtures/mission-real-smoke-v1.json`, `lib/eforch-artifacts.js`, `lib/real-e2e-driver.js`, `lib/real-provider-configs.js`, `reports/mono-08-test-report-v1.json`, `test/test_t08_runner_orchestration.js` |

**Elles ne sont imputables ni à v0.11 ni à v0.12.** Leurs dates de modification
vont du 31/08/2026 au 03/09/2026, soit neuf à douze jours **avant** l'ouverture
de la fenêtre de construction de v0.11 (12/09/2026 19:17:16, horodatage Unix
1789240636) :

```
find . -path ./MONO-10/v0.11 -prune -o -type f -print \
  | xargs stat -f "%m %N" | awk '$1 >= 1789240636'
```

Cette commande ne rend **qu'une seule ligne** : le fichier zip de livraison de
v0.11 lui-même, produit après la fenêtre. Aucun fichier de lot historique.
`MONO10_V11_CAUSED_REGRESSION = NO` reste donc **soutenu**, et il l'est
désormais sur le bon périmètre : 24 lots, pas 14.

*Précision de v0.11 corrigée* : v0.11 écrivait que cette commande rend « 0
ligne ». Elle en rend une — son propre livrable. L'écart est sans conséquence,
et il est dit.

## 4. Contrôle croisé indépendant des outils de mesure

`MONO-02/dependencies/MONO-01/` contient une copie de `MONO-01` faite par un lot
antérieur, sans rapport avec cette session. Comparaison octet par octet :
**107 fichiers comparés, 0 divergence.**

## 5. Ce que v0.12 ne prétend pas

- il ne corrige **pas** les neuf divergences historiques ;
- il ne ferme **aucune** des réserves de `OPEN-FINDINGS-v0.12.md` ;
- `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` reste **NO**, et le restera aussi
  longtemps que `MONO-07` et `MONO-08/v0.6` divergeront de leur propre sceau.

## 6. Vérification permanente

- `test/test-mono10-v0.11.js` — suite d'exécution de v0.11, **inchangée**.
  Son contrôle `NR-01` conserve sa liste de 14 chemins : elle est **exacte dans
  son périmètre** et sous-déclarée hors de lui. Ne pas la corriger fait partie
  de la preuve d'identité du runtime ; la mesure juste est dans
  `tools/seal-inventory.js`.
- `test/test-mono10-v0.12-documentary.js` — échoue si une fausseté documentaire
  corrigée par ce lot réapparaît.
