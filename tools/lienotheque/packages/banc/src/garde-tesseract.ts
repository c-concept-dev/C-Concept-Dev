import { createHash } from "node:crypto";

import { estDuCode, masqueDeCode } from "./lire-du-code.js";

/** Un contrôle qui peut atteindre la reconnaissance doit porter sa garde (lot 0q).
 *
 *  ## Le défaut que ce garde-fou existe pour empêcher
 *
 *  Il est **invisible là où on le fabrique**. La machine de développement a Tesseract, donc le
 *  contrôle complet local passe ; `lienotheque-ci.yml` ne l'installe que **sur macOS**,
 *  délibérément, avec les octets exacts du paquet des moteurs. Un contrôle qui appelle la
 *  reconnaissance sans garde est donc vert ici et rouge sur Ubuntu — après la poussée.
 *
 *  Le 12 novembre 2026, la course `43242544864` est tombée pour cette raison : cinq contrôles de
 *  `la-porte-relit-les-cases.test.ts` sur `spawnSync tesseract ENOENT`. L'idiome du remède
 *  existait déjà, employé à six endroits — `const siTesseract = tesseractDisponible() ? it :
 *  it.skip` —, ce qui manquait est la mécanique qui refuse de s'en passer.
 *
 *  ## Pourquoi un graphe et non un `grep`
 *
 *  La condition est **transitive** : « un fichier de contrôle qui appelle Tesseract, **ou une
 *  fonction qui l'appelle** ». Un contrôle qui franchit la Porte n'écrit jamais le mot
 *  « tesseract » : il appelle `executerTravail`, qui appelle la couche texte, qui appelle l'OCR.
 *  Chercher le mot ne trouverait que les feuilles — c'est-à-dire les contrôles déjà gardés.
 *
 *  ## Les deux façons de lancer un outil, et une seule compte
 *
 *  Une fonction qui lance Tesseract et **avale** l'échec ne demande aucune garde : sans l'outil,
 *  elle rend une valeur au lieu de lever. `tesseractDisponible` est exactement cela — la garde
 *  elle-même —, et l'exiger d'un contrôle qui l'appelle serait circulaire. La distinction est donc
 *  lue dans le code : un lancement **rattrapé sans relever** ne compte pas.
 *
 *  ## Pourquoi la lecture du code ne suffit pas, et ce qui la complète
 *
 *  Un appel **possible** n'est pas un appel **fait**. Mesuré le 14 novembre 2026, en rendant
 *  Tesseract indisponible et en relançant les seize fichiers que ce graphe désigne : **treize
 *  passent quand même**. Trois raisons, toutes légitimes — la Porte franchie avec un document
 *  natif n'atteint jamais la reconnaissance ; un contrôle qui éprouve un délai lance son **propre**
 *  binaire d'essai ; et un échec peut être absorbé par un appelant que le texte ne montre pas
 *  (`rotationParOsd` lance dans une fermeture que `surDisque` enveloppe d'un `try`).
 *
 *  Exiger la garde des seize aurait fait **sauter une soixantaine de contrôles sur Ubuntu**, qui y
 *  passent aujourd'hui et y prouvent quelque chose. C'est le piège que Christophe avait nommé en
 *  posant ce lot : « c'est le chemin réellement exécuté qui compte ».
 *
 *  Ce garde-fou ne devine donc pas le chemin exécuté : il **exige qu'il ait été mesuré**. Un
 *  contrôle qui peut atteindre la reconnaissance passe si, et seulement si, l'une des trois est
 *  vraie — il porte la garde, il est épinglé pour l'absence de l'outil, ou sa survie a été
 *  **mesurée et inscrite** avec l'empreinte du fichier mesuré. Un fichier neuf qui atteint la
 *  reconnaissance n'est dans aucun des trois cas : il est refusé. Un fichier mesuré puis modifié
 *  voit son empreinte changer, donc sa mesure périmer, et il est refusé lui aussi.
 *
 *  ## Ce qu'il ne prétend pas faire
 *  - Il ne suit pas un nom rangé dans une variable puis appelé autrement, ni une méthode d'objet :
 *    il tient la forme qui a fait tomber la course, l'appel direct par son nom.
 *  - Le nom du binaire doit apparaître comme **littéral** quelque part dans le module qui le
 *    lance. Un module qui le lirait d'un fichier de réglages échapperait à ce garde-fou ; aucun ne
 *    le fait, et le jour où l'un le fera, c'est ce commentaire qui dira pourquoi il est passé. */

