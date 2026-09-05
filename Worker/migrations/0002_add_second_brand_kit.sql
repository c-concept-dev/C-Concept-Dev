-- Migration number: 0002 	 2026-09-05T15:09:04.394Z
--
-- UX-8B Lot 2 — deuxième charte codée en dur, seed uniquement (aucun écran d'import, aucune
-- extraction). Sert à prouver que le mécanisme de sélection fonctionne réellement sur un vrai
-- document généré : "au moins 2 chartes sélectionnables" (CDC UX-8B, critère d'acceptation).
--
-- Typographie : reprend telle quelle la 2e paire du tableau des préréglages recommandés
-- (CDC UX-8B, §"Polices : catalogue élargi") — "Humaniste accessible" = Literata (titres) /
-- Atkinson Hyperlegible (corps), positionnée pour "documents longs et patients". Les deux
-- polices sont sur Google Fonts (libres de droits, cf. CDC), aucune police personnalisée à
-- héberger dans ce lot.
--
-- Couleurs : palette neuve, distincte de pétrole/terracotta (c'est un document, pas le chrome —
-- le CDC UX-8B est explicite : la charte externe ne s'applique jamais au chrome de l'app).
-- Choisie pour un ton chaud et feutré cohérent avec "documents longs et patients" (moins
-- clinique/institutionnel que pétrole/terracotta), contrastes calculés (WCAG 2.1, formule de
-- luminance relative) contre le fond #FBF8F3 de cette charte :
--   primary  #1B3A5C sur #FBF8F3 → 10.97:1 (AA/AAA texte normal)
--   accent   #9C561A sur #FBF8F3 →  5.27:1 (AA texte normal)
--   text     #2B2620 sur #FBF8F3 → 14.15:1 (AA/AAA texte normal)
--   success  #2E7D4F sur #FBF8F3 →  4.76:1 (AA texte normal)
--   warning  #A8431D sur #FBF8F3 →  5.69:1 (AA texte normal)
--   critical #A32C2C sur #FBF8F3 →  6.71:1 (AA texte normal)
-- Seuil AA texte normal = 4.5:1 (WCAG 2.1 SC 1.4.3) — les 6 couleurs le dépassent, y compris
-- pour du texte normal (pas seulement pour un usage décoratif/grand texte à 3:1).
--
-- minSizes/spacing légèrement plus généreux que la charte 1 (17px de base, interligne 1.65)
-- pour rester cohérent avec le positionnement "accessible" de cette charte — pas une valeur
-- WCAG obligatoire en soi, mais une lisibilité renforcée assumée pour ce préréglage.

INSERT INTO brand_kits (
  id, name, version, colors_json, typography_json, status,
  source_asset_id, source_checksum, source_type, imported_at, provenance_json, created_at
) VALUES (
  '00000000-0000-4000-8000-000000000002',
  'Humaniste accessible',
  1,
  '{"primary":"#1B3A5C","accent":"#9C561A","background":"#FBF8F3","text":"#2B2620","success":"#2E7D4F","warning":"#A8431D","critical":"#A32C2C"}',
  '{"headingFont":"\"Literata\", Georgia, serif","bodyFont":"\"Atkinson Hyperlegible\", Arial, sans-serif","minSizes":{"body":"17px","small":"14px","heading1":"30px","heading2":"24px","heading3":"19px"},"spacing":{"lineHeight":"1.65","sectionGap":"2.25rem","blockGap":"1.1rem"}}',
  'active',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);
