-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 6 « marqueur-de-lisibilite »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- Ce passage se lit-il ? (FMT-04)
--
-- Certains documents portent une couche texte dont l'encodage de police est faux : elle
-- rend des milliers de « mots » qui n'en sont pas, et la reconnaissance d'image n'aboutit
-- pas davantage sur une planche ou une photographie. Mesuré sur sept documents réels :
-- vingt et un passages sur deux mille sept cent trente, soit huit pour mille.
--
-- Ils entrent **marqués**, jamais écartés. Les exclure serait une exclusion silencieuse
-- déguisée en propreté : la page existe, elle a du contenu, et un trou dans la
-- bibliothèque ne se voit pas — alors qu'un passage marqué se compte, se montre en
-- dernier, et s'envoie à Vérifier.
--
-- Ils entrent aussi dans l'index plein texte, pour la même raison : qu'on les retrouve et
-- qu'on voie qu'ils sont douteux vaut mieux que de ne pas les retrouver du tout.
ALTER TABLE passage ADD COLUMN lisible INTEGER NOT NULL DEFAULT 1;
