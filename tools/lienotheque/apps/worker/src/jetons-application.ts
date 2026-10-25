import {
  ActionApplication,
  JetonApplication,
  type ActionApplication as ActionApplicationType,
  type JetonApplication as JetonApplicationType,
  type OperationSensible,
} from "@lienotheque/contrats";
import { empreinteDuJeton, jetonNeuf } from "@lienotheque/noyau";
import type { BaseSql, Resultat } from "./registre.js";
import { memeJeton } from "./vision.js";

const DUREE_MAXIMALE = 90 * 24 * 60 * 60 * 1000;
const FORME = /^ln_app_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{20,})$/i;
const MOT = "Accès refusé.";

type Ligne = {
  id: string;
  application: string;
  nom: string;
  bibliotheque: string;
  empreinte: string;
  cree_par: string;
  cree_le: string;
  expire_le: string;
  revoque_le: string | null;
};

const versContrat = (ligne: Ligne, actions: readonly string[]): JetonApplicationType =>
  JetonApplication.parse({
    id: ligne.id,
    application: ligne.application,
    nom: ligne.nom,
    bibliotheque: ligne.bibliotheque,
    actions,
    creePar: ligne.cree_par,
    creeLe: ligne.cree_le,
    expireLe: ligne.expire_le,
    ...(ligne.revoque_le === null ? {} : { revoqueLe: ligne.revoque_le }),
  });

const lesActions = async (registre: BaseSql, id: string): Promise<readonly ActionApplicationType[]> => {
  const { results } = await registre
    .prepare("SELECT action FROM jeton_application_action WHERE jeton_id = ? ORDER BY action")
    .bind(id)
    .all<{ action: string }>();
  return results.map((ligne) => ActionApplication.parse(ligne.action));
};

export async function leJetonApplication(registre: BaseSql, id: string): Promise<JetonApplicationType | undefined> {
  const ligne = await registre
    .prepare(
      "SELECT id, application, nom, bibliotheque, empreinte, cree_par, cree_le, expire_le, revoque_le " +
        "FROM jeton_application WHERE id = ?",
    )
    .bind(id)
    .first<Ligne>();
  return ligne === null ? undefined : versContrat(ligne, await lesActions(registre, id));
}

export async function emettreJetonApplication(
  registre: BaseSql,
  demande: {
    readonly application: string;
    readonly nom: string;
    readonly bibliotheque: string;
    readonly actions: readonly ActionApplicationType[];
    readonly expireLe: string;
  },
  maintenant: string,
  auteur: string,
): Promise<Resultat<{ readonly jeton: string; readonly acces: JetonApplicationType }>> {
  if (registre.batch === undefined) return { fait: false, raison: "Le registre ne garantit pas un geste atomique." };

  const debut = Date.parse(maintenant);
  const fin = Date.parse(demande.expireLe);
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut)
    return { fait: false, raison: "La péremption doit être future." };
  if (fin - debut > DUREE_MAXIMALE)
    return { fait: false, raison: "Un accès d’application ne peut pas dépasser quatre-vingt-dix jours." };

  const actions = [...new Set(demande.actions)].sort();
  const id = crypto.randomUUID();
  const jeton = `ln_app_${id}.${jetonNeuf()}`;
  const empreinte = await empreinteDuJeton(jeton);
  const analyse = JetonApplication.safeParse({
    id,
    application: demande.application,
    nom: demande.nom,
    bibliotheque: demande.bibliotheque,
    actions,
    creePar: auteur,
    creeLe: maintenant,
    expireLe: demande.expireLe,
  });
  if (!analyse.success) return { fait: false, raison: analyse.error.issues[0]?.message ?? "Accès refusé." };

  const acces = analyse.data;
  const auditId = crypto.randomUUID();
  const requetes = [
    registre
      .prepare(
        "INSERT INTO jeton_application " +
          "(id, application, nom, bibliotheque, empreinte, cree_par, cree_le, expire_le, revoque_le) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
      )
      .bind(id, acces.application, acces.nom, acces.bibliotheque, empreinte, auteur, maintenant, acces.expireLe),
    ...actions.map((action) =>
      registre.prepare("INSERT INTO jeton_application_action (jeton_id, action) VALUES (?, ?)").bind(id, action),
    ),
    registre
      .prepare("INSERT INTO journal_audit (id, objet, operation, auteur, detail, fait_le) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(
        auditId,
        id,
        "emission_jeton_application" satisfies OperationSensible,
        auteur,
        `${acces.application} · ${acces.bibliotheque} · ${actions.join(", ")}`,
        maintenant,
      ),
  ];
  try {
    await registre.batch(requetes);
  } catch {
    return { fait: false, raison: "L’accès d’application n’a pas été créé." };
  }
  return { fait: true, valeur: { jeton, acces } };
}

