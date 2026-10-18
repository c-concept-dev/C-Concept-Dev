import {
  CleDAcces,
  Personne,
  SessionEnregistree,
  type OperationSensible,
} from "@lienotheque/contrats";
import { DUREE_SESSION, NIVEAUX, empreinteDuJeton, type Niveau } from "@lienotheque/noyau";
import { journaliser, type BaseSql, type Resultat } from "./registre.js";

/** Lire et écrire qui entre : une personne, une clé, une session (SEC-02, SEC-03).
 *
 *  Les quatre tables existent depuis la migration 2 du registre et, jusqu'à cette étape, aucun
 *  code ne les touchait — un jeton de service unique ouvrait la façade pour tout le monde. Ce
 *  module leur donne enfin des lectures et des écritures ; la cérémonie qui s'en sert vient
 *  après, et c'est voulu : on vérifie d'abord que le registre sait tenir ce qu'on va lui confier.
 *
 *  Comme pour le registre des bibliothèques, **tout ce qui sort d'ici est passé par son
 *  contrat**. Une ligne de base n'est pas une donnée de confiance, même quand c'est nous qui
 *  l'avons écrite — et ici moins qu'ailleurs : un compteur anti-rejeu relu de travers, c'est une
 *  signature rejouée qui passe ; une date d'expiration illisible, c'est une session qui ne
 *  périme jamais. Mieux vaut une erreur bruyante qu'une relecture indulgente.
 *
 *  **Rien ne se supprime ici.** Une clé révoquée et une session révoquée gardent leur ligne,
 *  datée : c'est la lecture qui doit voir la révocation, pas la base qui doit l'effacer. Un
 *  journal dont les lignes disparaissent ne répond plus à « depuis quand ». */

/** Une date qu'on peut comparer, depuis un horodatage. Lève si l'horodatage est illisible —
 *  ce qui est le bon comportement : voir l'en-tête. */
const instant = (horodatage: string): number => {
  const quand = Date.parse(horodatage);
  if (Number.isNaN(quand)) throw new Error(`Horodatage illisible dans le registre : ${horodatage}`);
  return quand;
};

const plusTard = (depuis: string, secondes: number): string =>
  new Date(instant(depuis) + secondes * 1000).toISOString();

// ---------------------------------------------------------------- les personnes

type LignePersonne = { id: string; nom: string; cree_le: string };

const versPersonne = (ligne: LignePersonne): Personne =>
  Personne.parse({ id: ligne.id, nom: ligne.nom, creeLe: ligne.cree_le });

export async function laPersonne(registre: BaseSql, id: string): Promise<Personne | undefined> {
  const ligne = await registre
    .prepare("SELECT id, nom, cree_le FROM utilisateur WHERE id = ?")
    .bind(id)
    .first<LignePersonne>();
  return ligne === null ? undefined : versPersonne(ligne);
}

/** Toutes les personnes, par ordre de nom — pour qu'une liste montrée deux fois soit la même. */
export async function lesPersonnes(registre: BaseSql): Promise<readonly Personne[]> {
  const { results } = await registre
    .prepare("SELECT id, nom, cree_le FROM utilisateur ORDER BY nom")
    .bind()
    .all<LignePersonne>();
  return results.map(versPersonne);
}

/** Inscrit une personne. Pas d'inscription ouverte : c'est un geste d'administration, journalisé. */
export async function inscrireUnePersonne(
  registre: BaseSql,
  nom: string,
  maintenant: string,
  auteur: string,
): Promise<Resultat<Personne>> {
  const abrege = nom.trim();
  if (abrege.length === 0) return { fait: false, raison: "Une personne a un nom." };

  const personne = Personne.parse({ id: crypto.randomUUID(), nom: abrege, creeLe: maintenant });
  await registre
    .prepare("INSERT INTO utilisateur (id, nom, cree_le) VALUES (?, ?, ?)")
    .bind(personne.id, personne.nom, personne.creeLe)
    .run();
  await journaliser(registre, {
    objet: personne.id,
    operation: "inscription" satisfies OperationSensible,
    auteur,
    detail: `${personne.nom} peut désormais enrôler des clés`,
    faitLe: maintenant,
  });
  return { fait: true, valeur: personne };
}

// ---------------------------------------------------------------- les clés d'accès

