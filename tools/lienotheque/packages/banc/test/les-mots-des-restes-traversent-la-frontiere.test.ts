import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dossierDuProjet, racineDuDepot } from "../src/racine-sans-github.js";

/** Les mots d'un reste de retrait sont les mêmes des deux côtés de la frontière (HER-07, D32).
 *
 *  ## Pourquoi ce garde-fou existe
 *
 *  Un reste de retrait est composé par l'hôte Rust et lu par un contrat Zod `strict`. Son champ
 *  `quoi` porte le **texte de l'écran** plutôt qu'un code à traduire : il n'y a ainsi qu'un
 *  vocabulaire, et non deux à tenir d'accord. Mais ce choix déplace le risque sans le supprimer —
 *  un mot corrigé d'un côté et pas de l'autre fait **refuser le compte rendu entier** par
 *  `z.enum`, et ce refus arrive APRÈS le retrait, donc sans moyen de le redire. C'est la même
 *  raison qui faisait déjà garder la clef `source` omise plutôt que nulle.
 *
 *  Un contrôle d'exécution ne peut pas l'attraper : il faudrait qu'un retrait échoue vraiment, et
 *  sur chacune des cinq choses. On lit donc les deux fichiers et on compare les mots.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  Il ne juge ni la formulation, ni l'ordre, ni le nombre : Christophe peut en ajouter un sixième
 *  demain. Il tient une seule chose — que les deux listes soient **la même** — et il nomme les
 *  mots en trop d'un côté comme de l'autre. */

const RACINE = racineDuDepot(new URL("../../../", import.meta.url));
const DOSSIER = dossierDuProjet(RACINE, new URL("../../../", import.meta.url));

const lire = (relatif: string): string => readFileSync(join(RACINE, DOSSIER, relatif), "utf8");

/** Les cinq constantes de l'hôte, lues dans leur déclaration. */
function motsDeLHote(source: string): readonly string[] {
  return [...source.matchAll(/^const RESTE_[A-Z]+: &str = "([^"]+)";$/gmu)].map((trouve) => trouve[1] ?? "");
}

/** Les valeurs du `z.enum` du champ `quoi`, lues dans le contrat. */
function motsDuContrat(source: string): readonly string[] {
  const bloc = /quoi:\s*z\.enum\(\[([^\]]*)\]\)/u.exec(source);
  if (bloc === null) return [];
  return [...(bloc[1] ?? "").matchAll(/"([^"]+)"/gu)].map((trouve) => trouve[1] ?? "");
}

describe("un reste de retrait porte les mêmes mots des deux côtés (HER-07)", () => {
  const hote = lire("apps/app/src-tauri/src/depot.rs");
  const contrat = lire("packages/contrats/src/ecrans.ts");

  it("trouve bien les deux listes : sans elles, ce contrôle ne mesure rien", () => {
    expect(motsDeLHote(hote), "les constantes RESTE_* de depot.rs").toHaveLength(5);
    expect(motsDuContrat(contrat), "le z.enum du champ « quoi »").toHaveLength(5);
  });

  it("ne laisse aucun mot d'un seul côté", () => {
    const hotes = [...motsDeLHote(hote)].sort();
    const contrats = [...motsDuContrat(contrat)].sort();
    expect(
      hotes.filter((mot) => !contrats.includes(mot)),
      "l'hôte emploie un mot que le contrat refusera, et le refus arrivera après le retrait",
    ).toEqual([]);
    expect(
      contrats.filter((mot) => !hotes.includes(mot)),
      "le contrat attend un mot que l'hôte n'écrit plus : la liste fermée l'est pour rien",
    ).toEqual([]);
    expect(hotes).toEqual(contrats);
  });

  it("repérerait bien un mot corrigé d'un seul côté", () => {
    const abime = hote.replace('const RESTE_SOURCE: &str = "la source";', 'const RESTE_SOURCE: &str = "le fichier source";');
    expect(abime, "la sonde doit avoir changé quelque chose").not.toEqual(hote);
    const hotes = [...motsDeLHote(abime)].sort();
    const contrats = [...motsDuContrat(contrat)].sort();
    expect(hotes).not.toEqual(contrats);
    expect(hotes.filter((mot) => !contrats.includes(mot))).toEqual(["le fichier source"]);
  });

  /** La phrase du refus vit elle aussi des deux côtés : dans le dépôt, qui la compose, et dans
   *  l'hôte, qui la reconnaît pour ne pas la préfixer d'un « Retrait impossible : » qui ferait
   *  croire à une panne. Un contrôle de Rust tient son texte exact ; celui-ci tient le lien. */
  it("l'hôte reconnaît la phrase du document absent plutôt que d'en écrire une seconde", () => {
    const lib = lire("apps/app/src-tauri/src/lib.rs");
    expect(hote, "le dépôt doit déclarer la phrase").toMatch(/pub const ABSENT_DE_LA_BIBLIOTHEQUE: &str = "[^"]+";/u);
    expect(lib, "l'hôte doit la nommer, jamais la recopier").toContain("depot::ABSENT_DE_LA_BIBLIOTHEQUE");
    const recopiee = /"Ce document n[’']est pas dans la bibliothèque\./u.test(lib);
    expect(recopiee, "une phrase écrite deux fois finit par différer").toBe(false);
  });
});
