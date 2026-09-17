# MONO-10 v0.15 — non-régression

## 1. La propriété centrale de ce lot : le runtime est inchangé

v0.15 est un successeur **strictement documentaire** de v0.14, qui l'était de
v0.13, de v0.12 et de v0.11. La seule affirmation forte qu'il porte est
celle-ci, et elle est vérifiable en **quarante-huit comparaisons** (douze
chemins × quatre lots de référence) :

| Affirmation | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V012` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V013` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V014` | **YES** |
| `MONO10_V15_CAUSED_REGRESSION` | **NO** |
| `MONO10_V15_CHANGED_ANY_API` | **NO** |
| `MONO10_V15_CHANGED_ANY_BEHAVIOUR` | **NO** |
| `CHARTE_BYTE_IDENTICAL` | **YES** |

### Le périmètre runtime, défini explicitement

Décision de gouvernance, prise en v0.13 et maintenue : **`governance/README.md`
est un document de gouvernance, pas un composant runtime.** Le périmètre
d'identité octet à octet est donc :

| Dans le périmètre | Hors périmètre |
|---|---|
| `core/` `adapters/` `validators/` `schemas/` `contracts/` | `governance/README.md` — document, corrigé en v0.13, v0.14 et v0.15 |
| la **Charte** (`governance/EvidenceForge-CHARTE-…md`) | tous les autres `.md` du lot |
| `test/fixture-chain.js`, `test/test-mono10-v0.11.js`, `test/test-mono10-v0.11-integration.js` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `tools/aggregate-hash.js`, `tools/operator-provisioning.js`, `tools/reference-llm-transport.js` | `tools/seal-inventory.js` (ajout de v0.12, lecture seule, inchangé depuis) |
| | `test/test-mono10-v0.15-documentary.js` (ajout, lecture seule) |

La Charte **reste byte-identique** : c'est une condition de la décision, pas une
conséquence. Le `MANIFEST` porte ce périmètre tel quel dans
`runtimeIdentityProof.paths` — la Charte y figure, `governance/` n'y figure
**pas** (contrôle `DOC-16` ; v0.13 y listait `governance/` entier, ce qui
contredisait sa propre décision).

```
cd MONO-10
for prev in v0.11 v0.12 v0.13 v0.14; do
  for d in core adapters validators schemas contracts; do diff -r $prev/$d v0.15/$d; done
  for f in test/fixture-chain.js test/test-mono10-v0.11.js \
           test/test-mono10-v0.11-integration.js \
           tools/aggregate-hash.js tools/operator-provisioning.js \
           tools/reference-llm-transport.js \
           governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md; do
    diff $prev/$f v0.15/$f; done
done
# attendu : comparaisons = 48 ; VIDES = 48
```

Sortie attendue : **rien**, sur les quarante-huit comparaisons. La ligne
`# attendu` est **rejouée** par `test/test-mono10-v0.15-documentary.js`
(`DOC-13`) : le chiffre imprimé et la commande imprimée décrivent la même
mesure, ou le contrôle échoue.

Deux fichiers seulement sont hors du périmètre exécutable hérité, et aucun n'y
participe :

- `tools/seal-inventory.js` — outil de mesure **en lecture seule**, ajouté en
  v0.12, **inchangé** depuis, qui n'écrit aucun fichier et ne prend part à
  aucune décision de sécurité ;
- `test/test-mono10-v0.15-documentary.js` — contrôles documentaires, réécrits en
  v0.14 et durcis en v0.15 : balayage récursif des `.md` **et** des `.json`,
  témoins négatifs par **mutation en mémoire du contenu réel des documents
  livrés** (aucune écriture, nulle part), portée à la **phrase** pour les
  affirmations trompeuses, chiffres de cadre refusés sans leur cadre, fenêtre
  de construction re-dérivée, structure markdown comparée à une structure
  déclarée.

