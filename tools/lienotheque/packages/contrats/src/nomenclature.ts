import type { Axe, Cle, ClassementDocument, ModeleBibliotheque, SchemaBibliotheque, ValeurReferentiel } from "./classement.js";

/** Évolution d'une nomenclature sans régression (CLA-03, CLA-08, CLA-10).
 *
 *  Toutes les opérations sont pures : elles rendent un nouveau schéma. La clé d'une valeur ne
 *  change jamais ; renommer touche le nom, fusionner déplace la clé dans les alias de la valeur
 *  qui absorbe. Un document classé hier se résout donc toujours aujourd'hui. */

const copie = <T>(valeur: T): T => structuredClone(valeur);

const erreur = (message: string): never => {
  throw new Error(message);
};

export function axeDe(schema: SchemaBibliotheque, cle: Cle): Axe | undefined {
  return schema.axes.find((axe) => axe.cle === cle || axe.alias.includes(cle));
}

/** Valeur courante derrière une clé, qu'elle soit l'actuelle, un alias ou une redirection.
 *  `undefined` si la clé n'a jamais existé sur cet axe. */
export function resoudreValeur(axe: Axe, cle: Cle): ValeurReferentiel | undefined {
  const vues = new Set<string>();
  let courante = axe.valeurs.find((v) => v.cle === cle || v.alias.includes(cle));
  while (courante !== undefined && courante.redirigeVers !== undefined) {
    if (vues.has(courante.cle)) return undefined; // redirection circulaire : on ne boucle pas
    vues.add(courante.cle);
    const suivante: ValeurReferentiel | undefined = axe.valeurs.find(
      (v) => v.cle === courante!.redirigeVers || v.alias.includes(courante!.redirigeVers!),
    );
    if (suivante === undefined) return courante;
    courante = suivante;
  }
  return courante;
}

function remplacerAxe(schema: SchemaBibliotheque, cle: Cle, transformer: (axe: Axe) => Axe): SchemaBibliotheque {
  const suivant = copie(schema);
  const rang = suivant.axes.findIndex((axe) => axe.cle === cle || axe.alias.includes(cle));
  if (rang < 0) erreur(`Axe inconnu : ${cle}`);
  suivant.axes[rang] = transformer(suivant.axes[rang] as Axe);
  suivant.version += 1;
  return suivant;
}

export function renommerAxe(schema: SchemaBibliotheque, cle: Cle, nouveauNom: string): SchemaBibliotheque {
  return remplacerAxe(schema, cle, (axe) => ({ ...axe, nom: nouveauNom }));
}

export function renommerValeur(schema: SchemaBibliotheque, cleAxe: Cle, cleValeur: Cle, nouveauNom: string): SchemaBibliotheque {
  return remplacerAxe(schema, cleAxe, (axe) => {
    const rang = axe.valeurs.findIndex((v) => v.cle === cleValeur || v.alias.includes(cleValeur));
    if (rang < 0) erreur(`Valeur inconnue : ${cleValeur}`);
    const valeurs = [...axe.valeurs];
    valeurs[rang] = { ...(valeurs[rang] as ValeurReferentiel), nom: nouveauNom };
    return { ...axe, valeurs };
  });
}

/** `source` disparaît dans `cible` : sa clé, ses alias et son nom rejoignent la cible, et ses
 *  enfants changent de parent. Aucun document ne perd sa valeur (CLA-03). */
export function fusionnerValeurs(schema: SchemaBibliotheque, cleAxe: Cle, source: Cle, cible: Cle): SchemaBibliotheque {
  return remplacerAxe(schema, cleAxe, (axe) => {
    const depart = axe.valeurs.find((v) => v.cle === source || v.alias.includes(source));
    const arrivee = axe.valeurs.find((v) => v.cle === cible || v.alias.includes(cible));
    if (depart === undefined) erreur(`Valeur inconnue : ${source}`);
    if (arrivee === undefined) erreur(`Valeur inconnue : ${cible}`);
    if (depart === arrivee) erreur("Une valeur ne fusionne pas avec elle-même");

    const absorbee = depart as ValeurReferentiel;
    const absorbante = arrivee as ValeurReferentiel;
    // Les deux transformations se composent : la valeur qui absorbe peut aussi être l'enfant
    // de celle qu'elle absorbe, et devient alors une racine.
    const valeurs = axe.valeurs
      .filter((v) => v !== absorbee)
      .map((v) => {
        let suivant: ValeurReferentiel = v.parent === absorbee.cle ? { ...v, parent: absorbante.cle } : v;
        if (suivant.cle === absorbante.cle) {
          suivant = {
            ...suivant,
            alias: [...new Set([...suivant.alias, absorbee.cle, ...absorbee.alias])],
            synonymes: [...new Set([...suivant.synonymes, absorbee.nom, ...absorbee.synonymes])],
          };
        }
        if (suivant.parent === suivant.cle) {
          const { parent: _racine, ...sansParent } = suivant;
          suivant = sansParent;
        }
        return suivant;
      });
    return { ...axe, valeurs };
  });
}

