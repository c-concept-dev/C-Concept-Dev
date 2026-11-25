import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dossierDuProjet, fichiersSuivis, racineDuDepot } from "../src/racine-sans-github.js";

/** Aucune empreinte ne se découpe par octets sans avoir été validée juste avant (dette D31).
 *
 *  ## Pourquoi ce garde-fou, et pourquoi il balaie AUSSI les exemples
 *
 *  Une empreinte range une source : `sources/ab/abcdef….pdf`, où le palier est ses deux premiers
 *  caractères. `&empreinte[..2]` compte des **octets**, et un caractère non ASCII en pèse
 *  plusieurs : l'indice 2 tombe alors au milieu d'un caractère, et Rust **panique**. Ce n'est pas
 *  une erreur refusée, c'est l'hôte qui s'arrête.
 *
 *  Le lot `0z nonies` a posé `empreinte_de_document` et l'a branché aux douze commandes. Mais la
 *  mesure du 25 novembre 2026 a trouvé **quatre sites de plus dans les exemples**, que le premier
 *  décompte n'avait pas regardés. Les exemples ne sont pas des épreuves : ce sont les bancs qui ont
 *  réellement traité les documents, l'outil de travail de tous les jours. Et l'argument « ils
 *  lisent une vraie bibliothèque, donc une vraie empreinte » est celui qu'on avait déjà rejeté pour
 *  `titre_ou_empreinte`, nourri lui aussi par les fichiers de la bibliothèque.
 *
 *  Ce qui est jugé : le **code** du produit et des exemples. Pas les commentaires, qui citent
 *  l'ancienne forme pour dire pourquoi elle paniquait. Pas les modules `#[cfg(test)]`, qui sont des
 *  contrôles et fabriquent leurs empreintes.
 *
 *  La règle, dans les mots de Christophe : « aucun `&empreinte[..` sans validation juste avant ».
 *  Un affichage n'a pas à valider — il coupe par caractères, et il disparaît alors de ce relevé. */

const RACINE = racineDuDepot(new URL("../../../", import.meta.url));
const DOSSIER = dossierDuProjet(RACINE, new URL("../../../", import.meta.url));
const VALIDEUR = "empreinte_de_document(";
const DECOUPAGE = "empreinte[..";

/** Le texte, les modules de contrôles retirés : `#[cfg(test)] mod … { … }`, accolades comptées. */
const sansLesControles = (contenu: string): string => {
  let reste = contenu;
  for (;;) {
    const attribut = reste.indexOf("#[cfg(test)]");
    if (attribut === -1) return reste;
    const apres = reste.slice(attribut);
    const declaration = /^#\[cfg\(test\)\]\s*(?:pub\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/u.exec(apres);
    if (declaration === null) {
      // Un `#[cfg(test)]` sur autre chose qu'un module — une constante, par exemple : on le garde.
      const suite = reste.slice(attribut + "#[cfg(test)]".length);
      const plusLoin = sansLesControles(suite);
      return reste.slice(0, attribut) + "§" + plusLoin;
    }
    let profondeur = 0;
    let fin = apres.length;
    for (let place = declaration[0].length - 1; place < apres.length; place += 1) {
      if (apres[place] === "{") profondeur += 1;
      else if (apres[place] === "}") {
        profondeur -= 1;
        if (profondeur === 0) {
          fin = place + 1;
          break;
        }
      }
    }
    reste = reste.slice(0, attribut) + reste.slice(attribut + fin);
  }
};

type Site = { readonly chemin: string; readonly ligne: number; readonly texte: string; readonly valide: boolean };

