import {
  ModeleStructurelPropose,
  ModeleStructurelValide,
  Recette,
  ZoneNormalisee,
  type ModeleStructurelPropose as Proposition,
  type ModeleStructurelValide as ModeleValide,
} from "@lienotheque/contrats";
import { formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";
import { cadresRectangulaires, consolider, lecturesDePage } from "@lienotheque/recettes";

type Lecture = Proposition["lectures"][number];

const borner = (valeur: number, min = 0, max = 1): number => Math.min(max, Math.max(min, valeur));

const pixel = (zone: ZoneNormalisee, image: ImageGrise) => ({
  x: Math.floor(zone.x * image.largeur),
  y: Math.floor(zone.y * image.hauteur),
  l: Math.max(1, Math.ceil(zone.l * image.largeur)),
  h: Math.max(1, Math.ceil(zone.h * image.hauteur)),
});

/** Mesure le contour sombre réellement présent près d'une boîte proposée. La proposition ne
 * fournit qu'un voisinage ; les coordonnées rendues viennent exclusivement des pixels. */
function mesurer(zone: ZoneNormalisee, image: ImageGrise): ZoneNormalisee | undefined {
  const brute = pixel(zone, image);
  const marge = Math.max(3, Math.round(Math.max(brute.l, brute.h) * 0.2));
  const x0 = Math.max(0, brute.x - marge);
  const y0 = Math.max(0, brute.y - marge);
  const x1 = Math.min(image.largeur, brute.x + brute.l + marge);
  const y1 = Math.min(image.hauteur, brute.y + brute.h + marge);
  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1)
      if (image.pixels[y * image.largeur + x]! < 160) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  if (maxX < minX || maxY < minY) return undefined;
  return { x: minX / image.largeur, y: minY / image.hauteur, l: (maxX - minX + 1) / image.largeur, h: (maxY - minY + 1) / image.hauteur };
}

const mediane = (valeurs: readonly number[]): number => {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 0 ? (triees[milieu - 1]! + triees[milieu]!) / 2 : triees[milieu]!;
};

function zoneCalibree(lecture: Lecture): ZoneNormalisee {
  const zones = lecture.observations.map((observation) => observation.zone);
  const hauteur = mediane(zones.map((zone) => zone.h));
  const marge = hauteur * 0.7;
  const minX = Math.min(...zones.map((zone) => zone.x));
  const maxX = Math.max(...zones.map((zone) => zone.x + zone.l));
  if (lecture.repetition === "verticale") {
    const x = borner(minX - marge);
    return { x, y: 0.02, l: borner(maxX + marge) - x, h: 0.96 };
  }
  const minY = Math.min(...zones.map((zone) => zone.y));
  const maxY = Math.max(...zones.map((zone) => zone.y + zone.h));
  const x = borner(minX - marge);
  const y = borner(minY - marge);
  return { x, y, l: borner(maxX + marge) - x, h: borner(maxY + marge) - y };
}

/** Calibre toutes les observations sans prendre les coordonnées de Vision pour des faits. Une
 * observation qui ne contient aucun contour mesurable arrête le diagnostic. */
export function calibrerStructure(proposition: Proposition, pages: ReadonlyMap<number, ImageGrise>): Proposition {
  const entree = ModeleStructurelPropose.parse(proposition);
  const ecartees: string[] = [];
  const lectures = entree.lectures.flatMap((lecture) => {
    const observations = lecture.observations.flatMap((observation) => {
      const image = pages.get(observation.page);
      if (image === undefined) throw new Error(`Page d'échantillon absente : ${observation.page}`);
      const zone = mesurer(observation.zone, image);
      return zone === undefined ? [] : [{ ...observation, zone }];
    });
    if (observations.length < 2) {
      ecartees.push(lecture.id);
      return [];
    }
    const mesuree = { ...lecture, observations };
    const zone = zoneCalibree(mesuree);
    if (!ZoneNormalisee.safeParse(zone).success) {
      ecartees.push(lecture.id);
      return [];
    }
    return [{ ...mesuree, zone }];
  });
  const gardees = new Set(lectures.map((lecture) => lecture.id));
  const relations = entree.relations.filter((relation) => gardees.has(relation.de) && gardees.has(relation.vers));
  const inconnues = [
    ...entree.inconnues,
    ...ecartees.map((id) => `Lecture « ${id} » écartée par le calibrateur : moins de deux contours mesurables.`),
  ];
  return ModeleStructurelPropose.parse({ ...entree, lectures, relations, inconnues });
}

