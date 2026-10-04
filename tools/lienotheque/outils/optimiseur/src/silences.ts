import { DecoupeMedia, type Segment, type Silence } from "@lienotheque/contrats";

/** Découpe d'un média aux silences (A4, OUT-10).
 *
 *  Un enregistrement qui enchaîne plusieurs éléments les sépare par des silences. Les repérer
 *  permet de situer chaque élément dans sa piste, donc de commencer la lecture au bon endroit
 *  plutôt qu'au début.
 *
 *  Tout se mesure sur l'énergie du signal, par petites tranches. Un silence n'est pas l'absence
 *  totale de son — il y a toujours un souffle — mais un creux franc et durable par rapport au
 *  reste du morceau. Le seuil est donc relatif au média, jamais absolu : un disque gravé fort et
 *  un disque gravé bas n'ont pas le même silence. */

export type OptionsSilences = {
  /** Durée d'une tranche d'analyse, en secondes. */
  readonly tranche?: number;
  /** Durée minimale d'un silence pour qu'il sépare deux éléments. */
  readonly dureeMinimale?: number;
  /** Part du niveau courant du morceau sous laquelle une tranche est tenue pour muette. */
  readonly part?: number;
  /** Durée minimale d'un segment : en deçà, ce n'est pas un élément, c'est une respiration. */
  readonly segmentMinimal?: number;
};

const TRANCHE = 0.05;
const DUREE_MINIMALE = 0.6;
const PART = 0.08;
const SEGMENT_MINIMAL = 3;

/** Arrondi au centième, la précision des ancres temporelles (ANC). */
const auCentieme = (secondes: number): number => Math.round(secondes * 100) / 100;

/** Énergie moyenne par tranche : la racine de la moyenne des carrés, qui suit ce que l'oreille
 *  entend bien mieux que la crête. */
export function energieParTranche(echantillons: Float32Array, frequence: number, tranche = TRANCHE): Float64Array {
  const parTranche = Math.max(1, Math.round(frequence * tranche));
  const nombre = Math.ceil(echantillons.length / parTranche);
  const energies = new Float64Array(nombre);

  for (let rang = 0; rang < nombre; rang += 1) {
    const debut = rang * parTranche;
    const fin = Math.min(echantillons.length, debut + parTranche);
    let somme = 0;
    for (let position = debut; position < fin; position += 1) somme += echantillons[position]! ** 2;
    energies[rang] = Math.sqrt(somme / Math.max(1, fin - debut));
  }
  return energies;
}

/** Niveau de référence du morceau : la médiane des tranches qui sonnent. Robuste — un passage
 *  très fort ou un long silence ne la déplacent pas. */
export function niveauDeReference(energies: Float64Array): number {
  const sonnantes = [...energies].filter((energie) => energie > 0).sort((a, b) => a - b);
  if (sonnantes.length === 0) return 0;
  return sonnantes[Math.floor(sonnantes.length / 2)]!;
}

/** Les silences d'un média : les creux francs qui durent. */
export function silences(echantillons: Float32Array, frequence: number, options: OptionsSilences = {}): Silence[] {
  const tranche = options.tranche ?? TRANCHE;
  const energies = energieParTranche(echantillons, frequence, tranche);
  const seuil = niveauDeReference(energies) * (options.part ?? PART);
  const minimale = options.dureeMinimale ?? DUREE_MINIMALE;

  const trouves: Silence[] = [];
  let debut: number | undefined;

  const clore = (fin: number): void => {
    if (debut === undefined) return;
    const duree = (fin - debut) * tranche;
    if (duree >= minimale) trouves.push({ debut: auCentieme(debut * tranche), fin: auCentieme(fin * tranche) });
    debut = undefined;
  };

  for (const [rang, energie] of energies.entries()) {
    if (energie <= seuil) debut ??= rang;
    else clore(rang);
  }
  clore(energies.length);
  return trouves;
}

/** Découpe un média en segments, bornés par ses silences.
 *
 *  Un creux trop court ne sépare rien — c'est une respiration. Un fragment sonore trop court
 *  n'est pas un élément non plus : c'est un décompte, et un décompte **annonce ce qui suit**. On
 *  le rattache donc au segment suivant, et non au précédent. Faute de suivant — un fragment en
 *  toute fin de média —, il rejoint ce qui le précède. */
export function decouper(echantillons: Float32Array, frequence: number, options: OptionsSilences = {}): DecoupeMedia {
  const dureeS = auCentieme(echantillons.length / frequence);
  const creux = silences(echantillons, frequence, options);
  const minimal = options.segmentMinimal ?? SEGMENT_MINIMAL;

  const morceaux: { debut: number; fin: number; silenceApres: number }[] = [];
  let depart = 0;
  for (const silence of creux) {
    if (silence.debut > depart) morceaux.push({ debut: depart, fin: silence.debut, silenceApres: silence.fin - silence.debut });
    depart = silence.fin;
  }
  if (depart < dureeS) morceaux.push({ debut: depart, fin: dureeS, silenceApres: 0 });

  const segments: Segment[] = [];
  let enAttente: number | undefined;

  for (const morceau of morceaux) {
    if (morceau.fin - morceau.debut < minimal) {
      // Trop court pour être un élément : il annonce le suivant. On retient son début.
      enAttente ??= morceau.debut;
      continue;
    }
    segments.push({
      debut: auCentieme(enAttente ?? morceau.debut),
      fin: auCentieme(morceau.fin),
      // Plus le silence qui le suit est long, plus la coupure est sûre. Le dernier segment finit
      // avec le média : sa fin ne doit rien à un silence, mais elle est certaine.
      confiance: morceau.silenceApres === 0 ? 0.9 : Math.min(1, Math.round((0.5 + morceau.silenceApres / 2) * 100) / 100),
    });
    enAttente = undefined;
  }

  // Un fragment resté sans suite rejoint ce qui le précède : il n'annonce plus rien.
  const dernier = segments[segments.length - 1];
  if (enAttente !== undefined && dernier !== undefined)
    segments[segments.length - 1] = { ...dernier, fin: auCentieme(morceaux[morceaux.length - 1]!.fin) };

  return DecoupeMedia.parse({ dureeS, segments });
}