/** Retire une valeur sans l'effacer : elle reste lisible et redirige (CLA-03). */
export function retirerValeur(schema: SchemaBibliotheque, cleAxe: Cle, cle: Cle, versCle: Cle): SchemaBibliotheque {
  return remplacerAxe(schema, cleAxe, (axe) => {
    const rang = axe.valeurs.findIndex((v) => v.cle === cle);
    if (rang < 0) erreur(`Valeur inconnue : ${cle}`);
    if (resoudreValeur(axe, versCle) === undefined) erreur(`Cible inconnue : ${versCle}`);
    const valeurs = [...axe.valeurs];
    valeurs[rang] = { ...(valeurs[rang] as ValeurReferentiel), retiree: true, redirigeVers: versCle };
    return { ...axe, valeurs };
  });
}

/** Donne un parent à une valeur ; l'axe devient hiérarchique s'il ne l'était pas. */
export function hierarchiser(schema: SchemaBibliotheque, cleAxe: Cle, cle: Cle, parent: Cle): SchemaBibliotheque {
  return remplacerAxe(schema, cleAxe, (axe) => {
    const rang = axe.valeurs.findIndex((v) => v.cle === cle);
    if (rang < 0) erreur(`Valeur inconnue : ${cle}`);
    if (resoudreValeur(axe, parent) === undefined) erreur(`Parent inconnu : ${parent}`);
    const valeurs = [...axe.valeurs];
    valeurs[rang] = { ...(valeurs[rang] as ValeurReferentiel), parent };
    return { ...axe, structure: "hierarchique", valeurs };
  });
}

/** Forme d'un filtre proposée par la nature de l'axe. L'interface les affiche sans rien savoir
 *  du domaine : ajouter un axe fait apparaître son filtre partout (CLA-10). */
export type FormeFiltre = "liste" | "etiquettes" | "plage" | "periode";

export type Filtre = {
  readonly axe: Cle;
  readonly nom: string;
  readonly forme: FormeFiltre;
  readonly multiple: boolean;
  readonly hierarchique: boolean;
  readonly roleCommun?: string;
  readonly options: readonly { readonly cle: Cle; readonly nom: string; readonly parent?: Cle }[];
};

const FORMES: Readonly<Record<string, FormeFiltre>> = {
  referentiel: "liste",
  liste_semi_ouverte: "liste",
  etiquettes: "etiquettes",
  nombre: "plage",
  date: "periode",
};

export function filtresDepuisAxes(schema: SchemaBibliotheque): readonly Filtre[] {
  return schema.axes.map((axe) => ({
    axe: axe.cle,
    nom: axe.nom,
    forme: FORMES[axe.nature] ?? "liste",
    multiple: axe.cardinalite !== "une",
    hierarchique: axe.structure === "hierarchique",
    ...(axe.roleCommun === undefined ? {} : { roleCommun: axe.roleCommun }),
    options: axe.valeurs
      .filter((valeur) => !valeur.retiree)
      .map((valeur) => ({ cle: valeur.cle, nom: valeur.nom, ...(valeur.parent === undefined ? {} : { parent: valeur.parent }) })),
  }));
}

/** Axes qui portent le même rôle commun, d'une bibliothèque à l'autre (CLA-11). */
export function axesParRoleCommun(schemas: readonly SchemaBibliotheque[]): ReadonlyMap<string, readonly Cle[]> {
  const par = new Map<string, Cle[]>();
  for (const schema of schemas) {
    for (const axe of schema.axes) {
      if (axe.roleCommun === undefined) continue;
      par.set(axe.roleCommun, [...(par.get(axe.roleCommun) ?? []), axe.cle]);
    }
  }
  return par;
}

