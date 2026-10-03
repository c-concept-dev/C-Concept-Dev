# Liénothèque — consignes pour Claude Code

« Vos documents et médias, enfin reliés. » Bibliothèque universelle et neutre qui lit, relie et
retrouve documents, audio, vidéos et images, toujours sur la vraie page ou au vrai minutage.

## Sources qui font foi
- **CDC normatif v2.0** (exigences numérotées ID, JOB, ANC, REC, OUT, HER, OPT, HEB, SYN, RCH, UX, SEC) :
  https://claude.ai/code/artifact/0ea6d832-3c0c-4602-9c4d-ae3bbfcfed74
- **Charte graphique graphite et cuivre v3** : `docs/charte/` ; jetons sources dans
  `packages/jetons/src/tokens.json` (v3.0.1, réserves appliquées, jetons du kit inclus). Les maquettes
  sont illustratives, jamais typographiques.
- **Kit UI v1.1** : `docs/ui-kit/catalogue.html` (ouvrir dans un navigateur) est la référence visuelle et
  comportementale des composants (états, clavier, accessibilité). On le **porte en composants React**,
  on ne le copie pas tel quel. Logo vectoriel validé : `docs/ui-kit/assets/` (emblèmes et logos
  horizontaux clair/sombre). Polices WOFF2 : `docs/ui-kit/assets/fonts/`.
- En cas de doute entre une maquette, un ancien document et le CDC, **le CDC gagne**.

## Règles non négociables
1. **Rien en dur pour le domaine.** Champs, filtres, vocabulaire, types d'éléments viennent du schéma de
   la bibliothèque. Aucun mot « exercice », « partition », « thérapie » dans un composant générique.
2. **Contrats d'abord.** Toute donnée qui traverse une frontière (outil, base, réseau, sidecar) est
   validée par un contrat de `@lienotheque/contrats`. On modifie le contrat et ses tests avant le code.
3. **Aucune couleur, taille ou durée écrite dans un composant** : uniquement les variables `--ln-*`
   générées par `@lienotheque/jetons`. Les bandeaux de collections ne portent que des icônes (taupe
   sous 4,5:1 pour du texte).
4. **Tests obligatoires.** Chaque exigence implémentée cite son identifiant CDC dans le nom du test.
   `pnpm check` doit passer avant tout commit.
5. **Jamais d'œuvre sous droits dans le dépôt** (`fixtures/fichiers/` est ignoré). Seuls les empreintes,
   vérités attendues et paramètres sont versionnés.
6. **Jamais de clé ni de secret** dans le dépôt, une archive, le navigateur ou un dossier copiable.
   Les appels à Claude Haiku passent par le Worker existant (secret `ANTHROPIC_API_KEY`).
7. **Cloudflare** : jeton limité à ce projet ; aucune suppression de base D1 ou d'espace R2 sans accord
   explicite ; `wrangler deploy --config <fichier>` toujours explicite ; ne jamais toucher à
   `clone-proxy` ni à la base `therapeute-library` (Studio Clinique en dépend).
