# PDF-SAFARI-01 — La lecture PDF locale échouait dans Safari, et nulle part ailleurs

**Verdict** : `LECTURE_PDF_SAFARI = GELÉE` · `DOCX = NON RÉGRESSÉ` · `FROZEN = INTACT (aucune réouverture)`
**Mesures réelles** : `evaluation/pdf-safari-01/mesures-safari-reel.json` — Safari 26.3 de la personne, piloté par `safaridriver`, sur ses propres fichiers
**Tests** : `tests/document-reader-pdf-safari-pdfsafari01.test.mjs` — 10 cas

---

## A. Le symptôme, et ce qu'il n'était pas

Sur la page publiée, dans Safari macOS, **tout** PDF mourait à sa première page :

```
TypeError: undefined is not a function (near '...value of readableStream...')
  at getTextContent (vendor/pdf/pdf.mjs:16040)
  at extractDocument (core/documents/reader.js:116)
```

Le DOCX, lui, passait — ce qui situait d'emblée le défaut dans le chemin PDF seul.

Les `404` sur `pdf.mjs.map` relevés dans la console **n'y sont pour rien** : `pdf.mjs` se termine par
`//# sourceMappingURL=pdf.mjs.map`, le fichier de correspondance n'est pas vendoré, et seul
l'inspecteur web le demande. Aucun effet à l'exécution. Ils sont laissés tels quels : les supprimer
voudrait dire retoucher la bibliothèque vendorée, pour une ligne cosmétique.

## B. La cause racine, relevée dans le Safari de la personne

`PDFPageProxy.getTextContent()` consomme son propre flux de texte ainsi :

```js
const readableStream = this.streamTextContent(params);
for await (const value of readableStream) { … }   // pdf.mjs:16040
```

Relevé par `safaridriver` dans Safari 26.3 (WebKit 605.1.15) :

| Propriété | Valeur |
| --- | --- |
| `ReadableStream.prototype[Symbol.asyncIterator]` | **undefined** |
| `ReadableStream.prototype.values` | **undefined** |
| `ReadableStream.prototype.getReader` | `function` |

Et, dans ce même Safari, `for await (const v of flux)` rend
`TypeError: undefined is not a function (near '...v of st...')` — la même erreur, au même endroit,
avec le même « near » que celui rapporté.

**Safari n'itère pas un ReadableStream. PDF.js suppose que si.**

## C. Pourquoi aucun moteur automatisable ne le voyait

| Moteur | Itération asynchrone de `ReadableStream` | PDF de la personne |
| --- | --- | --- |
| **Safari 26.3 (réel, safaridriver)** | **absente** | **échec** → corrigé |
| WebKit embarqué par Playwright (26.6) | présente | lu, 7 pages |
| Chromium | présente | lu, 7 pages |
| Firefox | présente | lu, 7 pages |

Le WebKit de Playwright est **en avance** sur le Safari livré : la reproduction n'était donc
possible que dans le vrai Safari. Et les tests existants du lecteur injectaient un `pdfLoader` dont
les pages exposent directement `getTextContent` — le flux, et donc son itération, n'existaient
jamais dans le test.

## D. La correction : compléter le moteur, pas la bibliothèque

`core/documents/reader.js` installe, **et seulement si le moteur ne l'a pas**, l'itération
asynchrone de `ReadableStream` telle que la spécification WHATWG la définit : un itérateur adossé à
`getReader()`, qui rend le verrou à la fin comme sur erreur, et annule le flux en cas de sortie
anticipée sauf `preventCancel`.

- **Rien n'est retouché dans PDF.js** : la boucle fautive est toujours là, un test le vérifie.
- **Aucune dépendance ajoutée ni mise à jour** : `pdfjs-dist` reste en `6.3.289`, un test le vérifie.
- **Aucun effet là où l'API existe** : sur Chromium et Firefox la fonction ne fait rien et
  l'implémentation native reste en place, un test le vérifie.
- **Le site d'appel ne change pas** : le lecteur continue d'appeler `getTextContent()`. L'autre
  option — drainer `page.streamTextContent()` nous-mêmes — aurait déplacé le lecteur sur une
  méthode moins publique de PDF.js, dupliqué l'assemblage `lang`/`styles` que `getTextContent()`
  fait déjà, et changé le contrat contre lequel tous les tests existants du lecteur sont écrits.

## E. Avant / après, dans le Safari de la personne

Chaque mesure dans une **page neuve** : le correctif s'installant sur le realm de la page,
enchaîner « avant » après « après » l'aurait faussé (c'est arrivé à la première campagne, corrigé).

| Document | Avant | Après |
| --- | --- | --- |
| `Charte_graphique_Institut_Relation_Couple_v6.pdf` | `undefined is not a function` | **7 pages, 7 085 caractères** |
| `Charte graphique C-Concept-Dev.pdf` | `undefined is not a function` | **8 pages, 7 916 caractères** |
| `IRC_BCC_Synthese_..._OCTOBRE_2026.docx` | 14 991 caractères | 14 991 caractères (inchangé) |

Dans les deux cas réparés : `ocrPages = 0` et la notice attendue, « Texte extrait ; la mise en page,
les schémas et les images ne sont pas interprétés. »

## F. Le contrat de lecture, inchangé

PDF lisible → texte extrait. PDF sans texte → OCR tenté, puis refus explicite
(« Aucun texte reconnu dans ce PDF »). PDF illisible → l'erreur remonte. Aucun document n'est
silencieusement ignoré. Les limites de taille, de pages et de caractères ne sont pas touchées : le
défaut ne venait pas d'elles.

## G. Périmètre

Un seul fichier de produit modifié, `core/documents/reader.js`. Ni le HTML, ni les plages `FROZEN`
(aucune réouverture), ni Anthropic, ni OpenAI, ni `FOURNISSEURS_API`, ni Fast, Deep, OPRIE, les
Workers, CONTINUITE-05, la compilation, le modèle de données, l'UX, ni les chemins DOCX, PPTX, XLSX,
ZIP — le correctif est en amont de tous, dans une capacité du moteur qui manquait.

**GLOBAL** : 3 778 tests, 0 échec. **FROZEN** : vert, sept plages inchangées.
