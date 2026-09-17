# MONO-05 — Rapport d'accessibilité

## Vérifié réellement (Playwright, pas un simple examen visuel)

- Navigation clavier réelle : `page.keyboard.press("Tab")` déplace le focus
  vers un élément interactif dès le chargement, puis atteint le bouton
  "Nouveau run" par tabulations successives (T05-29a/b).
- Focus visible : `getComputedStyle(el).outlineStyle !== "none"` vérifié sur
  l'élément réellement focusé (T05-30) — jamais un simple examen du CSS
  source sans vérification runtime.
- États toujours portés par couleur + texte + icône visuelle (le badge
  `.badge` combine une pastille colorée ET le libellé textuel de l'état,
  jamais la couleur seule).
- Labels explicites : `aria-label` sur chaque `<section>`/`<nav>`, `<label for>`
  associé à chaque champ du formulaire de création de run.
- `aria-live="polite"` sur la zone de contenu principale et le statut de
  polling, pour que les mises à jour asynchrones soient annoncées.

## Responsive (captures réelles, pas un jugement visuel seul)

1440×900, 1024×768, 390×844 — captures dans `reports/screenshot-*.png`.
Vérifié programmatiquement à chaque taille : `scrollWidth <= clientWidth + 20px`
(pas de débordement horizontal critique) et au moins un bouton d'action
visible (T05-31/32/33).

## Limite connue

L'audit d'accessibilité reste manuel/ciblé (Tab + focus + contraste visuel
via les captures) — aucun outil d'audit automatisé exhaustif (type axe-core)
n'a été intégré dans cette version, ce qui reste une limite assumée plutôt
qu'une prétention à une conformité WCAG complète.
