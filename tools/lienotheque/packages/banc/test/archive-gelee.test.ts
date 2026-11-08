// @vitest-environment node
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decisionsSansSommaire, ecartsDesArchivesGelees, gelDesArchives } from "../src/archive-gelee.js";

/** L'ancien registre est gelé, et une mécanique le tient.
 *
 *  Une règle écrite ne suffit pas : elle était écrite pour `git add -A`, pour `git stash`, pour les
 *  délais — et chaque fois quelqu'un est passé outre sans le vouloir. Ici, le contrôle complet
 *  rougit, nomme le fichier, et dit où écrire à la place. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

describe("l'ancienne archive des décisions ne change plus", () => {
  it("ne trouve aucun écart dans ce dépôt", () => {
    expect(ecartsDesArchivesGelees(RACINE)).toEqual([]);
  });

  it("gèle au moins l'ancien registre, et dit où écrire désormais", () => {
    const gel = gelDesArchives(RACINE);
    expect(gel.archives.map((a) => a.chemin)).toContain("docs/decisions.md");
    // L'archive doit ANNONCER son gel : une empreinte qui garde un fichier muet laisserait
    // quelqu'un y écrire de bonne foi, et ne le lui dirait qu'au contrôle complet.
    const tete = readFileSync(join(RACINE, "docs/decisions.md"), "utf8").slice(0, 2000);
    expect(tete).toMatch(/ARCHIVE GELÉE/u);
    expect(tete).toMatch(/docs\/decisions\/AAAA-MM-JJ-sujet\.md/u);
  });

  it("voit un octet ajouté à une archive gelée", () => {
    const bac = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
    try {
      mkdirSync(join(bac, "docs"), { recursive: true });
      copyFileSync(join(RACINE, "docs/decisions.md"), join(bac, "docs/decisions.md"));
      const gel = gelDesArchives(RACINE);
      expect(ecartsDesArchivesGelees(bac, gel), "la copie fidèle ne doit rien signaler").toEqual([]);
      appendFileSync(join(bac, "docs/decisions.md"), "\n");
      const ecarts = ecartsDesArchivesGelees(bac, gel);
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain("octets au lieu des");
      expect(ecarts[0], "et dit où écrire à la place").toContain("docs/decisions/AAAA-MM-JJ-sujet.md");
    } finally {
      execFileSync("rm", ["-r", bac]);
    }
  });

  it("voit un contenu changé à taille égale", () => {
    const bac = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
    try {
      mkdirSync(join(bac, "docs"), { recursive: true });
      const octets = readFileSync(join(RACINE, "docs/decisions.md"));
      // Un octet remplacé, pas ajouté : une comparaison par la seule taille passerait à côté.
      const change = Buffer.from(octets);
      change[change.length - 2] = change[change.length - 2] === 32 ? 46 : 32;
      writeFileSync(join(bac, "docs/decisions.md"), change);
      const ecarts = ecartsDesArchivesGelees(bac, gelDesArchives(RACINE));
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain("même taille, autre contenu");
    } finally {
      execFileSync("rm", ["-r", bac]);
    }
  });

  it("refuse un gel qui ne garde rien", () => {
    expect(ecartsDesArchivesGelees(RACINE, { archives: [] })[0]).toContain("ne garde rien");
  });
});

describe("le sommaire des décisions nomme chaque décision, et rien d'autre", () => {
  it("n'oublie aucun fichier et n'en invente aucun", () => {
    expect(decisionsSansSommaire(RACINE)).toEqual([]);
  });

  it("voit une décision que le sommaire oublie", () => {
    const dossier = join(RACINE, "docs/decisions");
    const intrus = join(dossier, "2099-01-01-intrus-du-controle.md");
    expect(existsSync(intrus), "le bac doit être propre avant l'essai").toBe(false);
    try {
      writeFileSync(intrus, "# intrus\n");
      const manques = decisionsSansSommaire(RACINE);
      expect(manques).toHaveLength(1);
      expect(manques[0]).toContain("absent du sommaire");
    } finally {
      execFileSync("rm", ["-f", intrus]);
    }
    expect(decisionsSansSommaire(RACINE), "et le dossier est rendu intact").toEqual([]);
  });
});
