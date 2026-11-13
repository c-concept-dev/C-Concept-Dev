# Architecture cible

## 1. Principe

Le noyau actuel reste la source littéraire. La BD est un périphérique utilisant ses sorties publiques.

```text
atelier-auteur-core.js ──┐
                         ├─> atelier-bd-core.js ─> atelier-image-core.js
atelier-editeur-core.js ─┘             │                  │
                                       ├─> mise-en-page-bd.js
                                       └─> shell-bande-dessinee.html
```

## 2. Modules à créer

### `atelier-bd-core.js`

Responsabilité : adaptation déterministe et orchestration de l’état BD.

API proposée :

```js
AtelierBD.VERSION
AtelierBD.createProject(sourceSession, config)
AtelierBD.extractChapter(project, chapterIndex)
AtelierBD.buildAdaptationPrompt(project)
AtelierBD.acceptAdaptation(project, adaptation)
AtelierBD.buildVisualBiblePrompt(project)
AtelierBD.acceptVisualBible(project, bible)
AtelierBD.buildStoryboardPrompt(project)
AtelierBD.acceptStoryboard(project, storyboard)
AtelierBD.attachImage(project, panelId, asset)
AtelierBD.validateProject(project)
AtelierBD.saveProject(project)
AtelierBD.restoreProject(data, ctx)
```

Le module ne fait aucun appel réseau.

### `atelier-image-core.js`

Responsabilité : préparer des requêtes d’image indépendantes du fournisseur.

API proposée :

```js
ImageNoyau.VERSION
ImageNoyau.buildCharacterReferencePrompt(project, characterId)
ImageNoyau.buildPanelPrompt(project, panelId)
ImageNoyau.buildEditPrompt(project, panelId, changeRequest)
ImageNoyau.validateImageRequest(request)
ImageNoyau.registerResult(project, panelId, result)
ImageNoyau.getGenerationHistory(project, panelId)
```

### `atelier-bd-editeur.js`

Responsabilité : contrôles déterministes et préparation d’une revue LLM facultative.

Contrôles :

- traçabilité de chaque case ;
- éléments non attestés ;
- continuité des personnages ;
- cohérence temporelle ;
- densité de texte ;
- ordre de lecture ;
- pages surchargées ;
- références manquantes ;
- consentements manquants.

### `mise-en-page-bd.js`

Responsabilité : produire une représentation SVG/HTML imprimable.

Le format interne d’une page doit rester indépendant du moteur d’images.

### `shell-bande-dessinee.html`

Responsabilité : interface, stockage local, import/export, appels injectés.

Callbacks proposés :

```js
ctx.llmCall(system, user, maxTokens, model)
ctx.imageCall(request)
ctx.onLog(message, level)
ctx.confirmExternalTransfer(payloadSummary)
```

## 3. Adaptateurs d’image

### Adaptateur manuel

Ne fait aucun appel. Il produit :

- prompt ;
- liste des références ;
- réglages conseillés ;
- zone d’import du fichier obtenu.

### Adaptateur API

Le shell appelle un worker. Le worker appelle l’API d’image. Le secret reste côté worker.

```text
Navigateur ── requête sans secret ──> Worker ── clé secrète ──> API image
```

### Adaptateur simulé

Retourne des images de test locales et déterministes. Utilisé pour les tests, jamais pour juger la qualité visuelle.

## 4. Règle de dépendance

- Le noyau Auteur ne dépend pas de la BD.
- Le noyau Éditeur ne dépend pas de la BD.
- Le noyau BD peut lire les API publiques Auteur/Éditeur.
- Le noyau Image ne connaît pas le shell.
- Le shell assemble les dépendances.
- Les exports ne contiennent aucun secret.

## 5. Compatibilité

Un `.ldv.json` existant doit rester lisible. L’option BD crée un nouveau projet lié à l’empreinte de la source ; elle ne modifie pas silencieusement le manuscrit.

## 6. Stratégie de branchement

1. Tests rouges des contrats BD.
2. `atelier-bd-core.js` sans interface.
3. Sauvegarde/restauration.
4. Adaptateur simulé.
5. Shell minimal.
6. Mode manuel ChatGPT.
7. Mise en page et PDF.
8. Seulement ensuite : adaptateur API réel.

