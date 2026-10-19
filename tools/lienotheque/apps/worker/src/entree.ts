import { type PreuveDEntree, type SessionEnregistree, type OperationSensible } from "@lienotheque/contrats";
import {
  MOT_DE_REFUS,
  examinerLesDonneesAuthentificateur,
  examinerLesDonneesClient,
  jetonNeuf,
  messageSigne,
  pourLeJournal as noterLIssue,
  verifierUneSignature,
} from "@lienotheque/noyau";
import { consommerLeDefi } from "./enrolement.js";
import { journaliser, type BaseSql } from "./registre.js";
import { avancerLeCompteur, laCleParIdentifiant, ouvrirUneSession } from "./qui-entre.js";

/** L'entrée : un défi, une signature, une session ouverte (SEC-02).
 *
 *  ## Deux sorties qui ne se mélangent pas
 *
 *  Un refus porte **deux** choses : `mot`, qui va au demandeur, et `pourLeJournal`, qui n'y va
 *  jamais. Les noms font le travail — personne n'écrit `pourLeJournal` dans une réponse HTTP par
 *  distraction.
 *
 *  Le mot est le même pour tous les refus. Apprendre qu'une signature est illisible plutôt que
 *  refusée, qu'une clé est révoquée plutôt qu'inconnue, c'est apprendre où chercher. C'est la
 *  même règle que le refus de la façade, et le défaut d'ordre corrigé le 10 octobre.
 *
 *  ## Quand un défi est dépensé
 *
 *  **Un défi est dépensé dès qu'une signature a été vérifiée contre lui**, qu'elle ait tenu ou
 *  non. C'est ce qui empêche d'essayer mille signatures sur le même défi.
 *
 *  La règle diffère de l'enrôlement, et la différence est de principe, non de commodité : là-bas,
 *  un refus de clé survient **avant** toute vérification — rien n'a été éprouvé, le défi n'a pas
 *  servi, et on peut réessayer depuis un autre appareil. Ici, la signature a été jugée.
 *
 *  ## Quels refus sont journalisés
 *
 *  Seuls ceux qui ont présenté un **défi valide**. Un défi inconnu n'écrit rien : sans cette
 *  retenue, n'importe qui remplirait le journal en envoyant des valeurs au hasard, et noierait
 *  les lignes qui comptent. Les refus journalisés, eux, sont bornés par les défis qu'on a émis.
 *
 *  Une entrée **réussie** n'est pas journalisée non plus : elle laisse une ligne de session,
 *  datée et nommée, qui dit déjà qui est entré et quand. Un refus, lui, ne laisse rien. */

/** Ce que l'entrée rend. Jamais un `Resultat` ordinaire : sa `raison` irait droit dans une
 *  réponse, et c'est précisément ce qu'on ne veut pas ici. */
export type Entree =
  | { readonly fait: true; readonly session: SessionEnregistree; readonly jeton: string }
  | { readonly fait: false; readonly mot: string; readonly pourLeJournal: string };

const refus = (pourLeJournal: string): Entree => ({ fait: false, mot: MOT_DE_REFUS, pourLeJournal });

const desOctets = (base64: string): Uint8Array<ArrayBuffer> | undefined => {
  try {
    const normal = base64.replaceAll("-", "+").replaceAll("_", "/");
    const brut = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
    return Uint8Array.from(brut, (caractere) => caractere.charCodeAt(0));
  } catch {
    return undefined;
  }
};

const leDefiAnnonce = (donneesClient: string): string | undefined => {
  const octets = desOctets(donneesClient);
  if (octets === undefined) return undefined;
  try {
    const lu: unknown = JSON.parse(new TextDecoder().decode(octets));
    if (lu === null || typeof lu !== "object") return undefined;
    const { challenge } = lu as Record<string, unknown>;
    return typeof challenge === "string" ? challenge : undefined;
  } catch {
    return undefined;
  }
};

type LigneDefi = { valeur: string; usage: string; expire_le: string; consomme_le: string | null };