export type PageTemoin = {
  readonly page: number;
  readonly lectures: Readonly<Record<string, readonly ZoneNormalisee[]>>;
};

export type ControleTemoins = { readonly pagesTemoins: readonly number[]; readonly ecarts: readonly string[] };

const normaliser = (boite: Boite, image: ImageGrise): ZoneNormalisee => ({
  x: boite.x / image.largeur,
  y: boite.y / image.hauteur,
  l: boite.l / image.largeur,
  h: boite.h / image.hauteur,
});

/** Applique seulement des mesures locales au gabarit calibré. Cette fonction est le point de
 * bascule : après elle, les pages ordinaires ne dépendent plus de Vision. */
export function detecterLecturesLocales(
  modele: Proposition,
  image: ImageGrise,
): Readonly<Record<string, readonly ZoneNormalisee[]>> {
  const calibre = ModeleStructurelPropose.parse(modele);
  const resultat: Record<string, readonly ZoneNormalisee[]> = {};
  const formes = formesSombres(image).map((forme) => forme.boite);
  for (const lecture of calibre.lectures) {
    if (lecture.nature === "exclusion") continue;
    const paireTextuelle = paireTextuelleDe(lecture);
    if (paireTextuelle !== undefined) {
      // Le contour d'un cartouche arrondi varie avec le contraste du scan. Ce qui fait foi est
      // le libellé stable suivi de son numéro, relu localement dans la zone calibrée. Vision a
      // proposé la structure ; elle ne revient pas lire la page témoin.
      const hauteurs = lecture.observations.map((observation) => observation.zone.h);
      const recette = Recette.parse({
        id: "temoin-paire-textuelle",
        version: 1,
        derivee_de: null,
        preparation: { redressement: "aucun", double_page: calibre.geometrie.doublePage },
        lectures: [
          {
            ancre: "element",
            zone: { type: "rectangle_rel", ...lecture.zone },
            hauteur_rel: {
              min: Math.max(0.0001, Math.min(...hauteurs) * 0.5),
              max: Math.min(0.9999, Math.max(...hauteurs) * 1.5),
            },
            alphabet: "chiffres",
            libelle: paireTextuelle.libelle,
            numero: { exemple: paireTextuelle.exemple },
          },
        ],
        regles: {
          elements: { ordre: "strictement_croissant", saut_max: 1000 },
          pistes: { ordre: "croissant", pas_autorises: [0, 1], egale_numero_element: true },
          plusieurs_elements_par_piste: false,
        },
        validation: { seuil_confiance: 0.8 },
      });
      resultat[lecture.id] = consolider(lecturesDePage(image, recette)).flatMap((element) =>
        element.zone === undefined ? [] : [element.zone],
      );
      continue;
    }
    const hauteurs = lecture.observations.map((observation) => observation.zone.h * image.hauteur);
    const min = Math.max(2, Math.min(...hauteurs) * 0.55);
    const max = Math.max(min + 1, Math.max(...hauteurs) * 1.8);
    const candidates =
      lecture.forme === "rectangle" && lecture.nature === "element"
        ? cadresRectangulaires(image, min, max)
        : formes.filter((boite) => boite.h >= min && boite.h <= max);
    resultat[lecture.id] = candidates
      .map((boite) => normaliser(boite, image))
      .filter((zone) => centreDans(zone, lecture.zone))
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }
  return resultat;
}

const centreDans = (zone: ZoneNormalisee, recherche: ZoneNormalisee): boolean => {
  const x = zone.x + zone.l / 2;
  const y = zone.y + zone.h / 2;
  return x >= recherche.x && x <= recherche.x + recherche.l && y >= recherche.y && y <= recherche.y + recherche.h;
};

