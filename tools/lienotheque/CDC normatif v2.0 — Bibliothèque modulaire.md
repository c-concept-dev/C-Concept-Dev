# CDC normatif v2.0 — Bibliothèque modulaire (document unique)

Oct 2, 2026 · @Christophe BONNET

## Statut et conventions

**Statut.** Ce document est le cahier des charges unique de la bibliothèque. Il remplace et intègre tous les documents produits le 2 octobre 2026 : audit phase 1, benchmark phase 2, notes de conception, CDC Bibliothèque modulaire, CDC UX/UI, CDC Recherche documentaire, CDC Outils d'optimisation et CDC normatif v1.0, avec les corrections de l'audit indépendant et les décisions prises ensuite. Les anciens documents restent consultables comme historique ; **seul celui-ci fait foi**.

**Mots normatifs.** **DOIT** / **NE DOIT PAS** : obligatoire pour accepter le lot concerné. **DEVRAIT** : attendu, tout écart justifié par écrit. **PEUT** : facultatif.

**Identifiants d'exigences**, stables et jamais réutilisés : `ID-` identités, `JOB-` travaux, `ANC-` ancres et liens, `REC-` recettes, `OUT-` outils, `HER-` fonctions héritées, `OPT-` optimisation, `HEB-` hébergement, `SYN-` synchronisation, `RCH-` recherche, `UX-` interface, `SEC-` sécurité. Les identifiants déjà attribués en v1.0 sont conservés.

**Statut des chiffres.** *Vérifié* (mesuré, avec date), *estimé* (calculé sur hypothèses explicites), *cible* (objectif). Les durées sont des estimations, pas des engagements.

**Principe directeur.** Protéger les usages existants (Studio Clinique continue de fonctionner sans interruption), livrer une première chaîne complète importer → vérifier → lire sur deux corpus vérifiables, puis étendre.

## Vision et principes

**Vision.** Une bibliothèque universelle, neutre et modulaire : n'importe qui crée en quelques minutes une bibliothèque de documents, d'audio, de vidéos ou d'images ; le système les lit (texte de toutes les langues, repères, zones), les relie entre eux (un exercice à sa piste, une partition à son enregistrement, un livre à son livre audio, une vidéo à sa transcription) et permet de tout retrouver, toujours sur la **vraie page** ou au **vrai minutage**.

**Principes directeurs**

1. **Universel et neutre.** Un seul profil utilisateur ; aucun écran, libellé ou parcours propre à un domaine. Le vocabulaire métier vient du schéma de chaque bibliothèque.
2. **Rien en dur pour le domaine.** Champs, filtres, types d'éléments, glossaire, pondérations et recettes sont de la configuration. Les commandes communes (ouvrir, rechercher, importer, annuler, vérifier) restent stables.
3. **Noyau stable, modules interchangeables.** Le noyau stocke, relie, cherche et valide ; chaque traitement est un module au contrat commun.
4. **Stockage cloisonné, recherche fédérée.** Chaque bibliothèque a sa base, ses fichiers, son index et ses droits ; la recherche traverse toutes celles que la personne peut lire.
5. **Le travail se fait dans l'application.** Les traitements lourds tournent dans l'application locale ; Cloudflare stocke, cherche et fournit les services d'IA (traduction, transcription, embeddings).
6. **D1 ne contient jamais de fichier** : seulement des données (registre, ancres, liens, mots positionnés, textes, cartes de synchronisation).
7. **Le système propose, la personne dispose.** Toute proposition montre sa raison et se refuse en un clic ; une décision humaine n'est jamais écrasée par un recalcul.
8. **Optimiser avant d'envoyer.** Chaque fichier est stocké une fois, sous son format le plus léger compatible avec sa lisibilité.
9. **Standards ouverts.** Ancres et liens exportables en W3C Web Annotation et Media Fragments ; cartes en WebVTT et EPUB 3 Media Overlays ; partitions en MusicXML.
10. **Mesurer avant de changer.** Toute modification d'un module, d'une recette ou du moteur de recherche est mesurée sur des fixtures avant activation.

## Utilisateurs, modes d'usage et droits

**Un profil unique.** Un seul type de compte, identique pour tous ; aucun réglage ni écran ne dépend d'une profession déclarée.

**Création ouverte à tous.** Aucun prérequis technique. Par défaut, une bibliothèque vit sur l'ordinateur ; Cloudflare s'active ensuite en un geste. L'assistant ne pose que quatre questions compréhensibles par tous : « Comment voulez-vous l'appeler ? », « Que contient-elle ? », « Où la ranger ? », « Qui peut y accéder ? ».

**Rôles du moment** (une même personne en change ; l'interface s'adapte au rôle, jamais à l'identité) :

| Rôle | Ce qu'on fait | Ce qui compte |
| --- | --- | --- |
| Créer | Créer une bibliothèque, déposer, choisir ou ajuster une recette, suivre le traitement | Simplicité, aperçu immédiat, aucun jargon |
| Vérifier | Confirmer ou corriger les cas douteux, compléter des informations | Comprendre pourquoi, ne jamais perdre une correction |
| Utiliser | Lire, écouter, regarder, répéter, annoter | Zéro friction, lisible à distance, mains libres si besoin |
| Chercher | Trouver, citer, ouvrir la source | Résultat immédiat et vérifiable |
| Partager | Donner une sélection en lecture | Contrôle de ce qui est visible |
| Outil connecté | Interroger par API (Studio Clinique, Prof de basse, Thérapeute IA) | Stabilité des réponses |

**Droits par bibliothèque** : la personne qui crée est propriétaire et invite avec trois niveaux — *lecture*, *contribution* (ajouter, vérifier, annoter), *administration* (réglages, accès, suppression). Les outils connectés reçoivent un accès du même type, visible et révocable.

**Contextes à concevoir** : au bureau (création, vérification) ; à distance de l'écran (instrument en main : grands caractères, clavier ou pédale, écran éveillé) ; consultation rapide ; tablette et téléphone (lecture et usage, la création reste pensée pour l'ordinateur) ; hors ligne.

## État de référence et décisions

**Production actuelle** (*vérifié* le 2 octobre 2026, lecture seule, recoupé par deux audits) : base D1 `therapeute-library` de 167 604 224 octets ; 234 livres, 22 022 passages ; 19 approches ; 91 livres sans auteur exploitable (38,9 %) ; 3 livres avec chapitres ; 301 groupes de numéros de passage répétés (2 175 lignes en excès, aucun texte en double) ; 957 vecteurs orphelins et 340 passages sans vecteur ; base servie depuis l'Amérique du Nord. Elle contient aussi les tables de Studio Clinique.

**Défauts connus du système actuel** : `/login` renvoie la clé maîtresse au navigateur ; le remplacement d'un livre supprime l'ancien avant d'extraire le nouveau ; écritures D1 et Vectorize indépendantes ; filtrage de la recherche de sens après sélection ; exclusion non appliquée à la branche vectorielle ; auteur corrigé pas toujours visible ; identifiant de livre dérivé du nom de fichier.

**Consommateur à préserver** : Studio Clinique (routes `/d1-query`, `/search-library`, `/library-facets`, `/rag-search`, catalogue `ADOC_CATALOG`), utilisé au quotidien.

**Décisions prises**

| Décision | Conséquence |
| --- | --- |
| L'ancienne base reste en service, intacte, jusqu'à la bascule ; elle NE DOIT PAS être archivée ni supprimée dans ce projet | Aucune interruption pour Studio Clinique |
| Pas de réparation de l'ancienne base : tous les livres seront **réimportés** depuis leurs fichiers d'origine dans la nouvelle bibliothèque | Données propres dès le départ ; fichiers d'origine des 234 livres requis |
| La sécurisation de l'accès se fait sans saisie répétée pour les utilisateurs quotidiens | Session longue durée sur appareil de confiance (SEC-02) |
| Les fonctions de l'admin actuelle sont toutes reprises (HER-01 à HER-12) | Rien de ce qui sert ne disparaît |
| Réponses rédigées par Claude Haiku via le Worker existant (secret `ANTHROPIC_API_KEY`) ; AI Gateway optionnel | Pas de nouveau service nécessaire |
| Studio Clinique et VideoBox sont des sources d'inspiration ; aucune reprise de code | Noyau écrit proprement |
| Une base D1 et un espace R2 par bibliothèque sur Cloudflare | Isolement réel |
| Worker vide `clone-prox` supprimé le 2 octobre 2026 | Compte assaini |