Les fichiers de test gardent leurs **noms de v0.11**. C'est volontaire : les
renommer aurait rompu l'identité du jeu de fichiers, donc la preuve.

## 2. Les mesures de sceaux : chaque chiffre nomme son cadre et sa commande

v0.11 annonçait 14 lots scellés, 514 références, 0 divergence et 9 lots non
vérifiables. **Les quatre chiffres étaient faux**, pour une seule raison de
méthode : la mesure parcourait une **liste codée en dur** de 14 chemins et ne
cherchait que le nom `SHA256SUMS.txt`. Or de `MONO-00` à `MONO-08/v0.6`, le
sceau se trouve dans `manifest/` et s'appelle le plus souvent `SHA256SUMS`,
**sans extension**.

La mesure juste est récursive, rejouable avec l'outil livré. **Une commande
imprimée doit produire le chiffre imprimé dans le même arbre** : v0.13 imprimait
`seal-inventory.js <racine> MONO-10/v0.11` à côté de « 24 / 1 577 », mais dans
l'arbre de v0.13 cette commande rendait 26 / 1 720, parce que v0.12 et v0.13 y
étaient devenus des lots historiques scellés. Le cadre v0.11 s'obtient en
excluant **tous** les lots MONO-10 postérieurs, et c'est ce que la commande
dit :

```
node tools/seal-inventory.js <racine> MONO-10/v0.11,MONO-10/v0.12,MONO-10/v0.13,MONO-10/v0.14,MONO-10/v0.15
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 24 ; SEALED_REFERENCES_COUNT = 1577 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

| Mesure | v0.11 annonçait | Valeur réelle (cadre v0.11) |
|---|---|---|
| `SEALED_HISTORICAL_LOTS_COUNT` | 14 | **24** |
| `SEALED_REFERENCES_COUNT` | 514 | **1 577** |
| `SEALED_DIVERGENCES` | 0 | **9** |
| `UNVERIFIABLE_HISTORICAL_LOTS` | 9 | **0** |
| `FULL_HISTORY_BYTE_IDENTITY_CONFIRMED` | NO | **NO** (inchangé, et honnête : 9 divergences subsistent) |

### Note de cadre, pour ne pas refaire l'erreur inverse

Un inventaire n'a de sens qu'en nommant les lots candidats, exclus de
l'historique. **Cinq cadres, cinq jeux de chiffres, tous vrais, tous
rejoués :**

| Cadre | Lots exclus | Lots scellés | Références | Divergences | Non scellés |
|---|---|---|---|---|---|
| **cadre v0.11** | v0.11, v0.12, v0.13, v0.14, v0.15 | 24 | 1 577 | 9 | 0 |
| **cadre v0.12** | v0.12, v0.13, v0.14, v0.15 | 25 | 1 644 | 9 | 0 |
| **cadre v0.13** | v0.13, v0.14, v0.15 | 26 | 1 715 | 9 | 0 |
| **cadre v0.14** | v0.14, v0.15 | 27 | 1 787 | 9 | 0 |
| **cadre v0.15** | v0.15 | 28 | 1 860 | 9 | 0 |

```
node tools/seal-inventory.js <racine> MONO-10/v0.12,MONO-10/v0.13,MONO-10/v0.14,MONO-10/v0.15
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 25 ; SEALED_REFERENCES_COUNT = 1644 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.13,MONO-10/v0.14,MONO-10/v0.15
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 26 ; SEALED_REFERENCES_COUNT = 1715 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.14,MONO-10/v0.15
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 27 ; SEALED_REFERENCES_COUNT = 1787 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.15
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 28 ; SEALED_REFERENCES_COUNT = 1860 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