/** Compare des détections locales de pages cachées au gabarit calibré. Aucun nouvel appel Vision
 * n'intervient : c'est précisément la preuve que la règle locale suffit hors échantillon. */
export function confronterPagesTemoins(modele: Proposition, pages: readonly PageTemoin[]): ControleTemoins {
  const calibre = ModeleStructurelPropose.parse(modele);
  const ecarts: string[] = [];
  for (const page of pages) {
    if (calibre.pagesObservees.includes(page.page)) ecarts.push(`page ${page.page} : déjà vue pendant le diagnostic`);
    for (const lecture of calibre.lectures) {
      if (lecture.nature === "exclusion") continue;
      const zones = page.lectures[lecture.id] ?? [];
      if (zones.length === 0) {
        ecarts.push(`page ${page.page} : « ${lecture.id} » absent`);
        continue;
      }
      if (!zones.some((zone) => centreDans(zone, lecture.zone))) ecarts.push(`page ${page.page} : « ${lecture.id} » hors de sa zone calibrée`);
    }
  }
  return { pagesTemoins: pages.map((page) => page.page), ecarts };
}

/** Le dernier verrou est explicite : pages témoins sans écart puis approbation des
 * superpositions. Une fonction appelée avec `false` ne peut pas rendre un modèle exécutable. */
export function validerStructure(modele: Proposition, controle: ControleTemoins, superpositionsApprouvees: boolean): ModeleValide {
  if (controle.ecarts.length > 0) throw new Error(`Modèle structurel refusé : ${controle.ecarts.join(" ; ")}`);
  if (!superpositionsApprouvees) throw new Error("Modèle structurel refusé : les superpositions n'ont pas été approuvées");
  return ModeleStructurelValide.parse({
    ...ModeleStructurelPropose.parse(modele),
    etat: "valide",
    validation: { pagesTemoins: [...controle.pagesTemoins], ecarts: [], superpositionsApprouvees: true },
  });
}