/** Entre avec une clé déjà enrôlée, et ouvre une session de quatre-vingt-dix jours. */
export async function entrer(
  registre: BaseSql,
  preuve: PreuveDEntree,
  cadre: {
    readonly origine: string;
    /** Le domaine pour lequel les clés ont été enrôlées. L'appareil l'inclut dans ce qu'il
     *  signe, et c'est la garde contre une signature prise sur un site voisin. */
    readonly domaine: string;
    readonly maintenant: string;
  },
): Promise<Entree> {
  // 1. Le défi. Avant lui, rien n'est journalisé : voir l'en-tête.
  const annonce = leDefiAnnonce(preuve.donneesClient);
  if (annonce === undefined) return refus("données du client illisibles : aucun défi annoncé");

  const ligne = await registre
    .prepare("SELECT valeur, usage, expire_le, consomme_le FROM defi WHERE valeur = ?")
    .bind(annonce)
    .first<LigneDefi>();
  if (ligne === null) return refus("défi inconnu");
  if (ligne.usage !== "entree") return refus(`défi émis pour un autre usage (${ligne.usage})`);
  if (ligne.consomme_le !== null) return refus("ce défi a déjà servi");
  if (Date.parse(ligne.expire_le) <= Date.parse(cadre.maintenant)) return refus("défi périmé");

  // À partir d'ici, un défi valide a été présenté : les refus s'inscrivent au journal.
  const noter = async (pourquoi: string): Promise<Entree> => {
    await journaliser(registre, {
      objet: preuve.identifiant,
      operation: "entree_refusee" satisfies OperationSensible,
      auteur: "—",
      detail: pourquoi,
      faitLe: cadre.maintenant,
    });
    return refus(pourquoi);
  };

  // 2. La clé que le navigateur présente. Inconnue et révoquée se distinguent : la seconde dit
  //    qu'on a retiré cet appareil, et c'est une information utile dans un journal.
  const cle = await laCleParIdentifiant(registre, preuve.identifiant);
  if (cle === undefined) return noter("clé inconnue");
  if (cle.revoqueeLe !== undefined) return noter("clé révoquée");

  // 3. Ce que le navigateur dit avoir fait.
  const vuClient = examinerLesDonneesClient(preuve.donneesClient, {
    type: "webauthn.get",
    defi: ligne.valeur,
    origine: cadre.origine,
  });
  if (!vuClient.bon) return noter(`cérémonie refusée : ${vuClient.raison}`);

  // 4. Ce que l'authentificateur dit de lui-même : le domaine, la présence, le compteur.
  const donneesAuth = desOctets(preuve.donneesAuthentificateur);
  if (donneesAuth === undefined) return noter("données de l'authentificateur illisibles");

  const vuAuth = await examinerLesDonneesAuthentificateur(donneesAuth, { domaine: cadre.domaine });
  if (!vuAuth.bon) return noter(`authentificateur refusé : ${vuAuth.raison}`);

  // 5. La signature. Trois issues, et le journal les sépare.
  const donneesClient = desOctets(preuve.donneesClient);
  const signature = desOctets(preuve.signature);
  const clePublique = desOctets(cle.clePublique);
  if (donneesClient === undefined || signature === undefined) return noter("preuve illisible");
  if (clePublique === undefined) return noter("clé publique enrôlée illisible");

  const issue = await verifierUneSignature(
    clePublique,
    signature,
    await messageSigne(donneesAuth, donneesClient),
  );

  // 6. Le défi est dépensé : une signature a été jugée contre lui. Même si elle a échoué.
  const depense = await consommerLeDefi(registre, ligne.valeur, "entree", cadre.maintenant);
  if (!depense.fait) return noter(`défi non dépensable : ${depense.raison}`);

  if (issue.issue !== "valide") return noter(noterLIssue(issue));

  // 7. Le compteur anti-rejeu. Seconde garde, indépendante du défi : une preuve rejouée arrive
  //    avec un compteur qui n'a pas avancé.
  const avance = await avancerLeCompteur(registre, cle.id, vuAuth.compteur);
  if (!avance.fait) return noter(`signature rejouée : ${avance.raison}`);

  // 8. La session. Le jeton sort d'ici et n'y revient jamais : seule son empreinte est rangée.
  const jeton = jetonNeuf();
  const ouverte = await ouvrirUneSession(
    registre,
    {
      personneId: cle.personneId,
      jeton,
      ...(cle.appareil === undefined ? {} : { appareil: cle.appareil }),
    },
    cadre.maintenant,
  );
  if (!ouverte.fait) return noter(`session non ouverte : ${ouverte.raison}`);

  return { fait: true, session: ouverte.valeur, jeton };
}
