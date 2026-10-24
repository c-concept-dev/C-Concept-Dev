import { TraductionDePage, type DemandeTraductionPage } from "@lienotheque/contrats";
import type { BaseSql } from "./registre.js";

export const MODELE_TRADUCTION = "@cf/meta/m2m100-1.2b" as const;
const LIMITE_SEGMENT = 500;

export class PhraseTropLongue extends Error {
  constructor() {
    super("Une phrase dépasse 500 caractères : traduction refusée plutôt que coupure au milieu.");
    this.name = "PhraseTropLongue";
  }
}

export class TraductionRefusee extends Error {
  constructor(
    message: string,
    readonly statut: 404 | 422 | 503 = 422,
  ) {
    super(message);
    this.name = "TraductionRefusee";
  }
}

/** Découpe uniquement à la fin d'une phrase, en conservant chaque caractère de la source.
 * Une phrase trop longue est un cas explicitement refusé : une coupure arbitraire ferait perdre
 * le contexte au modèle et réintroduirait le défaut observé dans Studio Clinique. */
export function decouperPourTraduction(source: string, limite = LIMITE_SEGMENT): readonly string[] {
  if (source.length === 0) return [];
  const phrases: string[] = [];
  const finDePhrase = /[.!?…]+[”"’')\]]*(?:\s+|$)/gu;
  let debut = 0;
  for (const fin of source.matchAll(finDePhrase)) {
    const apres = (fin.index ?? 0) + fin[0].length;
    phrases.push(source.slice(debut, apres));
    debut = apres;
  }
  if (debut < source.length) phrases.push(source.slice(debut));
  if (phrases.some((phrase) => phrase.length > limite)) throw new PhraseTropLongue();

  const segments: string[] = [];
  let courant = "";
  for (const phrase of phrases) {
    if (courant.length > 0 && courant.length + phrase.length > limite) {
      segments.push(courant);
      courant = phrase;
    } else {
      courant += phrase;
    }
  }
  if (courant.length > 0) segments.push(courant);
  return segments;
}

export type ModeleDeTraduction = {
  readonly traduire: (texte: string, langueSource: string, langueCible: "fr") => Promise<string>;
};

type LiaisonAi = {
  readonly run: (modele: string, entree: Record<string, unknown>) => Promise<unknown>;
};

/** Adaptateur du même modèle et de la même garde anti-dégénérescence que Studio Clinique. */
export function modeleWorkersAi(ai: LiaisonAi | undefined): ModeleDeTraduction {
  return {
    traduire: async (texte, langueSource, langueCible) => {
      if (ai === undefined) throw new TraductionRefusee("Workers AI indisponible.", 503);
      const brut = await ai.run(MODELE_TRADUCTION, {
        text: texte,
        source_lang: langueSource,
        target_lang: langueCible,
      });
      const resultat = (brut as { translated_text?: unknown } | null)?.translated_text;
      if (typeof resultat !== "string" || resultat.trim().length === 0)
        throw new Error("Le modèle n'a rendu aucune traduction.");

      const mots = resultat.toLocaleLowerCase().trim().split(/\s+/u);
      const repetitions = new Map<string, number>();
      for (let rang = 0; rang + 8 <= mots.length; rang += 1) {
        const phrase = mots.slice(rang, rang + 8).join(" ");
        const compte = (repetitions.get(phrase) ?? 0) + 1;
        if (compte >= 3) throw new Error("La traduction a dégénéré en répétitions.");
        repetitions.set(phrase, compte);
      }
      return resultat;
    },
  };
}

export type PassageCanoniqueATraduire = {
  readonly id: string;
  readonly rang: number;
  readonly texte: string;
  readonly classement_axes: string | null;
};

const LANGUES = new Map<string, string>([
  ["fr", "fr"], ["fra", "fr"], ["français", "fr"], ["francais", "fr"], ["french", "fr"],
  ["en", "en"], ["eng", "en"], ["anglais", "en"], ["english", "en"],
  ["es", "es"], ["espagnol", "es"], ["spanish", "es"], ["español", "es"],
  ["de", "de"], ["allemand", "de"], ["german", "de"], ["deutsch", "de"],
  ["it", "it"], ["italien", "it"], ["italian", "it"], ["italiano", "it"],
  ["pt", "pt"], ["portugais", "pt"], ["portuguese", "pt"], ["português", "pt"],
]);

const normaliserLangue = (valeur: unknown): string | undefined => {
  if (Array.isArray(valeur)) return normaliserLangue(valeur[0]);
  if (typeof valeur === "object" && valeur !== null && "valeurs" in valeur)
    return normaliserLangue((valeur as { valeurs?: unknown }).valeurs);
  if (typeof valeur !== "string") return undefined;
  return LANGUES.get(valeur.trim().toLocaleLowerCase());
};

const MOTS_LANGUE: Readonly<Record<string, ReadonlySet<string>>> = {
  fr: new Set(["le", "la", "les", "des", "une", "dans", "pour", "avec", "est", "qui", "que", "nous", "vous", "sur"]),
  en: new Set(["the", "and", "that", "with", "this", "from", "have", "you", "your", "for", "are", "was", "not", "they"]),
  es: new Set(["el", "la", "los", "una", "que", "con", "para", "por", "del", "las", "como", "sus"]),
  de: new Set(["der", "die", "das", "und", "mit", "für", "ist", "nicht", "von", "den", "ein", "eine"]),
  it: new Set(["il", "la", "che", "con", "per", "una", "del", "della", "sono", "non", "come", "gli"]),
  pt: new Set(["o", "a", "os", "uma", "que", "com", "para", "por", "dos", "das", "não", "como"]),
};

const detecterLangue = (texte: string): string | undefined => {
  const mots = texte.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
  const scores = Object.entries(MOTS_LANGUE)
    .map(([langue, connus]) => ({ langue, score: mots.reduce((n, mot) => n + (connus.has(mot) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const premiere = scores[0];
  const seconde = scores[1];
  return premiere !== undefined && premiere.score >= 2 && premiere.score > (seconde?.score ?? 0)
    ? premiere.langue
    : undefined;
};

const langueDuClassement = (axes: string | null, axeLangue: string | undefined): string | undefined => {
  if (axes === null || axeLangue === undefined) return undefined;
  try {
    return normaliserLangue((JSON.parse(axes) as Record<string, unknown>)[axeLangue]);
  } catch {
    return undefined;
  }
};

const empreinteDe = async (passages: readonly PassageCanoniqueATraduire[]): Promise<string> => {
  const octets = new TextEncoder().encode(JSON.stringify(passages.map(({ id, rang, texte }) => ({ id, rang, texte }))));
  const empreinte = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(empreinte)].map((octet) => octet.toString(16).padStart(2, "0")).join("");
};

const traduireDeuxALaFois = async <T, R>(entrees: readonly T[], travail: (entree: T) => Promise<R>): Promise<R[]> => {
  const sorties = new Array<R>(entrees.length);
  let prochain = 0;
  const ouvrier = async (): Promise<void> => {
    while (prochain < entrees.length) {
      const rang = prochain++;
      const entree = entrees[rang];
      if (entree !== undefined) sorties[rang] = await travail(entree);
    }
  };
  await Promise.all([ouvrier(), ouvrier()]);
  return sorties;
};

type Options = {
  readonly maintenant?: () => string;
  readonly axeLangue?: string;
  /** Texte canonique déjà résolu côté serveur depuis l'instantané publié. Jamais reçu du client. */
  readonly passages?: readonly PassageCanoniqueATraduire[];
};

export async function traduireLaPage(
  base: BaseSql,
  modele: ModeleDeTraduction,
  demande: DemandeTraductionPage,
  { maintenant = () => new Date().toISOString(), axeLangue, passages: passagesPublies }: Options = {},
): Promise<TraductionDePage> {
  const passages = passagesPublies === undefined
    ? (
        await base
          .prepare(
            `SELECT p.id, p.rang, p.texte, c.axes AS classement_axes
             FROM passage p
             JOIN version v ON v.id = p.version_id
             LEFT JOIN classement c ON c.document_id = v.document_id
             WHERE p.version_id = ? AND p.page = ? AND v.active = 1
             ORDER BY p.rang`,
          )
          .bind(demande.version, demande.page)
          .all<PassageCanoniqueATraduire>()
      ).results
    : [...passagesPublies].sort((a, b) => a.rang - b.rang);
  if (passages.length === 0) throw new TraductionRefusee("Cette page ne porte aucun texte canonique.", 404);

  const empreinteSource = await empreinteDe(passages);
  const cache = await base
    .prepare(
      `SELECT langue_source, empreinte_source, modele, traductions
       FROM traduction_page WHERE version_id = ? AND page = ? AND langue_cible = 'fr'`,
    )
    .bind(demande.version, demande.page)
    .first<{ langue_source: string; empreinte_source: string; modele: string; traductions: string }>();
  if (cache !== null && cache.empreinte_source === empreinteSource && cache.modele === MODELE_TRADUCTION) {
    const traductions = JSON.parse(cache.traductions) as unknown;
    return TraductionDePage.parse({
      etat: "traduite",
      page: demande.page,
      langueSource: cache.langue_source,
      langueCible: "fr",
      traduction: traductions,
      automatique: true,
      cache: "present",
      modele: MODELE_TRADUCTION,
    });
  }

  const langueSource =
    langueDuClassement(passages[0]?.classement_axes ?? null, axeLangue) ??
    detecterLangue(passages.map((passage) => passage.texte).join(" "));
  if (langueSource === undefined)
    throw new TraductionRefusee("La langue source ne peut pas être déterminée avec assez de certitude.");
  if (langueSource === "fr")
    return TraductionDePage.parse({
      etat: "deja_en_francais",
      page: demande.page,
      langueSource: "fr",
      langueCible: "fr",
      traduction: [],
      automatique: false,
      cache: "inutile",
    });

  const travaux = passages.flatMap((passage, passageRang) =>
    decouperPourTraduction(passage.texte).map((texte, segmentRang) => ({ passageRang, segmentRang, texte })),
  );
  const resultats = await traduireDeuxALaFois(travaux, async (travail) => ({
    ...travail,
    texte: await modele.traduire(travail.texte, langueSource, "fr"),
  }));
  const traductions = passages.map((_, passageRang) =>
    resultats
      .filter((resultat) => resultat.passageRang === passageRang)
      .sort((a, b) => a.segmentRang - b.segmentRang)
      .map((resultat) => resultat.texte.trim())
      .join(" "),
  );
  if (traductions.some((texte) => texte.length === 0)) throw new Error("Une traduction de passage est vide.");

  // Une seule écriture, seulement après la réussite de tous les appels : aucun cache partiel.
  await base
    .prepare(
      `INSERT INTO traduction_page
         (version_id, page, langue_source, langue_cible, empreinte_source, modele, traductions, cree_le)
       VALUES (?, ?, ?, 'fr', ?, ?, ?, ?)
       ON CONFLICT(version_id, page, langue_cible) DO UPDATE SET
         langue_source = excluded.langue_source,
         empreinte_source = excluded.empreinte_source,
         modele = excluded.modele,
         traductions = excluded.traductions,
         cree_le = excluded.cree_le`,
    )
    .bind(demande.version, demande.page, langueSource, empreinteSource, MODELE_TRADUCTION, JSON.stringify(traductions), maintenant())
    .run();

  return TraductionDePage.parse({
    etat: "traduite",
    page: demande.page,
    langueSource,
    langueCible: "fr",
    traduction: traductions,
    automatique: true,
    cache: "cree",
    modele: MODELE_TRADUCTION,
  });
}
