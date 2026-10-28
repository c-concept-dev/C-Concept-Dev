import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DemandeValidationCibles,
  ReponseValidationCibles,
  validationCiblesRepondA,
  type DemandeValidationCibles as Demande,
  type ReponseValidationCibles as Reponse,
} from "@lienotheque/contrats";
import { encoderWebp, type ImageGrise, type ImageRvba } from "@lienotheque/images";
import {
  preparerLot,
  type CibleStructurelleValidee,
  type ValidationStructurelle,
} from "@lienotheque/recettes";
import { RelectureInjoignable } from "./transport.js";

export type TransportValidationCibles = (demande: Demande) => Promise<Reponse>;
type PageDemande = Demande["pages"][number];
type Rendre = (chemin: string, numeros: readonly number[], recette: Parameters<ValidationStructurelle>[0]["recette"]) => Promise<readonly PageDemande[]>;

const sha = (octets: Uint8Array): string => createHash("sha256").update(octets).digest("hex");

const enRvba = (image: ImageGrise): ImageRvba => {
  const data = new Uint8ClampedArray(image.pixels.length * 4);
  for (let rang = 0; rang < image.pixels.length; rang += 1) {
    const ton = image.pixels[rang]!;
    const base = rang * 4;
    data[base] = ton;
    data[base + 1] = ton;
    data[base + 2] = ton;
    data[base + 3] = 255;
  }
  return { data, width: image.largeur, height: image.hauteur, colorSpace: "srgb" };
};

/** Rend seulement la tranche qui contient les pages candidates. Le WebP est sans perte ici :
 * les petits chiffres ne doivent pas payer une compression photographique. */
const rendrePages: Rendre = async (chemin, numeros, recette) => {
  const tries = [...new Set(numeros)].sort((a, b) => a - b);
  const premiere = tries[0];
  const derniere = tries.at(-1);
  if (premiere === undefined || derniere === undefined) return [];
  const voulues = new Set(tries);
  const pages: PageDemande[] = [];
  for await (const page of preparerLot(chemin, recette, {
    depuis: premiere - 1,
    pages: derniere - premiere + 1,
    sansBinarisation: true,
  })) {
    const numero = page.index + 1;
    if (!voulues.has(numero)) continue;
    const image = await encoderWebp(enRvba(page.image), { lossless: 1, quality: 100 });
    pages.push({
      numero,
      empreinte: sha(image),
      image: image.toString("base64"),
      typeMime: "image/webp",
      largeur: page.image.largeur,
      hauteur: page.image.hauteur,
    });
  }
  return pages;
};

/** Transport strict vers la route déjà protégée du Worker. */
export function transportValidationCiblesVersWorker(
  base: string,
  jeton: string,
  appeler: typeof fetch = fetch,
): TransportValidationCibles {
  const adresse = `${base.replace(/\/$/, "")}/vision/structure/cibles`;
  return async (demande) => {
    const envoyee = DemandeValidationCibles.parse(demande);
    const vue = await appeler(adresse, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
      body: JSON.stringify(envoyee),
    });
    if (!vue.ok) throw new RelectureInjoignable(vue.status, `La validation structurelle a été refusée (statut ${vue.status})`);
    const reponse = ReponseValidationCibles.safeParse(await vue.json());
    if (!reponse.success) throw new RelectureInjoignable(vue.status, "La validation structurelle a rendu une réponse non conforme");
    const ecarts = validationCiblesRepondA(envoyee, reponse.data);
    if (ecarts.length > 0) throw new RelectureInjoignable(vue.status, `La validation structurelle ne répond pas à la demande : ${ecarts.join(", ")}`);
    return reponse.data;
  };
}

/** Branche la validation distante derrière le port des recettes. Une cible absente, incertaine,
 * déplacée sur une autre page ou sans zone reste absente du résultat. */
export function validationStructurelleCiblee(
  transport: TransportValidationCibles,
  options: { readonly rendre?: Rendre; readonly cache?: string } = {},
): ValidationStructurelle {
  const appeler = async (demande: Demande): Promise<Reponse> => {
    if (options.cache === undefined) return transport(demande);
    const clef = sha(
      Buffer.from(
        JSON.stringify({
          version: 1,
          document: demande.document,
          pages: demande.pages.map((page) => [page.numero, page.empreinte]),
          cibles: demande.cibles,
        }),
      ),
    );
    const fichier = join(options.cache, `${clef}.json`);
    try {
      const gardee = ReponseValidationCibles.parse(JSON.parse(readFileSync(fichier, "utf8")));
      if (validationCiblesRepondA(demande, gardee).length === 0) return gardee;
    } catch {
      // Une absence ou une entrée cassée n'est jamais une panne : le service la remplacera.
    }
    const reponse = await transport(demande);
    mkdirSync(options.cache, { recursive: true });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    try {
      writeFileSync(temporaire, JSON.stringify(reponse));
      renameSync(temporaire, fichier);
    } finally {
      rmSync(temporaire, { force: true });
    }
    return reponse;
  };
  return async ({ chemin, recette, cibles }) => {
    if (cibles.length === 0 || recette.preparation.double_page === true) return [];
    const pages = await (options.rendre ?? rendrePages)(
      chemin,
      cibles.flatMap((cible) => cible.pagesPdf),
      recette,
    );
    if (pages.length === 0) return [];
    const document = sha(await readFile(chemin));
    const demande = DemandeValidationCibles.parse({
      document,
      pages,
      cibles: cibles.map((cible) => cible.numeroLu),
    });
    const premiere = await appeler(demande);
    const parCible = new Map(premiere.resultats.map((resultat) => [resultat.cible, resultat]));
    // Une cible noyée dans un lot peut rester illisible alors que sa page seule la rend nette.
    // Le second passage est strictement borné : uniquement les abstentions, une cible à la fois,
    // sur ses seules pages candidates. Une seconde abstention est définitive.
    for (const cible of cibles) {
      if (parCible.get(cible.numeroLu)?.etat === "trouve") continue;
      const pagesCiblees = pages.filter((page) => cible.pagesPdf.includes(page.numero));
      if (pagesCiblees.length === 0) continue;
      const ciblee = DemandeValidationCibles.parse({
        document,
        pages: pagesCiblees,
        cibles: [cible.numeroLu],
      });
      const relue = await appeler(ciblee);
      parCible.set(cible.numeroLu, relue.resultats[0]!);
    }
    const parNumeroLu = new Map(cibles.map((cible) => [cible.numeroLu, cible]));
    return [...parCible.values()].flatMap((resultat): CibleStructurelleValidee[] => {
      const attendue = parNumeroLu.get(resultat.cible);
      if (
        resultat.etat !== "trouve" ||
        resultat.page === undefined ||
        resultat.zone === undefined ||
        attendue === undefined ||
        !attendue.pagesPdf.includes(resultat.page)
      )
        return [];
      return [
        {
          numero: attendue.numero,
          numeroLu: attendue.numeroLu,
          pagePdf: resultat.page,
          zone: resultat.zone,
          confiance: resultat.confiance,
        },
      ];
    });
  };
}
