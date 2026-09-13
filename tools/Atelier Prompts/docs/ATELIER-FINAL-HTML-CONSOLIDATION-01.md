# ATELIER-FINAL-HTML-CONSOLIDATION-01

> L'audit demandé avait déjà été fait, et verrouillé par des tests.
> Ce lot le vérifie, le prouve, et emballe.

## 1. État d'entrée

`HEAD = 93992e9fbe2af82318d37db33fb0274206bb6eee`, worktree Atelier **propre**, aucune mutation
externe. HTML canonique : `atelier-prompts-v11.5-lot10g-decision-provider.html` — 1 362 951 octets,
21 996 lignes.

## 2. Ce que ce lot n'a pas eu à faire

**`PRODUCTION_CODE_CHANGED = NO`.** Aucun fichier de production n'a été modifié, et c'est le
résultat, pas un renoncement : le lot HTML-FINAL-01 avait déjà mené cet audit et l'a **gravé dans
32 tests**, tous verts. Les redécouvrir aurait été du travail en double ; les vérifier était le
travail.

| ce que le §3 demande | ce qui le garde déjà |
|---|---|
| aucun identifiant dupliqué, aucune référence morte | `T-HTMLFINAL01-01` à `-03` |
| **aucun sélecteur CSS orphelin** | `T-HTMLFINAL01-04` |
| la page s'exécute réellement | `T-HTMLFINAL01-06` |
| Rapide rend un prompt **sur place** | `T-HTMLFINAL01-07` |
| Architecte dialogue puis rend un prompt | `T-HTMLFINAL01-08`, `-09` |
| **une bascule ne laisse jamais deux surfaces visibles** | `T-HTMLFINAL01-11` |
| **la demande et les documents survivent aux bascules** | `T-HTMLFINAL01-12` |
| **chaque aide dit réellement quelque chose** | `T-HTMLFINAL01-13` |
| aucun indicateur d'attente ne survit à une bascule | `T-HTMLFINAL01-15` |
| le vocabulaire des modes est celui du produit | `T-HTMLFINAL01-17` |
| tout contrôle et tout bouton portent un nom | `T-HTMLFINAL01-18`, `-19` |
| le focus reste visible | `T-HTMLFINAL01-20` |
| hiérarchie des titres, zones vivantes annoncées | `T-HTMLFINAL01-21`, `-22` |
| **aucun débordement à 1440 / 768 / 430 / 390 / 375 px** | `T-HTMLFINAL01-23` à `-27` |
| l'interface n'écrit aucune autorité sémantique | `T-HTMLFINAL01-29`, `-30` |

228 tests d'interface et de modes exécutés séparément : **228/228**.

## 3. Audit des reliquats — ce qui a été cherché, et ce qui a été trouvé

Recherche de `TODO`, `FIXME`, `XXX`, `debugger`, `console.log`, textes de banc, commentaires de
migration, branding obsolète, styles inline morts, handlers orphelins.

**Aucun reliquat.** Trois faux positifs méritent d'être nommés, parce qu'un nettoyage aveugle les
aurait supprimés :

| trouvé | verdict | pourquoi |
|---|---|---|
| `todo`, `xxx`, `tbd`, `placeholder` | **KEEP** | ce sont des **motifs de détection** du produit : les gardes qui refusent un prompt à trous. Les retirer désarmerait une protection. |
| `console.log(JSON.stringify(event))` ×2 | **KEEP** | journalisation structurée d'observabilité (`defaultLog` de `provider-ha`), pas du débogage. Vient du noyau généré ; l'éditer dans le HTML violerait la chaîne de génération. |
| `benchmark`, `fixture` ×3 | **KEEP** | mots présents dans des **commentaires** du noyau embarqué, jamais dans une surface utilisateur. |

`display:none` inline ×29 : conservés — ce sont des états initiaux de panneaux que `resetModePresentation`
et `setMode` pilotent ensuite par `hidden`. `T-HTMLFINAL01-04` garantit déjà l'absence de sélecteur orphelin.

## 4. Contrôles d'aide « ? »

Construits par `boutonAide(texte)` : `<button type="button">` portant `?`, `aria-label="Aide"`,
`aria-expanded="false"`, la charge d'aide en `data-aide`, **et un `title` natif** en repli si le
script d'infobulle est empêché.