## Architecture technique et stack

&#91;embedded content: architecture technique · application locale, Cloudflare, consommateurs\]

Le noyau TypeScript est le même code dans l'application et dans le Worker (contrats, recettes, ancres, liens, règles de synchronisation) ; le stockage et les processus passent par des ports distincts (SQLite local, D1, fichiers locaux, R2), car un schéma SQL commun ne garantit pas des transactions identiques. La double flèche est la synchronisation ; le mode ordinateur fonctionne sans la moitié droite.

| Couche | Choix | Statut |
| --- | --- | --- |
| Application locale | Tauri 2 + hôte Rust, binaires annexes (sidecars) | À valider par prototype Mac/Windows au lot C ; taille mesurée avec les moteurs embarqués |
| Interface | React 19, TypeScript strict, Vite | Retenu |
| Données côté interface | TanStack Query, Router, Table, Virtual ; Zustand | Retenu |
| Contrats | Zod avec export JSON Schema, partagé par interface, noyau, Worker et modules | Retenu |
| Pages et zones | pdf.js ; OpenSeadragon + Annotorious (annotations W3C) ; Moveable pour l'ajustement fin des zones | Retenu |
| Gestes et texte riche | dnd-kit ; Tiptap | Retenu |
| Audio et partitions | wavesurfer.js (régions) ; Verovio pour MusicXML (lot F) | Retenu |
| Base locale | SQLite + FTS5 via l'hôte ; Drizzle côté TypeScript ; recherche de sens locale à spécifier au lot C | Retenu, sens local ouvert |
| Cloud | Hono sur Workers ; D1 ; R2 ; Durable Objects (coordination) ; Queues/Workflows ; Workers AI | Retenu |
| Traitements | Tesseract, pdfimages, ffmpeg, modèles ONNX locaux ; Docling optionnel ; Audiveris au lot F | Retenu |
| Composition de fiches | Puck | Lot F |
| Qualité | Vitest, Playwright, banc d'essai sur fixtures | Retenu |
| Organisation | Monorepo pnpm : `contrats`, `noyau`, `app`, `worker`, `outils/*`, `recettes/*` | Retenu |
| Réalisation | Claude Code sur le dépôt, lot par lot, critères d'acceptation de ce CDC comme tests | Recommandé |

## Définitions et états

| Terme | Définition |
| --- | --- |
| **Bibliothèque** | Espace isolé : schéma, droits, mode d'hébergement, base de données, espace de fichiers |
| **Schéma** | Description d'une bibliothèque : types d'éléments, champs (avec rôles communs), vocabulaire, glossaire, couleur d'accent |
| **Fichier** | Suite d'octets identifiée par son empreinte SHA-256 |
| **Document** | Unité logique de lecture (livre, méthode, recueil, enregistrement) ; plusieurs fichiers et versions possibles |
| **Œuvre** | Ce que l'on cherche indépendamment des documents (un morceau, un texte) |
| **Version de document** | État figé issu d'un traitement donné (fichiers, recette, versions des outils) |
| **Ancre** | Endroit précis dans une version : page, zone, élément, intervalle de temps, passage |
| **Lien** | Relation typée entre deux ancres, avec preuve, confiance et auteur |
| **Carte de synchronisation** | Ensemble de liens ancre ↔ intervalle de temps entre un document et un média |
| **Recette** | Paramètres typés et versionnés qui disent comment traiter un type de document |
| **Outil** | Module de traitement au contrat commun |
| **Travail** | Exécution d'un outil sur une version de document |
| **Dérivé** | Fichier calculé à partir d'une source (vignette, aperçu, forme d'onde) |

**États d'une version de document** (transitions journalisées) :

