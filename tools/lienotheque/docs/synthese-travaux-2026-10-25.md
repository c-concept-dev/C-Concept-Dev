# Liénothèque — synthèse des travaux

**État établi le 25 octobre 2026.** Cette synthèse couvre le projet `tools/lienotheque/` du dépôt C-Concept-Dev, de sa mise en place début octobre aux derniers changements du 24 octobre. Elle s'appuie sur le code, l'historique Git (261 commits touchant ce sous-dossier), le [journal des décisions](decisions.md) et un contrôle local `pnpm check` effectué pour cette synthèse. Les chiffres de corpus ci-dessous sont des relevés **datés**, pas des compteurs de production actuels.

> **Périmètre important.** Liénothèque est distincte de `bibliotheque-admin.html`, de Studio Clinique et du Worker `clone-proxy`. Les travaux récents de traduction de livres entiers et de remplacement d'ouvrages dans Bibliothèque Thérapeutique ne sont pas des fonctions de Liénothèque.

## 1. Ce que construit Liénothèque

Liénothèque vise une bibliothèque universelle : recevoir des documents et médias, les organiser selon le vocabulaire de chaque bibliothèque, les lire, les relier et les retrouver avec un repère fidèle à la source — page imprimée quand elle existe, emplacement ou passage quand elle n'existe pas. Le socle est volontairement indépendant d'un domaine particulier : les catégories, étiquettes et mots affichés viennent du schéma de la bibliothèque, pas de cas cliniques écrits dans le code.

Deux usages ont été séparés :

- **Bureau (Tauri 2)** : créer et administrer une bibliothèque locale, traiter les fichiers, vérifier les résultats et lire hors ligne.
- **En ligne (Worker Cloudflare + React)** : consulter une bibliothèque publiée depuis un navigateur, avec une façade D1/R2 et une identité contrôlée. Cette voie n'est pas un second moteur d'ingestion.

Le principe directeur est « une seule chaîne de traitement, plusieurs portes ». Les contrats typés protègent les frontières entre interface, moteur, dépôt local et service en ligne.

## 2. Travaux réalisés, par chantier

| Chantier | Réalisations principales | Repères |
|---|---|---|
| Identité et interface | Nom Liénothèque, logo géométrique, charte graphite/cuivre, jetons CSS, thèmes clair/hybride/sombre, composants React issus du kit UI, contrôles de contraste et de clavier. | [Charte](charte/), [kit UI](ui-kit/), `packages/jetons/` |
| Socle | Monorepo pnpm/Node 24, contrats Zod/JSON Schema, noyau indépendant, banc d'universalité, dépôt SQLite local cloisonné par bibliothèque, migrations, versions et vues actives. | `packages/contrats/`, `packages/noyau/`, `packages/depot-sqlite/`, `packages/banc/` |
| Application bureau | Tauri 2 et hôte Rust, moteur Node embarqué en processus séparé, création/ouverture de bibliothèques, organisation, dépôt, file durable, catalogue, recherche, lecteur et réglages. L'hôte est le seul écrivain du dépôt. | `apps/app/`, `apps/app/src-tauri/`, [décisions D2](decisions.md) |
| Formats et lecture | Identification par contenu, lecture PDF natif, OCR des scans, EPUB, pages doubles, redressement, optimisation d'images, vignettes, recettes de repérage et association de médias. Les formats refusés donnent une cause explicite. | `outils/formats/`, `outils/lecteur-texte/`, `outils/redresseur/`, `outils/recettes/`, `outils/ingestion/` |
| Provenance et recherche | Passages structurés, origine du texte, rang, chapitre/section, page imprimée si attestée ; recherche dans le texte, filtres issus du classement, citation cohérente et accès à la lecture. Un EPUB n'est pas présenté comme possédant des pages imprimées. | `packages/noyau/src/recherche.ts`, migrations `0005` à `0007`, `apps/app/src/pages/Recherche.tsx` |
| Consultation | Écrans Catalogue, Lecteur avec image, lecture du texte sans image pour PDF natif/EPUB, audio et médias associés, page de vérification, recherche navigable et écran de doublons. | `apps/app/src/pages/` ; [chantier du livre natif](chantier-lire-un-livre-natif.md) |
| Service en ligne | Worker Hono séparé de `clone-proxy`, registre D1, base d'essai D1, objets R2, façade de recherche, vues publiées, liens de fichiers signés, page servie à la même origine, sessions et cérémonie d'identité. | `apps/worker/`, [plan E5](lot-e5-plan.md), [page servie](lot-e5-page-servie.md) |
| Traduction à la demande | Depuis le 24 octobre : traduction **d'une page vers le français**, par Workers AI `@cf/meta/m2m100-1.2b`, segments de 500 caractères au plus coupés aux fins de phrase, deux appels simultanés au maximum, garde contre les répétitions et cache D1 invalidé si le texte source change. Aucun cache partiel n'est écrit si un segment échoue. | `apps/worker/src/traduction.ts`, migration `0008`, `apps/app/src/pages/lecteur/TextePage.tsx` ; commit `dae5dbf0` |

