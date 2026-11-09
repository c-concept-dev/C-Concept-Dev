// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Rien n'est redistribué sans son texte de licence (dette D2, étape 0).
 *
 *  ## Pourquoi un contrôle, et non une relecture
 *
 *  Le paquet embarque des programmes et des bibliothèques écrits par d'autres. La règle 3.6 du
 *  cahier de pilotage demande que l'application embarque les **textes de licence de tout ce qu'elle
 *  redistribue**. Une liste tenue à la main se périme au premier codec qui entre ou qui sort : le
 *  paquet a déjà changé trois fois en deux jours.
 *
 *  Ce contrôle part donc des **fichiers réellement présents** dans le paquet, et demande pour
 *  chacun qui en répond. L'inverse — partir de la liste et vérifier qu'elle est satisfaite —
 *  resterait vert sur un fichier ajouté hier et oublié.
 *
 *  ## Ce qu'il ne dit pas
 *
 *  Il ne dit pas que le paquet a le **droit** de redistribuer. Il dit que le texte qui l'accorde
 *  est là. Lire les conditions — l'attribution, le copyleft de `liblzma` et de `lz4` — appartient à
 *  Christophe.
 *
 *  ## Pourquoi il saute parfois, et le dit
 *
 *  Les moteurs ne sont pas dans le dépôt (`moteurs/` est ignoré par Git, 269 Mo de binaires). Sur
 *  un coureur d'intégration continue, il n'y a rien à inspecter : le contrôle saute **en nommant
 *  sa raison**, jamais en silence. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const MOTEURS = join(RACINE, "apps/app/src-tauri/moteurs");
const LICENCES = join(MOTEURS, "licences");
const INVENTAIRE = join(LICENCES, "INVENTAIRE.json");
const EPINGLES = join(RACINE, "fixtures/licences-des-moteurs.json");
const APPLICATION = "/Applications/Liénothèque.app";

interface Texte {
  readonly fichier: string;
  readonly empreinte_sha256: string;
}
interface Composant {
  readonly version: string;
  readonly source: string;
  readonly textes: readonly Texte[];
  readonly redistribue: readonly string[];
}

/** Le condensé d'un contenu. Nommé ainsi, et non « empreinte » : le garde-fou des promesses tient
 *  la liste des noms asynchrones du dépôt ENTIER, et deux `empreinte` y sont asynchrones. Un appel
 *  de ce nom dans une condition lui ressemblerait donc à une promesse mal placée, et ce choix de
 *  nom est la réponse juste — la portée globale de cette liste est voulue, puisqu'un port déclaré
 *  dans un fichier s'appelle depuis un autre. */
const condenseSha256 = (octets: Buffer): string => createHash("sha256").update(octets).digest("hex");

const siLesMoteursSontLa = existsSync(MOTEURS) ? it : it.skip;
const siLInventaireEstLa = existsSync(INVENTAIRE) ? it : it.skip;
const siLApplicationEstLa = existsSync(APPLICATION) ? it : it.skip;

/** Tout ce que le paquet emporte et dont quelqu'un d'autre est l'auteur. */
function redistribues(): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (entree.isFile()) trouves.push(relative(MOTEURS, chemin));
    }
  };
  for (const sous of ["bin", "lib", "tessdata", "siegfried"]) {
    const dossier = join(MOTEURS, sous);
    if (existsSync(dossier)) parcourir(dossier);
  }
  return trouves.sort();
}

const inventaire = (): Readonly<Record<string, Composant>> =>
  (JSON.parse(readFileSync(INVENTAIRE, "utf8")) as { composants: Record<string, Composant> }).composants;

