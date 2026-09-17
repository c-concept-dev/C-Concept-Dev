# MONO-10 v0.13 — non-régression

## 1. La propriété centrale de ce lot : le runtime est inchangé

v0.12 est un successeur **strictement documentaire**. La seule affirmation forte
qu'il porte est celle-ci, et elle est vérifiable en douze commandes :

| Affirmation | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V012` | **YES** |
| `MONO10_V13_CAUSED_REGRESSION` | **NO** |
| `MONO10_V13_CHANGED_ANY_API` | **NO** |
| `MONO10_V13_CHANGED_ANY_BEHAVIOUR` | **NO** |
| `CHARTE_BYTE_IDENTICAL` | **YES** |

### Le périmètre runtime, défini explicitement

Décision de gouvernance de v0.13 : **`governance/README.md` est un document de
gouvernance, pas un composant runtime.** Le périmètre d'identité octet à octet
est donc :

| Dans le périmètre | Hors périmètre |
|---|---|
| `core/` `adapters/` `validators/` `schemas/` `contracts/` | `governance/README.md` — document, corrigé en v0.13 |
| la **Charte** (`governance/EvidenceForge-CHARTE-…md`) | tous les autres `.md` du lot |
| `test/fixture-chain.js`, `test/test-mono10-v0.11.js`, `test/test-mono10-v0.11-integration.js` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `tools/aggregate-hash.js`, `tools/operator-provisioning.js`, `tools/reference-llm-transport.js` | `tools/seal-inventory.js` (ajout, lecture seule) |
| | `test/test-mono10-v0.13-documentary.js` (ajout) |

La Charte **reste byte-identique** : c'est une condition de la décision, pas une
conséquence.

```
cd MONO-10
for prev in v0.11 v0.12; do
  for d in core adapters validators schemas contracts; do diff -r $prev/$d v0.13/$d; done
  for f in test/fixture-chain.js test/test-mono10-v0.11.js \
           test/test-mono10-v0.11-integration.js \
           tools/aggregate-hash.js tools/operator-provisioning.js \
           tools/reference-llm-transport.js \
           governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md; do
    diff $prev/$f v0.13/$f; done
done
```

Sortie attendue : **rien**, sur les vingt-quatre comparaisons. Deux fichiers
seulement sont ajoutés au périmètre exécutable, et aucun n'y participe :

- `tools/seal-inventory.js` — outil de mesure **en lecture seule**, qui n'écrit
  aucun fichier et ne prend part à aucune décision de sécurité ;
- `test/test-mono10-v0.13-documentary.js` — contrôles documentaires, réécrits en
  v0.13 pour être réellement causaux : balayage récursif (`governance/` inclus),
  témoins négatifs par **mutation contrôlée des documents livrés**, portée
  sectionnelle.

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

Un inventaire n'a de sens qu'en nommant le lot candidat, exclu de l'historique.
**Trois cadres, trois jeux de chiffres, tous vrais :**

| Cadre | Lots exclus | Lots scellés | Références | Divergences | Non scellés |
|---|---|---|---|---|---|
| **cadre v0.11** | v0.11, v0.12, v0.13 | 24 | 1 577 | 9 | 0 |
| **cadre v0.12** | v0.12, v0.13 | 25 | 1 644 | 9 | 0 |
| **cadre v0.13** | v0.13 | 26 | 1 715 | 9 | 0 |

Ils ne répondent pas à la même question. **Le cadre doit toujours être nommé** —
citer « 24 lots » sans dire « cadre v0.11 » serait déjà une inexactitude.
Le cadre v0.13 est mesuré après construction, pas postulé :
`node tools/seal-inventory.js <racine> MONO-10/v0.13`.

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

**Cadre de cette mesure**, à ne pas généraliser : elle porte sur l'arbre du
paquet **tel qu'il était au moment de la construction de v0.11**, avec
`MONO-10/v0.11` comme seul lot exclu. Dans ce cadre précis, la commande ne rend
**qu'une seule ligne** : le fichier zip de livraison de v0.11 lui-même, produit
après la fenêtre. Aucun fichier de lot historique.

Ce n'est **pas** une vérité générale de l'arbre v0.12 ou v0.13 : chaque lot
ultérieur ajoute ses propres fichiers et son propre zip, et la même commande en
rendra donc davantage. Ce qui se transporte d'un cadre à l'autre est la
conclusion, pas le décompte : **aucun fichier de lot historique n'a été écrit
dans aucune des trois fenêtres de construction.**

`MONO10_V11_CAUSED_REGRESSION = NO` reste donc **soutenu**, et il l'est désormais
sur le bon périmètre : 24 lots, pas 14. `MONO10_V12_CAUSED_REGRESSION = NO` et
`MONO10_V13_CAUSED_REGRESSION = NO` le sont de la même façon, chacun mesuré dans
sa propre fenêtre.

*Précision de v0.11 corrigée* : v0.11 écrivait que cette commande rend « 0
ligne ». Elle en rend une — son propre livrable. L'écart est sans conséquence,
et il est dit.

## 4. Contrôle croisé indépendant des outils de mesure

`MONO-02/dependencies/MONO-01/` contient une copie de `MONO-01` faite par un lot
antérieur, sans rapport avec cette session. Comparaison octet par octet :
**107 fichiers comparés, 0 divergence.**

## 5. Ce que v0.13 ne prétend pas

- il ne corrige **pas** les neuf divergences historiques ;
- il ne ferme **aucune** des cinq réserves de `OPEN-FINDINGS.md` ;
- `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` reste **NO**, et le restera aussi
  longtemps que `MONO-07` et `MONO-08/v0.6` divergeront de leur propre sceau.

## 6. Vérification permanente

- `test/test-mono10-v0.11.js` — suite d'exécution de v0.11, **inchangée**.
  Son contrôle `NR-01` conserve sa liste de 14 chemins : elle est **exacte dans
  son périmètre** et sous-déclarée hors de lui. Ne pas la corriger fait partie
  de la preuve d'identité du runtime ; la mesure juste est dans
  `tools/seal-inventory.js`.
- `test/test-mono10-v0.13-documentary.js` — échoue si une fausseté documentaire
  corrigée par ce lot réapparaît. **Dix** détecteurs, chacun accompagné d'une
  mutation causale du paquet livré.
