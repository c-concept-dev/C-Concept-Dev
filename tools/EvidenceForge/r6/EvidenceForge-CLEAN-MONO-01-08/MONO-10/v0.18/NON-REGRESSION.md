# MONO-10 v0.18 — non-régression

## 1. La propriété centrale de ce lot : le runtime est inchangé

v0.18 est un successeur **strictement documentaire** de v0.17, qui l'était de
v0.16, de v0.15, de v0.14, de v0.13, de v0.12 et de v0.11. La seule affirmation
forte qu'il porte est celle-ci, et elle est vérifiable en **quatre-vingt-quatre
comparaisons** (douze chemins × sept lots de référence) :

| Affirmation | Valeur |
|---|---|
| `RUNTIME_BYTE_IDENTICAL_TO_V011` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V012` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V013` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V014` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V015` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V016` | **YES** |
| `RUNTIME_BYTE_IDENTICAL_TO_V017` | **YES** |
| `MONO10_V18_CAUSED_REGRESSION` | **NO** |
| `MONO10_V18_CHANGED_ANY_API` | **NO** |
| `MONO10_V18_CHANGED_ANY_BEHAVIOUR` | **NO** |
| `CHARTE_BYTE_IDENTICAL` | **YES** |

### Le périmètre runtime, défini explicitement

Décision de gouvernance, prise en v0.13 et maintenue : **`governance/README.md`
est un document de gouvernance, pas un composant runtime.** Le périmètre
d'identité octet à octet est donc :

| Dans le périmètre | Hors périmètre |
|---|---|
| `core/` `adapters/` `validators/` `schemas/` `contracts/` | `governance/README.md` — document, corrigé à chaque lot documentaire depuis v0.13 (`MANIFEST.documentHistory`) |
| la **Charte** (`governance/EvidenceForge-CHARTE-…md`) | tous les autres `.md` du lot |
| `test/fixture-chain.js`, `test/test-mono10-v0.11.js`, `test/test-mono10-v0.11-integration.js` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `tools/aggregate-hash.js`, `tools/operator-provisioning.js`, `tools/reference-llm-transport.js` | `tools/seal-inventory.js` (ajout de v0.12, lecture seule, inchangé depuis) |
| | `test/test-mono10-v0.18-documentary.js` (ajout, lecture seule) |

La Charte **reste byte-identique** : c'est une condition de la décision, pas une
conséquence. Le `MANIFEST` porte ce périmètre tel quel dans
`runtimeIdentityProof.paths` — la Charte y figure, `governance/` n'y figure
**pas** (contrôle `DOC-16` ; v0.13 y listait `governance/` entier, ce qui
contredisait sa propre décision).

```
cd MONO-10
for prev in v0.11 v0.12 v0.13 v0.14 v0.15 v0.16 v0.17; do
  for d in core adapters validators schemas contracts; do diff -r $prev/$d v0.18/$d; done
  for f in test/fixture-chain.js test/test-mono10-v0.11.js \
           test/test-mono10-v0.11-integration.js \
           tools/aggregate-hash.js tools/operator-provisioning.js \
           tools/reference-llm-transport.js \
           governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md; do
    diff $prev/$f v0.18/$f; done
done
# attendu : comparaisons = 84 ; VIDES = 84
```

Sortie attendue : **rien**, sur les quatre-vingt-quatre comparaisons. La ligne
`# attendu` est **rejouée** par `test/test-mono10-v0.18-documentary.js`
(`DOC-13`) : le chiffre imprimé et la commande imprimée décrivent la même
mesure, ou le contrôle échoue.

Deux fichiers seulement sont hors du périmètre exécutable hérité, et aucun n'y
participe :

- `tools/seal-inventory.js` — outil de mesure **en lecture seule**, ajouté en
  v0.12, **inchangé** depuis, qui n'écrit aucun fichier et ne prend part à
  aucune décision de sécurité ;
- `test/test-mono10-v0.18-documentary.js` — contrôles documentaires, réécrits en
  v0.14, durcis à chaque lot depuis : balayage récursif des `.md` **et** des `.json`,
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
node tools/seal-inventory.js <racine> MONO-10/v0.11,MONO-10/v0.12,MONO-10/v0.13,MONO-10/v0.14,MONO-10/v0.15,MONO-10/v0.16,MONO-10/v0.17,MONO-10/v0.18
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
l'historique. **Huit cadres, huit jeux de chiffres, tous vrais, tous
rejoués :**

