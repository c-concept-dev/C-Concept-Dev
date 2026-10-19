-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : registre · migration 3 « l-identifiant-que-l-appareil-presente »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- La migration 2 a été écrite avant la cérémonie, et il lui manquait une colonne.
--
-- À l'entrée, le navigateur présente l'identifiant que l'authentificateur a donné à la
-- clé — des octets quelconques, pas un UUID — et c'est **le seul chemin** pour retrouver
-- la clé publique qui vérifiera la signature. Sans cette colonne, une clé enrôlée est
-- introuvable au moment précis où elle sert.
--
-- On ne la met pas à la place de « id » : l'identifiant interne reste un UUID, comme
-- partout ailleurs, et c'est lui que le journal cite. Deux identités pour deux usages,
-- chacune avec sa forme.
ALTER TABLE cle_acces ADD COLUMN identifiant_cle TEXT;

-- Deux appareils ne peuvent pas prétendre au même identifiant : la contrainte vit dans la
-- base, pas dans la vigilance de qui écrit. Partiel, parce qu'ajouter une colonne à une
-- table peuplée la laisse nulle — ici elle est vide, mais la règle ne doit pas en dépendre.
CREATE UNIQUE INDEX idx_cle_identifiant ON cle_acces(identifiant_cle)
  WHERE identifiant_cle IS NOT NULL;