describe("rien n'est redistribué sans son texte de licence (D2)", () => {
  it("la liste épinglée nomme les composants et les empreintes de l'amont", () => {
    const epingles = JSON.parse(readFileSync(EPINGLES, "utf8")) as {
      amont: Record<string, { empreinte_sha256: string; url: string }>;
      attendu_dans_le_paquet: { composants: readonly string[] };
    };
    // Trois textes ne sont pas sur la machine et viennent de l'amont : ils sont épinglés.
    expect(Object.keys(epingles.amont).sort()).toEqual(["leptonica", "node", "siegfried"]);
    for (const [nom, quoi] of Object.entries(epingles.amont)) {
      expect(quoi.empreinte_sha256, nom).toMatch(/^[0-9a-f]{64}$/u);
      // Une adresse figée sur une étiquette de version, jamais sur une branche : le texte d'une
      // branche change sous les pieds, et l'empreinte épinglée deviendrait un faux rouge.
      expect(quoi.url, nom).not.toMatch(/\/(main|master|HEAD)\//u);
    }
    expect(epingles.attendu_dans_le_paquet.composants.length).toBeGreaterThan(10);
  });

  siLesMoteursSontLa("le paquet porte un dossier de licences", () => {
    expect(existsSync(LICENCES), `${LICENCES} : lancer outils/collecter-licences.py`).toBe(true);
    expect(existsSync(INVENTAIRE), INVENTAIRE).toBe(true);
  });

  siLInventaireEstLa("chaque fichier redistribué a un composant qui en répond", () => {
    const composants = inventaire();
    const couverts = new Set<string>();
    for (const composant of Object.values(composants))
      for (const nom of composant.redistribue) couverts.add(nom);

    const orphelins = redistribues().filter((chemin) => {
      const nom = chemin.split("/").at(-1)!;
      return !couverts.has(nom) && !couverts.has(chemin);
    });
    expect(orphelins, "ces fichiers partiraient sans leur texte de licence").toEqual([]);
  });

  siLInventaireEstLa("chaque texte annoncé est là, aux octets annoncés", () => {
    const manquants: string[] = [];
    const differents: string[] = [];
    for (const [nom, composant] of Object.entries(inventaire())) {
      for (const texte of composant.textes) {
        // La chaîne porte ses textes elle-même : ils sont inscrits, pas recopiés.
        const chemin = nom === "chaine" ? join(MOTEURS, texte.fichier) : join(LICENCES, dossierDe(nom, composant), texte.fichier);
        if (!existsSync(chemin)) {
          manquants.push(`${nom} : ${chemin}`);
          continue;
        }
        const condense = condenseSha256(readFileSync(chemin));
        if (condense !== texte.empreinte_sha256) differents.push(`${nom} : ${texte.fichier}`);
      }
    }
    expect(manquants, "textes annoncés et absents").toEqual([]);
    expect(differents, "textes présents mais d'autres octets qu'annoncé").toEqual([]);
  });

  siLInventaireEstLa("les textes de l'amont ont l'empreinte épinglée, et pas une autre", () => {
    const epingles = (
      JSON.parse(readFileSync(EPINGLES, "utf8")) as { amont: Record<string, { empreinte_sha256: string }> }
    ).amont;
    const composants = inventaire();
    for (const [nom, quoi] of Object.entries(epingles)) {
      const composant = composants[nom];
      expect(composant, `${nom} absent de l'inventaire du paquet`).toBeDefined();
      expect(composant!.textes).toHaveLength(1);
      expect(composant!.textes[0]!.empreinte_sha256, nom).toBe(quoi.empreinte_sha256);
    }
  });

  siLInventaireEstLa("aucun composant attendu ne manque à l'inventaire", () => {
    const attendus = (
      JSON.parse(readFileSync(EPINGLES, "utf8")) as { attendu_dans_le_paquet: { composants: readonly string[] } }
    ).attendu_dans_le_paquet.composants;
    const presents = Object.keys(inventaire());
    expect([...attendus].sort()).toEqual([...presents].sort());
  });

  siLApplicationEstLa("l'application installée emporte les licences, et non seulement le dépôt", () => {
    // Collecter sans embarquer ne tient pas la règle 3.6 : c'est le paquet livré qui doit les
    // porter. On regarde donc l'application, et pas le dossier de travail.
    const dans = join(APPLICATION, "Contents/Resources/moteurs/licences");
    expect(existsSync(dans), `${dans} : refabriquer l'application après la collecte`).toBe(true);
    expect(statSync(join(dans, "INVENTAIRE.json")).size).toBeGreaterThan(0);
  });
});

/** Le dossier d'un composant dans `licences/` : son nom et sa version, ou son nom seul. */
function dossierDe(nom: string, composant: Composant): string {
  const avecVersion = join(LICENCES, `${nom}-${composant.version}`);
  return existsSync(avecVersion) ? `${nom}-${composant.version}` : nom;
}
