import {
  Arret,
  Echec,
  MessageVersProcessus,
  Salutation,
  VERSION_PROTOCOLE,
  desaccordDeProtocole,
  type MessageVersHote,
} from "@lienotheque/contrats";
import { executerTravail } from "./executant.js";

/** Le processus annexe : une boucle de messages, et rien d'autre (PLT-02, JOB-09).
 *
 *  L'hôte le lance, lui parle sur l'entrée standard, l'écoute sur la sortie standard. Un message
 *  par ligne : c'est la forme la plus simple qui survive à un résultat de plusieurs mégaoctets,
 *  et la seule qu'un hôte écrit en Rust puisse lire sans bibliothèque.
 *
 *  Le processus ne décide de rien. Il ne connaît ni la file, ni le dépôt, ni ce qui sera gardé :
 *  il reçoit un travail, dit où il en est, rend ce qu'il a produit. L'hôte est seul écrivain. */

/** Ce qu'on écrit sur la sortie standard, et comment.
 *
 *  Une ligne par message, terminée par un saut : un hôte qui lit ligne à ligne n'a pas besoin de
 *  savoir combien d'octets viennent. Les caractères non ASCII partent tels quels — JSON est en
 *  UTF-8 et l'hôte lit de l'UTF-8. */
export type Ecrire = (ligne: string) => void;

/** Première chose dite, avant qu'on nous confie quoi que ce soit : qui nous sommes.
 *
 *  La version du moteur part avec, parce que la décision du lot D2 exige la même en développement
 *  et dans le paquet, et qu'un écart doit se constater plutôt que se deviner. */
export function salutation(): Salutation {
  return Salutation.parse({
    type: "salutation",
    protocole: VERSION_PROTOCOLE,
    moteur: { nom: "node", version: process.versions.node },
  });
}

/** L'identifiant de travail d'une ligne qu'on n'a pas su lire, s'il s'y trouve malgré tout.
 *
 *  Sans lui, il n'y a personne à qui dire l'échec : on se rabat alors sur la sortie d'erreur, que
 *  l'hôte joint à son journal. Avec lui, l'échec part par le canal prévu et le travail cesse
 *  proprement au lieu de rester en suspens. */
function travailDe(brut: unknown): string | undefined {
  if (typeof brut !== "object" || brut === null) return undefined;
  const id = (brut as { travailId?: unknown }).travailId;
  return typeof id === "string" ? id : undefined;
}

export type OptionsBoucle = {
  /** Ce qu'on fait d'une ligne qu'on n'a pas su rattacher à un travail. Par défaut, la sortie
   *  d'erreur — jamais la sortie standard, qui ne porte que des messages. */
  readonly signaler?: (texte: string) => void;
};

/** La boucle. Elle rend la main quand l'entrée se ferme, ou sur un arrêt demandé.
 *
 *  Séparée du câblage aux flux du processus pour être éprouvable sans lancer de processus : c'est
 *  la boucle qu'on veut contrôler, pas la capacité de Node à ouvrir un tuyau. */
export async function boucleDeMessages(
  lignes: AsyncIterable<string>,
  ecrire: Ecrire,
  options: OptionsBoucle = {},
): Promise<void> {
  const signaler = options.signaler ?? ((texte: string) => process.stderr.write(`${texte}\n`));
  const dire = (message: MessageVersHote): void => ecrire(`${JSON.stringify(message)}\n`);

  dire(salutation());

  for await (const ligne of lignes) {
    const nettoyee = ligne.trim();
    if (nettoyee === "") continue;

    let brut: unknown;
    try {
      brut = JSON.parse(nettoyee);
    } catch {
      signaler("Ligne illisible reçue : ce n'est pas du JSON.");
      continue;
    }

    const lu = MessageVersProcessus.safeParse(brut);
    if (!lu.success) {
      const travailId = travailDe(brut);
      const cause = "Message reçu que ce processus ne sait pas lire.";
      if (travailId === undefined) signaler(cause);
      else dire(Echec.parse({ type: "echec", protocole: VERSION_PROTOCOLE, travailId, cause, reprisePossible: false }));
      continue;
    }

    const message = lu.data;
    const ecart = desaccordDeProtocole(message.protocole);
    if (ecart !== undefined) {
      dire(Echec.parse({ type: "echec", protocole: VERSION_PROTOCOLE, travailId: message.travailId, cause: ecart.message, reprisePossible: false }));
      continue;
    }

    // Un arrêt ferme la boucle. Ce qui a déjà été lu est gardé par le cache de lecture : une
    // reprise ne refait pas ce travail-là (JOB-03).
    if (message.type === Arret.shape.type.value) return;

    dire(await executerTravail(message, { emettre: dire }));
  }
}

/** Câble la boucle aux flux du processus.
 *
 *  La sortie standard ne porte que des messages : tout ce qu'un outil de la chaîne écrirait avec
 *  `console.log` partirait au milieu d'un message et le rendrait illisible. On détourne donc
 *  `console.log` vers la sortie d'erreur, où l'hôte le lit comme du journal. C'est le genre de
 *  panne qu'on ne diagnostique pas une fois en production. */
export async function brancherSurLesFlux(): Promise<void> {
  console.log = console.error;
  console.info = console.error;

  const lignes = async function* (): AsyncGenerator<string> {
    let reste = "";
    for await (const morceau of process.stdin) {
      reste += String(morceau);
      let saut = reste.indexOf("\n");
      while (saut !== -1) {
        yield reste.slice(0, saut);
        reste = reste.slice(saut + 1);
        saut = reste.indexOf("\n");
      }
    }
    if (reste.trim() !== "") yield reste;
  };

  await boucleDeMessages(lignes(), (ligne) => process.stdout.write(ligne));
}