type LigneCle = {
  id: string;
  utilisateur_id: string;
  identifiant_cle: string | null;
  cle_publique: string;
  compteur: number;
  appareil: string | null;
  enrolee_le: string;
  revoquee_le: string | null;
};

/** Ce que le registre sait d'une clé, plus l'identifiant que l'appareil présente.
 *
 *  Deux identités pour deux usages : `id` est le nôtre, un UUID que le journal cite ;
 *  `identifiant` est celui de l'authentificateur, des octets quelconques, et le seul par lequel
 *  on retrouve la clé au moment de l'entrée. */
export type CleEnrolee = CleDAcces & { readonly identifiant: string };

const versCle = (ligne: LigneCle): CleEnrolee => {
  if (ligne.identifiant_cle === null)
    throw new Error(`Clé ${ligne.id} sans identifiant d'appareil : elle serait introuvable à l'entrée.`);
  const contrat = CleDAcces.parse({
    id: ligne.id,
    personneId: ligne.utilisateur_id,
    clePublique: ligne.cle_publique,
    compteur: ligne.compteur,
    ...(ligne.appareil === null ? {} : { appareil: ligne.appareil }),
    enroleeLe: ligne.enrolee_le,
    ...(ligne.revoquee_le === null ? {} : { revoqueeLe: ligne.revoquee_le }),
  });
  return { ...contrat, identifiant: ligne.identifiant_cle };
};

const CHAMPS_CLE =
  "id, utilisateur_id, identifiant_cle, cle_publique, compteur, appareil, enrolee_le, revoquee_le";

/** La clé que le navigateur présente, par l'identifiant qu'il en donne.
 *
 *  Rend aussi une clé révoquée : c'est à l'appelant de refuser, et il doit pouvoir dire
 *  « révoquée » plutôt que « inconnue » dans son journal. */
export async function laCleParIdentifiant(registre: BaseSql, identifiant: string): Promise<CleEnrolee | undefined> {
  const ligne = await registre
    .prepare(`SELECT ${CHAMPS_CLE} FROM cle_acces WHERE identifiant_cle = ?`)
    .bind(identifiant)
    .first<LigneCle>();
  return ligne === null ? undefined : versCle(ligne);
}

export async function laCle(registre: BaseSql, id: string): Promise<CleEnrolee | undefined> {
  const ligne = await registre
    .prepare(`SELECT ${CHAMPS_CLE} FROM cle_acces WHERE id = ?`)
    .bind(id)
    .first<LigneCle>();
  return ligne === null ? undefined : versCle(ligne);
}

/** Les clés d'une personne qui ouvrent encore, de la plus récente à la plus ancienne. */
export async function lesClesVivesDe(registre: BaseSql, personneId: string): Promise<readonly CleEnrolee[]> {
  const { results } = await registre
    .prepare(
      `SELECT ${CHAMPS_CLE} FROM cle_acces WHERE utilisateur_id = ? AND revoquee_le IS NULL ORDER BY enrolee_le DESC`,
    )
    .bind(personneId)
    .all<LigneCle>();
  return results.map(versCle);
}