/** Le relevé, sur des sources DONNÉES : c'est la part pure, et c'est elle qui s'éprouve. */
const relevePur = (sources: readonly { readonly chemin: string; readonly contenu: string }[]): readonly Site[] => {
  const sites: Site[] = [];
  for (const { chemin, contenu: brut } of sources) {
    const contenu = sansLesControles(brut);
    const lignes = contenu.split("\n");
    for (const [rang, ligne] of lignes.entries()) {
      if (!ligne.includes(DECOUPAGE) || ligne.trim().startsWith("//")) continue;
      // Le corps de la fonction qui porte le site, jusqu'au découpage : la validation doit y être.
      const avant = lignes.slice(0, rang);
      // En remontant à la main : `findLastIndex` demande une bibliothèque plus récente que celle
      // que ce paquet cible, et le typage strict le refuse là où `vitest` ne l'aurait pas vu.
      let ouverture = -1;
      for (let place = avant.length - 1; place >= 0; place -= 1)
        if (/^\s*(?:pub\s+)?(?:async\s+)?fn\s/u.test(avant[place] ?? "")) {
          ouverture = place;
          break;
        }
      const corps = avant.slice(ouverture === -1 ? 0 : ouverture).join("\n");
      sites.push({ chemin, ligne: rang + 1, texte: ligne.trim(), valide: corps.includes(VALIDEUR) });
    }
  }
  return sites;
};

/** Le relevé du dépôt : les mêmes règles, sur les fichiers que git suit. */
const relever = (): readonly Site[] => {
  const fichiers = fichiersSuivis(RACINE, DOSSIER).filter(
    (chemin) =>
      chemin.endsWith(".rs") &&
      (chemin.includes("/src-tauri/src/") || chemin.includes("/src-tauri/examples/")),
  );
  expect(fichiers.length, "aucun fichier Rust lu : ce garde-fou ne garde plus rien").toBeGreaterThan(20);
  return relevePur(
    fichiers.map((chemin) => ({
      chemin: chemin.slice(DOSSIER.length + 1),
      contenu: readFileSync(join(RACINE, chemin), "utf8"),
    })),
  );
};

describe("aucun découpage d'empreinte sans validation juste avant (dette D31)", () => {
  it("lit vraiment les sources de l'hôte et des exemples, et y trouve des découpages à juger", () => {
    const sites = relever();
    expect(sites.length, "aucun découpage trouvé : le relevé ne mesure plus rien").toBeGreaterThan(0);
  });

  it("chaque découpage du produit ET des exemples a sa validation dans la même fonction", () => {
    const nus = relever()
      .filter((site) => !site.valide)
      .map((site) => `${site.chemin}:${site.ligne} ${site.texte}`);
    expect(nus, "un découpage par octets sans `empreinte_de_document` au-dessus : il peut paniquer").toStrictEqual([]);
  });
});

describe("ce que ce garde-fou voit, et ce qu'il laisse passer", () => {
  /** La preuve qu'il n'est pas aveugle, et pourquoi elle est faite ainsi.
   *
   *  Une mutation du dépôt ne conviendrait pas ici : ce relevé lit les fichiers que **git suit**,
   *  donc un clone jetable sans dépôt git ne lui rendrait rien. La part qui juge est donc pure, et
   *  c'est elle qu'on nourrit — un site validé, un site nu, et le second seul doit être accusé. */
  const VALIDE = [
    "pub fn deposer(&self, empreinte: &str) -> io::Result<()> {",
    '    let empreinte = empreinte_de_document(empreinte, "l\'épreuve")?;',
    "    let palier = self.racine.join(&empreinte[..2]);",
    "    Ok(())",
    "}",
  ].join("\n");
  const NU = [
    "pub fn deposer(&self, empreinte: &str) -> io::Result<()> {",
    "    let palier = self.racine.join(&empreinte[..2]);",
    "    Ok(())",
    "}",
  ].join("\n");

  it("accuse un découpage dont la fonction ne valide pas, et laisse passer celui qui valide", () => {
    const releve = relevePur([
      { chemin: "src-tauri/src/valide.rs", contenu: VALIDE },
      { chemin: "src-tauri/src/nu.rs", contenu: NU },
    ]);
    expect(releve.filter((site) => !site.valide).map((site) => site.chemin)).toStrictEqual([
      "src-tauri/src/nu.rs",
    ]);
  });

  it("ne juge pas un découpage cité en commentaire, ni un module de contrôles", () => {
    const releve = relevePur([
      { chemin: "src-tauri/src/prose.rs", contenu: "/// `&empreinte[..2]` paniquait ici.\n" },
      {
        chemin: "src-tauri/src/epreuves.rs",
        contenu: ["#[cfg(test)]", "mod tests {", "    fn un() {", "        let p = &empreinte[..2];", "    }", "}"].join("\n"),
      },
    ]);
    expect(releve).toStrictEqual([]);
  });
});
