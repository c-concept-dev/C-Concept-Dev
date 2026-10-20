// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VersionDocument, type Passage, type SchemaBibliotheque } from "@lienotheque/contrats";
import type { Depot } from "@lienotheque/noyau";
import { ouvrirDepot } from "@lienotheque/depot-sqlite";
import { enregistrerLeTraitement } from "../src/index.js";

/** Du traitement au dépôt, et du dépôt à la recherche — le chaînon qui manquait (BAS-02).
 *
 *  ## Ce qui n'existait pas, et que personne n'avait vu
 *
 *  Relevé le 20 octobre 2026 sur `origin/main` : `executerTravail` lit un document, construit une
 *  vue et des passages, **rapporte** — et n'écrit rien. `ingerer` sait écrire documents, versions,
 *  ancres et liens, et **n'est appelée que par ses propres épreuves**. `enregistrerPassages` n'a
 *  **aucun appelant**, nulle part. `activerVersion` non plus, hors épreuves.
 *
 *  L'étape 5 du chemin du texte — « écriture dans `passage` et l'index plein texte à l'activation
 *  d'une version » — n'était donc pas faite. Toutes les pièces existaient, bien faites et
 *  éprouvées ; **leur assemblage manquait**, et c'est ce qui séparait la chaîne d'une
 *  bibliothèque cherchable.
 *
 *  ## L'ordre des trois gestes n'est pas indifférent
 *
 *  Le lot, puis les passages, puis l'activation — et l'activation **en dernier**. Une version
 *  n'est active que lorsque tout ce qu'elle promet est écrit : si l'écriture des passages échoue,
 *  la version précédente reste active et la bibliothèque reste cohérente. Activer d'abord
 *  laisserait une version vivante et vide, ce qui est pire que pas de version du tout.
 */

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string): string => c.repeat(64).slice(0, 64);
const LE = "2026-10-20T09:00:00+02:00";

let dossier = "";
let depot: Depot;

const SCHEMA: SchemaBibliotheque = {
  cle: "essai",
  nom: "Essai",
  langue: "fr",
  version: 1,
  axes: [
    {
      cle: "axe_un",
      nom: "Un axe",
      nature: "referentiel",
      cardinalite: "une",
      structure: "plat",
      obligatoire: false,
      alias: [],
      valeurs: [{ cle: "une", nom: "Une valeur", alias: [], synonymes: [], retiree: false }],
    },
  ],
};

const lotDe = (versionN: number) => ({
  document: { id: id(10), bibliothequeId: id(1), titre: "Un document", alias: [], creeLe: LE },
  version: VersionDocument.parse({
    id: id(versionN),
    documentId: id(10),
    numero: versionN,
    etat: "pret_a_lire",
    active: false,
    fichiers: [sha("a")],
    recette: { id: "livre-natif", version: 1 },
    outils: [{ nom: "lecteur-texte", version: "1.0.0" }],
    manques: [],
    creeLe: LE,
  }),
  schema: SCHEMA,
  fichiers: [
    {
      empreinte: sha("a"),
      taille: 1234,
      typeMime: "application/pdf",
      nomOrigine: "un-document.pdf",
      ajouteLe: LE,
      appareilId: id(99),
    },
  ],
  lignes: [],
  association: { appariements: [], orphelins: [], manquants: [] },
  medias: [],
});

/** Des passages comme la lecture les produit : un par page, rangs qui se suivent. */
const passagesDe = (textes: readonly string[]): readonly Passage[] =>
  textes.map((texte, rang) => ({
    rang,
    texte,
    source: "couche_texte" as const,
    page: rang + 1,
    pageImprimee: rang + 10,
    lisible: true,
  }));

beforeEach(async () => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-depot-"));
  depot = await ouvrirDepot(dossier);
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe("le traitement entre dans le dépôt, et la recherche l'y retrouve", () => {
  it("écrit les passages et rend la version active", async () => {
    await enregistrerLeTraitement(depot, lotDe(20), passagesDe(["le texte de la première page", "celui de la seconde"]));

    const active = await depot.versionActive(id(10));
    expect(active?.id, "la version n'a pas été activée").toBe(id(20));
    expect(await depot.passages(id(20))).toHaveLength(2);
  });

  it("retrouve un passage par la recherche plein texte, avec son numéro imprimé (RCH-07, RCH-09)", async () => {
    // Le critère du lot : ce qui est écrit doit être **retrouvable**, et ce qu'on retrouve doit
    // dire sur quelle page le lire. Un passage sans numéro imprimé est une citation qu'on ne
    // peut pas vérifier.
    await enregistrerLeTraitement(depot, lotDe(20), passagesDe(["une phrase singulière à retrouver", "autre chose"]));

    const trouves = await depot.chercherPassages("singulière");
    expect(trouves).toHaveLength(1);
    expect(trouves[0]?.passage.texte).toContain("singulière");
    expect(trouves[0]?.passage.pageImprimee).toBe(10);
  });

  it("remplace les passages d'une version rejouée, sans en laisser deux fois", async () => {
    // Rejouer un traitement est normal — une recette corrigée, un outil mis à jour. Ce qui ne
    // l'est pas, c'est que l'ancien texte reste trouvable à côté du nouveau.
    await enregistrerLeTraitement(depot, lotDe(20), passagesDe(["une version ancienne du texte"]));
    await enregistrerLeTraitement(depot, lotDe(20), passagesDe(["la version corrigée du texte"]));

    expect(await depot.passages(id(20))).toHaveLength(1);
    expect(await depot.chercherPassages("ancienne")).toHaveLength(0);
    expect(await depot.chercherPassages("corrigée")).toHaveLength(1);
  });

  it("n'active pas une version dont les passages ont été refusés", async () => {
    // L'ordre protège : une version n'est active que lorsque tout ce qu'elle promet est écrit.
    // Ici les rangs sautent, et le contrat des passages refuse — un trou dans les rangs est ce
    // qu'un transport perd. La version précédente doit rester celle qu'on lit.
    await enregistrerLeTraitement(depot, lotDe(20), passagesDe(["la version qui marche"]));

    const troues: readonly Passage[] = [
      { rang: 0, texte: "la première", source: "couche_texte", page: 1, lisible: true },
      { rang: 2, texte: "la troisième, et la deuxième manque", source: "couche_texte", page: 3, lisible: true },
    ];
    await expect(enregistrerLeTraitement(depot, lotDe(21), troues)).rejects.toThrow();

    const active = await depot.versionActive(id(10));
    expect(active?.id, "une version incomplète a été activée").toBe(id(20));
    expect(await depot.chercherPassages("marche"), "le texte d'avant a disparu").toHaveLength(1);
  });

  it("rend le bilan de ce qui a été écrit", async () => {
    const bilan = await enregistrerLeTraitement(depot, lotDe(20), passagesDe(["un texte"]));
    expect(bilan.passages).toBe(1);
  });
});