export type Source = { readonly chemin: string; readonly contenu: string };

/** Pourquoi un contrôle est refusé. La distinction compte : « jamais mesuré » demande une mesure,
 *  « mesure périmée » dit qu'elle a eu lieu mais ne porte plus sur ce fichier. */
export type Pourquoi = "jamais mesuré" | "mesure périmée";
export type ControleSansGarde = { readonly chemin: string; readonly nom: string; readonly pourquoi: Pourquoi };

/** Une survie mesurée : le fichier, et l'empreinte de ce qui a été mesuré. */
export type SurvieMesuree = { readonly chemin: string; readonly empreinte: string };

/** Les programmes extérieurs qu'un module peut lancer. Un seul d'entre eux nous intéresse, mais
 *  c'est la **forme de l'appel** qu'on cherche, pas le nom du programme : celui-ci est lu plus
 *  loin, dans les littéraux du module.
 *
 *  `(?<![.\w])` n'est pas une précaution : sans lui, `exec` attrape `expression.exec(texte)`, et
 *  la première mesure de ce garde-fou a désigné `rotationDansOsd` — une fonction qui ne lance
 *  rien et se contente de lire une réponse par expression régulière. */
const LANCEURS = /(?<![.\w])\b(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\s*\(/gu;

/** Le nom du binaire : un littéral qui **commence** par ce mot. */
const EST_LE_BINAIRE = /^tesseract/u;

/** Les littéraux **de code** d'une tranche de texte, contenu par contenu.
 *
 *  Le masque tranche : il efface un commentaire délimiteurs compris, alors qu'il garde les
 *  guillemets d'un littéral et n'en blanchit que le contenu. Un guillemet encore présent au même
 *  décalage est donc du code — c'est ainsi qu'un `` `tesseract` `` écrit dans une phrase ne compte
 *  pas, et qu'un `"tesseract"` passé à un programme compte. */
function litterauxDeCode(contenu: string, masque: string, debut: number, fin: number): readonly string[] {
  const trouves: string[] = [];
  for (let place = debut; place < fin && place < contenu.length; place += 1) {
    const marque = contenu[place]!;
    if (!(marque === '"' || marque === "'" || marque === "`") || masque[place] !== marque) continue;
    let suite = place + 1;
    while (suite < contenu.length && !(contenu[suite] === marque && masque[suite] === marque)) suite += 1;
    trouves.push(contenu.slice(place + 1, suite));
    place = suite;
  }
  return trouves;
}

/** Le **premier** argument d'un appel, celui qui nomme le programme.
 *
 *  Jusqu'à la première virgule de profondeur zéro : `join(dossier, "sf")` est un seul argument,
 *  et le découper à sa virgule intérieure ferait prendre `dossier` pour le programme. */
function premierArgument(contenu: string, masque: string, parenthese: number): { readonly debut: number; readonly fin: number } {
  const debut = parenthese + 1;
  let profondeur = 0;
  for (let place = debut; place < masque.length; place += 1) {
    const marque = masque[place];
    if (marque === "(" || marque === "[" || marque === "{") profondeur += 1;
    else if (marque === ")" || marque === "]" || marque === "}") {
      if (profondeur === 0) return { debut, fin: place };
      profondeur -= 1;
    } else if (marque === "," && profondeur === 0) return { debut, fin: place };
  }
  return { debut, fin: contenu.length };
}

/** Cet appel lance-t-il **Tesseract**, et non un autre programme ?
 *
 *  La question se pose sur l'**argument**, jamais sur le module. La première version de ce
 *  garde-fou appariait « ce module nomme Tesseract quelque part » avec « cette fonction lance
 *  quelque chose », et elle s'est accusée elle-même dès que son fichier est devenu suivi par Git :
 *  il lance `git` pour lire l'index, et porte ailleurs le littéral `"tesseract"` — celui d'une
 *  épingle. Deux faits vrais, une conclusion fausse.
 *
 *  Deux cas, dans cet ordre. L'argument porte un littéral de code : c'est lui qui nomme le
 *  programme, et `join(dossier, "sf")` est alors écarté sans hésiter. L'argument n'en porte aucun —
 *  c'est une variable : on cherche dans le module ce qu'on lui affecte, car `const binaire =
 *  options.binaire ?? "tesseract"` nomme bien Tesseract, une ligne plus haut. */
function lanceTesseract(contenu: string, masque: string, parenthese: number): boolean {
  const { debut, fin } = premierArgument(contenu, masque, parenthese);
  const litteraux = litterauxDeCode(contenu, masque, debut, fin);
  if (litteraux.length > 0) return litteraux.some((litteral) => EST_LE_BINAIRE.test(litteral));
  const segments = contenu.slice(debut, fin).trim().split(".");
  const nom = segments[segments.length - 1]!.trim();
  if (!/^\w+$/u.test(nom)) return false;
  for (const trouve of contenu.matchAll(new RegExp(`\\b${nom}\\b[^;\n]*?["'\`]tesseract`, "gu"))) {
    const guillemet = trouve.index + trouve[0].length - "tesseract".length - 1;
    if (masque[guillemet] === contenu[guillemet]) return true;
  }
  return false;
}

type Definition = { readonly nom: string; readonly debut: number; readonly fin: number };

/** Les définitions de **premier niveau** d'un module, dans l'ordre, avec l'étendue de leur corps.
 *
 *  Reconnues à la **colonne zéro**, et c'est volontaire : une fonction interne est indentée, donc
 *  son corps reste celui de la fonction qui la porte. C'est exactement ce que la propagation
 *  demande — une fermeture qui appelle la reconnaissance rend appelante la fonction qui l'abrite.
 *
 *  Le corps d'une définition s'étend jusqu'à la suivante. Compter les accolades serait plus exact
 *  en apparence, mais une annotation de type porte des accolades (`function f(): { a: number }`)
 *  et il faudrait alors lire les types pour lire le code. */
function definitions(masque: string): readonly Definition[] {
  const debuts: { nom: string; debut: number }[] = [];
  for (const trouve of masque.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/gmu))
    debuts.push({ nom: trouve[1]!, debut: trouve.index });
  for (const trouve of masque.matchAll(/^(?:export\s+)?(?:const|let|class)\s+(\w+)/gmu))
    debuts.push({ nom: trouve[1]!, debut: trouve.index });
  debuts.sort((un, autre) => un.debut - autre.debut);
  return debuts.map((definition, place) => ({
    ...definition,
    fin: debuts[place + 1]?.debut ?? masque.length,
  }));
}

/** La fin d'un bloc ou d'un appel, en comptant les délimiteurs sur le **masque**.
 *
 *  Sur le masque, parce qu'une accolade ou une parenthèse dans une chaîne n'en est pas une. */
function finDuGroupe(masque: string, ouverture: number, ouvrant: string, fermant: string): number {
  let profondeur = 0;
  for (let place = ouverture; place < masque.length; place += 1) {
    if (masque[place] === ouvrant) profondeur += 1;
    else if (masque[place] === fermant) {
      profondeur -= 1;
      if (profondeur === 0) return place + 1;
    }
  }
  return masque.length;
}

/** Un lancement **rattrapé sans relever** : sans l'outil, l'appelant reçoit une valeur, pas une
 *  exception. Le `try` retenu est le plus intérieur de ceux qui contiennent le lancement, et un
 *  `try` sans `catch` — donc un `finally` seul — ne rattrape rien. */
function avale(masque: string, lancement: number): boolean {
  let retenu: { readonly debut: number; readonly fin: number } | undefined;
  for (const trouve of masque.matchAll(/\btry\s*\{/gu)) {
    const fin = finDuGroupe(masque, trouve.index + trouve[0].length - 1, "{", "}");
    if (trouve.index >= lancement || lancement >= fin) continue;
    if (retenu === undefined || trouve.index > retenu.debut) retenu = { debut: trouve.index, fin };
  }
  if (retenu === undefined) return false;
  const suite = /^\s*catch\s*(?:\([^)]*\))?\s*\{/u.exec(masque.slice(retenu.fin));
  if (suite === null) return false;
  const ouverture = retenu.fin + suite[0].length - 1;
  const corps = masque.slice(ouverture, finDuGroupe(masque, ouverture, "{", "}"));
  return !/\bthrow\b/u.test(corps);
}

/** Les définitions qui lancent Tesseract et **laissent passer** son absence, nommées
 *  `chemin#nom`. Lues dans le code : aucune liste n'est écrite ici, car une liste écrite à la main
 *  vieillirait en silence. */
export function racinesQuiEchouentSansTesseract(sources: readonly Source[]): ReadonlySet<string> {
  const racines = new Set<string>();
  for (const source of sources) {
    const masque = masqueDeCode(source.contenu);
    const defs = definitions(masque);
    for (const trouve of masque.matchAll(LANCEURS)) {
      if (!lanceTesseract(source.contenu, masque, trouve.index + trouve[0].length - 1)) continue;
      if (avale(masque, trouve.index)) continue;
      const definition = defs.find((candidate) => candidate.debut <= trouve.index && trouve.index < candidate.fin);
      if (definition !== undefined) racines.add(`${source.chemin}#${definition.nom}`);
    }
  }
  return racines;
}

/** Résout un chemin relatif depuis le fichier qui l'importe, sans toucher au disque. */
function resoudreRelatif(depuis: string, relatif: string): string {
  const morceaux = depuis.split("/").slice(0, -1).concat(relatif.split("/"));
  const pile: string[] = [];
  for (const morceau of morceaux) {
    if (morceau === "." || morceau === "") continue;
    if (morceau === "..") pile.pop();
    else pile.push(morceau);
  }
  return pile.join("/");
}

/** Le module qu'un import désigne, ramené à un chemin présent dans les sources lues.
 *
 *  Les imports par **nom de paquet** comptent autant que les relatifs : neuf fichiers de contrôle
 *  atteignent la reconnaissance par `@lienotheque/lecteur-texte`, et les ignorer rendrait ce
 *  garde-fou aveugle là où il doit voir. La correspondance nom → point d'entrée est **donnée**,
 *  lue des `package.json` par l'appelant, jamais écrite ici. */
function moduleDesigne(
  connus: ReadonlySet<string>,
  paquets: ReadonlyMap<string, string>,
  depuis: string,
  specificateur: string,
): string | undefined {
  if (!specificateur.startsWith(".")) return paquets.get(specificateur);
  const cible = resoudreRelatif(depuis, specificateur);
  const essais = cible.endsWith(".js")
    ? [`${cible.slice(0, -3)}.ts`, `${cible.slice(0, -3)}.tsx`]
    : [cible, `${cible}.ts`, `${cible}.tsx`];
  return essais.find((essai) => connus.has(essai));
}

type Lien = { readonly nom: string; readonly module: string; readonly nomDOrigine: string };

/** Ce qu'un module fait venir d'ailleurs : ses imports nommés et ses réexports.
 *
 *  Les types sont écartés — `import type` ne s'appelle pas. Les spécificateurs sont lus sur le
 *  **contenu** et non sur le masque : un chemin EST une chaîne, donc blanchi par le masque ; c'est
 *  le **mot-clé** qu'on interroge pour savoir si l'on lit du code. */
function liens(source: Source, masque: string): { readonly importes: readonly Lien[]; readonly etoiles: readonly string[] } {
  const importes: Lien[] = [];
  const etoiles: string[] = [];
  for (const trouve of source.contenu.matchAll(
    /\b(import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/gu,
  )) {
    if (!estDuCode(masque, trouve.index, trouve[1]!)) continue;
    if (trouve[2] !== undefined) continue;
    for (const morceau of trouve[3]!.split(",")) {
      const nettoye = morceau.trim();
      if (nettoye === "" || nettoye.startsWith("type ")) continue;
      const parties = nettoye.split(/\s+as\s+/u);
      const nomDOrigine = parties[0]!.trim();
      importes.push({ nom: (parties[1] ?? nomDOrigine).trim(), module: trouve[4]!, nomDOrigine });
    }
  }
  for (const trouve of source.contenu.matchAll(/\bexport\s+\*\s+from\s*"([^"]+)"/gu)) {
    if (!estDuCode(masque, trouve.index, "export")) continue;
    etoiles.push(trouve[1]!);
  }
  return { importes, etoiles };
}

/** Les noms appelés dans un texte, par leur nom seul.
 *
 *  `(?<![.\w])` écarte la méthode d'un objet : ce module ne sait rien du type de `lecteur`, et il
 *  se taira plutôt que d'accuser `lecteur.lireParOcr()`. */
function nomsAppeles(masque: string, candidats: Iterable<string>): ReadonlySet<string> {
  const appeles = new Set<string>();
  for (const nom of candidats) {
    if (new RegExp(`(?<![.\\w])\\b${nom}\\s*\\(`, "u").test(masque)) appeles.add(nom);
  }
  return appeles;
}

type Graphe = {
  readonly aretes: ReadonlyMap<string, ReadonlySet<string>>;
  readonly masques: ReadonlyMap<string, string>;
  readonly importsParFichier: ReadonlyMap<string, ReadonlyMap<string, string>>;
};

/** Le graphe des appels, nom par nom. Les arêtes vont de l'appelant vers l'appelé. */
function graphe(sources: readonly Source[], paquets: ReadonlyMap<string, string>): Graphe {
  const connus = new Set(sources.map((source) => source.chemin));
  const masques = new Map(sources.map((source) => [source.chemin, masqueDeCode(source.contenu)] as const));
  const definitionsParFichier = new Map(
    sources.map((source) => [source.chemin, definitions(masques.get(source.chemin)!)] as const),
  );
  const aretes = new Map<string, Set<string>>();
  const importsParFichier = new Map<string, Map<string, string>>();
  const ajouter = (de: string, vers: string): void => {
    const deja = aretes.get(de);
    if (deja === undefined) aretes.set(de, new Set([vers]));
    else deja.add(vers);
  };

  for (const source of sources) {
    const masque = masques.get(source.chemin)!;
    const { importes, etoiles } = liens(source, masque);
    const locales = new Set(definitionsParFichier.get(source.chemin)!.map((definition) => definition.nom));

    // Où chaque nom visible dans ce fichier mène : son nœud, ici ou ailleurs.
    const vers = new Map<string, string>();
    for (const lien of importes) {
      const module = moduleDesigne(connus, paquets, source.chemin, lien.module);
      if (module !== undefined) vers.set(lien.nom, `${module}#${lien.nomDOrigine}`);
    }
    for (const nom of locales) vers.set(nom, `${source.chemin}#${nom}`);
    importsParFichier.set(source.chemin, new Map(vers));

    // Un réexport nommé fait suivre la nature du nom d'origine, sans toucher à ses voisins.
    for (const trouve of source.contenu.matchAll(/\bexport\s+\{([^}]*)\}\s*from\s*"([^"]+)"/gu)) {
      const module = moduleDesigne(connus, paquets, source.chemin, trouve[2]!);
      if (module === undefined) continue;
      for (const morceau of trouve[1]!.split(",")) {
        const nettoye = morceau.trim();
        if (nettoye === "" || nettoye.startsWith("type ")) continue;
        const parties = nettoye.split(/\s+as\s+/u);
        const nomDOrigine = parties[0]!.trim();
        ajouter(`${source.chemin}#${(parties[1] ?? nomDOrigine).trim()}`, `${module}#${nomDOrigine}`);
      }
    }
    // Un réexport en étoile fait suivre chaque nom du module désigné, un par un.
    for (const etoile of etoiles) {
      const module = moduleDesigne(connus, paquets, source.chemin, etoile);
      if (module === undefined) continue;
      for (const definition of definitionsParFichier.get(module) ?? [])
        ajouter(`${source.chemin}#${definition.nom}`, `${module}#${definition.nom}`);
    }

    for (const definition of definitionsParFichier.get(source.chemin)!) {
      const corps = masque.slice(definition.debut, definition.fin);
      for (const nom of nomsAppeles(corps, vers.keys())) {
        const cible = vers.get(nom)!;
        if (cible !== `${source.chemin}#${definition.nom}`) ajouter(`${source.chemin}#${definition.nom}`, cible);
      }
    }
  }

  return { aretes, masques, importsParFichier };
}

