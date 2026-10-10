/** Migrations versionnées du dépôt local.
 *
 *  On n'édite jamais une migration déjà publiée : on en ajoute une. Le schéma est volontairement
 *  simple et portable — types SQL du plus petit dénominateur commun, aucune extension — pour être
 *  repris tel quel sur D1 au lot E.
 *
 *  Aucune colonne BLOB nulle part : les octets vivent dans le dossier de la bibliothèque, la base
 *  ne garde qu'empreintes et chemins relatifs (HEB-02). */
export type Migration = { readonly version: number; readonly nom: string; readonly sql: string };

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    nom: "socle",
    sql: `
      CREATE TABLE fichier (
        empreinte   TEXT PRIMARY KEY,
        taille      INTEGER NOT NULL,
        type_mime   TEXT NOT NULL,
        nom_origine TEXT NOT NULL,
        ajoute_le   TEXT NOT NULL,
        appareil_id TEXT NOT NULL
      );

      CREATE TABLE document (
        id              TEXT PRIMARY KEY,
        bibliotheque_id TEXT NOT NULL,
        titre           TEXT NOT NULL,
        cree_le         TEXT NOT NULL
      );

      CREATE TABLE document_alias (
        alias       TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_alias_document ON document_alias(document_id);

      CREATE TABLE version (
        id            TEXT PRIMARY KEY,
        document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
        numero        INTEGER NOT NULL,
        etat          TEXT NOT NULL,
        active        INTEGER NOT NULL DEFAULT 0,
        recette_id    TEXT NOT NULL,
        recette_ver   INTEGER NOT NULL,
        precedente_id TEXT,
        cree_le       TEXT NOT NULL,
        UNIQUE (document_id, numero)
      );
      CREATE INDEX idx_version_document ON version(document_id);
      -- Une seule version active par document : la contrainte vit dans la base, pas dans le code.
      CREATE UNIQUE INDEX idx_version_active ON version(document_id) WHERE active = 1;

      CREATE TABLE version_fichier (
        version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
        empreinte  TEXT NOT NULL REFERENCES fichier(empreinte),
        rang       INTEGER NOT NULL,
        PRIMARY KEY (version_id, rang)
      );

      CREATE TABLE version_outil (
        version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
        nom        TEXT NOT NULL,
        version    TEXT NOT NULL,
        PRIMARY KEY (version_id, nom, version)
      );

      CREATE TABLE version_manque (
        version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
        manque     TEXT NOT NULL,
        PRIMARY KEY (version_id, manque)
      );

      CREATE TABLE ancre (
        id          TEXT PRIMARY KEY,
        version_id  TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
        fichier     TEXT NOT NULL,
        selecteur   TEXT NOT NULL
      );
      CREATE INDEX idx_ancre_version ON ancre(version_id);

      CREATE TABLE lien (
        id        TEXT PRIMARY KEY,
        de        TEXT NOT NULL,
        vers      TEXT NOT NULL,
        nature    TEXT NOT NULL,
        preuve    TEXT NOT NULL,
        confiance REAL NOT NULL,
        auteur    TEXT NOT NULL
      );
      CREATE INDEX idx_lien_de ON lien(de);
      CREATE INDEX idx_lien_vers ON lien(vers);

      CREATE TABLE carte_synchro (
        id         TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
        media      TEXT NOT NULL,
        paires     TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_carte_version ON carte_synchro(version_id);

      CREATE TABLE schema_bibliotheque (
        cle     TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        contenu TEXT NOT NULL
      );

      CREATE TABLE classement (
        document_id    TEXT PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
        schema_cle     TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        axes           TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    nom: "file-de-travaux",
    sql: `
      CREATE TABLE travail (
        id               TEXT PRIMARY KEY,
        outil_nom        TEXT NOT NULL,
        outil_version    TEXT NOT NULL,
        version_cible    TEXT NOT NULL,
        etat             TEXT NOT NULL,
        lieu             TEXT NOT NULL,
        empreinte_entree TEXT,
        tentative        INTEGER NOT NULL,
        progression      REAL NOT NULL,
        verrou           TEXT,
        point_reprise    TEXT,
        erreur           TEXT,
        cree_le          TEXT NOT NULL,
        maj_le           TEXT NOT NULL
      );
      CREATE INDEX idx_travail_etat ON travail(etat);
      -- Une seule demande identique en file à la fois (JOB-04).
      CREATE UNIQUE INDEX idx_travail_entree ON travail(empreinte_entree)
        WHERE empreinte_entree IS NOT NULL AND etat NOT IN ('termine', 'annule', 'en_echec_definitif');

      CREATE TABLE journal_indexation (
        index_nom TEXT NOT NULL,
        objet_id  TEXT NOT NULL,
        etape     TEXT NOT NULL,
        maj_le    TEXT NOT NULL,
        PRIMARY KEY (index_nom, objet_id, etape)
      );
      CREATE INDEX idx_journal_index ON journal_indexation(index_nom);
    `,
  },
  {
    version: 3,
    nom: "passages",
    sql: `
      -- Le texte d'un passage, là où une requête peut l'atteindre.
      --
      -- Jusqu'ici le texte lisible d'une bibliothèque vivait dans la vue — un fichier JSON à
      -- côté de la base — et la recherche locale le parcourait en entier. C'est tenable pour une
      -- bibliothèque ouverte sur un ordinateur ; ça ne l'est pas pour une bibliothèque servie,
      -- où chaque requête devrait rapatrier la vue entière avant de chercher dedans.
      --
      -- La façade de compatibilité le réclame en clair : elle doit rendre un champ « content ».
      -- Un texte qui n'existe que dans un fichier JSON ne se cherche pas en SQL.
      --
      -- Ce n'est pas un second magasin à tenir à jour à la main : la table est **produite** à
      -- partir de la vue au moment où une version est activée, et refaite si la version change.
      -- La vue reste ce qui fait foi.
      CREATE TABLE passage (
        id          TEXT PRIMARY KEY,
        version_id  TEXT NOT NULL REFERENCES version(id) ON DELETE CASCADE,
        ancre_id    TEXT REFERENCES ancre(id) ON DELETE SET NULL,
        rang        INTEGER NOT NULL,
        texte       TEXT NOT NULL,
        UNIQUE (version_id, rang)
      );
      CREATE INDEX idx_passage_version ON passage(version_id);
      CREATE INDEX idx_passage_ancre ON passage(ancre_id);
    `,
  },
];

/** Registre des bibliothèques connues de cet ordinateur.
 *
 *  À ne pas confondre avec `MIGRATIONS_REGISTRE_EN_LIGNE` ci-dessous : celui-ci dit où une
 *  bibliothèque se trouve **sur cette machine**, celui-là dit où elle est **publiée**. Les deux
 *  portent le mot « registre » parce qu'ils répondent à la même question — où est quoi ? — mais
 *  ils ne se recouvrent pas et ne vivent pas dans la même base. */
export const MIGRATIONS_REGISTRE: readonly Migration[] = [
  {
    version: 1,
    nom: "registre",
    sql: `
      CREATE TABLE bibliotheque (
        cle      TEXT PRIMARY KEY,
        nom      TEXT NOT NULL,
        dossier  TEXT NOT NULL,
        cree_le  TEXT NOT NULL
      );
    `,
  },
];

/** Registre des bibliothèques publiées (lot E1).
 *
 *  Une base à part, sur D1, qui ne contient **aucun contenu de bibliothèque** : seulement de quoi
 *  savoir laquelle existe, où elle est servie et dans quel état. Les bases des bibliothèques
 *  elles-mêmes restent une par bibliothèque — c'est ce qui rend leur isolation structurelle et
 *  non conditionnelle : aucune requête ne peut en atteindre deux.
 *
 *  Pourquoi une `liaison` et pas l'identifiant de la base : une liaison D1 se déclare dans la
 *  configuration au déploiement. Plutôt que de donner au Worker un jeton de compte capable de
 *  créer et de supprimer des bases — ce que SEC-08 interdit —, on déclare une réserve de places
 *  nommées et le registre dit laquelle est occupée par qui. */
export const MIGRATIONS_REGISTRE_EN_LIGNE: readonly Migration[] = [
  {
    version: 1,
    nom: "registre-en-ligne",
    sql: `
      CREATE TABLE bibliotheque_publiee (
        cle            TEXT PRIMARY KEY,
        nom            TEXT NOT NULL,
        -- locale, mixte ou publiee. L'état commande ce que l'interface a le droit d'annoncer
        -- avant confirmation (HEB-01), et il se lit ici plutôt que de se deviner.
        etat           TEXT NOT NULL,
        -- La place prise dans la réserve de liaisons, nulle tant que la bibliothèque n'est pas
        -- servie. Une place ne porte qu'une bibliothèque : la contrainte vit dans la base.
        liaison        TEXT,
        prefixe        TEXT NOT NULL UNIQUE,
        -- Choisie explicitement à la création, jamais implicite (HEB-05).
        region         TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        publiee_le     TEXT,
        maj_le         TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_registre_liaison ON bibliotheque_publiee(liaison) WHERE liaison IS NOT NULL;
      CREATE INDEX idx_registre_etat ON bibliotheque_publiee(etat);

      -- Journal des opérations sensibles (SEC-07) : publication, dépublication, changement
      -- d'hébergement, révocation. Chaque ligne dit qui, quoi, quand — et rien ne l'efface.
      CREATE TABLE journal_audit (
        id        TEXT PRIMARY KEY,
        objet     TEXT NOT NULL,
        operation TEXT NOT NULL,
        auteur    TEXT NOT NULL,
        detail    TEXT,
        fait_le   TEXT NOT NULL
      );
      CREATE INDEX idx_audit_objet ON journal_audit(objet);
      CREATE INDEX idx_audit_date ON journal_audit(fait_le);
    `,
  },
  {
    version: 2,
    nom: "qui-entre",
    sql: `
      -- Les personnes qui ont le droit d'entrer. Deux, nommées, et pas d'inscription ouverte :
      -- une bibliothèque personnelle n'a pas de visiteurs (SEC-02).
      CREATE TABLE utilisateur (
        id      TEXT PRIMARY KEY,
        nom     TEXT NOT NULL,
        cree_le TEXT NOT NULL
      );

      -- Une clé d'accès enrôlée : la partie publique, jamais de secret. Le navigateur garde la
      -- partie privée, l'appareil la déverrouille, et rien de tout cela ne traverse le réseau.
      CREATE TABLE cle_acces (
        id              TEXT PRIMARY KEY,
        utilisateur_id  TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
        cle_publique    TEXT NOT NULL,
        compteur        INTEGER NOT NULL DEFAULT 0,
        appareil        TEXT,
        enrolee_le      TEXT NOT NULL,
        revoquee_le     TEXT
      );
      CREATE INDEX idx_cle_utilisateur ON cle_acces(utilisateur_id);

      -- Une session ouverte sur un appareil de confiance. Quatre-vingt-dix jours, repoussés à
      -- chaque usage : c'est ce qui fait qu'on ne ressaisit rien.
      --
      -- La table garde une **empreinte** du jeton, jamais le jeton : une base lue ne doit pas
      -- livrer de quoi se faire passer pour quelqu'un.
      CREATE TABLE session (
        id             TEXT PRIMARY KEY,
        utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
        empreinte      TEXT NOT NULL UNIQUE,
        appareil       TEXT,
        ouverte_le     TEXT NOT NULL,
        vue_le         TEXT NOT NULL,
        expire_le      TEXT NOT NULL,
        revoquee_le    TEXT
      );
      CREATE INDEX idx_session_utilisateur ON session(utilisateur_id);
      CREATE INDEX idx_session_expire ON session(expire_le);

      -- Ce qu'une personne a le droit de faire, bibliothèque par bibliothèque (SEC-03).
      CREATE TABLE droit (
        utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
        bibliotheque   TEXT NOT NULL,
        niveau         TEXT NOT NULL,
        PRIMARY KEY (utilisateur_id, bibliotheque)
      );
    `,
  },
];
