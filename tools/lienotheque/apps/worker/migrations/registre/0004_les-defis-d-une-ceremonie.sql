-- Engendré depuis packages/depot-sqlite/src/migrations.ts — NE PAS MODIFIER ICI.
-- Base : registre · migration 4 « les-defis-d-une-ceremonie »
-- Pour changer le schéma : ajoutez une migration au tableau, puis « pnpm build ».

-- Un défi : le hasard que le serveur envoie et que l'appareil signe.
--
-- Il vit dans la base, et non dans un jeton signé qu'on se repasserait, pour une seule
-- raison : **un défi ne doit servir qu'une fois**, et une chose à usage unique a besoin
-- d'un endroit où l'on puisse marquer qu'elle a servi. Un jeton signé sait dire qu'il est
-- authentique et qu'il n'est pas périmé ; il ne saura jamais dire qu'il a déjà été employé.
--
-- La valeur est la clé primaire : deux défis identiques ne peuvent pas coexister, et la
-- contrainte vit dans la base plutôt que dans la confiance au générateur.
CREATE TABLE defi (
  valeur      TEXT PRIMARY KEY,
  -- À quoi il sert : enrôler une clé, ou entrer avec une clé déjà enrôlée. Un défi émis
  -- pour l'un ne doit pas pouvoir servir à l'autre.
  usage       TEXT NOT NULL,
  -- Pour qui, quand on le sait déjà. Nul à l'entrée : c'est la clé présentée qui dira qui.
  personne_id TEXT REFERENCES utilisateur(id) ON DELETE CASCADE,
  cree_le     TEXT NOT NULL,
  expire_le   TEXT NOT NULL,
  -- Marqué au moment où le défi sert. Une ligne consommée reste : c'est elle qui permet de
  -- répondre « ce défi a déjà servi » plutôt que « ce défi n'existe pas », et les deux ne
  -- disent pas la même chose à qui lit un journal.
  consomme_le TEXT
);
CREATE INDEX idx_defi_expire ON defi(expire_le);