/** Les noms qui peuvent atteindre Tesseract : les racines, et tout ce qui les appelle, de proche
 *  en proche jusqu'au point fixe. */
export function nomsQuiAtteignentTesseract(
  sources: readonly Source[],
  paquets: ReadonlyMap<string, string> = new Map(),
): ReadonlySet<string> {
  const { aretes } = graphe(sources, paquets);
  const atteignent = new Set(racinesQuiEchouentSansTesseract(sources));
  let encore = true;
  while (encore) {
    encore = false;
    for (const [de, vers] of aretes) {
      if (atteignent.has(de)) continue;
      for (const cible of vers) {
        if (!atteignent.has(cible)) continue;
        atteignent.add(de);
        encore = true;
        break;
      }
    }
  }
  return atteignent;
}

/** La garde **déclarée**, et non mentionnée : le fichier demande si l'outil est là, et fait
 *  sauter quelque chose sinon. Un fichier qui appelle `tesseractDisponible()` dans une assertion
 *  sans jamais sauter n'est pas gardé — c'est un contrôle qui exige l'outil, pas qui s'en passe. */
function porteLaGarde(masque: string): boolean {
  return /\btesseractDisponible\s*\(/u.test(masque) && /\.skip\b/u.test(masque);
}

const EST_UN_CONTROLE = /(?:^|\/)[^/]*\.test\.tsx?$/u;

export type Atteinte = { readonly chemin: string; readonly nom: string };

/** Les fichiers de contrôle qui **peuvent** atteindre la reconnaissance, et par quel nom.
 *
 *  C'est la part que la lecture du code sait faire, et elle est précieuse : elle réduit un dépôt
 *  de deux cents fichiers de contrôle à la poignée qui demande une réponse. Ce qu'elle ne dit pas,
 *  la mesure le dit. */
export function controlesQuiPeuventAtteindre(
  sources: readonly Source[],
  paquets: ReadonlyMap<string, string> = new Map(),
): readonly Atteinte[] {
  const atteignent = nomsQuiAtteignentTesseract(sources, paquets);
  const { masques, importsParFichier } = graphe(sources, paquets);
  const trouves: Atteinte[] = [];
  for (const source of sources) {
    if (!EST_UN_CONTROLE.test(source.chemin)) continue;
    const vers = importsParFichier.get(source.chemin)!;
    for (const nom of [...nomsAppeles(masques.get(source.chemin)!, vers.keys())].sort())
      if (atteignent.has(vers.get(nom)!)) trouves.push({ chemin: source.chemin, nom });
  }
  return trouves;
}

export type Reponses = {
  /** Les contrôles épinglés **pour l'absence de l'outil**, chemin par chemin. Lus des épingles,
   *  jamais écrits ici : un rouge épinglé est une réponse légitime, et le dire deux fois ferait
   *  deux vérités à tenir. */
  readonly epingles?: ReadonlySet<string>;
  /** Les survies mesurées, chemin par empreinte du fichier mesuré. */
  readonly mesures?: ReadonlyMap<string, string>;
  readonly paquets?: ReadonlyMap<string, string>;
};

/** L'empreinte d'un fichier de contrôle, telle que la mesure l'inscrit. */
export function empreinteDuControle(contenu: string): string {
  return createHash("sha256").update(contenu, "utf8").digest("hex");
}

/** Les contrôles qui peuvent atteindre la reconnaissance **sans réponse** : ni garde, ni épingle,
 *  ni survie mesurée sur ce contenu-là. */
export function controlesSansGarde(
  sources: readonly Source[],
  reponses: Reponses = {},
): readonly ControleSansGarde[] {
  const { epingles = new Set<string>(), mesures = new Map<string, string>(), paquets = new Map<string, string>() } =
    reponses;
  const masques = new Map(sources.map((source) => [source.chemin, masqueDeCode(source.contenu)] as const));
  const contenus = new Map(sources.map((source) => [source.chemin, source.contenu] as const));
  const sansReponse: ControleSansGarde[] = [];
  for (const atteinte of controlesQuiPeuventAtteindre(sources, paquets)) {
    if (porteLaGarde(masques.get(atteinte.chemin)!)) continue;
    if (epingles.has(atteinte.chemin)) continue;
    const mesuree = mesures.get(atteinte.chemin);
    if (mesuree === undefined) {
      sansReponse.push({ ...atteinte, pourquoi: "jamais mesuré" });
      continue;
    }
    if (mesuree !== empreinteDuControle(contenus.get(atteinte.chemin)!))
      sansReponse.push({ ...atteinte, pourquoi: "mesure périmée" });
  }
  return sansReponse;
}
