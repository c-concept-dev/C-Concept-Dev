D101F — UX/UI mobile-first harmonisée
Date : 16/08/2026

Principe non négociable : desktop = responsive sur le fond.
Un seul DOM, une seule logique, mêmes champs, mêmes états et mêmes libellés.
Le responsive adapte seulement la disposition.

Modifications UX/UI :
- Durée : remplacement du select « La durée comprend » par un contrôle segmenté
  Marche + pauses / Marche seule / Tout compris, câblé sur #timeIncludes.
- Heure de retour : remplacement de la grosse case par un contrôle segmenté
  Pas d'heure limite / Heure à respecter. Le booléen métier #returnDeadlineEnabled
  est conservé et l'heure ne s'ouvre que lorsque la limite est activée.
- Étape Aujourd'hui : divulgation progressive. L'état du jour reste visible ;
  Chaussures & équipement et Limitations à respecter deviennent des sections
  compactes repliables avec résumé dynamique. Le détail de gêne n'apparaît que
  si une douleur est indiquée ou si un texte existe.
- Envies : ajout d'une bande « Mes envies » persistante, indépendante du thème
  actuellement affiché. Une envie peut être retirée directement depuis cette bande.
- Services : cartes Souhaité/Nécessaire compactées sans modifier leur logique.
- Vérification : « Confirmer et calculer » est remonté avant les options secondaires.
  Note personnelle, confidentialité, services et réglages avancés sont regroupés
  sous « Options et détails ».
- Navigation mobile : bouton d'action conservé en zone basse/sticky.
- Cache PWA incrémenté vers d101f-mobile-first.

Validation :
- npm run build : OK
- audit champs : 46 champs, 58 choix, 0 orphelin
- npm test : 286/286 réussis
- Chromium headless : tentative de rendu réel non exploitable dans cet environnement
  (processus navigateur bloqué/timeout) ; ne pas compter comme validation visuelle.
