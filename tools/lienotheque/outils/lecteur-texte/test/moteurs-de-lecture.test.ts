// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { tesseractDisponible } from "../src/ocr.js";

/** Les données de langue employées sont-elles CELLES que l'application embarque ? (OUT-05, lot 0b)
 *
 *  ## Pourquoi ce contrôle existe
 *
 *  Jusqu'au 8 novembre 2026, vingt-cinq contrôles se sautaient sur la CI faute de Tesseract — dont
 *  les dix-neuf de la voie oracle, c'est-à-dire le cœur de ce que la chaîne fait. Les installer ne
 *  suffit pas : la reconnaissance ne rend pas la même chose avec d'autres données de langue.
 *  **Une CI qui lirait avec d'autres octets que le produit ne dirait plus rien du produit.**
 *
 *  `fixtures/moteurs-de-lecture.json` enregistre les empreintes relevées sur les fichiers que
 *  l'application embarque. Ce contrôle les compare à ce que la machine courante emploie.
 *
 *  ## Pourquoi il se saute, et pourquoi il le DIT
 *
 *  Sans `TESSDATA_PREFIX`, on ne sait pas quels fichiers Tesseract emploierait : le chercher aux
 *  endroits usuels serait deviner, et un contrôle qui devine est pire qu'un contrôle absent. Il se
 *  saute donc — mais le dernier contrôle de ce fichier vérifie que la fixture, elle, est toujours
 *  là et toujours lisible. Un saut ne doit jamais ressembler à un succès. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const FIXTURE = join(RACINE, "fixtures/moteurs-de-lecture.json");
/** L'exécutable que l'application embarque, et qui lit pour de vrai. Ignoré par git
 *  (motif `src-tauri/moteurs/` du .gitignore) : il n'existe que sur une machine qui a joué la préparation des
 *  moteurs, donc jamais sur la CI. Le contrôle qui s'y adosse se saute là-bas, et le dit. */
const EMBARQUE = join(RACINE, "apps/app/src-tauri/moteurs/bin/tesseract");

type Langue = {
  readonly code: string;
  readonly octets: number;
  readonly empreinte_sha256: string;
  readonly provenance: string;
};

type Programme = {
  readonly version_tesseract: string;
  readonly version_leptonica: string;
  readonly releve_ou: string;
  readonly si_la_version_change: string;
};

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  readonly langues: readonly Langue[];
  readonly si_une_empreinte_change: string;
  readonly programme: Programme;
};

const modeles = process.env["TESSDATA_PREFIX"];
const siTesseract = tesseractDisponible() ? it : it.skip;
const siEmbarque = existsSync(EMBARQUE) && tesseractDisponible(EMBARQUE) ? it : it.skip;