| État | Signifie |
| --- | --- |
| `reçu` | Fichiers déposés, empreintes calculées |
| `préparé` | Pages triées, optimisées, dérivés produits |
| `lu` | Texte, positions, zones et repères extraits et enregistrés |
| `prêt à lire` | Consultable dans le Lecteur avec ses pages et ses liens validés ou proposés |
| `indexé` | Index plein texte **et** index de sens **confirmés consultables** pour toutes les ancres (l'indexation de sens est asynchrone : une demande acceptée ne suffit pas) |
| `partiel` | Au moins une étape terminée avec des manques listés et réparables |
| `en échec` | Étape échouée sans résultat exploitable ; erreur et reprise enregistrées |
| `active` | Version montrée pour ce document ; une seule à la fois |
| `remplacée` | Ancienne version conservée après activation d'une nouvelle |

## Identités et versions

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **ID-01** | Un fichier DOIT être identifié par l'empreinte SHA-256 de son contenu ; le nom n'est qu'une étiquette | Fichier renommé reconnu, non réimporté |
| **ID-02** | Un document DOIT avoir un identifiant logique stable, distinct de toute empreinte | Deux éditions d'un même livre rattachables au même document |
| **ID-03** | Une œuvre DOIT avoir un identifiant distinct des documents qui la portent | Un morceau présent dans trois recueils = une œuvre |
| **ID-04** | Tout traitement DOIT produire une nouvelle version ; l'activation DOIT être atomique et réversible | Remplacer un livre par un PDF illisible laisse l'ancienne version active et intacte |
| **ID-05** | Une version NE DOIT PAS être supprimée avant que la suivante soit `active` et validée | Interruption pendant un remplacement : aucun contenu perdu |
| **ID-06** | Chaque résultat d'outil DOIT citer l'empreinte de la source, la version de la recette et la version de l'outil | Traçabilité complète depuis toute ancre |
| **ID-07** | Les identifiants DOIVENT être globalement uniques et indépendants du contenu affiché (UUID v7 ou équivalent) | Aucune collision entre bibliothèques ou appareils |
| **ID-08** | Lors du réimport des livres de l'ancienne base, leurs identifiants actuels DOIVENT être conservés comme alias | La façade de compatibilité retrouve chaque ancien livre |

## Travaux

**États d'un travail** : `en file` → `verrouillé` → `en cours` → `terminé` | `partiel` | `en échec récupérable` | `en échec définitif` | `annulé`.

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **JOB-01** | Chaque travail DOIT être persisté avant de commencer (identifiant, outil, version ciblée, tentative, horodatage) | Liste exacte des travaux après redémarrage brutal |
| **JOB-02** | Un travail DOIT prendre un verrou avec expiration ; un verrou expiré rend le travail reprenable | Arrêt forcé : reprise automatique |
| **JOB-03** | Un travail long DOIT enregistrer des points de reprise (par page ou par lot) | Reprise au dernier point, sans retraitement |
| **JOB-04** | Tout travail DOIT être idempotent | Rejouer une indexation ne crée aucun doublon |
| **JOB-05** | Les erreurs DOIVENT être enregistrées (cause, éléments, reprise possible) ; aucune erreur avalée silencieusement | Toute erreur visible dans Traitement avec une action proposée |
| **JOB-06** | Les sorties DOIVENT s'écrire dans la version cible sans toucher la version active, puis être activées en une opération | Pendant un retraitement, la recherche reste sur la version active |
| **JOB-07** | L'indexation DOIT tenir un journal par identifiant (prévu, envoyé, confirmé) pour chaque index | Réconciliation base/index : zéro écart inexpliqué |
| **JOB-08** | Un travail DOIT pouvoir être annulé ou mis en pause sans effet sur la version active | Annulation à 50 % : aucun effet visible hors Traitement |
| **JOB-09** | Les travaux DOIVENT tourner en tâche de fond, jamais dans un onglet de navigateur qui doit rester ouvert | Fermer la fenêtre n'arrête pas le traitement de l'application |

## Ancres, liens et cartes de synchronisation

**Conventions**

- **Espace** : pixels de l'image d'origine de la page, origine en haut à gauche, après rotation de redressement ; rotation et recadrage enregistrés avec la page ; les dérivés convertissent par facteur d'échelle.
- **Pagination** : deux numéros par page, index dans le fichier (à partir de 1) et page imprimée (statut lu, déduit ou absent) ; l'interface affiche la page imprimée quand elle existe.
- **Temps** : secondes décimales depuis le début du fichier média d'origine, précision 0,01 s ; image et son d'une vidéo partagent la même base.
- **Texte** : décalages en caractères Unicode dans le texte normalisé de la version, plus la liste des mots positionnés couverts.

**Types d'ancres** : page, zone, élément numéroté, passage, mesure, intervalle de temps, chapitre. **Natures de liens** (extensibles par schéma) : piste de, suite de, même œuvre, transcrit par, cité dans, traduction de.

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **ANC-01** | Chaque ancre DOIT référencer une version, un fichier par empreinte et un sélecteur typé conforme aux conventions | Validation par schéma de 100 % des ancres |
| **ANC-02** | Chaque lien DOIT porter nature, preuve (`lu`, `séquence`, `nom_de_fichier`, `manuel`), confiance (0 à 1) et auteur (outil et version, ou personne) | « Pourquoi ce lien » affichable partout |
| **ANC-03** | Un lien vers un média DOIT distinguer « piste connue » et « segment connu » ; sans segment vérifié, lecture au début de la piste et mention « segment inconnu » | Aucune position de départ inventée |
| **ANC-04** | Export et réimport en W3C Web Annotation (`FragmentSelector` conforme aux Media Fragments) | Aller-retour validé sur une fixture |
| **ANC-05** | Une carte de synchronisation DOIT être indépendante de l'emplacement des fichiers ; le lecteur résout l'emplacement à la lecture | Même carte lue avec un média local puis dans R2 |
| **ANC-06** | Export des cartes en WebVTT et, pour les livres audio, en SMIL (EPUB 3 Media Overlays) | Lecture par un lecteur standard |
| **ANC-07** | Une partition PEUT avoir plusieurs cartes (une par enregistrement), mesures jouées numérotées en tenant compte des reprises | Deux enregistrements synchronisés séparément |

## Recettes typées

Une recette ne contient **aucun texte libre interprété** : paramètres typés, validés par schéma, exécutés par un interpréteur déterministe. Elle se crée dans l'éditeur visuel (zones tracées sur 2 ou 3 pages) sans être écrite à la main.

```json
{
  "id": "methode-pastilles-cd",
  "version": 4,
  "derivee_de": null,
  "preparation": { "redressement": "auto", "double_page": true, "page_gauche": "paire" },
  "lectures": [
    { "ancre": "page_imprimee", "zone": { "type": "coins", "bord": "haut" }, "alphabet": "chiffres" },
    { "ancre": "element", "zone": { "type": "marges_exterieures", "largeur_rel": 0.2 },
      "hauteur_rel": { "min": 0.012, "max": 0.032 }, "alphabet": "chiffres" },
    { "ancre": "piste", "outil": "pastilles", "relatif_a": "element", "position": "dessous",
      "motif": "bloc_sombre_chiffres_clairs", "etiquette_disque": true }
  ],
  "regles": {
    "elements": { "ordre": "strictement_croissant", "saut_max": 12 },
    "pistes": { "ordre": "croissant", "pas_autorises": [0, 1], "penalite_pas_2": 1.5 },
    "changement_disque": { "lectures_sures_consecutives": 3, "valeur_max": 5 },
    "plusieurs_elements_par_piste": true
  },
  "audio": { "motif_nom": "{disque}-{piste} {style} - {element} Pg.{page}", "usage": "indice" },
  "validation": { "seuil_confiance": 0.6 }
}
```

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **REC-01** | Toute recette DOIT valider un schéma publié ; un paramètre inconnu est refusé | Message d'erreur lisible |
| **REC-02** | L'interpréteur DOIT être déterministe | Rejeu identique sur les fixtures |
| **REC-03** | Toute modification DOIT créer une nouvelle version ; les résultats gardent la version qui les a produits | Historique consultable |
| **REC-04** | Changer de recette DOIT proposer le recalcul des seules versions concernées, avec estimation, sans l'imposer | Choix laissé à l'utilisateur |
| **REC-05** | Les noms de fichiers NE DOIVENT servir que d'indices de recoupement | F4 piste 14 : la pastille l'emporte |
| **REC-06** | Les deux recettes prouvées DOIVENT être portées avant toute troisième | Scores au moins égaux aux prototypes |
| **REC-07** | Une recette PEUT être dérivée d'une autre et ne décrire que ses différences | Nouvelle méthode paramétrée en moins de 15 minutes |

**Recettes de départ**

| Recette | Documents types | Statut |
| --- | --- | --- |
| Méthode, pastille = piste | *70s Funk & Disco Bass* | Prouvée (95/95) |
| Méthode, pastilles CD indépendantes | Paul Westwood | Prouvée (83/92 premiers exercices, 89/92 pages) |
| Livre natif | Livres thérapeutiques, Aebersold *Jazz Handbook* | Diagnostic fait ; utilisée pour le réimport |
| Recueil de grilles | Real Books, *Volume 2 contrebasse* | Testée sur une page |
| Livre + livre audio | À venir | Lot F |

## Outils intégrés et fonctions héritées

**Contrat commun des outils.** Entrée : une source (empreinte, fichier ou zone) et des paramètres issus de la recette. Sortie : un JSON validé par schéma (ancres, textes, liens proposés, chacun avec confiance), avec la version de l'outil. Un outil n'écrit jamais en base : le noyau écrit. Chaque outil est appelé par la recette ou ouvert à la main depuis l'Atelier.

| Réf. | Outil | Rôle | Où il tourne | Lot |
| --- | --- | --- | --- | --- |
| **OUT-01** | Inspecteur | Natif ou scanné, résolution, couleur, poids, pages manquantes, doublons ; estimation du poids final et du coût | Application | C |
| **OUT-02** | Optimiseur | Format par page (voir OPT), couche texte préservée, aperçu avant/après | Application | C |
| **OUT-03** | Redresseur | Rotation, perspective, coupe des doubles pages, effacement du verso visible, binarisation adaptative | Application | D |
| **OUT-04** | Générateur de dérivés | Vignettes, aperçus, formes d'onde ; images de vidéo (Media Transformations) | Application ; vidéo côté Cloudflare | C |
| **OUT-05** | Lecteur de texte | Texte natif ou OCR multilingue avec position de chaque mot | Application | C |
| **OUT-06** | Détecteur de zones | Petits modèles locaux (ONNX) : texte, portée, tablature, numéros, figures ; corrigeable | Application | D |
| **OUT-07** | Lecteur de repères | Numéros de page et d'élément, pastilles, séquence | Application | C |
| **OUT-08** | Vision ciblée | Envoie à Claude uniquement les zones difficiles, à bonne résolution, avec budget par lot | Application + Worker | D |
| **OUT-09** | Transcripteur | Audio ou vidéo → texte minuté mot par mot (Whisper sur Workers AI) | Cloudflare | F |
| **OUT-10** | Associateur média | Relie médias et ancres, découpe aux silences, vérifie les durées, produit les cartes | Application | C |
| **OUT-11** | Traducteur | Passages traduits à la demande (Workers AI `m2m100`), cache, original toujours accessible | Cloudflare | E |
| **OUT-12** | Normaliseur | Complète auteur, éditeur, ISBN depuis des référentiels ouverts ; regroupe les valeurs proches ; signale les douteuses | Application | E |
| **OUT-13** | Synchroniseur | Envoi par empreinte, reprenable, file hors ligne | Application + Cloudflare | E |
| **OUT-14** | Tableau de stockage | Poids et coût par bibliothèque et par type de média, alertes, conseil d'hébergement | Application | E |
| **OUT-15** | Banc d'essai | Rejoue les fixtures après chaque changement d'outil ou de recette | Application | C |

**Fonctions héritées de l'admin actuelle, toutes reprises**

| Réf. | Fonction actuelle | Reprise |
| --- | --- | --- |
| **HER-01** | Dépôt PDF, HTML, EPUB ; file d'attente (retirer, vider) | Dépôt universel, file de traitement |
| **HER-02** | Détection automatique des métadonnées et formulaire par fichier | Inspecteur + formulaire généré depuis le schéma, valeurs suggérées marquées |
| **HER-03** | Doublon à l'ajout : « Écraser » ou « Ignorer » | « Remplacer (nouvelle version) », « Ignorer », « Garder les deux » ; rien n'est supprimé avant succès (ID-04) |
| **HER-04** | « Indexer tout » | Traitement du lot entier en tâche de fond |
| **HER-05** | Liste avec statistiques, actualisation | Catalogue et vue d'ensemble |
| **HER-06** | Modification des métadonnées | Édition individuelle et groupée ; toute valeur existante conservée, même hors liste |
| **HER-07** | Suppression d'un livre | Confirmation, journal d'audit, marque de suppression |
| **HER-08** | Scan et purge des doublons | Scan des doublons de fichiers, contenus et documents ; fusion ou suppression proposée et validée, jamais automatique |
| **HER-09** | Test de recherche en trois colonnes avec provenance et score | Banc de pertinence dans les réglages |
| **HER-10** | Bascule traduction / texte original | Conservée dans résultats et Lecteur |
| **HER-11** | Glossaire | Glossaire par bibliothèque dans le schéma, aussi utilisé comme synonymes |
| **HER-12** | Journal d'activité | Écran Traitement et journal d'audit |

## Optimisation des fichiers et dérivés

**Mesures *vérifiées* sur de vraies pages (2 octobre 2026)**

| Page | Format actuel du dépôt | Format optimisé | Gain |
| --- | --- | --- | --- |
| Realbook p. 28 (noir et blanc) | PNG couleur 144 dpi : 468 Ko | 1 bit, compression G4, 300 dpi : 45 Ko | ×10, résolution doublée |
| Westwood (photo couleur) | PNG : 3,5 Mo | WebP qualité 70 : 145 Ko ; AVIF : 88 Ko | ×24 à ×40 |
| Vignette | — | WebP 320 px : 19 Ko | — |
| Aperçu | — | WebP 1 200 px : 130 Ko | — |

*Estimé* : le corpus musical actuel (3 611 pages, 2,2 Go) tiendrait entre 0,5 et 1 Go, dérivés compris.

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **OPT-01** | Chaque page DOIT être classée (noir et blanc, gris, couleur, native) et stockée dans le format adapté : 1 bit compressé (G4/JBIG2), AVIF, AVIF ou WebP, PDF d'origine | Gain ≥ ×5 sur les scans de référence |
| **OPT-02** | La couche texte d'un PDF natif NE DOIT JAMAIS être détruite | Texte natif identique après optimisation |
| **OPT-03** | Toute conversion DOIT être validée visuellement sur un échantillon (traits fins, transparence du verso) avant application au lot | Échantillon validé dans Vérifier |
| **OPT-04** | Les images DOIVENT être extraites à leur résolution d'origine, jamais re-rendues plus bas | Aucune perte de résolution |
| **OPT-05** | Dérivés produits à l'ingestion : vignette (\~320 px, < 25 Ko), aperçu (\~1 200 px), forme d'onde (< 10 Ko) ; la loupe est recadrée à la volée, jamais stockée | Tailles respectées |
| **OPT-06** | Le poids estimé et le coût DOIVENT être affichés avant l'envoi vers Cloudflare | Estimation visible dans l'Inspecteur |
| **OPT-07** | L'archive des originaux non optimisés est un choix explicite (aucune, disque local, R2 classe rare) | Choix enregistré par bibliothèque |

## Hébergement

**Trois modes, au choix par bibliothèque** : *ordinateur* (tout en local), *mixte* (fichiers sur l'ordinateur, index et liens sur Cloudflare), *Cloudflare* (fichiers dans R2, données dans D1).

**Par type de média** (défaut proposé, modifiable) :

| Média | Poids typique optimisé | Où par défaut | Ce qui va dans D1 |
| --- | --- | --- | --- |
| Page scannée noir et blanc | \~45 Ko | R2 | Mots positionnés, zones, page imprimée |
| Photo de page couleur | \~90 à 150 Ko | R2 | Idem |
| PDF natif, EPUB | Fichier d'origine | R2 | Texte, positions, structure |
| Pistes audio courtes | 0,3 à 1 Mo | R2 | Segments, cartes, forme d'onde |
| Livre audio | 300 à 600 Mo pour 10 h | Ordinateur ; R2 si plusieurs postes | Transcription minutée, alignement |
| Vidéo courte (< 100 Mo) | MP4 optimisé | R2 + Media Transformations | Transcription, chapitres, images clés |
| Vidéo longue souvent regardée | Encodée | Stream | Idem + identifiant Stream |
| Vidéo lourde ou privée | Fichier d'origine | Ordinateur | Idem |
| Partition transcrite (MusicXML) | Quelques dizaines de Ko | R2 | Titre, tonalité, grille, mesures |

**Capacités par mode** (la promesse faite à l'utilisateur) :

| Capacité | Ordinateur | Mixte | Cloudflare |
| --- | --- | --- | --- |
| Traitements | Oui | Oui (ordinateur) | Oui si l'application est lancée ; Containers en option (lot F) |
| Recherche plein texte | Oui, hors ligne | Oui | Oui |
| Recherche de sens | Si modèle local installé (à spécifier au lot C) | Oui | Oui |
| Lecture des pages et médias | Oui, hors ligne | Si l'ordinateur est joignable ou si une copie existe | Oui ; hors ligne pour le cache |
| Accès depuis un autre poste | Non | Partiel | Oui |
| Changement de mode | Transfert des index **si moteur et modèle identiques**, sinon réindexation annoncée | Idem | Idem |

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **HEB-01** | L'interface DOIT afficher les capacités réelles du mode avant confirmation | Aucune promesse non tenue |
| **HEB-02** | D1 NE DOIT contenir aucun fichier binaire | Contrôle automatique périodique |
| **HEB-03** | Le provisionnement Cloudflare DOIT couvrir création de la base et de l'espace R2, liaison et routage côté Worker, migrations, révocation, suppression | Création puis suppression complète testées |
| **HEB-04** | Les limites utilisées DOIVENT être celles de l'abonnement (Workers Paid : 10 Go par base, 50 000 bases ; Free : 500 Mo, 10 bases) | Abonnement vérifié au lot E |
| **HEB-05** | La région des nouvelles bases DOIT être choisie explicitement | Indice de région à chaque création |
| **HEB-06** | La création DOIT proposer un défaut expliqué et une estimation de poids et de coût, sans exiger de décision technique | Création possible en gardant le défaut |

## Synchronisation des données et des médias

**Autorité d'écriture**

| Objet | Qui l'écrit | Révision |
| --- | --- | --- |
| Fichier | L'appareil qui l'a déposé ; immuable ensuite | Empreinte |
| Version, textes, positions, ancres automatiques | Le travail qui les produit | Version de document |
| Lien ou ancre validé ou corrigé | Une personne avec droit de contribution | Compteur par objet |
| Recette, schéma, droits, hébergement | Administration | Numéro de version |

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **SYN-01** | Toute modification DOIT être une opération journalisée (`operationId`, `deviceId`, objet, révision attendue, contenu, horodatage) | Journal rejouable |
| **SYN-02** | Accusé de réception ; une opération renvoyée NE DOIT PAS s'appliquer deux fois | Coupure pendant l'envoi : aucun doublon |
| **SYN-03** | Révision attendue périmée = conflit explicite | Deux appareils hors ligne : conflit visible |
| **SYN-04** | Humain contre automatique : la décision humaine est conservée, le résultat automatique devient une proposition | Recalcul après validation : la validation tient |
| **SYN-05** | Deux décisions humaines en conflit : les deux sont conservées et présentées dans Vérifier, aucune appliquée automatiquement | Aucun choix silencieux |
| **SYN-06** | Les suppressions laissent une marque conservée au moins 90 jours ; un appareil hors ligne NE DOIT PAS faire réapparaître un objet supprimé | Appareil rallumé après 30 jours : l'objet reste supprimé |
| **SYN-07** | Décision humaine dont l'ancre disparaît après recalcul : marquée « à rattacher », jamais perdue ni appliquée ailleurs | Aucune correction perdue |
| **SYN-08** | Fichiers transférés par empreinte, en morceaux reprenables, dérivés d'abord | 500 Mo repris après coupure |
| **SYN-09** | État visible : à jour, n opérations en attente, conflits | Indicateur dans la barre permanente |

Un coordinateur par bibliothèque (Durable Object côté Cloudflare, l'application en mode ordinateur) ordonne les opérations et applique ces règles.

**Synchronisation des médias**

Le **résolveur d'emplacement** trouve chaque fichier au moment de la lecture, dans l'ordre : cache local, ordinateur (serveur local), R2 (lien signé), Stream. Si rien n'est joignable, l'interface le dit (« Audio disponible sur votre ordinateur uniquement »).

| Mélange | Paires de la carte | Production | Précision visée | Lot |
| --- | --- | --- | --- | --- |
| Méthode : exercices + pistes | Élément ↔ piste \[début, fin\] | Pastilles, séquence, silences, validation à l'oreille | 0,2 s, ou « segment inconnu » | C, D |
| Partition + enregistrement | Mesure ↔ instant, reprises comprises | Points tapés pendant l'écoute ; automatique plus tard | 0,1 s | F |
| Livre + livre audio | Phrase ou paragraphe ↔ intervalle | Whisper puis alignement | La phrase | F |
| Vidéo + texte | Sous-titre ↔ instant, chapitres | Audio extrait (Media Transformations), Whisper | 0,3 s | F |
| Vidéo de cours + document | Instant ↔ page ou zone | Images clés comparées aux pages, validation | La page | F |
| Conférence + notes | Instant ↔ paragraphe | Transcription, rapprochement de sens | Le paragraphe | F |
| Image + texte | Zone ↔ passage | Renvois (« figure 3 »), validation | La zone | F |

Optimisations de lecture : forme d'onde pré-calculée, lecture par plages, préchargement du segment suivant, cache des médias récents, changement de tempo sans changer la hauteur calculé dans le lecteur, plusieurs enregistrements par partition.

## Recherche documentaire et réponse rédigée

**Ce que la recherche sert** : retrouver un élément connu (titre, « p.127 », « #402 »), des mots, une phrase exacte, un thème ou concept (multilingue), filtrer, rebondir par les liens, trouver du semblable. Une seule barre (Cmd+K), partout.

**Un résultat est une ancre**, toujours ouvrable à l'endroit exact : vraie page avec la zone surlignée, ou vrai minutage. Le texte reconstitué est un complément (copier, traduire), jamais le seul accès.

**Fonctionnement** : interprétation de la requête (immédiate pour numéros, guillemets et valeurs connues ; enrichie par un modèle léger pour les filtres et thèmes) affichée en étiquettes modifiables ; diffusion en parallèle vers chaque bibliothèque autorisée ; fusion par rangs ; reclassement multilingue ; regroupement par source ou par œuvre ; badges d'explication (*mots*, *phrase exacte*, *sens*, *champ*, *lié à*).

**Indexation** : six couches par bibliothèque — lexicale (accents, racinisation, phrases, préfixes, synonymes du glossaire, tolérance aux erreurs d'OCR), sémantique (passages enrichis d'une phrase de contexte), structurée (champs du schéma), relationnelle (liens), visuelle (empreinte d'image, lot F), temporelle (transcriptions).

**Filtres générés par les schémas** : socle commun (bibliothèque, type de source, média, langue, créateur, titre, date, avec média, validé) ; rôles de champ (`créateur`, `date`, `sujet`, `catégorie`, `niveau`, `durée`, `identifiant`) qui fusionnent des champs de noms différents ; formes selon le type (liste à compteurs, plage, interrupteur, arbre, relation) ; combinaison vide → proposition du filtre à retirer ; recherches enregistrées et partageables.

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **RCH-01** | Droits vérifiés **avant** toute récupération ; bibliothèque non autorisée jamais interrogée | Tests de fuite négatifs, compteurs compris |
| **RCH-02** | Filtres appliqués avant la recherche de sens et identiques sur chaque branche, inclusion et exclusion | Vérifié sur chaque branche |
| **RCH-03** | Métadonnées affichées lues depuis la version active, jamais recopiées dans l'index | Auteur corrigé visible partout |
| **RCH-04** | Métadonnées de préfiltrage versionnées et resynchronisées | Aucun résultat manquant après changement de catégorie |
| **RCH-05** | Un même modèle de sens versionné dans une recherche fédérée, sinon fusion par rangs seule | Version du modèle dans chaque réponse |
| **RCH-06** | Délai par bibliothèque ; celles qui ne répondent pas sont signalées | Bibliothèque coupée : les autres répondent |
| **RCH-07** | Extrait exact, jamais reformulé ; traduction séparée et marquée | Bascule original/traduction |
| **RCH-08** | Aucune troncature silencieuse avant embedding | Zéro troncature non signalée |
| **RCH-09** | Mode Répondre : seules les bibliothèques autorisant l'envoi d'extraits ; citations vérifiées (identifiant existant, phrase présente mot pour mot) ; abstention si les sources ne suffisent pas | Zéro citation non vérifiée |
| **RCH-10** | Réponses par Haiku (`claude-haiku-4-5-20251001`) via le Worker existant, avec jeton d'accès, plafond de dépense, journal, `max_tokens` limité et mise en cache de la partie fixe du message | Plafond atteint : refus propre |
| **RCH-11** | Le moteur actuel reste la référence de pertinence ; toute bascule (AI Search ou autre) décidée sur mesures comparatives (pertinence, filtres, citations, latence p50/p95, coût) | Rapport comparatif avant bascule |
| **RCH-12** | Façade de compatibilité pour `/d1-query`, `/search-library`, `/library-facets`, `/rag-search` tant que Studio Clinique les appelle | Parcours de Studio Clinique inchangés |

**Coût *estimé* du mode Répondre** : environ 1 centime par réponse (Haiku 4.5 : 1 $ par million de jetons en entrée, 5 $ en sortie).

## Interface : navigation, écrans, interactions

&#91;embedded content: navigation · barre permanente et trois espaces\]

Deux niveaux de navigation, jamais plus : une bibliothèque, puis une vue. Les vues sont identiques pour tous les contenus ; seul le contenu change selon le schéma.

| Écran | Objectif | Contenu principal | États à dessiner |
| --- | --- | --- | --- |
| **Accueil** | Voir ses bibliothèques et ce qui demande attention | Cartes de bibliothèques, « reprendre où vous en étiez », cas à vérifier | Première ouverture, hors ligne |
| **Création** | Créer en quatre questions | Assistant avec aperçu vivant, estimation de poids et de coût | Saisie incomplète, Cloudflare non connecté |
| **Vue d'ensemble** | État d'une bibliothèque en un regard | Chiffres clés, santé (manques, cas douteux), prochaine action suggérée | Vide (devient zone de dépôt), en traitement |
| **Catalogue** | Parcourir et organiser | Grille de vignettes ou tableau dense, filtres du schéma, panneau de détail | Milliers d'éléments, filtre vide |
| **Lecteur** | Lire, écouter, regarder, répéter | Vraie page zoomable avec zones cliquables et surlignage ; bande de vignettes ; navigation d'occurrence en occurrence ; texte synchronisé avec l'image ; média avec forme d'onde et segments ; boucle, tempo 50 à 100 % sans changer la hauteur ; « pourquoi ce lien » ; notes | Sans média, segment inconnu, média non disponible ici, mode à distance |
| **Résultats de recherche** | Choisir le bon résultat | Carte avec vignette double (page entière surlignée + loupe sur la zone), extrait exact, badges ; vues liste, mur de pages, par source ou œuvre | Aucun résultat, recherche dégradée, bibliothèque non jointe |
| **Vérifier** | Trancher les cas douteux | Planche de vignettes, proposition et confiance, conflits entre appareils, décisions à rattacher | Rien à vérifier, validation devenue obsolète |
| **Traitement** | Suivre et piloter | File par fichier : étape, progression, temps restant, erreurs lisibles | Interrompu puis repris, erreur récupérable |
| **Réglages et Atelier** | Adapter sans coder | Schéma et vocabulaire, éditeur visuel de recettes (zones sur page, test sur 10 pages), hébergement, accès, outils à la main, banc de pertinence | Recalcul nécessaire, accès révoqué |

**Gestes communs** : déposer n'importe où ; glisser pour réordonner, corriger un lien ou ajuster une zone (toujours avec alternative clavier) ; survoler pour un aperçu ; annuler pendant quelques secondes puis via le journal.

**Raccourcis** : Cmd+K recherche, Cmd+N nouvelle bibliothèque, Cmd+Z annuler, ? aide. Lecteur : Espace lecture, ← → élément, Maj+← → occurrence, L boucle, \[ \] tempo, D mode à distance, N note. Vérifier : Entrée confirmer, C corriger, Échap ignorer. En mode à distance, une pédale vue comme un clavier pilote le Lecteur.

| Réf. | Exigence | Critère d'acceptation |
| --- | --- | --- |
| **UX-01** | Le parcours importer → vérifier → lire DOIT être complet avant toute fonction secondaire | Parcours réalisé sans aide |
| **UX-02** | Vérifier et le Lecteur appartiennent à la première chaîne utilisable | Présents au lot C |
| **UX-03** | Vérifier mesure séparément rapidité et taux d'erreur, sans objectif de vitesse | Taux d'erreur suivi |
| **UX-04** | Budgets p50/p95 : retour visuel < 100 ms ; page locale < 500 ms ; recherche locale < 300 ms ; recherche distante < 800 ms ; traduction et réponse affichées progressivement | Mesures publiées |
| **UX-05** | Les états listés ci-dessus sont prototypés et testés | Un écran validé par état |
| **UX-06** | Tout glisser-déposer a une alternative clavier | Parcours complet sans souris |
| **UX-07** | Contrastes WCAG 2.2 AA (voir système de design) | Contrôle automatique des jetons |
| **UX-08** | Le Lecteur est l'écran le plus utilisé par hypothèse, vérifiée par mesure d'usage | Statistiques locales et anonymes |
| **UX-09** | Une seule chose importante par écran ; l'emplacement des commandes principales ne change jamais | Revue des maquettes |

## Système de design, accessibilité et langue

**Charte de référence (validée le 3 octobre 2026).** Le produit s'appelle **Liénothèque** (signature : « Vos documents et médias, enfin reliés. »). La charte **graphite et cuivre v3** (`Lienotheque-Charte-Complete-v3` : charte, fichier de jetons `Lienotheque-Tokens-v3.json`, logo, fond noyer, maquettes illustratives) **fait foi** pour la palette, le logo, la typographie, la photographie et les jetons des trois variantes (clair de concentration, hybride photographique, sombre intégral). Elle remplace les valeurs de départ de cette section et la charte chêne et sauge. Les règles d'accessibilité, de langue et de ton ci-dessous restent valables.

**Réserves d'intégration à appliquer dans les jetons au lot 0** (vérifiées par calcul) :

| Point | Valeur v3 | Constat | Correction |
| --- | --- | --- | --- |
| Progression en clair | `progress_fill` #B88B62 sur `progress_track` #D8D0C5 | 1,99:1 (la charte cite 2,70:1, ratio sur ivoire) | Conserver la parade de la charte : pourcentage en texte et liseré graphite de 1 px ; corriger le chiffre |
| Progression en sombre | #B88B62 sur #44494F | 2,99:1, sous le seuil de 3:1 annoncé comme dépassé | Piste #3C4046 ou remplissage #C99E78 |
| Texte désactivé en clair | #62666B sur #E6E0D7 | 4,41:1 (exempté par les WCAG) | Recommandé : #5A5E63 |

Les maquettes v2 sont des illustrations de composition, jamais des références typographiques ; le logo vectoriel et la conformité de l'interface restent des livrables distincts.

**Direction visuelle : calme, lumineuse, éditoriale.** L'interface s'efface derrière les contenus. Fonds neutres, une seule couleur d'accent par bibliothèque (choisie à la création), typographie soignée, une seule ombre (menus et fenêtres), beaucoup d'espace. Aucun thème de domaine. Thèmes clair et sombre dès la première version. Tout est défini en jetons, exportés en JSON et en variables CSS ; aucune couleur ni taille écrite dans un composant.

| Famille | Valeurs de départ (contrastes *vérifiés* par calcul) |
| --- | --- |
| Surfaces clair | `surface-0` #F7F6F3, `surface-1` #FFFFFF, `surface-2` #FBFAF8 |
| Surfaces sombre | #141413, #1E1E1C, #262624 |
| Texte clair | `text-primary` #1F1E1D (15,4:1) ; `text-secondary` #5E5D59 (6,1:1) ; `text-muted` #6B6A66 (5,0:1) — sur #F7F6F3 |
| Texte sombre | `text-muted` #9C9B97 sur #141413 (6,6:1) |
| Accent par défaut | #3E5C76 (texte blanc : 7,0:1) ; palette de 8 teintes toutes vérifiées en clair et sombre |
| États | `success`, `warning`, `danger`, `info` réservés aux états |
| Confiance | trois niveaux, toujours doublés d'une icône ou d'un libellé |
| Typographie | Inter (interface), Source Serif 4 (textes longs), JetBrains Mono (données) ; échelle 12 / 14 / 16 / 20 / 24 / 32 |
| Espacements, rayons | grille de 4 px ; rayons 6, 10, 16 px |
| Densité | compacte (Catalogue, Vérifier), confortable ailleurs ; mode à distance ×1,5 |
| Icônes | Lucide, trait 1,5 px ; icônes des types d'éléments choisies dans le schéma |
| Mouvement | transitions de 150 à 250 ms qui expliquent un changement ; respect de « réduire les animations » |

**Accessibilité (WCAG 2.2 AA)** : tout au clavier avec focus visible ; 4,5:1 pour le texte courant, 3:1 pour grand texte et composants ; aucune information par la couleur seule ; cibles de 44 px (64 px en mode à distance) ; zones et segments aussi exposés en liste pour les lecteurs d'écran ; agrandissement à 200 % sans perte. Les couleurs de l'admin actuelle (blanc sur #8FAFB1, #888888 sur blanc) ne sont pas reprises.

**Langue et ton** : français d'abord, interface prête pour d'autres langues (aucun texte écrit dans les composants) ; vouvoiement, phrases courtes, verbes d'action ; aucun jargon visible (on dit « manière de lire » plutôt que recette, « lien » plutôt que concordance, « élément » plutôt qu'ancre). Erreurs : ce qui s'est passé puis quoi faire ; pas de « avec succès » ; états vides formulés en invitation.

## Sécurité et accès

**Principe** : protéger sans gêner. Les personnes qui utilisent la bibliothèque ou Studio Clinique au quotidien ne doivent jamais avoir à ressaisir un code régulièrement.

| Réf. | Exigence | Critère d'acceptation | Lot |
| --- | --- | --- | --- |
| **SEC-01** | Aucune clé maîtresse ne DOIT être transmise à un navigateur ou à une application (fin de `/login` qui renvoie `WORKER_API_KEY`) | Clé absente du trafic et du stockage du navigateur | E |
| **SEC-02** | Session longue durée sur appareil de confiance : cookie sécurisé, au moins 90 jours, renouvelée à chaque usage, révocable à distance, idéalement déverrouillée par Touch ID ou clé d'accès ; aucune saisie de code répétée | Utilisation quotidienne sans ressaisie pendant 90 jours | E |
| **SEC-03** | Jetons limités par bibliothèque et par action (lecture, contribution, administration) pour l'application et les outils connectés, révocables individuellement | Révoquer un jeton n'affecte aucun autre accès | E |
| **SEC-04** | `WORKER_API_KEY` renouvelée une fois les consommateurs migrés | Ancienne clé refusée | E |
| **SEC-05** | Toute l'API et tout accès aux médias authentifiés ; médias privés par session ou lien signé de courte durée ; un identifiant difficile à deviner n'est pas une autorisation | Accès sans session ni signature refusé | C (local), E (cloud) |
| **SEC-06** | Clés des fournisseurs uniquement dans les secrets chiffrés des Workers ; jamais dans un dépôt, une archive ou un dossier copiable | Analyse des dépôts et archives : aucune clé | C |
| **SEC-07** | Journal d'audit des opérations sensibles (suppression, droits, activation de version, changement d'hébergement) | Chaque opération retrouvable avec son auteur | C |
| **SEC-08** | Agents automatisés (Claude Desktop, Codex, Claude Code) avec jetons Cloudflare et GitHub limités par projet ; aucun ne peut supprimer une base ou un espace de fichiers de la bibliothèque | Liste des jetons et droits documentée | Avant E |
| **SEC-09** | Déploiement avec configuration explicite (`--config`), version de wrangler fixée et tests exécutés avant publication | Workflow revu | C |
| **SEC-10** | Sauvegarde et restauration éprouvées (restauration réelle) avant toute migration de données ou bascule | Restauration chronométrée et documentée | Avant E |

**Risque accepté jusqu'au lot E** : la clé maîtresse reste présente dans les navigateurs déjà connectés au système actuel.

## Cloudflare : services retenus et coûts

**Compte actuel** (*vérifié* le 2 octobre 2026) : 14 Workers, dont `clone-proxy` (KV `CLONE_KV`, D1 `therapeute-library`, Vectorize, Workers AI, R2 `studio-clinique-brand-assets`) et plusieurs proxys de clés (OpenAI, Groq, Google TTS, OCR Universel, EvidenceForge, OpenAlex) ; deux bases D1 ; un compartiment R2 ; deux espaces KV. La nouvelle bibliothèque aura son propre Worker ; `clone-proxy` reste en service pour Studio Clinique.

| Service | Usage | Repère de coût ou de limite | Statut |
| --- | --- | --- | --- |
| R2 | Fichiers optimisés et dérivés | 10 Go/mois gratuits, puis 0,015 $/Go/mois, sortie gratuite | Retenu |
| D1 | Une base par bibliothèque + registre | 10 Go par base (Workers Paid) | Retenu |
| Durable Objects | Coordinateur de synchronisation par bibliothèque | — | Retenu |
| Queues / Workflows | Traitements côté cloud reprenables (indexation, transcription) | — | Retenu |
| Workers AI | Embeddings `bge-m3`, traduction `m2m100`, transcription Whisper (0,000453 $/min), reclasseur à tester | À l'usage | Retenu |
| Recherche de sens | Vectorize par bibliothèque, ou AI Search après mesures (RCH-11) | Selon choix | Décision au lot E |
| Media Transformations | Images et audio extraits des vidéos dans R2 | Gratuit pendant la bêta du binding, puis 0,50 $ les 1 000 opérations | Lot F |
| Stream | Vidéos longues souvent regardées | À la minute (60 min regardées = 0,06 $) | Lot F, si besoin |
| Containers | Traitements lourds dans le cloud quand l'ordinateur est éteint | Instances de 1/16 à 4 vCPU | Option lot F |
| AI Gateway | Plafonds, cache et journal centralisés pour les appels IA | — | Optionnel |
| Access, KV | Protection de l'administration ; réglages et caches | — | Retenu |

**Coûts *estimés***

| Poste | Hypothèse | Coût |
| --- | --- | --- |
| R2, corpus musical optimisé | 0,5 à 1 Go | 0 $ (tranche gratuite) |
| R2 au-delà | 100 Go de livres audio et vidéos | \~1,35 $/mois |
| D1 | Quelques dizaines de Mo par bibliothèque | Négligeable |
| Whisper | Livre audio de 10 h | \~0,27 $ une fois |
| Réponses rédigées (Haiku) | 1 000 réponses | \~7,50 à 10 $ |
| Vision ciblée (Claude) | Zones difficiles seulement | Budget plafonné par lot |

Les deux postes à surveiller sont les réponses rédigées et la vision ciblée : ce sont les seuls qui croissent avec l'usage quotidien ; le plafond du Worker les borne.

## Fixtures, vérités attendues et mesures

Chaque fixture est livrée avec : fichiers (ou leur emplacement privé) et empreintes SHA-256, vérité attendue figée, script de mesure, résultat de référence daté.

| Fixture | Contenu | Vérité attendue | Référence |
| --- | --- | --- | --- |
| **F1 — Aebersold** | PDF natif, 55 pages | Texte identique à la couche PDF ; pages imprimées | Couche texte extraite à 100 % |
| **F2 — Realbook Bass F** | Scan, 508 pages ; page 28 annotée | Grille et tonalité de la page 28 (36 accords, A♭) ; titres par page | Grille lue sur 1 page ; 305/437 titres dans la couche OCR existante |
| **F3 — 70s Funk & Disco Bass** | 29 images, 99 MP3 | Exercice → piste ; pages 30-31 absentes ; patterns 100-101 sur la piste 99 | 95/95 (`ocr_methode.py`) |
| **F4 — Westwood vol. 1** | 143 photos, 92 MP3 | Premier exercice et page par piste (noms corrigés : piste 14 → exercice 189) | 83/92 exercices, 89/92 pages (`westwood_*.py`) |
| **F5 — Recherche** | 30 à 50 requêtes par bibliothèque : français, anglais, sigles courts, auteurs, phrases exactes, filtres | Pages ou passages attendus | À constituer au lot C, mesuré d'abord sur le moteur actuel |
| **F6 — Synchronisation** | Coupure pendant envoi, deux appareils hors ligne, suppression puis retour d'un appareil, recalcul après validation | SYN-01 à SYN-09 | À constituer au lot E |
| **F7 — Optimisation** | Échantillon de pages noir et blanc, gris, couleur, natives | Gain et lisibilité (OPT-01 à OPT-04) | Mesures du 2 octobre 2026 |
| **F8 — Réimport** | Échantillon de 10 livres de l'ancienne base | Mêmes livres retrouvés via la façade, alias conservés | À constituer au lot E |

**Règles** : les œuvres sous droits ne quittent pas le stockage privé (les fixtures partagées contiennent empreintes et vérités) ; toute modification d'outil ou de recette est mesurée sur les fixtures avant activation ; taille et performance de l'application mesurées sur Mac **et** Windows avec les moteurs réellement embarqués.

## Roadmap

&#91;embedded content: roadmap · préparation et lots C à F\]

Les anciens lots A (sécurité de l'existant) et B (réparation de l'ancienne base) sont réorganisés : la sécurité est portée par le lot E, au moment où la nouvelle API s'ouvre et où Studio Clinique bascule ; la réparation est remplacée par le réimport complet. On ne passe au lot suivant qu'une fois son critère atteint ; les durées seront estimées à la fin de la préparation.

| Lot | Résultat concret | Critère de passage | Exigences |
| --- | --- | --- | --- |
| **0 — Préparation** | Maquettes des écrans (kit de prompts en annexe) et jetons validés ; monorepo ; contrats Zod (fichier, document, version, ancre, lien, recette, travail, opération) ; prototype Tauri 2 Mac/Windows (PDF, sidecar, reprise, lecture MP3) | Maquettes validées ; contrats validés par les fixtures ; décision Tauri prise | UX-07, UX-09 ; SEC-06, SEC-09 |
| **C — Première bibliothèque** | Bibliothèque en mode ordinateur ; Inspecteur, Optimiseur, dérivés, lecteur de texte et de repères, associateur média ; recette F3 ; file de travaux durable ; Lecteur et Vérifier ; recherche locale ; fonctions héritées ; banc d'essai | Fichier renommé reconnu ; arrêt/redémarrage sans perte ; correction conservée après recalcul ; F3 ≥ 95/95 ; F1 exact | ID-01 à 07 ; JOB-01 à 09 ; ANC-01 à 05 ; REC-01 à 06 ; OUT-01, 02, 04, 05, 07, 10, 15 ; HER-01 à 12 ; OPT-01 à 07 ; UX-01 à 06 ; SEC-05, 07 |
| **D — Deuxième corpus** | Recette F4 ; redresseur ; détecteur de zones ; plusieurs exercices par piste ; segments vérifiés ou « inconnus » ; éditeur visuel de recettes ; vision ciblée | F4 ≥ 83/92 automatique ; généralisation sans code spécifique ; nouvelle recette dérivée en < 15 min | REC-06, 07 ; ANC-03 ; OUT-03, 06, 08 ; UX-08 |
| **E — Cloudflare, réimport et bascule** | Sessions longue durée et jetons ; provisionnement d'une bibliothèque Cloudflare ; synchronisation ; recherche fédérée et mode Répondre ; traducteur, normaliseur, tableau de stockage ; **réimport des 234 livres** avec alias ; façade compatible Studio Clinique ; sauvegarde et restauration éprouvées ; renouvellement de la clé | Tests de fuite négatifs ; F5, F6, F8 réussies ; Studio Clinique bascule sans interruption ni ressaisie | SEC-01 à 04, 08, 10 ; SYN-01 à 09 ; RCH-01 à 12 ; HEB-01 à 06 ; OUT-11 à 14 ; ID-08 |
| **F — Extensions** | Transcription et vidéo ; livre + livre audio ; partition + enregistrement ; recueils de grilles ; OMR à la demande ; fiches composées (Puck) ; pages semblables par l'image ; Containers en option | Une preuve mesurée par extension ; aucune ne bloque l'usage de base | ANC-06, 07 ; OUT-09 |

## Annexe : kit de prompts pour les maquettes

**Mise à jour.** Les prompts de cette annexe datent de la charte provisoire. Pour toute nouvelle maquette, utiliser la charte graphite et cuivre v3 et ses jetons ; la liste des écrans reste valable.

Coller d'abord le prompt de style dans une conversation ChatGPT, puis demander les écrans un par un dans la même conversation. Juger la composition et la hiérarchie, pas l'orthographe des petits textes. Les jetons ci-dessous sont ceux du système de design corrigé.

```
Tu es directeur artistique UI. Application de bureau « Bibliothèque », universelle et neutre :
n'importe qui y range documents, audios, vidéos et images, et l'application les relie entre eux.
Style : calme, lumineux, éditorial, très aéré, plat (ni dégradés ni effets 3D). Fond #F7F6F3,
cartes blanches à filets fins, texte #1F1E1D et #5E5D59, accent unique bleu ardoise #3E5C76,
typographie Inter, icônes au trait fin type Lucide, coins arrondis 10 px, une seule ombre légère
pour les menus. Interface en français, vouvoiement. Format 16:10, capture d'écran réaliste
sur macOS, sans personnage. Réponds « Style mémorisé », puis attends mes demandes d'écrans.
```

| Écran | Demande à formuler |
| --- | --- |
| Accueil | Barre fine en haut (sélecteur, « Rechercher (Cmd+K) », indicateur de traitement, synchronisation) ; grille de 6 cartes de bibliothèques variées (« Méthode d'instrument », « Livres audio », « Archives photo », « Cours vidéo », « Thèse », « Recettes de famille ») ; panneau « Reprendre où vous en étiez » ; bouton « Nouvelle bibliothèque » |
| Création | Assistant en 4 étapes, étape 2 « Que contient-elle ? » avec grandes tuiles (Documents, Audio, Vidéo, Images, Un mélange) ; aperçu vivant à droite |
| Vue d'ensemble | Image A : bibliothèque vide = grande zone de dépôt ; image B : indicateurs, bloc « Santé », carte « Prochaine action suggérée » |
| Résultats de recherche | Cartes avec vignette double (page entière surlignée + loupe), extrait exact, badges « mots », « sens » ; filtres à compteurs à gauche ; étiquettes d'interprétation sous la barre |
| Lecteur | Page scannée à 60 % avec zones numérotées, zone active en bleu ardoise ; forme d'onde avec segments, lecture, boucle, « Tempo 75 % » ; encart « Pourquoi ce lien » ; bande de vignettes |
| Lecteur à distance | Même écran, page agrandie plein écran, très grandes commandes, lisible à deux mètres |
| Vérifier | Planche de 12 vignettes avec proposition et pastille de confiance (icône + libellé) ; vignette active agrandie avec « Confirmer », « Corriger », « Ignorer » et raccourcis |
| Traitement | File de fichiers : étape, progression, temps restant, pause, annuler ; un fichier en erreur avec message clair et « Réessayer » |
| Atelier : manière de lire | Page zoomable avec zones colorées « Numéro de page », « Numéro d'élément », « Repère audio » et poignées ; résultat en direct sur trois miniatures ; « Tester sur 10 pages » |
| Recherche Cmd+K | Fenêtre centrée, résultats groupés (Éléments, Passages, Médias, Actions), aperçu avec source à droite |
| Variante sombre | « Reprends l'écran précédent en thème sombre (#141413), mêmes proportions, même accent. » |

Méthode : trois directions visuelles sur Accueil et Lecteur, choix d'une direction, maquettes de tous les écrans avec leurs états, relevé et validation des jetons, puis prototype React.

## Traçabilité, décisions et documents sources

**Corrections intégrées par rapport aux documents antérieurs**

| Point corrigé | Version retenue |
| --- | --- |
| 26 approches | 19 (26 = combinaisons approche × langue) |
| 301 doublons à nettoyer | 301 groupes de numéros répétés, aucun texte en double ; plus de réparation, réimport complet |
| Ancienne base archivée | Conservée intacte jusqu'à la bascule (tables de Studio Clinique) |
| Changement d'hébergement sans réindexation | Seulement si moteur et modèle identiques |
| Tauri : quelques Mo | Taille mesurée avec les moteurs embarqués, Mac et Windows |
| Une validation par seconde | Rapidité et taux d'erreur suivis séparément, sans objectif de vitesse |
| Règles de recette en texte libre | Paramètres typés, interpréteur déterministe |
| `text-muted` #8A8985 | #6B6A66 (5,0:1) |
| Conflit humain : la plus récente l'emporte | Deux décisions humaines conservées et présentées, jamais tranchées automatiquement |
| Limites D1 sans condition | Conditionnées à l'abonnement |
| Tout passe par AI Gateway | Haiku via le Worker existant ; AI Gateway optionnel |
| Position de départ d'un exercice présumée | « Segment inconnu » tant que non vérifié |
| Lots A et B en premier | Sécurité portée par le lot E sans saisie répétée ; réparation remplacée par le réimport |
| Vocabulaire musical dans l'interface (« Pupitre ») | Vocabulaire neutre (« Lecteur », « élément », « mode à distance ») |

**Décisions ouvertes**

- [ ] Socle de l'application locale (Tauri 2 ou autre) — fin du lot 0.
- [ ] Modèle de sens local pour le mode ordinateur — lot C.
- [ ] Moteur de recherche côté Cloudflare (Vectorize ou AI Search) — sur mesures, lot E.
- [ ] Région de stockage des nouvelles bibliothèques — lot E.
- [ ] Archive des originaux non optimisés — lot C.
- [ ] Disponibilité des fichiers d'origine des 234 livres — avant le lot E.
- [ ] Historique et plafond mensuel du mode Répondre — lot E.

**Matrice** : chaque exigence est rattachée à un lot (tableau de la roadmap) et à un critère d'acceptation (tableaux de chaque section). En cas de divergence avec un document antérieur, ce document fait foi.

**Documents sources** (historique) : Audit phase 1, Benchmark phase 2, Notes de conception, CDC Bibliothèque modulaire, CDC UX/UI, CDC Recherche documentaire, CDC Outils d'optimisation, CDC normatif v1.0, audit indépendant du 2 octobre 2026 ; prototypes `ocr_methode.py`, `westwood_ocr.py`, `westwood_pastilles.py`, `westwood_relire.py`, `westwood_apparier.py` et leurs résultats CSV ; mesures d'optimisation sur le Realbook et Westwood ; dépôt Prof-de-basse-V2 ; `bibliotheque-admin.html`.