/** Ce qu'un classement perd face à un schéma donné. Vide = rien n'est perdu (CLA-08). */
export function pertesDuClassement(classement: ClassementDocument, schema: SchemaBibliotheque): readonly string[] {
  const pertes: string[] = [];
  for (const [cleAxe, valeurs] of Object.entries(classement.axes)) {
    const axe = axeDe(schema, cleAxe);
    if (axe === undefined) {
      pertes.push(`axe disparu : ${cleAxe}`);
      continue;
    }
    if (valeurs.type !== "reference") continue;
    for (const cle of valeurs.valeurs) {
      if (resoudreValeur(axe, cle) === undefined) pertes.push(`valeur disparue : ${cleAxe}/${cle}`);
    }
  }
  return pertes;
}

/** Réécrit un classement avec les clés courantes, sans rien perdre. */
export function normaliserClassement(classement: ClassementDocument, schema: SchemaBibliotheque): ClassementDocument {
  const axes: Record<string, ClassementDocument["axes"][string]> = {};
  for (const [cleAxe, valeurs] of Object.entries(classement.axes)) {
    const axe = axeDe(schema, cleAxe);
    if (axe === undefined) continue;
    if (valeurs.type !== "reference") {
      axes[axe.cle] = valeurs;
      continue;
    }
    const courantes = [...new Set(valeurs.valeurs.map((cle) => resoudreValeur(axe, cle)?.cle ?? cle))];
    const principale = valeurs.principale === undefined ? undefined : (resoudreValeur(axe, valeurs.principale)?.cle ?? valeurs.principale);
    axes[axe.cle] = { type: "reference", valeurs: courantes, ...(principale === undefined ? {} : { principale }) };
  }
  return { ...classement, schema: schema.cle, schemaVersion: schema.version, axes };
}

/** Ce qu'un classement a d'incorrect face à son schéma. Vide = conforme.
 *  Sépare bien les deux questions : la forme (nature de l'axe, cardinalité) et le contenu. */
export function ecartsDuClassement(classement: ClassementDocument, schema: SchemaBibliotheque): readonly string[] {
  const ecarts: string[] = [...pertesDuClassement(classement, schema)];

  for (const axe of schema.axes) {
    const porte = Object.keys(classement.axes).some((cle) => axeDe(schema, cle)?.cle === axe.cle);
    if (axe.obligatoire && !porte) ecarts.push(`axe obligatoire absent : ${axe.cle}`);
  }

  for (const [cleAxe, valeurs] of Object.entries(classement.axes)) {
    const axe = axeDe(schema, cleAxe);
    if (axe === undefined) continue;

    const attendu = FORME_ATTENDUE[axe.nature];
    if (valeurs.type !== attendu) {
      ecarts.push(`${axe.cle} : forme « ${valeurs.type} » alors que l'axe attend « ${attendu} »`);
      continue;
    }
    if (valeurs.type !== "reference") continue;

    if (axe.cardinalite === "une" && valeurs.valeurs.length > 1) ecarts.push(`${axe.cle} : une seule valeur attendue`);
    if (axe.cardinalite === "principale_et_secondaires" && valeurs.principale === undefined)
      ecarts.push(`${axe.cle} : une valeur principale est attendue`);
    if (axe.cardinalite !== "principale_et_secondaires" && valeurs.principale !== undefined)
      ecarts.push(`${axe.cle} : cet axe n'a pas de valeur principale`);

    if (axe.nature === "referentiel") {
      for (const cle of valeurs.valeurs) {
        if (resoudreValeur(axe, cle)?.retiree === true) ecarts.push(`${axe.cle}/${cle} : valeur retirée`);
      }
    }
  }
  return ecarts;
}

const FORME_ATTENDUE: Readonly<Record<string, string>> = {
  referentiel: "reference",
  liste_semi_ouverte: "reference",
  etiquettes: "etiquettes",
  nombre: "nombre",
  date: "date",
};

/** Un modèle ne contient que la nomenclature : ni fichier, ni document (CLA-09, KIT-07). */
export function exporterModele(schema: SchemaBibliotheque): ModeleBibliotheque {
  const { cle, nom, langue, description, version, axes } = copie(schema);
  return { cle, nom, langue, version, axes, ...(description === undefined ? {} : { description }) };
}

export function importerModele(modele: ModeleBibliotheque): SchemaBibliotheque {
  const { cle, nom, langue, description, version, axes } = copie(modele);
  return { cle, nom, langue, version, axes, ...(description === undefined ? {} : { description }) };
}