const prefixesDe = (lecture: Lecture): string[] | undefined => {
  const exemple = lecture.exemple;
  if (exemple === undefined) return undefined;
  const separateur = exemple.match(/\D+/)?.[0];
  if (separateur === undefined) return undefined;
  const prefixes = [
    ...new Set(
      lecture.observations
        .map((observation) => observation.valeur?.match(new RegExp(`^(\\d+)${separateur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))?.[1])
        .filter((valeur): valeur is string => valeur !== undefined)
        .map((valeur) => `${valeur}${separateur}`),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));
  return prefixes.length === 0 ? undefined : prefixes;
};

type PaireTextuelle = { readonly lecture: Lecture; readonly libelle: string; readonly confirmation: string; readonly exemple: string };

/** Deux libellés stables qui portent le même nombre constituent deux témoins sur la page.
 *
 * Aucun mot de domaine n'est connu ici : « Workout 32 / TRACK 32 », « Leçon 7 / Audio 7 » ou
 * « Chapitre 4 / Fichier 4 » ont exactement la même structure. Il faut deux pages distinctes et
 * les mêmes deux libellés ; un nombre répété par hasard dans une seule page ne suffit pas. */
function paireTextuelleDe(lecture: Lecture): PaireTextuelle | undefined {
  const paires = lecture.observations.flatMap((observation) => {
    const valeur = observation.valeur;
    if (valeur === undefined) return [];
    const trouves = [...valeur.matchAll(/([\p{L}][\p{L}\p{N}_-]*)\s*#?\s*(\d{1,4})/gu)];
    for (let premier = 0; premier < trouves.length; premier += 1)
      for (let second = premier + 1; second < trouves.length; second += 1) {
        const un = trouves[premier]!;
        const deux = trouves[second]!;
        if (un[2] !== deux[2] || un[1]!.localeCompare(deux[1]!, "fr", { sensitivity: "base" }) === 0) continue;
        return [{ page: observation.page, libelle: un[1]!, confirmation: deux[1]!, exemple: un[2]! }];
      }
    return [];
  });
  if (paires.length < 2) return undefined;
  const premiere = paires[0]!;
  const stables = paires.filter(
    (paire) =>
      paire.libelle.localeCompare(premiere.libelle, "fr", { sensitivity: "base" }) === 0 &&
      paire.confirmation.localeCompare(premiere.confirmation, "fr", { sensitivity: "base" }) === 0,
  );
  if (new Set(stables.map((paire) => paire.page)).size < 2) return undefined;
  return { lecture, libelle: premiere.libelle, confirmation: premiere.confirmation, exemple: premiere.exemple };
}

/** Compile uniquement la partie générique que le modèle a établie. Les coordonnées et hauteurs
 * viennent des observations recalibrées ; aucune valeur grossière de Vision n'est reprise. */
export function compilerRecetteStructurelle(
  modele: unknown,
  identite: { readonly id: string; readonly version: number },
): Recette {
  const valide = ModeleStructurelValide.safeParse(modele);
  if (!valide.success) throw new Error("Une recette ne peut être compilée que depuis un modèle structurel validé");
  const structure = valide.data;
  const page = structure.lectures.find((lecture) => lecture.nature === "page_imprimee");
  const paireTextuelle = structure.lectures.map(paireTextuelleDe).find((paire) => paire !== undefined);
  const element = paireTextuelle?.lecture ?? structure.lectures.find((lecture) => lecture.nature === "element");
  if (element === undefined) throw new Error("Le modèle validé ne contient aucune lecture d'élément");
  const repere = paireTextuelle === undefined ? structure.lectures.find((lecture) => lecture.nature === "repere") : undefined;
  const hauteurs = element.observations.map((observation) => observation.zone.h);
  const min = Math.max(0.0001, Math.min(...hauteurs) * 0.75);
  const max = Math.min(0.9999, Math.max(...hauteurs) * 1.3);
  const relation = repere === undefined ? undefined : structure.relations.find((un) => un.de === repere.id && un.vers === element.id);
  if (relation?.position === "dans") throw new Error("Un repère intérieur n'est pas encore compilable par la recette actuelle");

  return Recette.parse({
    id: identite.id,
    version: identite.version,
    derivee_de: null,
    preparation: { redressement: "aucun", double_page: structure.geometrie.doublePage },
    lectures: [
      ...(page === undefined
        ? []
        : [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", ...page.zone }, alphabet: page.alphabet }]),
      {
        ancre: "element",
        zone: { type: "rectangle_rel", ...element.zone },
        hauteur_rel: { min, max },
        alphabet: paireTextuelle === undefined ? element.alphabet : "chiffres",
        ...(paireTextuelle === undefined ? {} : { libelle: paireTextuelle.libelle }),
        ...(paireTextuelle === undefined && element.exemple === undefined
          ? {}
          : {
              numero: {
                exemple: paireTextuelle?.exemple ?? element.exemple!,
                ...(paireTextuelle === undefined && element.forme === "rectangle" ? { encadrement: "rectangle" } : {}),
                ...(paireTextuelle === undefined && prefixesDe(element) !== undefined ? { prefixes: prefixesDe(element) } : {}),
              },
            }),
      },
      ...(repere === undefined || relation === undefined
        ? []
        : [
            {
              ancre: "piste",
              outil: "pastilles",
              relatif_a: "element",
              position: relation.position,
              motif: repere.forme === "losange" ? "losange_sombre_chiffres_clairs" : "bloc_sombre_chiffres_clairs",
              etiquette_disque: false,
            },
          ]),
    ],
    regles: {
      elements: {
        ordre: "strictement_croissant",
        saut_max: paireTextuelle === undefined && element.exemple?.match(/\D/) === null ? 12 : 1000,
      },
      ...(paireTextuelle !== undefined
        ? { pistes: { ordre: "croissant", pas_autorises: [0, 1], egale_numero_element: true } }
        : repere === undefined
          ? {}
          : { pistes: { ordre: "croissant", pas_autorises: [0, 1] } }),
      plusieurs_elements_par_piste: paireTextuelle === undefined,
    },
    validation: { seuil_confiance: 0.8 },
  });
}