/** Ce que l'outil dit de lui-même, première ligne et ligne de leptonica. */
function versionsInstallees(binaire = "tesseract"): { readonly tesseract: string; readonly leptonica: string } {
  const dit = execFileSync(binaire, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const tesseract = /tesseract\s+v?([0-9][0-9.]*)/iu.exec(dit)?.[1] ?? "illisible";
  const leptonica = /leptonica[- ]v?([0-9][0-9.]*)/iu.exec(dit)?.[1] ?? "illisible";
  return { tesseract, leptonica };
}
const siModeles = modeles !== undefined && modeles !== "" && existsSync(modeles) ? it : it.skip;

describe("les données de langue de la reconnaissance (OUT-05, lot 0b)", () => {
  it("la fixture nomme au moins deux langues, avec taille ET empreinte", () => {
    // Sans ce contrôle, une fixture vidée ferait passer les suivants sans rien comparer.
    expect(fixture.langues.length).toBeGreaterThanOrEqual(2);
    for (const langue of fixture.langues) {
      expect(langue.code, "une langue sans code ne se vérifie pas").toMatch(/^[a-z]{3}$/u);
      expect(langue.octets, langue.code).toBeGreaterThan(0);
      expect(langue.empreinte_sha256, langue.code).toMatch(/^[0-9a-f]{64}$/u);
      expect(langue.provenance.length, "d'où viennent ces octets").toBeGreaterThan(0);
    }
    expect(fixture.si_une_empreinte_change, "la fixture dit quoi faire si ça change").toMatch(/ROUGIR/);
  });

  for (const langue of fixture.langues) {
    siModeles(`emploie exactement les octets de ${langue.code} que l'application embarque`, () => {
      const chemin = join(modeles!, `${langue.code}.traineddata`);
      expect(existsSync(chemin), `${chemin} doit exister : la CI l'installe`).toBe(true);
      // La taille d'abord : elle sépare « absent » de « différent » sans lire quatre mégaoctets.
      expect(statSync(chemin).size, `taille de ${langue.code} (${langue.provenance})`).toBe(langue.octets);
      expect(
        createHash("sha256").update(readFileSync(chemin)).digest("hex"),
        `empreinte de ${langue.code} — ne JAMAIS ajuster l'attendu pour faire passer la course`,
      ).toBe(langue.empreinte_sha256);
    });
  }

  siModeles("ne porte aucune langue que la fixture ne nomme pas", () => {
    // Une langue de plus n'est pas anodine : la reconnaissance peut la choisir, et ce que la CI
    // vérifie cesserait d'être ce que le produit lit.
    const presentes = readdirSync(modeles!)
      .filter((nom) => nom.endsWith(".traineddata"))
      .map((nom) => nom.replace(/\.traineddata$/u, ""))
      .sort();
    expect(presentes).toEqual(fixture.langues.map((l) => l.code).sort());
  });

  // ── LE PROGRAMME, ET PAS SEULEMENT SES FICHIERS DE LANGUE ────────────────────────────────────
  //
  // Les contrôles ci-dessus comparent les octets que la reconnaissance LIT. Ils ne disent rien de
  // ce qui les lit. Homebrew peut installer une autre version que celle que l'application
  // embarque : le programme lirait alors différemment AVEC LES MÊMES fichiers, et rien ne le
  // signalerait. Signalé par Christophe le 8 novembre 2026, et c'est la même classe de défaut que
  // les fichiers eux-mêmes — un écart qui ne se dit pas.
  siTesseract("emploie la version de Tesseract que l'application embarque", () => {
    const installees = versionsInstallees();
    expect(
      installees.tesseract,
      `attendu ${fixture.programme.version_tesseract} (${fixture.programme.releve_ou}) — ` +
        `ne JAMAIS ajuster l'attendu pour faire passer la course`,
    ).toBe(fixture.programme.version_tesseract);
  });

  siTesseract("emploie la même leptonica, qui décide du traitement d'image", () => {
    // Leptonica seuille, recadre et met à l'échelle avant que la reconnaissance ne voie quoi que
    // ce soit. Une autre version n'est pas un détail d'emballage : c'est une autre image lue.
    const installees = versionsInstallees();
    expect(installees.leptonica, `attendu ${fixture.programme.version_leptonica}`).toBe(
      fixture.programme.version_leptonica,
    );
  });

  // ── ET QUE LA FIXTURE RÉPONDE DE SON ANCRE ───────────────────────────────────────────────────
  //
  // Les deux contrôles ci-dessus comparent le Tesseract du PATH au chiffre de la fixture. Mais ce
  // chiffre se dit relevé sur l'exécutable que l'application EMBARQUE, et rien ne le vérifiait :
  // il avait été noté à la main. Si la préparation des moteurs rembarque une autre version, la
  // fixture se périme en silence, et le seul contrôle qui rougirait accuserait le PATH — c'est-à-
  // dire le mauvais coupable. Celui-ci tient la fixture à sa propre parole.
  siEmbarque("dit vrai sur l'exécutable embarqué, dont elle tire son chiffre", () => {
    const embarque = versionsInstallees(EMBARQUE);
    expect(
      embarque.tesseract,
      `la fixture annonce ${fixture.programme.version_tesseract}, relevé sur ${EMBARQUE} — ` +
        `si l'embarqué a changé, relever la NOUVELLE version ici, jamais l'inverse`,
    ).toBe(fixture.programme.version_tesseract);
    expect(embarque.leptonica).toBe(fixture.programme.version_leptonica);
  });

  it("la fixture dit quelle version est attendue, et d'où elle la tient", () => {
    expect(fixture.programme.version_tesseract).toMatch(/^[0-9]+\.[0-9]+(\.[0-9]+)?$/u);
    expect(fixture.programme.version_leptonica).toMatch(/^[0-9]+\.[0-9]+(\.[0-9]+)?$/u);
    expect(fixture.programme.releve_ou, "d'où vient ce chiffre").toContain("src-tauri/moteurs");
    expect(fixture.programme.si_la_version_change).toMatch(/ROUGIR/);
  });

  it("dit pourquoi il se saute, au lieu de se taire", () => {
    // Le contrôle qui garde le saut honnête : si TESSDATA_PREFIX manque, la raison est nommée, et
    // la fixture reste lisible. Un saut silencieux est indistinguable d'un succès.
    if (modeles === undefined || modeles === "") {
      expect(existsSync(FIXTURE), "la fixture reste là, même quand on ne peut pas comparer").toBe(true);
      expect(dirname(FIXTURE)).toContain("fixtures");
    } else {
      expect(existsSync(modeles), `TESSDATA_PREFIX est posé sur ${modeles} : il doit exister`).toBe(true);
    }
  });
});