export async function revoquerJetonApplication(
  registre: BaseSql,
  id: string,
  auteur: string,
  maintenant: string,
): Promise<Resultat<JetonApplicationType>> {
  if (registre.batch === undefined) return { fait: false, raison: "Le registre ne garantit pas un geste atomique." };
  const acces = await leJetonApplication(registre, id);
  if (acces === undefined) return { fait: false, raison: "Accès inconnu." };
  if (acces.revoqueLe !== undefined) return { fait: false, raison: "Cet accès est déjà révoqué." };
  try {
    await registre.batch([
      registre.prepare("UPDATE jeton_application SET revoque_le = ? WHERE id = ? AND revoque_le IS NULL").bind(maintenant, id),
      registre
        .prepare("INSERT INTO journal_audit (id, objet, operation, auteur, detail, fait_le) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(
          crypto.randomUUID(),
          id,
          "revocation_jeton_application" satisfies OperationSensible,
          auteur,
          `${acces.application} · ${acces.bibliotheque}`,
          maintenant,
        ),
    ]);
  } catch {
    return { fait: false, raison: "L’accès d’application n’a pas été révoqué." };
  }
  return { fait: true, valeur: { ...acces, revoqueLe: maintenant } };
}

export type ApplicationIdentifiee =
  | {
      readonly ouverte: true;
      readonly id: string;
      readonly application: string;
      readonly bibliotheque: string;
      readonly actions: ReadonlySet<ActionApplicationType>;
    }
  | { readonly ouverte: false; readonly statut: 401; readonly mot: string; readonly pourLeJournal: string };

const fermee = (pourLeJournal: string): ApplicationIdentifiee => ({
  ouverte: false,
  statut: 401,
  mot: MOT,
  pourLeJournal,
});

export async function identifierParJetonApplication(
  registre: BaseSql,
  entetes: Headers,
  maintenant: string,
): Promise<ApplicationIdentifiee> {
  const brut = entetes.get("x-api-key") ?? "";
  const forme = FORME.exec(brut);
  if (forme === null) return fermee("jeton d’application absent ou mal formé");
  const id = forme[1]!;
  const ligne = await registre
    .prepare(
      "SELECT id, application, nom, bibliotheque, empreinte, cree_par, cree_le, expire_le, revoque_le " +
        "FROM jeton_application WHERE id = ?",
    )
    .bind(id)
    .first<Ligne>();
  if (ligne === null) return fermee("jeton d’application inconnu");
  if (!memeJeton(await empreinteDuJeton(brut), ligne.empreinte)) return fermee("secret d’application refusé");
  if (ligne.revoque_le !== null) return fermee("jeton d’application révoqué");
  if (Date.parse(ligne.expire_le) <= Date.parse(maintenant)) return fermee("jeton d’application périmé");
  const actions = new Set(await lesActions(registre, id));
  return { ouverte: true, id, application: ligne.application, bibliotheque: ligne.bibliotheque, actions };
}

export function lireOriginesApplications(brut: string | undefined): Readonly<Record<string, readonly string[]>> {
  if (brut === undefined || brut.length === 0) return {};
  try {
    const valeur: unknown = JSON.parse(brut);
    if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
    const resultat: Record<string, readonly string[]> = {};
    for (const [application, origines] of Object.entries(valeur)) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(application) || !Array.isArray(origines)) return {};
      const valides = origines.filter((origine): origine is string => {
        if (typeof origine !== "string") return false;
        try {
          const url = new URL(origine);
          return url.origin === origine && (url.protocol === "https:" || url.hostname === "localhost");
        } catch {
          return false;
        }
      });
      if (valides.length !== origines.length) return {};
      resultat[application] = [...new Set(valides)];
    }
    return resultat;
  } catch {
    return {};
  }
}

export function origineAutorisee(
  configuration: Readonly<Record<string, readonly string[]>>,
  application: string,
  origine: string | null,
): boolean {
  // Un appel de serveur à serveur n'a pas d'origine. Un navigateur, lui, doit présenter une
  // valeur exactement inscrite pour cette application ; aucune suffixation ni réflexion.
  return origine === null || configuration[application]?.includes(origine) === true;
}