Câblage par délégation au document : `focusin` (donc **accessible au clavier**), `click` qui
bascule, clic extérieur qui ferme, **`Escape` qui ferme**. `aria-expanded` passe à `true` à
l'ouverture et revient à `false` à la fermeture. La cible est `<div id="bulle" role="tooltip"
aria-live="polite">`, et `placerBulle` **la contraint au viewport** — recentrage horizontal borné à
12 px des bords, bascule au-dessus si elle déborderait en bas.

Aucun « ? » cosmétique n'est possible **par construction** : l'injection ne se fait que pour les
clés présentes dans `AIDES` / `AIDES_RELEVES`, et le texte du bouton vient de cette table.
`T-HTMLFINAL01-13` le garde.

*Réserve mineure, non corrigée* : les boutons ne portent pas `aria-controls="bulle"`. L'annonce est
assurée par `aria-live` sur l'infobulle ; l'ajout serait une amélioration, pas un défaut évident, et
le §8 demande de ne corriger que l'évident.

## 5. Bascule de mode

`setMode(mode)` synchronise le sélecteur, met à jour le texte d'aide et le libellé de l'action
principale, bascule `.is-active` **et `aria-pressed`** sur les cartes, puis appelle
`resetModePresentation(mode)` qui masque `#ui-rapid-result`, `#ui-rapid-gate`, `#v11-api-progress`,
`#v11-exchange`, `#v11-dialogue` et `#v11-ready`, et pose `document.body.dataset.v11Mode`.

Une ligne du code dit l'essentiel : *« On conserve volontairement `#v11-demande`, les documents et
`state.docs`. »* La demande de l'utilisateur survit à la bascule — c'est exactement le §3.B.

Entrer dans un mode non gouverné périme le tour en vol (`v11AbandonGovernedTurn`), ce qui empêche
un tour lancé en Architecte d'atterrir par-dessus quelqu'un qui compose déjà en Atelier.

## 6. Runtime embarqué

Le runtime généré est contenu **verbatim** dans le HTML, et la régénération par la chaîne officielle
produit **zéro différence**.

```
SOURCE_RUNTIME_HASH   = 74f8199ec718d19887c714d153e43103210ad2ebcc404a227b5d21d3fcaaca2f
EMBEDDED_RUNTIME_HASH = 74f8199ec718d19887c714d153e43103210ad2ebcc404a227b5d21d3fcaaca2f
MATCH                 = YES
```

## 7. Scan de secrets

Aucune occurrence de `sk-ant-`, `gsk_`, `sk-proj-`, `Bearer …`, `Authorization:`, ni d'affectation
littérale de `ANTHROPIC_API_KEY` / `GROQ_API_KEY`, dans le HTML, le noyau, les workers, les docs ou
l'évaluation. **Aucun chemin de machine locale** dans l'artefact.

## 8. Manifeste et jeu de release

Les **80 fichiers** du jeu de release déclaré par `docs/RELEASE-MANIFEST.md` sont présents, et
**chacun correspond à son empreinte**. Aucun manquant, aucune divergence.

Répartition : 1 HTML canonique · 20 `REQUIRED_BUILD` · 13 `REQUIRED_RUNTIME` · 43 `REQUIRED_DOC` ·
3 `BUILD_TOOL`.

## 9. Artefact final

`Atelier-Prompts-FINAL.zip`, construit **à partir du jeu de release du manifeste** plutôt que d'une
liste inventée. Contenu : le HTML canonique, `core/`, `workers/`, `docs/`, les trois outils de
build, `package.json` et la ligne de base anti-régression.

Exclus et vérifiés absents : `node_modules`, autres ZIP, traces d'évaluation et de campagne, suites
de tests, `.env` / `.dev.vars`, secrets, fichiers parasites.

**Emplacement : à la racine du dépôt, hors du périmètre Atelier.** Ce n'est pas un détail : le garde
`T-CLEAN05-21` refuse tout `.zip` à l'intérieur du périmètre, et il a refusé le premier essai. Le
dépôt veut son périmètre propre et son artefact de livraison ailleurs ; c'est respecté.

L'empreinte est dans `Atelier-Prompts-FINAL.zip.sha256`, à côté du ZIP — délibérément **pas recopiée
ici** : le ZIP contient ce document, l'y inscrire créerait une circularité. Le ZIP n'est pas
versionné (`.gitignore:118 *.zip`), et `.gitignore` n'a pas été modifié.

## 10. Limites à déclarer

**Aucun outillage navigateur n'est installé** — ni Playwright, ni Puppeteer, ni jsdom. Ce lot n'a
donc *rien vu* : il n'a pas rendu la page, pas cliqué, pas mesuré un pixel.

Ce qui est prouvé l'est par deux moyens distincts, et il faut les distinguer :

- **exécution réelle** — le harnais `loadPilot` évalue le code frontend de production dans un DOM
  simulé (`T-HTMLFINAL01-06` et suivants). La logique de bascule, d'aide et d'état est donc
  réellement exercée ;
- **invariants statiques** — le responsive (`-23` à `-27`) est vérifié par règle CSS : aucune largeur
  fixe supérieure à 375 px, grilles repliables. C'est une garantie forte contre le débordement, **ce
  n'est pas un rendu**.

`RESPONSIVE` et `ACCESSIBILITY_SMOKE` sont donc rapportés PASS **au sens de leurs invariants
vérifiés**, pas au sens d'une inspection visuelle. Une relecture à l'œil sur un vrai navigateur
reste la dernière chose que ce lot ne peut pas remplacer.

Aucun appel API n'a été passé.
