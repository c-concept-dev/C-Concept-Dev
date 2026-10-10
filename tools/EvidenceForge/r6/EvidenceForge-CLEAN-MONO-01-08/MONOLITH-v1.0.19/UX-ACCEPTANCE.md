# UX-ACCEPTANCE — MONOLITH v1.0.1

Recette d'interface mesurée le 2026-09-14 : rendu par Chrome headless (captures `ui-*.png` conservées dans le dossier de session), vérifications structurelles par le test U1, flux API par les tests V1/Q1–Q5 et les runs réels (`FUNCTIONAL-TEST-REPORT.md`).

## Mode simple — parcours attendu par le mandat

| Exigence | État | Preuve |
|---|---|---|
| Page d'accueil fonctionnelle : demande visible, ajout de documents, bouton lancer | OK | capture `ui-desktop-home` / `ui-mobile-home` ; `POST /api/runs` |
| Reformulation présentée, confirmation puis lancement (« Confirmer et lancer l'analyse ») | OK | capture `ui-desktop-gate1` (run `efm-20260914-8beea006`) : compréhension, périmètre, ambiguïtés, angles, plan, nom, bouton |
| Progression lisible en langage utilisateur (9 étapes nommées sans code) | OK | `STAGE_LABELS` (test Q5), cartes d'étapes terminé / en cours / à venir / interrompu |
| L'utilisateur ne choisit ni professionnel ni discipline | OK | angles retenus automatiquement (`AUTO_RETAIN_VALID_PROPOSALS`) et affichés pour information ; panel admis par porte machine |
| Aucun code EF-*, aucun checkpoint, aucun JSON à réparer en mode simple | OK | test U1 ; v1.0.1 : codes de réserves / critères / readiness / hashes repliés dans « Détails techniques » (test U1 vérifie qu'ils sont hors du rendu par défaut) |
| Rapport final : établi / convergent / divergent / provisoire / non établi / réserves / qualification / limites | OK | capture `ui-desktop-report` (run importé P0.1) ; `report.json` |
| « Pourquoi EvidenceForge dit cela ? » sur chaque énoncé → lignée compréhensible (constat, raisonnement, passages du document, jumeau, professionnel identifié, publications réelles, source ratifiée, limites) | OK | `stage-report.js → lineageOf` ; dépliant par énoncé |
| `PROCESS_QUALIFICATION = QUALIFIED_WITH_RESERVATIONS` / `SCIENTIFICALLY_USABLE = NO` affichés, jamais « validé scientifiquement » | OK | bandeau d'en-tête du rapport ; test P1/P2 |
| Export JSON | OK | bouton « Exporter JSON » (Blob du `report.json`) ; `GET /api/runs/<id>/report` |
| Export PDF | OK (impression) | bouton « Exporter PDF (imprimer) » → `window.print()` avec feuille `@media print` ; v1.0.1 : page 1 non vide, sections « Pourquoi » ouvertes à l'impression (`beforeprint`), mesuré via CDP `Page.printToPDF` : 483 pages A4 pour le rapport P0.1 importé avec ses 382 lignées |
| Messages d'erreur compréhensibles (fournisseur non configuré, crédit, débit, réseau, délai, ambiguïté bloquante, aucune source, aucun professionnel) | OK | `userMessage` de chaque code ; bandeau rouge/orange ; bouton « Reprendre le run » seulement si reprenable |
| Refresh / lien direct | OK | l'URL porte `#run=<id>[&mode=expert]` ; le rafraîchissement rouvre la même vue et rejoue les 200 derniers événements |
| Reprise après arrêt | OK | bouton « Reprendre le run » → `POST /api/runs/<id>/resume` ; refusé (409) pour un run FAILED non reprenable ; v1.0.1 : sortie invalide du kit EF-01 ⇒ reprise bornée automatique (3 tentatives) avant l'arrêt, message explicite |
| Document refusé | OK (v1.0.1) | le lancement est refusé tant que l'utilisateur n'a pas confirmé « continuer sans ce document » (`DOCUMENTS_REJECTED`) |
| Notification porte 2 | OK (v1.0.1) | bandeau collant + titre d'onglet + notification système (si autorisée) + défilement vers la porte |
| Réimport JSON | OK (v1.0.1) | « Importer un rapport JSON exporté » ; hash canonique vérifié ; limite : rapport seul, sans artefacts détaillés |
| Résultat long | OK | rapport P0.1 importé : 371 énoncés, 4 réserves ; **v1.0** : l'audit final a mesuré un débordement horizontal d'une ligne de la section Qualification (1635/1280 px desktop, 1529/400 px mobile) ; **v1.0.1** : corrigé (`overflow-wrap:anywhere`), mesuré `scrollWidth == clientWidth` à 1280 et 400 px sur le rapport, le mode expert et la porte 2 (script CDP `Emulation.setDeviceMetricsOverride`) |
| Erreur réseau | OK | `NETWORK_UNAVAILABLE` / `PROVIDER_TIMEOUT` → STOPPED reprenable, message en clair ; interface : `EventSource` se reconnecte seul |

## Desktop / mobile

- Desktop 1280 px : `ui-desktop-home`, `ui-desktop-gate1`, `ui-desktop-report`, `ui-desktop-expert`.
- Mobile 400 px (viewport réel via cadre 400 px puis, en v1.0.1, via émulation d'appareil CDP) : `ui-mobile-home`, `ui-mobile-gate1`, `ui-mobile-report` — colonnes d'étapes en 2 × n, cartes pleine largeur, boutons accessibles au pouce ; défilement horizontal : présent en v1.0 sur une ligne (constat d'audit), absent en v1.0.1 (mesuré).
- Note de méthode : Chrome impose une largeur minimale de fenêtre (~500 px) ; la capture mobile est donc réalisée dans un `<iframe>` de 400 px, ce qui donne le viewport de mise en page réel.

## Mode expert

Onglets sur l'artefact brut du run (état, RunContract, plan/SearchProtocol, snapshot, screening, corpus, candidats, évaluation MONO-10, gate machine, corpus professionnels, jumeaux, revues, agrégation, qualification, run MONO-10/sceau/attestation/chaînes, lignée/hashes, appels LLM réels vs réutilisés, journal, fichiers). Capture `ui-desktop-expert`.

## Deux confirmations, pas zéro — et pourquoi

Le mandat vise « l'utilisateur confirme et lance, puis pipeline automatique ». Les contrats gelés imposent **deux** actes humains réels en mode REAL (validation du SearchProtocol ; `acteur:"human"` sur chaque décision de screening). Le monolithe les présente comme deux écrans clairs (« Confirmer et lancer », « Ratifier et poursuivre »), avec le nom de l'utilisateur, et ne les simule jamais. Réduire à une seule confirmation exigerait d'amender un lot gelé (MONO-08 v0.6) : hors périmètre, signalé.

## Réserves UX (non bloquantes, v1.0)

- Pas de lecture PDF (texte brut seulement) — limite déclarée à l'écran.
- L'écran de ratification liste jusqu'à ~100 publications : filtrage « incluses + 10 » par défaut, bouton « Tout afficher ».
- Les captures ont été produites en headless ; aucune session de recette avec un utilisateur final n'a eu lieu dans ce chantier (à faire lors du FINAL_USER_PRODUCT_AUDIT).

DESKTOP_PASS = YES · MOBILE_PASS = YES · EXPORT_JSON_PASS = YES · EXPORT_PDF_PASS = YES (impression navigateur)