/** Enrôle une clé pour une personne. La partie publique, jamais un secret. */
export async function enrolerUneCle(
  registre: BaseSql,
  clef: {
    readonly personneId: string;
    readonly identifiant: string;
    readonly clePublique: string;
    readonly compteur: number;
    readonly appareil?: string;
  },
  maintenant: string,
  auteur: string,
): Promise<Resultat<CleEnrolee>> {
  if ((await laPersonne(registre, clef.personneId)) === undefined)
    return { fait: false, raison: "Personne inconnue." };
  if ((await laCleParIdentifiant(registre, clef.identifiant)) !== undefined)
    return { fait: false, raison: "Une clé porte déjà cet identifiant." };

  const analyse = CleDAcces.safeParse({
    id: crypto.randomUUID(),
    personneId: clef.personneId,
    clePublique: clef.clePublique,
    compteur: clef.compteur,
    ...(clef.appareil === undefined ? {} : { appareil: clef.appareil }),
    enroleeLe: maintenant,
  });
  // Un refus ici est un refus de forme, et il est explicite : une clé publique qui n'en a pas
  // l'air ne doit pas entrer dans la base pour échouer plus tard, au moment de l'entrée.
  if (!analyse.success) return { fait: false, raison: `Clé refusée : ${analyse.error.issues[0]?.message ?? "forme"}` };

  const cle = analyse.data;
  await registre
    .prepare(
      "INSERT INTO cle_acces (id, utilisateur_id, identifiant_cle, cle_publique, compteur, appareil, enrolee_le, revoquee_le) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    )
    .bind(cle.id, cle.personneId, clef.identifiant, cle.clePublique, cle.compteur, cle.appareil ?? null, cle.enroleeLe)
    .run();
  await journaliser(registre, {
    objet: cle.id,
    operation: "enrolement" satisfies OperationSensible,
    auteur,
    detail: `clé enrôlée pour ${clef.personneId}${clef.appareil === undefined ? "" : ` depuis ${clef.appareil}`}`,
    faitLe: maintenant,
  });
  return { fait: true, valeur: { ...cle, identifiant: clef.identifiant } };
}

/** Retire une clé. Sa ligne reste, datée. */
export async function revoquerLaCle(
  registre: BaseSql,
  id: string,
  auteur: string,
  maintenant: string,
): Promise<Resultat<CleEnrolee>> {
  const cle = await laCle(registre, id);
  if (cle === undefined) return { fait: false, raison: "Clé inconnue." };
  if (cle.revoqueeLe !== undefined) return { fait: false, raison: "Cette clé est déjà révoquée." };

  await registre.prepare("UPDATE cle_acces SET revoquee_le = ? WHERE id = ?").bind(maintenant, id).run();
  await journaliser(registre, {
    objet: id,
    operation: "revocation" satisfies OperationSensible,
    auteur,
    detail: "clé d'accès révoquée",
    faitLe: maintenant,
  });
  return { fait: true, valeur: { ...cle, revoqueeLe: maintenant } };
}

/** Avance le compteur anti-rejeu d'une clé.
 *
 *  L'authentificateur l'incrémente à chaque usage : un compteur qui n'a pas avancé est le signe
 *  d'une signature rejouée, et c'est le seul moyen qu'on ait de le voir. Le refus n'écrit rien.
 *
 *  **Zéro après zéro est toléré**, et seulement ce cas : certains authentificateurs ne comptent
 *  pas du tout et laissent la valeur à zéro. Refuser zéro après zéro leur interdirait d'entrer
 *  une seconde fois ; l'exiger strictement croissant pour tous les autres reste en vigueur. */
export async function avancerLeCompteur(
  registre: BaseSql,
  id: string,
  nouveau: number,
): Promise<Resultat<number>> {
  const cle = await laCle(registre, id);
  if (cle === undefined) return { fait: false, raison: "Clé inconnue." };
  if (cle.revoqueeLe !== undefined) return { fait: false, raison: "Cette clé est révoquée." };
  if (!Number.isInteger(nouveau) || nouveau < 0) return { fait: false, raison: "Compteur impossible." };

  const immobile = nouveau === 0 && cle.compteur === 0;
  if (!immobile && nouveau <= cle.compteur)
    return { fait: false, raison: `Compteur non croissant (${cle.compteur} puis ${nouveau}) : signature rejouée.` };

  if (!immobile) await registre.prepare("UPDATE cle_acces SET compteur = ? WHERE id = ?").bind(nouveau, id).run();
  return { fait: true, valeur: nouveau };
}

// ---------------------------------------------------------------- les sessions

type LigneSession = {
  id: string;
  utilisateur_id: string;
  empreinte: string;
  appareil: string | null;
  ouverte_le: string;
  vue_le: string;
  expire_le: string;
  revoquee_le: string | null;
};

const versSession = (ligne: LigneSession): SessionEnregistree =>
  SessionEnregistree.parse({
    id: ligne.id,
    personneId: ligne.utilisateur_id,
    empreinte: ligne.empreinte,
    ...(ligne.appareil === null ? {} : { appareil: ligne.appareil }),
    ouverteLe: ligne.ouverte_le,
    vueLe: ligne.vue_le,
    expireLe: ligne.expire_le,
    ...(ligne.revoquee_le === null ? {} : { revoqueeLe: ligne.revoquee_le }),
  });

const CHAMPS_SESSION = "id, utilisateur_id, empreinte, appareil, ouverte_le, vue_le, expire_le, revoquee_le";

/** La session que porte une empreinte — **jamais** un jeton.
 *
 *  Ce qui arrive par le réseau est un jeton ; ce qui se cherche ici est son condensat. L'appelant
 *  condense avant d'appeler, et c'est pour cela que cette fonction ne prend pas de jeton : une
 *  signature qui accepterait les deux finirait par recevoir le mauvais. */
export async function laSessionParEmpreinte(
  registre: BaseSql,
  empreinte: string,
): Promise<SessionEnregistree | undefined> {
  const ligne = await registre
    .prepare(`SELECT ${CHAMPS_SESSION} FROM session WHERE empreinte = ?`)
    .bind(empreinte)
    .first<LigneSession>();
  return ligne === null ? undefined : versSession(ligne);
}

export async function laSession(registre: BaseSql, id: string): Promise<SessionEnregistree | undefined> {
  const ligne = await registre
    .prepare(`SELECT ${CHAMPS_SESSION} FROM session WHERE id = ?`)
    .bind(id)
    .first<LigneSession>();
  return ligne === null ? undefined : versSession(ligne);
}

/** Ouvre une session pour quatre-vingt-dix jours.
 *
 *  Le jeton entre ici et n'en ressort pas : seule son empreinte est rangée. L'appelant garde le
 *  jeton le temps de le déposer chez le lecteur, et personne ne peut le retrouver ensuite —
 *  c'est précisément ce qu'on veut d'une base qui serait lue. */
export async function ouvrirUneSession(
  registre: BaseSql,
  demande: { readonly personneId: string; readonly jeton: string; readonly appareil?: string },
  maintenant: string,
): Promise<Resultat<SessionEnregistree>> {
  if ((await laPersonne(registre, demande.personneId)) === undefined)
    return { fait: false, raison: "Personne inconnue." };

  const empreinte = await empreinteDuJeton(demande.jeton);
  const session = SessionEnregistree.parse({
    id: crypto.randomUUID(),
    personneId: demande.personneId,
    empreinte,
    ...(demande.appareil === undefined ? {} : { appareil: demande.appareil }),
    ouverteLe: maintenant,
    vueLe: maintenant,
    expireLe: plusTard(maintenant, DUREE_SESSION),
  });

  await registre
    .prepare(
      "INSERT INTO session (id, utilisateur_id, empreinte, appareil, ouverte_le, vue_le, expire_le, revoquee_le) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    )
    .bind(
      session.id,
      session.personneId,
      session.empreinte,
      session.appareil ?? null,
      session.ouverteLe,
      session.vueLe,
      session.expireLe,
    )
    .run();
  return { fait: true, valeur: session };
}

/** Repousse l'échéance d'une session qui vient de servir.
 *
 *  La date d'ouverture ne bouge jamais : c'est elle qui dit depuis quand on entre. */
export async function repousserLaSession(
  registre: BaseSql,
  id: string,
  maintenant: string,
): Promise<Resultat<SessionEnregistree>> {
  const session = await laSession(registre, id);
  if (session === undefined) return { fait: false, raison: "Session inconnue." };
  if (session.revoqueeLe !== undefined) return { fait: false, raison: "Cette session est révoquée." };

  const expireLe = plusTard(maintenant, DUREE_SESSION);
  await registre
    .prepare("UPDATE session SET vue_le = ?, expire_le = ? WHERE id = ?")
    .bind(maintenant, expireLe, id)
    .run();
  return { fait: true, valeur: { ...session, vueLe: maintenant, expireLe } };
}

/** Ferme une session à distance (SEC-02). Sa ligne reste, datée.
 *
 *  La révocation vit dans le registre et non dans le jeton : un jeton ne peut pas se retirer
 *  lui-même. C'est la seule raison pour laquelle le registre est consulté à chaque usage. */
export async function revoquerLaSession(
  registre: BaseSql,
  id: string,
  auteur: string,
  maintenant: string,
): Promise<Resultat<SessionEnregistree>> {
  const session = await laSession(registre, id);
  if (session === undefined) return { fait: false, raison: "Session inconnue." };
  if (session.revoqueeLe !== undefined) return { fait: false, raison: "Cette session est déjà révoquée." };

  await registre.prepare("UPDATE session SET revoquee_le = ? WHERE id = ?").bind(maintenant, id).run();
  await journaliser(registre, {
    objet: id,
    operation: "revocation" satisfies OperationSensible,
    auteur,
    detail: "session révoquée à distance",
    faitLe: maintenant,
  });
  return { fait: true, valeur: { ...session, revoqueeLe: maintenant } };
}

// ---------------------------------------------------------------- les droits

/** Le niveau d'une personne sur une bibliothèque (SEC-03).
 *
 *  La table ne dit que le **niveau** ; ce que chaque niveau permet est dans `droits.ts`, une
 *  table unique qu'on relit en revue de sécurité. Une action absente de celle-là n'est permise à
 *  personne, et une personne absente de celle-ci n'a aucun droit — jamais un droit par défaut.
 *
 *  Rien ne lève sur un niveau inconnu : un niveau que `droits.ts` ne connaît pas vaut **aucun
 *  droit**. Une base trafiquée ne doit pas pouvoir faire tomber la porte ; elle doit la laisser
 *  fermée. */
export async function leNiveauDe(
  registre: BaseSql,
  personneId: string,
  bibliotheque: string,
): Promise<Niveau | undefined> {
  const ligne = await registre
    .prepare("SELECT niveau FROM droit WHERE utilisateur_id = ? AND bibliotheque = ?")
    .bind(personneId, bibliotheque)
    .first<{ niveau: string }>();
  if (ligne === null) return undefined;
  return (NIVEAUX as readonly string[]).includes(ligne.niveau) ? (ligne.niveau as Niveau) : undefined;
}

/** Donne — ou change — le niveau d'une personne sur une bibliothèque. Journalisé : c'est par là
 *  qu'on saura un jour qui a élargi l'accès de qui. */
export async function inscrireUnDroit(
  registre: BaseSql,
  droit: { readonly personneId: string; readonly bibliotheque: string; readonly niveau: Niveau },
  maintenant: string,
  auteur: string,
): Promise<Resultat<Niveau>> {
  if ((await laPersonne(registre, droit.personneId)) === undefined)
    return { fait: false, raison: "Personne inconnue." };
  if (!(NIVEAUX as readonly string[]).includes(droit.niveau)) return { fait: false, raison: "Niveau inconnu." };

  await registre
    .prepare(
      "INSERT INTO droit (utilisateur_id, bibliotheque, niveau) VALUES (?, ?, ?) " +
        "ON CONFLICT(utilisateur_id, bibliotheque) DO UPDATE SET niveau = excluded.niveau",
    )
    .bind(droit.personneId, droit.bibliotheque, droit.niveau)
    .run();
  await journaliser(registre, {
    objet: droit.personneId,
    operation: "reviser_droits" satisfies OperationSensible,
    auteur,
    detail: `${droit.niveau} sur ${droit.bibliotheque}`,
    faitLe: maintenant,
  });
  return { fait: true, valeur: droit.niveau };
}

/** Combien de clés sont enrôlées, révoquées comprises.
 *
 *  C'est **la** condition de l'amorçage du premier accès : un registre sans aucune clé est un
 *  registre où personne ne peut entrer, donc un registre qu'il faut bien amorcer d'une façon ou
 *  d'une autre. Dès qu'une clé existe, la porte d'amorçage se referme pour toujours.
 *
 *  On compte les clés et non les personnes, parce que l'amorçage crée la personne **avant**
 *  d'enrôler sa clé : compter les personnes refermerait la porte au milieu du geste. */
export async function combienDeCles(registre: BaseSql): Promise<number> {
  const ligne = await registre
    .prepare("SELECT COUNT(*) AS combien FROM cle_acces")
    .bind()
    .first<{ combien: number }>();
  return ligne === null ? 0 : Number(ligne.combien);
}

/** Combien de personnes sont inscrites.
 *
 *  Sert à une seule chose : savoir si le registre est **vierge**, ce qui est la condition de
 *  l'amorçage du premier accès. Une question qui ne se pose qu'une fois dans la vie d'un
 *  registre. */
export async function combienDePersonnes(registre: BaseSql): Promise<number> {
  const ligne = await registre
    .prepare("SELECT COUNT(*) AS combien FROM utilisateur")
    .bind()
    .first<{ combien: number }>();
  return ligne === null ? 0 : Number(ligne.combien);
}