Ils ne répondent pas à la même question. **Le cadre doit toujours être nommé** —
citer « 24 lots » sans dire « cadre v0.11 » serait déjà une inexactitude, et
c'est exactement le résidu B1 que l'audit final de v0.14 a relevé dans
`OPEN-FINDINGS.md` R4 : depuis v0.15, le contrôle `DOC-05` refuse tout chiffre
de cadre (lots scellés, références) cité sans son cadre dans la même phrase ou
cellule — en prose, en tableau, en puce, entre parenthèses, en gras ou dans une
chaîne du `MANIFEST`. Le cadre v0.15 est **mesuré après scellement** de v0.15,
jamais postulé : la valeur « 0 non scellé » n'est vraie qu'une fois
`SHA256SUMS.txt` écrit.

### Le total, tous sceaux confondus — cadre : l'arbre complet au scellement de v0.15

**Trois populations, jamais additionnées en silence.** L'outil les sépare,
parce que les confondre est précisément ce qui fabrique un faux chiffre. v0.12
et v0.13 publiaient « 35 sceaux / 3 127 références » comme total ; c'était le
total de l'arbre **de v0.12**, et il était devenu faux dès que v0.13 y avait
ajouté deux sceaux (37 / 3 270 dans l'arbre de v0.13 ; 38 / 3 343 dans l'arbre
de v0.14). Le total ne se recopie pas : il se mesure, dans l'arbre où on le
publie.

```
node tools/seal-inventory.js <racine>
# attendu : ALL_SEALS_FILE_COUNT = 39 ; ALL_SEALS_REFERENCE_COUNT = 3417 ; ALL_SEALS_DIVERGENCES = 9
```

| Population (arbre complet, v0.15 scellé) | Sceaux | Références | Divergences |
|---|---|---|---|
| lots historiques distincts (cadre v0.15) | 28 | 1 860 | 9 |
| copies imbriquées sous `dependencies/` | 10 | 1 483 | 0 |
| lot candidat v0.15 | 1 | 74 | 0 |
| **tous sceaux confondus** | **39** | **3 417** | **9** |

## 3. Les neuf divergences : réelles, et antérieures

| Lot | Divergences | Fichiers |
|---|---|---|
| `MONO-07` | 1 | `package.json` |
| `MONO-08/v0.6` | 8 | `CDC-TRACE.md`, `bin/run-real-smoke.js`, `fixtures/mission-real-smoke-v1.json`, `lib/eforch-artifacts.js`, `lib/real-e2e-driver.js`, `lib/real-provider-configs.js`, `reports/mono-08-test-report-v1.json`, `test/test_t08_runner_orchestration.js` |

**Elles ne sont imputables ni à v0.11, ni à v0.12, ni à v0.13, ni à v0.14, ni
à v0.15.** Leurs dates de modification vont du 31/08/2026 au 03/09/2026, soit neuf à douze
jours **avant** l'ouverture de la fenêtre de construction de v0.11 (12/09/2026
19:17:16, horodatage Unix 1789240636) :

```
find . -path ./MONO-10/v0.11 -prune -o -type f -print \
  | xargs stat -f "%m %N" | awk '$1 >= 1789240636'
```

**Cadre de cette mesure**, à ne pas généraliser : elle porte sur l'arbre du
paquet **tel qu'il était au moment de la construction de v0.11**, avec
`MONO-10/v0.11` comme seul lot exclu. Dans ce cadre précis, la commande ne rend
**qu'une seule ligne** : le fichier zip de livraison de v0.11 lui-même, produit
après la fenêtre. Aucun fichier de lot historique. Cette commande n'est **pas**
rejouable dans l'arbre courant — elle porte sur un état passé — et ne porte
donc pas de ligne `# attendu`.

Ce n'est **pas** une vérité générale des arbres v0.12 à v0.15 : chaque lot
ultérieur ajoute ses propres fichiers et son propre zip, et la même commande en
rendra donc davantage. Ce qui se transporte d'un cadre à l'autre est la
conclusion, pas le décompte : **aucun fichier de lot historique n'a été écrit
dans aucune des cinq fenêtres de construction** (chaque fenêtre est définie en
§7).

