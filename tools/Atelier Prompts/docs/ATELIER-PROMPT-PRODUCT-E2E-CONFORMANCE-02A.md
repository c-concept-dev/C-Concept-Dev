# ATELIER-PROMPT-PRODUCT-E2E-CONFORMANCE-02A

**Lot :** `ATELIER_PROMPT_PRODUCT_E2E_CONFORMANCE_02A`
**Nature :** audit produit en lecture seule. Aucun correctif, aucun appel provider.
**Produit jugé :** le **prompt final** — pas l'architecture qui le fabrique.

**Résultat en une phrase.** La fidélité est excellente : sur huit demandes du corpus réel, **8/8**
conservent objectif, quantités, format, destinataire, périmètre et matériau, sans une seule
invention. Mais le prompt réellement livré n'est **jamais** celui que le Prompt Contract Gate a
contrôlé — **0/8** — parce que `adpRunRapide` réassemble le prompt après le gate, avec une fusion de
verrous qui ne sait qu'**ajouter**. Conséquence mesurable : une demande de vingt-un mots produit un
prompt de 2 026 caractères, et quatre demandes sur huit portent une quantité explicite qui n'est
jamais promue en contrainte.

---

## A. Baseline

```
git status --short -- 'tools/Atelier Prompts'  → ?? docs/ATELIER-FAST-DEEP-TRIGGER-REAL-SMOKE-01.md
git branch --show-current                      → main
git rev-parse HEAD                             → 51ecbfb97d95fae5b73cbcfde97ead07ec3337d4
git log -5  → 51ecbfb Update studio-clinique.html
               e6d1371 ATELIER-FAST-DEEP-TRIGGER-FIX-01D-N: le plan profond redevient une escalade
               01e08fb / 7f3f245 / 305f544
```

Chantier 1D présent et clos : `e6d1371` (1D-N) est dans l'historique ; le rapport de smoke 1D-O est
le seul fichier non suivi. **Aucun fichier de production modifié par ce lot.**

## B. Mission produit

`MD ATELIER.md` : *comprendre → clarifier seulement si nécessaire → construire avec l'ADN →
contrôler → livrer le prompt*. Le lot ne juge donc ni la latence, ni Fast/Deep, ni les providers —
seulement ce que la personne reçoit.

## C. État réel des lots ADN

Vérifié par présence de code **et** par chemin d'appel, jamais par le statut de la roadmap.

| lot | état | preuve |
|---|---|---|
| **ADN-CANON-01/02** | **IMPLEMENTED** | `core/adn/oprie-canonical-mapping.js` (`mapOprieToCanonicalContract`, `CANONICAL_BASE_FIELDS`, `validateCanonicalContract`, `ACCEPTED_PRESENTATION_LOSSES`) + `adn-state.js` ; seul consommateur algorithmique de la sortie de tour |
| **ADN-RAPIDE-01** | **IMPLEMENTED** | `core/adn/rapide-canonical-enrichment.js` ; `rapideProjectionCanonique()` ; dans `assemblerRapideAdaptatif` : « quand un contrat canonique existe, il décide le format, la quantité et les verrous. Les sélecteurs historiques ne sont pas consultés. » |
| **ADN-ARCH-01/02** | **IMPLEMENTED** | `core/adn/arch-canonical-enrichment.js` ; `archContexte()` (plage gelée) ; `archControleQg()` |
| **ADN-QG-00 / Prompt Contract Gate** | **PARTIAL** | `core/adn/prompt-contract-gate.js`, `PROMPT_CONTRACT_GATE_PRODUCTION_ACTIVE = true`, 20 codes de violation ; appelé par `rapideControleQg` et `archControleQg`, **fail-closed** — mais appliqué à un prompt qui est ensuite remplacé (§P) |
| **ADN-QG-01 / Output Compliance Gate** | **IMPLEMENTED** | `core/adn/output-compliance-gate.js` ; couple `{prompt, contrat}` posé par `rapideDernierePublication` et par `adpRunRapide` ; `ARCH_QG_SORTIE_MESSAGES` |