### Les principaux correctifs issus des essais réels

- La lenteur de lecture de F4 a été analysée : une tentative de découpage accélérait le traitement en **perdant** l'orientation correcte et des numéros imprimés. Cette optimisation a été invalidée ; la lecture plus lente, mais juste, a été conservée ([décision](decisions.md)).
- Sur le réimport de corpus, deux écritures concurrentes pouvaient perdre des pointeurs de versions actives. Un verrou de processus et des noms de fichiers temporaires uniques ont corrigé la course ; les versions invisibles ont été réactivées sans retraiter leur contenu ([BAS-02](decisions.md)).
- Les erreurs du moteur embarqué sont devenues lisibles, et le paquet a été réaligné sur la chaîne réellement testée. Le travail d'OCR, les images de page, les compteurs et la corbeille externe ont reçu des correctifs spécifiques (notamment `79167c13`).
- Des boutons ou parcours qui semblaient disponibles sans appeler la bonne action ont été corrigés ; des tests traversent désormais les frontières d'interface au lieu de vérifier seulement une fonction isolée (`80bbf785` et les commits du 21 octobre).
- La bibliothèque publiée et les écrans Catalogue/Lecteur ont été rendus consultables en ligne (`def5c077`). Les médias et décisions de vérification sont servis ou conservés sous le bon périmètre (`dd42655d`).

## 3. Corpus et mesures : ce qui a été réellement observé

Le réimport **BAS-02 du 21 octobre** a traité une bibliothèque **d'essai** sur volume externe : 249 documents en file après dédoublonnage de 292 fichiers, 243 réussites, 6 échecs, 32 052 passages déposés, en environ 5 h 15. Après réparation des activations, le journal indique 243 versions actives et zéro version sans pointeur. Dans l'échantillon de contrôle, 29 documents interrogeables sur 30 répondaient et citaient juste ; le trentième était trop court pour la question. Ce relevé n'est ni l'état actuel de D1 ni une garantie de réussite sur tous les formats.

Des épreuves plus ciblées ont aussi confirmé, selon le corpus concerné, le chemin dépôt → traitement → recherche → citation, l'OCR de scans, la lecture de PDF natifs et d'EPUB, ainsi que l'association de repères à des médias. Les fixtures contenant des œuvres sous droits restent hors Git ; certains tests réels se sautent donc volontairement sans ces fichiers.

Pour cette synthèse, `pnpm check` a terminé avec **code de sortie 0** : typage de l'espace de travail et suites de tests. Quelques avertissements de test subsistent (notamment des clés React dupliquées dans un scénario en ligne et des données de police PDF.js non fournies dans certaines fixtures) ; ce résultat vert ne prouve pas à lui seul un parcours complet sur la bibliothèque d'un utilisateur.

Le 25 octobre, la route publique `/sante` du Worker `lienotheque-api` répondait avec la version **0.2.0**, l'état `pret` et les capacités `sante`, `vision`, `fichiers`, `recherche`, `traduction`. Ce contrôle ne vérifie ni une session authentifiée, ni la présence de tous les ouvrages, ni une traduction réelle de bout en bout.

