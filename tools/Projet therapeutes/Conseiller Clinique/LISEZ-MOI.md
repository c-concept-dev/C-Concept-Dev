# Studio Clinique — Phase 0 (retrait vidéo) + Phase B (split Noyau/Périphérique)

## Contenu de ce paquet

- `studio-clinique.html` — le périphérique "création de documents" : coquille HTML/CSS +
  Schemas/Fixtures JSON Schema embarqués (inchangé, cf. rapport Phase A point 2) + le tag
  `<script src="studio-clinique-core.js">`.
- `studio-clinique-core.js` — le NOYAU : tout le JavaScript applicatif (moteurs structuré/legacy,
  éditeur riche, bibliothèque/RAG, brand kit, ClinicalDocument/versions, service de capture),
  déplacé VERBATIM depuis l'ancien `<script>` inline (vérifié octet pour octet avant le split,
  cf. rapport). Chargé exactement comme `therapeute-core.js` (Projet therapeutes/Therapeute Noyau
  periph) : un fichier global, sans bundler ni module.
- `Schemas/`, `Fixtures/`, `vendor/` — copies de référence (mêmes fichiers que ceux déjà utilisés
  par le dépôt réel pour produire les blocs JSON embarqués dans le HTML). `vendor/ajv2020.min.js`
  EST réellement chargé par le HTML (`<script src="vendor/ajv2020.min.js">`) ; `Schemas/` et
  `Fixtures/` ne sont PAS fetchés à l'exécution dans ce lot — ils restent une référence humaine,
  la source déjà embarquée dans le HTML.

## Lancer en local — AUCUN serveur requis pour ce lot

Double-cliquer `studio-clinique.html` (ou l'ouvrir via `file:///chemin/vers/studio-clinique.html`
dans un navigateur). Le chargement de `studio-clinique-core.js` via `<script src>` fonctionne
nativement en `file://` (contrairement à `fetch()`, qui serait bloqué par CORS en local — c'est
précisément pourquoi ce lot n'a PAS transformé Schemas/Fixtures en vrais fichiers fetchés, cf.
rapport Phase A point 2/5).

Ce que tu peux vérifier sans serveur ni backend :
- Le chargement de la page, la navigation, l'écran d'accueil.
- Que `studio-clinique-core.js` se charge bien (ouvrir la console développeur : aucune erreur
  "adoc... is not defined" ne doit apparaître).
- La validation de schéma côté client (ajv), qui ne dépend d'aucun réseau.

## Ce que tu NE POURRAS PAS tester sans configuration supplémentaire

Une génération réelle (Fiche/Carrousel/etc.) appelle le Worker de production
(`c-concept-dev.github.io` est la SEULE origine autorisée par CORS côté Worker,
`ADOC_ALLOWED_ORIGIN`, cf. rapport Phase A point 6). Ouvert en `file://` ou en `localhost`, le
navigateur enverra un `Origin` différent et le Worker refusera la requête (erreur CORS dans la
console, pas un bug de ce lot). Pour tester une génération réelle, il faudrait soit déployer ce
paquet sur l'origine autorisée, soit que Christophe élargisse temporairement
`ADOC_ALLOWED_ORIGIN` côté Worker — décision et action séparées, hors périmètre de ce lot.

## Si un jour Schemas/Fixtures deviennent de vrais fichiers fetchés (PAS fait dans ce lot)

Ça exigerait un serveur HTTP local (`fetch()` de fichiers locaux est bloqué en `file://`), par
exemple :
```
cd studio-clinique/
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/studio-clinique.html
```
Et il faudrait alors migrer les 118 scripts `verify-*.js` (sur 126) qui ouvrent aujourd'hui le
HTML via `page.goto('file://' + FILE)` — un chantier séparé, à ne pas faire au même lot,
cf. rapport Phase A point 5.

## Hash de vérification

| Fichier | Lignes | Hash SHA-256 |
|---|---:|---|
| `studio-clinique.html` | 2981 | `e5c4a395a72b045c413f28b4fda4819012a785c0458e50a48d3cc346c888f8f7` |
| `studio-clinique-core.js` | 12279 | `24f6883d8d964e8df3052f7d80a69d70b8b6f3fc7286b449920464e8c1e65175` |

Régression complète (126 scripts `verify-*.js`) exécutée après ce split : 118 PASS, 7 CRASH et
1 TIMEOUT — identique à la baseline connue avant ce lot, aucune nouvelle anomalie.

Aucun commit ni push — ce paquet est un livrable de test local uniquement.
