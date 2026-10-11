-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : bibliotheque · migration 5 « provenance-du-passage »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- D'où vient le texte d'un passage, et à quel point on s'y fie.
--
-- La table portait le texte sans dire comment il avait été obtenu. Or les deux chemins ne
-- valent pas la même chose : une couche texte est exacte — ce sont les caractères que
-- l'auteur a posés —, un OCR approche. Une citation tirée d'un OCR peut porter « rnartyre »
-- là où la page dit « martyre », et rien ne permettait de le savoir.
--
-- RCH-09 demande qu'une citation soit vérifiable contre sa source. Le Lecteur a donc
-- besoin de dire « lu dans le document » ou « reconnu sur l'image », et l'écran de
-- vérification de trier les seconds d'abord. Sans cette colonne, il ne peut ni l'un ni
-- l'autre, et tout se présente avec la même assurance.
ALTER TABLE passage ADD COLUMN source TEXT NOT NULL DEFAULT 'couche_texte';
ALTER TABLE passage ADD COLUMN confiance REAL;

-- Le rang de la page d'où le texte vient, et son numéro imprimé quand il est connu.
--
-- L'ancre reste ce qui fait foi pour « où exactement » (ANC-01). Ces deux colonnes sont là
-- pour que la façade rende un `content` avec sa référence **en une requête**, sans
-- déplier le sélecteur JSON de l'ancre en SQL. Un passage sans numéro imprimé se cite par
-- son rang de page, et le dit plutôt que de faire croire à un numéro.
ALTER TABLE passage ADD COLUMN page INTEGER;
ALTER TABLE passage ADD COLUMN page_imprimee INTEGER;