Aucun lot `ABSENT`. Un seul `PARTIAL`, et c'est le défaut n°1.

## D. Corpus

Huit cas **réutilisés tels quels** depuis `evaluation/corpus-lot10g2a.json` (30 cas existants).
Aucune fixture métier créée, aucun codage en dur.

| dimension demandée | cas | demande |
|---|---|---|
| simple complète | **R05** | ordre du jour d'un atelier de 45 minutes sur l'accueil des nouveaux salariés |
| quantité exacte | **R01** | checklist de **20 points** pour préparer un voyage en Italie |
| format strict | **R07** | comparer train/voiture **dans un tableau** avantages, limites, critères |
| matériau fourni | **R11** | analyser un tableau CSV (matériau réel injecté) |
| destinataire explicite | **R03** | expliquer la photosynthèse **à un enfant de 10 ans**, **cinq** paragraphes |
| périmètre / préservation | **R13** | traduire **en conservant les titres et les listes** |
| hypothèse substituable | **R14** | **trois scénarios** pour réduire de **15 %** les dépenses |
| multi-contraintes | **R06** | **dix** slogans chaleureux de moins de **huit mots** |

## E. Pipeline end-to-end

```
demande
 └─ (OPRIE si tour gouverné) → arbiter.state + candidat + issues
 └─ mapOprieToCanonicalContract                     core/adn/oprie-canonical-mapping.js
 └─ rapideProjectionCanonique(materiau) → p         si contrat canonique présent
 └─ assemblerRapideAdaptatif()                      PLAGE GELÉE « moteur Rapide »
      ├─ format  = (p && p.format) || rapideFormatAdaptatif()
      ├─ verrous = p ? p.locks : actifsAdaptes(profil.verrous, ctx)
      ├─ rapideAppliquerCanoniqueAuContexte(ctx, p)
      ├─ blocs = assemblerAnnote(ctx, actifs) ; prompt = blocs joints
      └─ si p : rapideControleQg(...)  →  FAIL ⇒ AUCUN prompt exposé   ◀── LE GATE
 └─ adpRunRapide (chemin PRINCIPAL du mode)         HTML ~21884
      ├─ refined    = adnRefineRapidEnvelope(r, orientation, materiau)
      ├─ projection = projectToRapide(refined, …)
      ├─ actifs     = adnMergeLegacyLocks(r.actifs, projection)      ◀── UNION
      └─ si actifs ≠ r.actifs : r.prompt = assembler(r.ctx, actifs)  ◀── APRÈS LE GATE
 └─ prompt livré (copié, affiché, mémorisé)
```

Les deux flèches marquées sont le cœur de cet audit.

## F. Canonical Contract