8. **Interface en français**, vouvoiement, casse normale, aucun jargon visible (« manière de lire »
   plutôt que recette, « élément » plutôt qu'ancre).
9. Pas d'abstraction sans deux usages réels.

## Emplacement : dépôt C-Concept-Dev (public)
- Le projet vit dans `tools/lienotheque/` du dépôt `C-Concept-Dev`. **Lancez Claude Code et pnpm depuis
  ce dossier**, jamais depuis la racine du dépôt.
- Le dépôt est **public** : rien de privé ici (aucune clé, aucune œuvre, aucune donnée personnelle).
- Ne jamais modifier `Worker/` ni lancer `wrangler deploy` depuis la racine : tout changement dans
  `Worker/**` redéploie automatiquement `clone-proxy` (workflow `deploy-worker.yml`).
- Le workflow `deploy-pages.yml` publie tout le dépôt sur GitHub Pages à chaque push : `node_modules/`
  et `dist/` ne doivent jamais être commités.
- Le workflow `generate-index.yml` indexe tous les fichiers `*.html` du dépôt ; les `index.html` de
  Vite apparaîtront dans cet index tant qu'il n'exclut pas `tools/lienotheque/`.
- Deux intégrations continues, toutes deux à la racine du dépôt et filtrées sur nos chemins :

| Workflow | Déclenchement | Ce qu'il vérifie |
|---|---|---|
| `.github/workflows/lienotheque-ci.yml` | push sur `main` et pull request touchant `tools/lienotheque/**` | `pnpm check` sur Linux, macOS et Windows : typage strict et tests JavaScript et TypeScript (contrats, jetons, application, worker). Il **n'a ni Rust ni Tesseract** |
| `.github/workflows/lienotheque-tauri.yml` | à la main (`workflow_dispatch`), plus push et pull request touchant `apps/app/src-tauri/**` ou `fixtures/generer-locales.py` | macOS et Windows : fabrique les fixtures, embarque les moteurs, lance les **tests Rust du prototype** (les quatre critères du CDC), construit le paquet et publie sa taille et celle des moteurs dans le résumé d'exécution |

  Aucun des deux ne déploie quoi que ce soit. Les tests Rust ne sont donc **pas** dans `pnpm check` :
  les installer sur les trois systèmes de `lienotheque-ci.yml` l'alourdirait pour rien, puisque
  `lienotheque-tauri.yml` les couvre là où ils ont un sens.

## Organisation
```
packages/contrats   Contrats Zod + export JSON Schema (fait)
packages/jetons     Jetons v3.0.1 + générateur CSS + tests de contraste (fait)
apps/app            React 19 + Vite + TypeScript strict : composants du kit, accueil statique (fait)
apps/app/src-tauri  Prototype bureau Tauri 2 : mesures du lot 0 (fait, décision en attente)
apps/worker         API Hono (squelette fait, aucun déploiement au lot 0)
outils/*            Outils de traitement (lot C)
recettes/           Recettes typées (fixtures dans fixtures/recettes)
fixtures/           Vérités attendues F1 à F8
```
Commandes : `pnpm install`, `pnpm check` (typage + tests), `pnpm build` (schémas JSON, CSS et
application web). Les tests du prototype bureau sont à part : voir `apps/app/src-tauri/README.md`
(ils demandent Rust et Tesseract, absents de l'intégration continue).

## Lot 0 — état
| Tâche | Critère d'acceptation |
|---|---|
| ~~Prototype Tauri 2, Mac et Windows~~ **fait** | Les quatre critères passent sur les deux systèmes et les tailles sont mesurées moteurs compris (`docs/decisions.md`). **Tauri 2 retenu**, réserve levée sur les critères ; reste à trancher l'agencement d'un paquet Windows installé |
| ~~`apps/app` : squelette React 19 + Vite + TypeScript strict~~ **fait** | Charge la feuille des jetons, polices Inter et Source Serif 4, bascule clair / hybride / sombre intégral |
| ~~Page d'accueil statique~~ **fait** | Reproduit la composition des maquettes avec des données factices typées par les contrats ; Inter partout sauf logo et « Bonjour » ; contrôle clavier complet |
| ~~`apps/worker` : squelette Hono~~ **fait** | Route de santé validée par `EtatService`, tests ; aucun déploiement |
| ~~Intégration continue~~ **fait** | GitHub Actions `lienotheque-ci.yml` : `pnpm check` sur Linux, Mac et Windows |
| Empreintes des fixtures F1 à F4 | Calculées depuis les fichiers privés et inscrites dans `fixtures/README.md` |
| ~~Composants React~~ **fait** | Portage des familles du kit UI v1.1 nécessaires à l'accueil (boutons, cartes, badges, progression, dépôt, recherche), même rendu et mêmes comportements clavier que le catalogue, styles uniquement via `--ln-*` |