## 4. Choix structurants et limites assumées

1. **Une bibliothèque, une vérité locale.** Le bureau tient les versions et la vue active ; la publication en ligne sert un instantané, elle ne réinterprète pas les documents dans une seconde chaîne.
2. **Repères honnêtes.** Une citation utilise le numéro imprimé seulement quand il a été établi ; l'EPUB est repéré autrement. Le texte OCR est annoncé comme reconnu, non présenté comme éditorial.
3. **Sécurité séparée selon les usages.** Les écrans en ligne emploient la session ; les fichiers, un laissez-passer signé et périssable ; les opérations de service, un accès distinct. Les secrets restent hors dépôt. L'accès des applications tierces par jeton limité et la question CORS/multibibliothèque ont été explicitement identifiés comme des travaux de la suite, pas comme des garanties déjà livrées ([décisions du 22 octobre](decisions.md)).
4. **Cloudflare reste un service distinct.** Le Worker `lienotheque-api` et ses bases ne sont pas `clone-proxy` ni `therapeute-library`. La traduction de page de Liénothèque **conserve un cache en D1** ; elle n'est donc pas à confondre avec les choix de stockage de l'export PDF de Bibliothèque Thérapeutique.
5. **Universalité par extension, non promesse que tout marche déjà.** Le registre de lecteurs permet d'ajouter des formats, mais chaque format et chaque type de média demandent leur propre preuve. La transposition Windows reste informative pendant la bêta macOS ; Linux est hors périmètre annoncé.

## 5. Ce qui reste à suivre

- **Valider le parcours humain complet** sur la bibliothèque de référence : dépôt, lecture, recherche, citation, médias, publication, accès depuis un second appareil et traduction. Les tests automatisés et `/sante` ne remplacent pas cette validation.
- **Traiter les refus de formats et les six échecs historiques** sur le corpus d'essai en gardant leur cause précise ; ne pas convertir « 243/249 » en promesse de prise en charge universelle.
- **Continuer la fidélité du lecteur** : l'écran texte rend les documents sans image lisibles, mais le surlignage exact de l'extrait depuis la recherche et le rendu visuel fidèle des PDF natifs restent des sujets distincts ([chantier](chantier-lire-un-livre-natif.md)).
- **Achever l'intégration des applications tierces** si Studio Clinique ou d'autres systèmes doivent interroger Liénothèque : jetons bornés par bibliothèque/actions, origines CORS autorisées, isolation et révocation, puis tests réels de bout en bout.
- **Mettre à jour les README du projet et du Worker.** Ils décrivent encore le « lot 0 » ou un simple squelette, alors que le code, les commits récents et `/sante` montrent davantage. Le présent document est une synthèse datée, pas un remplacement de leur maintenance.

## 6. Repères pour reprendre le travail

- [Journal des décisions](decisions.md) : arbitrages, mesures, défauts rencontrés et réserves.
- [Plan du socle Cloudflare](lot-e-proposition.md), [plan de la version en ligne](lot-e5-plan.md), [page servie par le Worker](lot-e5-page-servie.md).
- [Chantier de lecture des documents natifs](chantier-lire-un-livre-natif.md).
- Commandes locales : depuis `tools/lienotheque/`, `pnpm check` pour le typage et les tests, `pnpm build` pour les artefacts. Les épreuves Rust/Tauri et les parcours réels ne sont pas inclus dans `pnpm check`.
- Derniers jalons Git de ce périmètre : `80bbf785` (consolidation bureau), `dd42655d` (médias et décisions), `79167c13` (correctifs application), `def5c077` (consultation en ligne), `dae5dbf0` (traduction de page).

**Conclusion.** Liénothèque possède aujourd'hui un socle local éprouvé, un premier corpus d'essai réellement traité, des écrans de lecture et de recherche, et une façade en ligne active. Le chantier suivant est moins de créer un nouveau noyau que de confirmer les parcours humains et de fermer, avec preuves, les limites de formats, de fidélité de lecture et d'intégration externe.
