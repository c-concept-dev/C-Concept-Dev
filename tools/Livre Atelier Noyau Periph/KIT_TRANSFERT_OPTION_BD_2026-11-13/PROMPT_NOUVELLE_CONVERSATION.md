# Prompt à copier dans une nouvelle conversation

```text
Tu reprends le projet « Livre de Vie — Atelier Biographie » pour construire son option bande dessinée / roman graphique.

Workspace :
/Users/christophebonnet/Documents/GitHub/C-Concept-Dev/tools/Livre Atelier Noyau Periph

AVANT TOUTE MODIFICATION
1. Lis intégralement :
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/README_REPRISE.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/CDC_ATELIER_BD_V0.1.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/ARCHITECTURE_CIBLE.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/CONTRATS_DE_DONNEES.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/PLAN_IMPLEMENTATION.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/RECETTE_ACCEPTATION.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/PROMPTS_BD.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/SECURITE_DROITS_ET_VIE_PRIVEE.md
   - KIT_TRANSFERT_OPTION_BD_2026-11-13/DECISIONS_OUVERTES.md
   - les trois schémas JSON du dossier schemas/
2. Lis les fichiers existants : atelier-auteur-core.js, atelier-editeur-core.js, shell-biographie.html et integration.js.
3. Vérifie git status, branche, HEAD et remote. Préserve tools/lienotheque/.claude/. Aucun push sans ma demande explicite.
4. Lance les tests existants et donne le résultat de départ. Le placement actuel
   de integration.js ne correspond pas à ses imports relatifs : utilise d’abord
   la procédure temporaire documentée dans ETAT_DEPOT.md, sans déplacer ni
   corriger le fichier source. La référence attendue est 76/76.

OBJECTIF
Construire un pilote BD d’un chapitre fictif, de 8 à 12 pages, en conservant les noyaux Auteur et Éditeur existants. Commence par les contrats et tests déterministes, puis le noyau BD, la sauvegarde/restauration, l’adaptateur image simulé, le shell minimal, le mode manuel ChatGPT, la mise en page avec bulles SVG et l’export PDF. L’adaptateur API réel vient seulement après validation du pilote manuel.

RÈGLES
- Propose d’abord un plan d’exécution précis et attends ma validation avant le code.
- Red-first : tests avant implémentation.
- Ne modifie pas le noyau Auteur ou Éditeur sauf nécessité démontrée et validée.
- Chaque case doit citer sa source narrative.
- Aucune image ne contient de texte, bulle ou logo : le lettrage reste en HTML/SVG.
- Aucune clé API dans le navigateur ou les fichiers de projet.
- Toute donnée envoyée à un service externe est affichée et confirmée avant envoi.
- Utilise uniquement de la matière fictive pendant le développement initial.
- Distingue toujours preuve automatique, observation navigateur et validation humaine.
- Fais des commits locaux limités, aucun push.

PREMIÈRE RÉPONSE ATTENDUE
Un audit bref de l’architecture existante, les éventuelles contradictions avec le CDC, le plan des lots 0 à 7, les fichiers qui seront créés ou modifiés et la recette du premier lot. Ne code rien avant mon accord.
```

