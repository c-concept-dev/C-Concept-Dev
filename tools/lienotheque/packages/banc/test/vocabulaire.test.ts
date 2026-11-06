// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLEXIONS, termesTrouves } from "../src/vocabulaire.js";

/** CLA-01 : le garde-fou cherche des MOTS, pas des suites de lettres.
 *
 *  Un garde-fou qui accuse à tort finit par être désarmé — et un code déjà propre ne peut pas le
 *  révéler : il faut le soumettre à des mots légitimes. « bâche » contient « bach », « desserte »
 *  contient « dessert ». Dans l'autre sens, il doit continuer d'attraper les pluriels et les
 *  identifiants composés, où le mot de domaine est collé à un autre sans espace. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const GARDE = JSON.parse(readFileSync(join(RACINE, "fixtures/termes-de-domaine.json"), "utf8")) as {
  readonly description: string;
  readonly termes: readonly string[];
};
const TERMES = GARDE.termes;

describe("CLA-01 : le garde-fou cherche des mots entiers", () => {
  it("n'accuse pas un mot français qui contient par hasard un terme", () => {
    for (const innocent of [
      "const bache = couvrirLaZone();",
      "la bache de protection",
      "une desserte de service",
      "un bachelor en informatique",
      "la fête bachique",
      "const bacheDeProtection = true;",
    ]) {
      expect(termesTrouves(innocent, TERMES), innocent).toEqual([]);
    }
  });

  it("attrape le terme décliné, quand la déclinaison est prouvée", () => {
    // « s » : le pluriel ordinaire.
    expect(termesTrouves("les exercices du recueil", TERMES)).toContain("exercice");
    expect(termesTrouves("trois décrets de 1984", TERMES)).toContain("décret");
    expect(termesTrouves("des desserts", TERMES)).toContain("dessert");
    // « es » : le féminin pluriel d'un participe, seul cas réel dans la liste des termes.
    expect(termesTrouves("des pièces oblitérées", TERMES)).toContain("oblitéré");
  });

  it("refuse une lettre ajoutée qui fait un autre mot", () => {
    // La frontière n'est pas une longueur : « e » est plus court que « es » et pourtant interdit,
    // parce qu'il transforme le mot. C'est la liste qui décide, pas le compte des lettres.
    expect(termesTrouves("une desserte de service", TERMES)).toEqual([]);
    expect(termesTrouves("la bache de protection", TERMES)).toEqual([]);
  });

  it("attrape le terme collé dans un identifiant composé", () => {
    expect(termesTrouves("function lirePartition(page) {}", TERMES)).toContain("partition");
    expect(termesTrouves("const partitionDuTexte = 3;", TERMES)).toContain("partition");
    expect(termesTrouves("const PARTITION_LUE = 1;", TERMES)).toContain("partition");
  });

  it("attrape un titre de plusieurs mots, quelle que soit la casse", () => {
    expect(termesTrouves('document: "Funk Fusion Bass.pdf",', TERMES)).toContain("funk fusion");
    expect(termesTrouves("// le jalon BASS AEROBICS", TERMES)).toContain("bass aerobics");
  });

  it("ne dépend pas de l'apostrophe employée", () => {
    expect(termesTrouves("// Jump’n’Blues Bass", TERMES)).toContain("jump'n'blues");
    expect(termesTrouves("// Jump'n'Blues Bass", TERMES)).toContain("jump'n'blues");
  });

  /** L'avertissement déposé dans la liste des termes nomme les terminaisons reconnues. Qui en
   *  ajoute une sans corriger l'avertissement laisse une consigne fausse là où elle sera lue. */
  it("garde l'avertissement de la liste des termes d'accord avec FLEXIONS", () => {
    for (const flexion of FLEXIONS) {
      expect(GARDE.description, `la description devrait citer « ${flexion} »`).toContain(`« ${flexion} »`);
    }
    const citees = [...GARDE.description.matchAll(/« ([a-z]{1,4}) »/gu)].map((trouve) => trouve[1]);
    expect([...new Set(citees)].sort()).toEqual([...FLEXIONS].sort());
  });

  it("ne dépend pas des accents du texte contrôlé", () => {
    expect(termesTrouves("const approche = 'Thérapie brève';", TERMES)).toContain("thérapie");
    expect(termesTrouves("const approche = 'Therapie breve';", TERMES)).toContain("thérapie");
  });
});
