// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Siegfried voyage dans le paquet, et il y démarre (dette D21).
 *
 *  ## Pourquoi ce contrôle existe
 *
 *  Le § 3.6 du cahier de pilotage nomme `sf` parmi ce que l'application redistribue. Jusqu'au
 *  9 novembre 2026 elle ne l'emportait pas : `tauri.conf.json` ne déclarait que `tesseract` et
 *  `node`. Le paquet était donc en désaccord avec la règle, et rien ne le disait.
 *
 *  ## Ce qu'il vérifie, et dans quel ordre
 *
 *  Un binaire présent ne prouve rien : un binaire qui ne démarre pas, ou qui démarre en chargeant
 *  une bibliothèque de Homebrew, est pire qu'absent — il marche sur la machine qui l'a fabriqué.
 *  On regarde donc, dans cet ordre : qu'il est là, qu'il est hermétique, **qu'il démarre avec le
 *  fichier de signatures du paquet**, et que son texte de licence voyage avec lui.
 *
 *  ## Ce qu'il ne prétend pas
 *
 *  Il ne dit pas que la chaîne l'APPELLE. Mesuré le 9 novembre : le programme livré
 *  (`moteurs/chaine/moteur.js`) ne contient ni `"sf"`, ni `"-sig"`, ni `"-json"` — aucune
 *  occurrence. Embarquer `sf` met le paquet en accord avec la règle 3.6 et le rend disponible ;
 *  le jour où la chaîne l'appellera est un autre lot.
 *
 *  ## Pourquoi il saute parfois, et le dit
 *
 *  L'application n'est pas dans le dépôt : sur un coureur d'intégration continue, il n'y a rien à
 *  inspecter. Le contrôle saute **en nommant sa raison**, jamais en silence. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const APPLICATION = "/Applications/Liénothèque.app";
const DANS_LE_PAQUET = join(APPLICATION, "Contents/MacOS");
const RESSOURCES = join(APPLICATION, "Contents/Resources/moteurs");
const EPINGLES = join(RACINE, "fixtures/licences-des-moteurs.json");

const siLApplicationEstLa = existsSync(APPLICATION) ? it : it.skip;

/** La version de Siegfried que le dépôt épingle — une seule source, pas un nombre réécrit ici. */
function versionEpinglee(): string {
  const epingles = JSON.parse(readFileSync(EPINGLES, "utf8")) as {
    amont: Record<string, { version: string }>;
  };
  return epingles.amont["siegfried"]!.version;
}

/** Ce qu'un Mach-O charge hors du paquet : `/opt/...` ou `/usr/local/...`, jamais le système. */
function horsDuPaquet(binaire: string): readonly string[] {
  const sortie = execFileSync("otool", ["-L", binaire], { encoding: "utf8" });
  return sortie
    .split("\n")
    .slice(1)
    .map((ligne) => ligne.trim().split(" ")[0] ?? "")
    .filter((chemin) => chemin.startsWith("/opt/") || chemin.startsWith("/usr/local/"));
}

describe("Siegfried voyage dans le paquet et y démarre (D21)", () => {
  it("le dépôt épingle une version de Siegfried", () => {
    expect(versionEpinglee()).toMatch(/^\d+\.\d+\.\d+$/u);
  });

  it("tauri.conf.json le déclare en binaire annexe, et ses signatures en ressource", () => {
    // Le paquet ne porte que ce que la configuration nomme : c'est elle qui décidait l'absence.
    const conf = JSON.parse(readFileSync(join(RACINE, "apps/app/src-tauri/tauri.conf.json"), "utf8")) as {
      bundle: { externalBin: readonly string[]; resources: Readonly<Record<string, string>> };
    };
    expect(conf.bundle.externalBin).toContain("moteurs/bin/sf");
    expect(Object.keys(conf.bundle.resources)).toContain("moteurs/siegfried");
  });

  siLApplicationEstLa("l'application installée porte sf et son fichier de signatures", () => {
    const sf = join(DANS_LE_PAQUET, "sf");
    expect(existsSync(sf), `${sf} : refabriquer l'application après la préparation`).toBe(true);
    const signature = join(RESSOURCES, "siegfried/default.sig");
    expect(existsSync(signature), signature).toBe(true);
    expect(readFileSync(signature).byteLength).toBeGreaterThan(1000);
  });

  siLApplicationEstLa("le sf du paquet ne charge rien hors du paquet", () => {
    // Un binaire qui démarre ici en chargeant Homebrew ne démarrerait pas chez un testeur.
    expect(horsDuPaquet(join(DANS_LE_PAQUET, "sf"))).toEqual([]);
  });

  siLApplicationEstLa("le sf du paquet démarre AVEC les signatures du paquet", () => {
    // Sans `-sig`, Siegfried cherche ses signatures dans le dossier personnel de l'utilisateur et
    // s'arrête net. Le contrôle doit donc éprouver l'appel que le produit ferait, pas un appel nu.
    const signature = join(RESSOURCES, "siegfried/default.sig");
    const dit = execFileSync(join(DANS_LE_PAQUET, "sf"), ["-sig", signature, "-version"], {
      encoding: "utf8",
    });
    expect(dit).toContain(`siegfried ${versionEpinglee()}`);
  });

  siLApplicationEstLa("son texte de licence voyage avec lui", () => {
    const dossier = join(RESSOURCES, "licences", `siegfried-${versionEpinglee()}`);
    expect(existsSync(dossier), dossier).toBe(true);
    const textes = readdirSync(dossier);
    expect(textes.length).toBeGreaterThan(0);
  });

  siLApplicationEstLa("sf démarre SANS signatures en échouant, et non en inventant", () => {
    // La preuve que le `-sig` du contrôle précédent sert à quelque chose : sans lui, l'outil
    // s'arrête. Un contrôle qui ne montrerait pas cela laisserait croire que `-sig` est décoratif.
    let arrete = false;
    try {
      execFileSync(join(DANS_LE_PAQUET, "sf"), ["-version"], { stdio: "pipe", env: { HOME: "/var/empty" } });
    } catch {
      arrete = true;
    }
    expect(arrete, "sans son fichier de signatures, Siegfried doit s'arrêter").toBe(true);
  });
});