`MONO10_V11_CAUSED_REGRESSION = NO` reste donc **soutenu**, et il l'est sur le
bon périmètre : 24 lots (cadre v0.11), pas 14. `MONO10_V12_CAUSED_REGRESSION = NO`,
`MONO10_V13_CAUSED_REGRESSION = NO`, `MONO10_V14_CAUSED_REGRESSION = NO` et
`MONO10_V15_CAUSED_REGRESSION = NO` le sont de la même façon, chacun mesuré dans
sa propre fenêtre.

*Précision de v0.11 corrigée* : v0.11 écrivait que cette commande rend « 0
ligne ». Elle en rend une — son propre livrable. L'écart est sans conséquence,
et il est dit.

## 4. Contrôle croisé indépendant des outils de mesure

`MONO-02/dependencies/MONO-01/` contient une copie de `MONO-01` faite par un lot
antérieur, sans rapport avec cette session. Comparaison octet par octet :
**107 fichiers comparés, 0 divergence.**

## 5. Ce que v0.15 ne prétend pas

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
- `test/test-mono10-v0.15-documentary.js` — échoue si une fausseté documentaire
  corrigée par ce lot ou par ses prédécesseurs réapparaît. **Vingt-et-un**
  détecteurs, chacun validé par trois états sur le document réel :
  `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT`, `PASS_AFTER_REVERT`. Il rejoue les
  commandes imprimées ci-dessus et en §7, dérive les nombres d'hypothèses, de
  champs non attestés et la fenêtre de construction au lieu de les recopier,
  et compare la structure markdown de chaque document structuré à la structure
  déclarée dans le `MANIFEST`.

## 7. Fenêtre de construction : méthode canonique

L'audit final de v0.14 a établi que `MANIFEST.v014BuildWindowOpened` était une
valeur **saisie** (l'heure du premier `MANIFEST`), qu'aucune commande ne
reproduisait. Depuis v0.15 la fenêtre de construction d'un lot est **définie**,
**dérivée** et **rejouée** :

> `buildWindowOpened` = mtime UNIX **minimal** de tous les fichiers du lot,
> hors zip de livraison, **arrondi à la seconde paire supérieure**.

L'arrondi existe pour une raison précise : le format zip conserve les dates de
modification à **deux secondes** près, en arrondissant vers le haut. Sans lui,
l'arbre source et une extraction du zip donneraient deux valeurs différentes
d'une seconde, et la « commande publiée » ne serait reproductible que d'un seul
côté. Avec lui, les deux donnent la même valeur.

```
find MONO-10/v0.15 -type f ! -name '*.zip' -exec stat -f %m {} + | sort -n | head -1 | awk '{print $1 + ($1 % 2)}'
# attendu : BUILD_WINDOW_OPENED = 1789295186
```

La valeur est **calculée avant l'écriture finale du champ**, jamais saisie :
le `MANIFEST` porte le mtime de chaque fichier (`files[].mtime`), et
`sealInventory.v015BuildWindowOpened` est le minimum de ces mtimes, arrondi.
Le contrôle `DOC-20` re-dérive la valeur depuis `files[].mtime` (toujours
possible, même sur une copie qui n'a pas conservé les dates), la re-mesure sur
disque quand les dates y sont d'origine, et **échoue pour un écart d'une
seconde**. La commande ci-dessus est rejouée par `DOC-13`.

Les fenêtres de v0.11 à v0.14 (`sealInventory.v01xBuildWindowOpened`) sont
conservées **telles que leurs lots les ont rapportées** : pour v0.11 à v0.13
elles coïncident avec le mtime minimal du lot ; pour v0.14 la valeur rapportée
(`1789291393`) était celle du premier `MANIFEST`, le mtime minimal du lot étant
`1789290199` — c'est le résidu B2, dit ici tel quel, et non réécrit dans un lot
historique.