Mesure faite avec les harnais dédiés du dépôt — `tests/rapide-assembler-harness.helper.mjs`
(`runRapidePipeline`, qui reproduit explicitement l'ordre de `adpRunRapide`) et
`tests/archcompiler-harness.helper.mjs` (`compileWith`).

**Portée de la mesure, énoncée sans détour.** Mes huit exécutions ont été lancées **sans contrat
canonique** (`orientation.canonical = null`), donc sur la branche `p === null`. Dans cette branche :
le format vient de la détection historique, les verrous de `actifsAdaptes`, et **le gate ne tourne
pas du tout** (`if(p){ … rapideControleQg … }`). Ce que j'ai donc mesuré est le chemin **sans contrat
canonique** — celui d'une demande qui n'a pas traversé un tour OPRIE gouverné.

Pour la branche canonique, je n'ai **pas** exécuté : le verdict correspondant est établi par lecture
de code, et signalé comme tel partout dans ce rapport. Je ne présente aucune mesure que je n'ai pas
faite.

| champ canonique | R05 | R01 | R07 | R11 | R03 | R13 | R14 | R06 |
|---|---|---|---|---|---|---|---|---|
| `original_request` | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT |
| `intent` / objectif | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT |
| `output` / format | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT |
| `quantities` | **MISSING** | PRESENT | PRESENT | PRESENT | **MISSING** | ABSENT_JUSTIFIED | **MISSING** | **MISSING** |
| `evidence` / matériau | n/a | n/a | n/a | PRESENT | n/a | PRESENT | n/a | n/a |
| `provenance` | n/a | n/a | n/a | PRESENT | n/a | PRESENT | n/a | n/a |
| `selected_locks` | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT |
| `checks` | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT | PRESENT |
| invention | **aucune** | aucune | aucune | aucune | aucune | aucune | aucune | aucune |

`quantities` MISSING sur **4 cas sur 8** — développé au §I et §Q.

## G. ADN — 5 propriétés, jugées sur le prompt livré

| propriété | verdict | preuve observable |
|---|---|---|
| **INTENTIONALITY** | **PASS** | la section `TÂCHE` porte la demande **mot pour mot** sur 8/8 ; `RÔLE` nomme le livrable attendu |
| **EXECUTABILITY** | **PASS** | `FORMAT DE SORTIE`, `AMORCE ET CLÔTURE` (« Premier caractère de votre réponse : … »), `INTERDICTIONS` — le modèle sait par quoi commencer et finir |
| **DISCIPLINE** | **PASS** | interdictions explicites de préambule, de conclusion, d'espace réservé (« ni "…", ni "etc.", ni "à compléter" ») |
| **COMPLETENESS** | **PARTIAL** | complet sur l'objectif et le format ; **incomplet sur les quantités** — 4/8 demandes portent un nombre explicite qui n'entre dans aucune contrainte opposable |
| **CONFORMITY** | **PARTIAL** | le gate existe et est fail-closed, mais il ne contrôle pas l'artefact livré (§P) |

## H. 9 techniques, sur le prompt livré

| technique | R05/R03/R14/R06 (simples) | R01/R07/R11/R13 |
|---|---|---|
| 1 contrat préalable | `ACTIVE_AND_EFFECTIVE` (`RÔLE`) | idem |
| 2 blocage des échappatoires | `ACTIVE_AND_EFFECTIVE` (pas de résumé en lieu du contenu) | idem |
| 3 interdiction des questions inutiles | `ACTIVE_AND_EFFECTIVE` (pas de question finale) | idem |
| 4 format strict / bordures | `ACTIVE_AND_EFFECTIVE` | idem |
| 5 démarrage forcé | **`OVERAPPLIED`** — `AMORCE ET CLÔTURE` ajoutée par la fusion sur des demandes qui ne la demandaient pas | `ACTIVE_AND_EFFECTIVE` |
| 6 interdictions explicites | `ACTIVE_AND_EFFECTIVE` | idem |
| 7 obligations absolues | `ACTIVE_AND_EFFECTIVE` | idem |
| 8 règles quantifiées | **`MISSING`** — aucune section `CONTRAINTES QUANTIFIÉES` alors que la demande porte un nombre | `ACTIVE_AND_EFFECTIVE` |
| 9 injonction finale | **`OVERAPPLIED`** — `VÉRIFICATION AVANT ENVOI` en 5 points sur une demande de 21 mots | `ACTIVE_AND_EFFECTIVE` |

La technique 8 manque exactement là où la technique 5 et la 9 sont en excès : le système en met trop
là où il n'en fallait pas, et pas assez là où il en fallait.

## I. 13 verrous

`role, destinataire, donnees, provenance, perimetre, gabarit, format, amorce, volume, interdits,
hypotheses, longueur, controle` (plage gelée `VERROUS`).

| cas | verrous fusionnés (livrés) | `volume` ? | quantité dans la demande | verdict |
|---|---|---|---|---|
| R05 | donnees, format, interdits, **role, amorce, longueur, controle** | **non** | 45 minutes | **MISSING_REQUIRED** (`volume`) + `PROJECTED_WITHOUT_JUSTIFICATION` (4 ajoutés) |
| R01 | role, destinataire, format, amorce, interdits, controle, **volume**, longueur | oui | 20 points | `SELECTED_AND_EFFECTIVE` |
| R07 | destinataire, donnees, format, **volume**, interdits, role, amorce, longueur, controle | oui | 300 km | `SELECTED_AND_EFFECTIVE` |
| R11 | 12 verrous dont **volume, provenance, hypotheses** | oui | — | `SELECTED_AND_EFFECTIVE` |
| R03 | donnees, format, interdits, **role, amorce, longueur, controle** | **non** | cinq paragraphes | **MISSING_REQUIRED** |
| R13 | role, destinataire, format, amorce, interdits, controle, donnees, provenance, longueur | non | — | `NOT_SELECTED_JUSTIFIED` |
| R14 | donnees, format, interdits, **role, amorce, longueur, controle** | **non** | trois scénarios, 15 % | **MISSING_REQUIRED** |
| R06 | donnees, format, interdits, **role, amorce, longueur, controle** | **non** | dix slogans, huit mots | **MISSING_REQUIRED** |

Quatre cas sur huit portent une quantité explicite sans verrou `volume` : le nombre survit
**verbatim dans `TÂCHE`**, mais n'est jamais promu en règle opposable ni en point de vérification.

Et la fusion ajoute systématiquement `role, amorce, longueur, controle` sur les quatre cas simples —
`retirés par la fusion : (aucun)` sur **8/8**.

## J. Fidélité

Comparaison directe demande ↔ prompt livré, sur les jetons porteurs de sens de chaque cas :

| cas | jetons vérifiés | conservés |
|---|---|---|
| R05 | 45 minutes, accueil des nouveaux salariés | **2/2** |
| R01 | 20, Italie | **2/2** |
| R07 | tableau, avantages, limites, critères, train, voiture, 300 | **7/7** |
| R11 | CSV, manquantes, doublons, anomalies | **4/4** |
| R03 | 10 ans, cinq, photosynthèse | **3/3** |
| R13 | allemand, titres, listes | **3/3** |
| R14 | trois, 15, bénéfices, risques | **4/4** |
| R06 | dix, huit mots, boulangerie | **3/3** |

**28/28 jetons conservés. Aucune invention. Aucune restriction ajoutée sans source.** Le matériau
est correctement délimité (`DONNÉES SOURCES` + `PROVENANCE ET USAGE DU MATÉRIAU` sur R11 et R13).
Architecte : **10/10** sur les trois cas exercés.

C'est le point fort du produit, et il faut le dire aussi nettement que les défauts.

## K. Proportionnalité

| cas | prompt assemblé | prompt livré | facteur | verdict |
|---|---|---|---|---|
| R03 | 692 car. | **2 026** | **×2,9** | **OVERBUILT** |
| R14 | 709 car. | 2 021 | ×2,9 | **OVERBUILT** |
| R06 | 685 car. | 1 997 | ×2,9 | **OVERBUILT** |
| R05 | 1 656 car. | 2 022 | ×1,2 | OVERBUILT (léger) |
| R07 | 950 car. | 2 173 | ×2,3 | **OVERBUILT** |
| R13 | 1 415 car. | 2 751 | ×1,9 | OVERBUILT |
| R11 | 2 841 car. | 3 587 | ×1,3 | PROPORTIONATE |
| R01 | — | — | — | PROPORTIONATE |

Cas emblématique — R03, vingt-un mots : « Explique la photosynthèse à un enfant de 10 ans en cinq
paragraphes courts ». Le prompt livré fait 2 026 caractères et sept sections, dont un protocole
`[SUITE_REQUISE : dernier élément traité = <identifiant>]` et une vérification en cinq points — alors
qu'aucune contrainte quantifiée n'y figure, et que « cinq paragraphes » n'est nulle part opposable.

Aucun seuil numérique n'est posé ici : le verdict vient du rapport entre ce que la demande contient
et ce que le prompt ajoute.

## L. Rapide

`RAPIDE_CANONICAL_PROJECTION` — la mécanique existe et elle est même **fail-closed dans le bon
sens** : si un contrat `exploitable` ne parvient pas à projeter, `assemblerRapideAdaptatif` **refuse
d'emprunter le parcours historique** et n'expose aucun prompt. C'est exactement la garde qu'on
voudrait.

Mais sur la branche mesurée — sans contrat canonique — la projection canonique n'a pas lieu, le gate
ne tourne pas, et la fusion ADN s'ajoute par-dessus les verrous historiques.

## M. Architecte

Trois cas exercés via `compileWith` : R03, R06, R07. Fidélité **10/10**. Structure constante —
`RÔLE | OBJECTIF | DEMANDE ORIGINALE | FORMAT DE SORTIE | VÉRIFICATION AVANT ENVOI` — et longueur
quasi constante (2 188 / 2 199 / 2 225 car.).

**Réserve de portée** : `compileWith` utilise l'`analyseFixture()` par défaut du harnais. Ce que j'ai
mesuré est donc la fidélité du texte de la demande et le squelette de sections, **pas** la sélection
de verrous cas par cas. `archControleQg` existe, appelle `guardPromptContract`, et est fail-closed
(`return ''` sur FAIL) — vérifié par lecture, non exercé.

## N. Comparaison des modes

| champ | RAPIDE | ARCHITECTE | `SEMANTIC_EQUIVALENCE` |
|---|---|---|---|
| intent / objectif | `TÂCHE`, verbatim | `OBJECTIF` + `DEMANDE ORIGINALE`, verbatim | **OUI** |
| contraintes explicites | conservées | conservées | **OUI** |
| quantités | **verbatim, non opposables (4/8)** | verbatim | **OUI** sur le texte, `PARTIAL` sur l'opposabilité |
| périmètre / exclusions | conservés (R13) | conservés | **OUI** |
| matériau | `DONNÉES SOURCES` + `PROVENANCE` | délimité | **OUI** |
| destinataire | conservé (R03) | conservé | **OUI** |
| non-invention | aucune | aucune | **OUI** |
| obligations canoniques | présentes | présentes | **OUI** |
| profondeur / structure | 7 à 11 sections | 5 sections | divergence **autorisée** |

```
MODE_SEMANTIC_DIVERGENCE = NO
```

Les deux modes divergent en structure — ce que le CDC autorise — et convergent sur tous les champs
que le §12 interdit de faire diverger.

## O. Legacy overrides

```
LEGACY_OVERRIDE_EXISTS = NO
```

C'est le point où l'architecture est **meilleure** que ce que l'énoncé du lot redoutait, et cela
mérite d'être établi précisément.

Deux assembleurs Rapide coexistent :

- `assemblerRapideAdaptatif()` — voie canonique, consulte le contrat, applique ses verrous, passe le
  gate ;
- `assemblerRapide()` — voie historique, ne consulte **aucun** contrat canonique (`INTENTIONS`,
  `intentionActive`, `construireDemandeRapide`), ne passe **aucun** gate.

Le second est **injoignable** : l'unique bouton `#btn-rapide-copier` (HTML:1936) est lié à
`copierRapideAdaptatif` (HTML:7279), ainsi que le raccourci Ctrl+Entrée (HTML:7283).
`copierRapide()` est un **orphelin connu, conservé délibérément** parce qu'il est la borne de fin de
la plage gelée « moteur Rapide » — et ce fait est lui-même asserté :

```js
// tests/shared-state-cleanup-clean02.test.mjs:188
assert.deepEqual(orphelines.filter((n) => !['$','$$'].includes(n)), ['copierRapide']);
```

Aucune donnée canonique n'est donc reconstruite, écrasée ou ignorée par une projection historique.

**Ce qui ressemble à un override n'en est pas un, et c'est pire** : ce n'est pas le legacy qui écrase
le canonique, c'est la **fusion** qui empile les deux. Voir §Q, défaut 2.

## P. Prompt Contract Gate

Le gate est réel et sérieux. `core/adn/prompt-contract-gate.js` :
`PROMPT_CONTRACT_GATE_PRODUCTION_ACTIVE = true`, statuts `PASS | PASS_WITH_WARNINGS | FAIL`, et vingt
codes de violation dont **exactement** ceux qui compteraient ici :

```
QUANTITY_MISMATCH · SCOPE_MISMATCH · FORMAT_MISMATCH · PROVENANCE_MISMATCH
LOCK_MISMATCH · MISSING_REQUIRED_PROJECTION · EMPTY_REQUIRED_SECTION · MISSING_CHECK
CONTRADICTORY_INSTRUCTION · DUPLICATE_CONFLICTING_INSTRUCTION · ASSUMPTION_MISMATCH
```

Il est appelé fail-closed par `rapideControleQg` et `archControleQg` : sur `FAIL`, aucun prompt n'est
exposé.

**Et il contrôle un artefact qui est ensuite remplacé.**

```js
// assemblerRapideAdaptatif — le gate tourne ICI, sur `prompt`
const blocs=assemblerAnnote(ctx,actifs), prompt=blocs.map(b=>b.texte).join('\n\n');
if(p){ const verdict=rapideControleQg(p.contract,prompt,…); if(verdict.status==='FAIL'){…return null} }

// adpRunRapide — chemin PRINCIPAL du mode, APRÈS le gate
const actifs=adnMergeLegacyLocks(r.actifs,projection);
if(… && JSON.stringify(actifs)!==JSON.stringify(r.actifs)){ r.actifs=actifs; r.prompt=assembler(r.ctx,actifs) }
// ← aucun second appel au gate
```

Mesure : **0/8 cas où le prompt assemblé est le prompt livré.** Les verrous changent sur **8/8**, et
le prompt est réassemblé à chaque fois.

```
RAPIDE_PROMPT_CONTRACT_GATE    = PARTIAL
ARCHITECTE_PROMPT_CONTRACT_GATE = PARTIAL   (existe, fail-closed, non exercé ici)
```

Ce que le gate **ne peut pas** vérifier, et que je ne lui reproche pas : la pertinence sémantique
d'une question, la justesse d'un registre, l'adéquation d'un ton. Il vérifie des correspondances
structurelles entre un contrat et un texte. C'est déjà exactement ce qu'il faudrait pour attraper les
défauts 2 et 3 — s'il regardait le bon texte.

## Q. Défauts produit

### Défaut 1 — le gate contrôle un prompt qui n'est pas livré

```
CLASSE = PROMPT_GATE_GAP
USER_VISIBLE = YES        PROMPT_QUALITY_IMPACT = HIGH
```

Mesuré : 0/8. Code : `adpRunRapide` réassemble `r.prompt` après le gate, sans le rappeler.
Conséquence : `QUANTITY_MISMATCH` et `LOCK_MISMATCH` — qui auraient attrapé les défauts 2 et 3 — ne
sont jamais évalués sur l'artefact livré.

### Défaut 2 — la fusion de verrous ne sait qu'ajouter

```
CLASSE = OVERCONSTRAINT
USER_VISIBLE = YES        PROMPT_QUALITY_IMPACT = HIGH
```

```js
function adnMergeLegacyLocks(existing,projection){
  const merged=[];
  [...existing, ...projection.legacy_lock_ids].forEach(id=>{if(id&&!merged.includes(id))merged.push(id)});
  return merged;                       // union stricte : jamais de retrait
}
```

Quatre lignes. La sélection proportionnée de l'ADN ne peut **jamais** retirer un verrou historique,
et les verrous historiques ne peuvent jamais écarter un ajout ADN. `retirés par la fusion : (aucun)`
sur 8/8. Résultat : ×2,9 sur les demandes simples, `AMORCE ET CLÔTURE` et `VÉRIFICATION AVANT ENVOI`
imposées à une demande de vingt-un mots.

### Défaut 3 — une quantité explicite n'est pas promue en contrainte

```
CLASSE = UNDERCONSTRAINT (+ LOCK_SELECTION_GAP)
USER_VISIBLE = YES        PROMPT_QUALITY_IMPACT = HIGH
```

R05 (45 minutes), R03 (cinq paragraphes), R14 (trois scénarios, 15 %), R06 (dix slogans, huit mots) :
verrou `volume` non sélectionné, section `CONTRAINTES QUANTIFIÉES` absente. Le nombre ne survit que
dans `TÂCHE`. C'est la classe de demande la plus courante, et c'est là que le prompt est le plus
faible.

### Observation 4 — texte généré malformé

```
CLASSE = OTHER        USER_VISIBLE = YES        PROMPT_QUALITY_IMPACT = LOW
```

Sur 4/4 cas dépourvus de verrou `volume`, la section de vérification livre littéralement :

> « 2. Le volume tient-il dans la fourchette indiquée (aussi court que le sujet le permet, **sans
> remplissage mots) sans remplissage** ? »

Interpolation dupliquée et agrammaticale, dans un artefact livré à l'utilisateur.

## R. Priorisation

Classés par fidélité, non-invention, qualité du prompt, exploitabilité, simplicité — non par facilité
technique.

1. **Défaut 1** — le gate ne contrôle pas l'artefact livré. Il est premier parce qu'il est la
   **cause de l'impunité** des deux suivants : un gate qui regarderait le bon texte les signalerait.
2. **Défaut 2** — la fusion-union défait la proportionnalité de l'ADN. Elle touche l'exploitabilité
   et la simplicité sur toutes les demandes simples.
3. **Défaut 3** — les quantités explicites ne deviennent pas opposables. Elle touche la complétude
   sur la moitié du corpus.

L'observation 4 n'entre pas au classement : réelle, visible, mais sans effet sur la décision du
modèle.

## S. Prochain correctif minimal

**Une seule cause, et elle est locale.**

```
MINIMAL_NEXT_CORRECTION =
  faire porter le Prompt Contract Gate sur le prompt RÉELLEMENT livré — c'est-à-dire, dans
  adpRunRapide, soit rappeler rapideControleQg après la réassemblage, soit déplacer la fusion
  de verrous AVANT l'assemblage gaté, de sorte qu'il n'existe qu'un seul prompt dans le tour.
```

Pourquoi c'est le bon premier correctif, et pourquoi il suffit :

- il ne crée aucun composant, aucune autorité, aucune taxonomie — le gate et la fusion existent ;
- il ne change ni prompt provider, ni schéma, ni OPRIE, ni l'ADN ;
- et **il rend les défauts 2 et 3 visibles par la machine** : `LOCK_MISMATCH` signalerait les quatre
  verrous ajoutés sans justification, `QUANTITY_MISMATCH` signalerait les quantités non projetées.
  On ne corrige pas trois défauts ; on remet en marche l'instrument qui les mesure.

Les défauts 2 et 3 seront alors instruits sur preuve du gate, pas sur mon jugement.

`NEW_COMPONENT_REQUIRED = NO` · `NEW_ARCHITECTURE_REQUIRED = NO`

## T. Verdict

Jugé sur le prompt que l'utilisateur reçoit, Atelier Prompts réussit ce qui est le plus difficile et
rate ce qui est le plus mécanique.

Il réussit la **fidélité** : 28 jetons porteurs de sens sur 28 conservés, objectif, format,
destinataire, périmètre, matériau et quantités présents, **aucune invention**, aucune restriction
ajoutée sans source, dans les deux modes. Il réussit l'**intentionnalité**, l'**exécutabilité** et la
**discipline** : la demande est portée mot pour mot, le modèle sait par quoi commencer et finir, et
les échappatoires sont fermées. Et il n'a **aucun override legacy** : la voie historique est
injoignable, et ce fait est asserté par un test.

Il rate la **proportionnalité** et la **complétude**, pour une seule raison structurelle : il existe
deux prompts dans un tour, et le contrôle regarde le premier tandis que la personne reçoit le second.
Une fusion de verrous qui ne sait qu'ajouter s'intercale entre les deux. D'où une demande de vingt-un
mots qui reçoit 2 026 caractères de contrat, et une demande de « dix slogans de moins de huit mots »
dont aucune de ces deux quantités n'est opposable au modèle.

Le correctif n'est pas de mieux choisir les verrous. Il est de faire en sorte qu'il n'y ait **qu'un
seul prompt** dans le tour — celui qui est contrôlé et celui qui est livré étant le même. Le reste
suivra, et se mesurera.