| Cadre | Lots exclus | Lots scellés | Références | Divergences | Non scellés |
|---|---|---|---|---|---|
| **cadre v0.11** | v0.11, v0.12, v0.13, v0.14, v0.15, v0.16, v0.17, v0.18 | 24 | 1 577 | 9 | 0 |
| **cadre v0.12** | v0.12, v0.13, v0.14, v0.15, v0.16, v0.17, v0.18 | 25 | 1 644 | 9 | 0 |
| **cadre v0.13** | v0.13, v0.14, v0.15, v0.16, v0.17, v0.18 | 26 | 1 715 | 9 | 0 |
| **cadre v0.14** | v0.14, v0.15, v0.16, v0.17, v0.18 | 27 | 1 787 | 9 | 0 |
| **cadre v0.15** | v0.15, v0.16, v0.17, v0.18 | 28 | 1 860 | 9 | 0 |
| **cadre v0.16** | v0.16, v0.17, v0.18 | 29 | 1 934 | 9 | 0 |
| **cadre v0.17** | v0.17, v0.18 | 30 | 2 010 | 9 | 0 |
| **cadre v0.18** | v0.18 | 31 | 2 087 | 9 | 0 |

```
node tools/seal-inventory.js <racine> MONO-10/v0.12,MONO-10/v0.13,MONO-10/v0.14,MONO-10/v0.15,MONO-10/v0.16,MONO-10/v0.17,MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 25 ; SEALED_REFERENCES_COUNT = 1644 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.13,MONO-10/v0.14,MONO-10/v0.15,MONO-10/v0.16,MONO-10/v0.17,MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 26 ; SEALED_REFERENCES_COUNT = 1715 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.14,MONO-10/v0.15,MONO-10/v0.16,MONO-10/v0.17,MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 27 ; SEALED_REFERENCES_COUNT = 1787 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.15,MONO-10/v0.16,MONO-10/v0.17,MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 28 ; SEALED_REFERENCES_COUNT = 1860 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.16,MONO-10/v0.17,MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 29 ; SEALED_REFERENCES_COUNT = 1934 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.17,MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 30 ; SEALED_REFERENCES_COUNT = 2010 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

```
node tools/seal-inventory.js <racine> MONO-10/v0.18
# attendu : SEALED_HISTORICAL_LOTS_COUNT = 31 ; SEALED_REFERENCES_COUNT = 2087 ; SEALED_DIVERGENCES = 9 ; UNVERIFIABLE_HISTORICAL_LOTS = 0
```

Ils ne répondent pas à la même question. **Le cadre doit toujours être nommé** —
citer « 24 lots » sans dire « cadre v0.11 » serait déjà une inexactitude, et
c'est exactement le résidu B1 que l'audit final de v0.14 a relevé dans
`OPEN-FINDINGS.md` R4 : depuis v0.15, le contrôle `DOC-05` refuse tout chiffre
de cadre (lots scellés, références) cité sans son cadre dans la même phrase ou
cellule — en prose, en tableau, en puce, entre parenthèses, en gras ou dans une
chaîne du `MANIFEST` — et, depuis v0.16, un chiffre **cadré mais faux** (« cadre
v0.12 : 26 lots ») est refusé de la même façon, chaque cadre étant comparé aux
valeurs mesurées portées par `MANIFEST.sealInventory`. Le cadre v0.18 est
**mesuré après scellement** de v0.18, jamais postulé : la valeur « 0 non
scellé » n'est vraie qu'une fois `SHA256SUMS.txt` écrit.

### Le total, tous sceaux confondus — cadre : l'arbre complet au scellement de v0.18

**Trois populations, jamais additionnées en silence.** L'outil les sépare,
parce que les confondre est précisément ce qui fabrique un faux chiffre. v0.12
et v0.13 publiaient « 35 sceaux / 3 127 références » comme total ; c'était le
total de l'arbre **de v0.12**, et il était devenu faux dès que v0.13 y avait
ajouté deux sceaux (37 / 3 270 dans l'arbre de v0.13 ; 38 / 3 343 dans l'arbre
de v0.14 ; 39 / 3 417 dans l'arbre de v0.15 ; 40 / 3 493 dans l'arbre de
v0.16 ; 41 / 3 570 dans l'arbre de v0.17). Le total ne se recopie pas : il se
mesure, dans l'arbre où on le publie.

```
node tools/seal-inventory.js <racine>
# attendu : ALL_SEALS_FILE_COUNT = 42 ; ALL_SEALS_REFERENCE_COUNT = 3648 ; ALL_SEALS_DIVERGENCES = 9
```

| Population (arbre complet, v0.18 scellé) | Sceaux | Références | Divergences |
|---|---|---|---|
| lots historiques distincts (cadre v0.18) | 31 | 2 087 | 9 |
| copies imbriquées sous `dependencies/` | 10 | 1 483 | 0 |
| lot candidat v0.18 | 1 | 78 | 0 |
| **tous sceaux confondus** | **42** | **3 648** | **9** |

## 3. Les neuf divergences : réelles, et antérieures

| Lot | Divergences | Fichiers |
|---|---|---|
| `MONO-07` | 1 | `package.json` |
| `MONO-08/v0.6` | 8 | `CDC-TRACE.md`, `bin/run-real-smoke.js`, `fixtures/mission-real-smoke-v1.json`, `lib/eforch-artifacts.js`, `lib/real-e2e-driver.js`, `lib/real-provider-configs.js`, `reports/mono-08-test-report-v1.json`, `test/test_t08_runner_orchestration.js` |

**Elles ne sont imputables ni à v0.11, ni à v0.12, ni à v0.13, ni à v0.14, ni
à v0.15, ni à v0.16, ni à v0.17, ni à v0.18.** Leurs dates de modification vont du 31/08/2026 au 03/09/2026, soit neuf à douze
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

Ce n'est **pas** une vérité générale des arbres v0.12 à v0.18 : chaque lot
ultérieur ajoute ses propres fichiers et son propre zip, et la même commande en
rendra donc davantage. Ce qui se transporte d'un cadre à l'autre est la
conclusion, pas le décompte : **aucun fichier de lot historique n'a été écrit
dans aucune des huit fenêtres de construction** (chaque fenêtre est définie en
§7).

`MONO10_V11_CAUSED_REGRESSION = NO` reste donc **soutenu**, et il l'est sur le
bon périmètre : 24 lots (cadre v0.11), pas 14. `MONO10_V12_CAUSED_REGRESSION = NO`,
`MONO10_V13_CAUSED_REGRESSION = NO`, `MONO10_V14_CAUSED_REGRESSION = NO`,
`MONO10_V15_CAUSED_REGRESSION = NO`, `MONO10_V16_CAUSED_REGRESSION = NO`,
`MONO10_V17_CAUSED_REGRESSION = NO` et `MONO10_V18_CAUSED_REGRESSION = NO` le
sont de la même façon, chacun mesuré dans sa propre fenêtre.

*Précision de v0.11 corrigée* : v0.11 écrivait que cette commande rend « 0
ligne ». Elle en rend une — son propre livrable. L'écart est sans conséquence,
et il est dit.

## 4. Contrôle croisé indépendant des outils de mesure

`MONO-02/dependencies/MONO-01/` contient une copie de `MONO-01` faite par un lot
antérieur, sans rapport avec cette session. Comparaison octet par octet :
**107 fichiers comparés, 0 divergence.**

## 5. Ce que v0.18 ne prétend pas

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
- `test/test-mono10-v0.18-documentary.js` — échoue si une fausseté documentaire
  corrigée par ce lot ou par ses prédécesseurs réapparaît. **Vingt-six**
  détecteurs, chacun validé par trois états sur le document réel :
  `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT`, `PASS_AFTER_REVERT`. Il rejoue les
  commandes imprimées ci-dessus et en §7, dérive les nombres d'hypothèses, de
  champs non attestés et la fenêtre de construction au lieu de les recopier,
  et compare la structure markdown de chaque document structuré à la structure
  déclarée dans le `MANIFEST`, et la provenance de chaque document à
  l'historique mesuré (§8).

## 7. Fenêtre de construction : méthode canonique

L'audit final de v0.14 a établi que `MANIFEST.v014BuildWindowOpened` était une
valeur **saisie** (l'heure du premier `MANIFEST`), qu'aucune commande ne
reproduisait. Depuis v0.15 la fenêtre de construction d'un lot est **définie**,
**dérivée** et **rejouée** ; chaque lot depuis applique la même méthode :

> `buildWindowOpened` = mtime UNIX **minimal** de tous les fichiers du lot,
> hors zip de livraison, **arrondi à la seconde paire supérieure**.

L'arrondi existe pour une raison précise : le format zip conserve les dates de
modification à **deux secondes** près, en arrondissant vers le haut. Sans lui,
l'arbre source et une extraction du zip donneraient deux valeurs différentes
d'une seconde, et la « commande publiée » ne serait reproductible que d'un seul
côté. Avec lui, les deux donnent la même valeur.

```
find MONO-10/v0.18 -type f ! -name '*.zip' -exec stat -f %m {} + | sort -n | head -1 | awk '{print $1 + ($1 % 2)}'
# attendu : BUILD_WINDOW_OPENED = 1789315996
```

La valeur est **calculée avant l'écriture finale du champ**, jamais saisie :
le `MANIFEST` porte le mtime de chaque fichier (`files[].mtime`), et
`sealInventory.v018BuildWindowOpened` est le minimum de ces mtimes, arrondi.
Le contrôle `DOC-20` re-dérive la valeur depuis `files[].mtime` (toujours
possible, même sur une copie qui n'a pas conservé les dates), la re-mesure sur
disque quand les dates y sont d'origine, et **échoue pour un écart d'une
seconde**. La commande ci-dessus est rejouée par `DOC-13`.

Les fenêtres de v0.11 à v0.17 (`sealInventory.v01xBuildWindowOpened`) sont
conservées **telles que leurs lots les ont rapportées** : pour v0.11 à v0.13
elles coïncident avec le mtime minimal du lot ; pour v0.14 la valeur rapportée
(`1789291393`) était celle du premier `MANIFEST`, le mtime minimal du lot étant
`1789290199` — c'est le résidu B2 de v0.14, dit ici tel quel, et non réécrit
dans un lot historique ; pour v0.15 (`1789295186`), v0.16 (`1789306460`) et
v0.17 (`1789313214`) les valeurs sont dérivées par cette méthode et ont été
reproduites par les audits finaux de v0.15, v0.16 et v0.17.

## 8. Provenance documentaire : mesurée, jamais crue

L'audit final de v0.16 a établi que deux documents titrés « MONO-10 v0.7 »
(`HISTORICAL-INPUT-AUTHORITY.md`, `LINEAGE.md`) portaient un contenu apparu en
**v0.10**, et que le `MANIFEST` répétait leur H1 comme origine. Le défaut de
méthode : `RT-08` comparait à v0.11, jamais au lot que le titre nommait, et les
parenthèses « (contenu de vX, corrigé en vY) » des autres H1 étaient écrites à
la main — fausses pour deux d'entre elles.

Depuis v0.17, la provenance est **mesurée** par le constructeur sur les lots
scellés joignables (v0.1 à v0.17 pour ce lot), et re-mesurée par le test :

- `MANIFEST.documentHistory[fichier]` = `{ firstAppearedIn, changedIn[] }` pour
  chaque `.md` du lot — le lot où le document est apparu, puis chaque lot où il
  a changé (`DOC-27`) ;
- `MANIFEST.originTitledDocuments[fichier]` pour les neuf documents dont le H1
  n'est pas la version courante : `h1Version`, `conceptualOriginVersion`
  (la version que le titre affiche — celle du lot qui a donné au document sa
  forme actuelle de titre), `firstAppearedIn` (le premier lot où un fichier de
  ce nom existe — ce n'est **pas** toujours la même chose), `currentContentOriginVersion`
  (le **premier** lot scellé où le contenu courant apparaît à l'identique), `originPath`,
  `currentSha256`, `originSha256`, `byteIdentical` ; `DOC-24` compare le fichier
  au **lot nommé**, re-mesure le premier lot identique, et refuse toute origine
  de contenu qui n'est pas byte-identique ou qui n'est pas la première.

| Document | H1 (origine conceptuelle) | Première apparition (`firstAppearedIn`) | Origine de contenu (premier lot identique) |
|---|---|---|---|
| `CONTRACT-GUARD.md`, `UPSTREAM-EVIDENCE-BINDING.md` | v0.7 | v0.7 | v0.7 |
| `HUMAN-ACT-AUTHENTICATION.md` | v0.7 | v0.6 | v0.7 |
| `KEY-MANAGEMENT.md` | v0.7 | v0.5 | v0.7 |
| `RUN-ORDER.md` | v0.7 | v0.1 | v0.7 |
| `HISTORICAL-INPUT-AUTHORITY.md` | v0.7 — la version que le titre affiche | v0.7 | **v0.10** — le contenu courant est celui de v0.10, byte-identique de v0.10 à v0.18 ; v0.7 n'est pas l'origine du contenu |
| `LINEAGE.md` | v0.7 — la version que le titre affiche ; le fichier n'a **pas** été « conçu en v0.7 » | **v0.1** — le fichier existe depuis le premier lot | **v0.10** — contenu de v0.10, byte-identique de v0.10 à v0.18 |
| `ARCHITECTURE.md`, `CONTRACT-MAPPING.md` | v0.11 | v0.1 | v0.11 |

Trois notions, trois mesures, à ne pas confondre : la version affichée par le
titre, le premier lot où le fichier existe, le premier lot où son contenu
courant apparaît. v0.17 écrivait « conçu en v0.7 » pour `LINEAGE.md` : c'est
la version de son titre, pas sa naissance — le fichier existe depuis v0.1
(`documentHistory`).

Les deux documents à origine de contenu v0.10 ne sont **pas réécrits** par
v0.17 ni v0.18 : les retitrer aurait fait du lot courant l'origine de leur
contenu, et effacé la mesure. Leur H1 reste « v0.7 » ; ce que « v0.7 » veut dire est
déclaré, mesuré et contrôlé ici et dans le `MANIFEST`. Tout autre document
porte la version courante dans son H1, sans parenthèse : son histoire est dans
`documentHistory`.
