// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  copieDesReglagesActifs,
  copiesDuDepot,
  ecartsDeReglages,
  REGLAGES_SURVEILLES,
  type CopieDuDepot,
} from "../src/reglages-actifs.js";

/** Les réglages actifs sont ceux que le dépôt porte.
 *
 *  ## Pourquoi deux copies existent
 *
 *  Le travail se fait dans une copie liée du dépôt, pour qu'un basculement de branche d'une autre
 *  session ne change pas celle-ci sous les pieds. Mais Claude Code lit ses réglages dans le
 *  dossier de la **session**, qui est une autre copie. Les deux existent par construction.
 *
 *  ## Pourquoi un contrôle, et non une vérification à la main
 *
 *  Un script qu'on lance quand on y pense dépend de l'attention, et ce n'est plus un garde-fou —
 *  c'est la remarque de Christophe du 7 novembre 2026, et elle vaut pour celui-ci comme pour les
 *  autres. Il tourne donc dans le contrôle complet.
 *
 *  **Un réglage divergent ne se signale pas tout seul : il agit, simplement, autrement.**
 *
 *  ## Et une seule copie est comparée
 *
 *  Les huit copies du dépôt ne sont pas comparables entre elles : celle qui est posée sur un
 *  ancien commit porte légitimement une autre version du crochet. Seule compte la copie où une
 *  session lit ses réglages. C'est la remarque de Christophe du 7 novembre, la seconde sur ce
 *  fichier : un garde-fou qui accuse à tort finit désarmé. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

/** Un bac à sable de copies factices : chacune reçoit le contenu donné pour `.claude/x`. */
function bacDeCopies(contenus: Readonly<Record<string, string>>): {
  readonly dossier: string;
  readonly projet: (nom: string) => string;
  readonly ranger: () => void;
} {
  const dossier = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
  const projet = (nom: string): string => join(dossier, nom, "tools/lienotheque");
  for (const [nom, contenu] of Object.entries(contenus)) {
    const cible = join(projet(nom), ".claude/x");
    execFileSync("mkdir", ["-p", dirname(cible)]);
    execFileSync("sh", ["-c", `printf '%s' "$1" > "$2"`, "sh", contenu, cible]);
  }
  return { dossier, projet, ranger: () => execFileSync("rm", ["-r", dossier]) };
}

const copie = (projet: string, etat: Partial<CopieDuDepot> = {}): CopieDuDepot => ({
  projet,
  tete: "0".repeat(40),
  principale: false,
  ...etat,
});

describe("les réglages actifs sont ceux que le dépôt porte", () => {
  it("ne trouve aucun écart dans la copie où la session lit ses réglages", () => {
    expect(ecartsDeReglages(RACINE)).toEqual([]);
  });

  it("nomme les copies du dépôt sans les deviner, et désigne UNE principale", () => {
    const copies = copiesDuDepot(RACINE);
    expect(copies.length).toBeGreaterThan(0);
    // Chaque chemin rendu existe : la liste vient de git, pas d'une construction de chemin.
    for (const c of copies) expect(existsSync(c.projet), c.projet).toBe(true);
    expect(copies.filter((c) => c.principale)).toHaveLength(1);

    // La principale est bien celle qui porte le dossier git commun — nommée par git.
    const commun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: RACINE,
      encoding: "utf8",
    }).trim();
    const principale = copies.find((c) => c.principale);
    expect(principale?.projet.startsWith(dirname(commun))).toBe(true);
  });

  it("surveille des fichiers qui existent vraiment", () => {
    for (const relatif of REGLAGES_SURVEILLES)
      expect(existsSync(join(RACINE, relatif)), relatif).toBe(true);
  });

  it("ne fait PAS rougir une copie posée sur un ancien commit, même avec une autre version", () => {
    // Une copie de bissectage, ou le travail d'une autre session, porte la version que SON commit
    // contient. Rougir là-dessus, c'est accuser git d'avoir fait son travail.
    const bac = bacDeCopies({ versionnee: "neuf", principale: "neuf", ancienne: "vieux" });
    try {
      const copies = [
        copie(bac.projet("principale"), { principale: true, branche: "refs/heads/main" }),
        copie(bac.projet("ancienne")), // tête détachée, autre commit
      ];
      expect(
        ecartsDeReglages(bac.projet("versionnee"), { copies, surveilles: [".claude/x"] }),
        "la copie sur un ancien commit porte légitimement une autre version",
      ).toEqual([]);

      // Et ce silence vient bien du filtre : la MÊME copie, déclarée principale, fait rougir.
      expect(
        ecartsDeReglages(bac.projet("versionnee"), {
          copies: [copie(bac.projet("ancienne"), { principale: true })],
          surveilles: [".claude/x"],
        }),
      ).toHaveLength(1);
    } finally {
      bac.ranger();
    }
  });

  it("voit un écart d'un seul octet dans la copie qui agit", () => {
    const bac = bacDeCopies({ versionnee: "a", active: "b" });
    try {
      const ecarts = ecartsDeReglages(bac.projet("versionnee"), {
        copies: [copie(bac.projet("active"), { principale: true })],
        surveilles: [".claude/x"],
      });
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain(".claude/x");
    } finally {
      bac.ranger();
    }
  });

  it("ne dit rien d'une copie qui ne porte pas le fichier", () => {
    const bac = bacDeCopies({ versionnee: "a" });
    try {
      execFileSync("mkdir", ["-p", bac.projet("active")]);
      expect(
        ecartsDeReglages(bac.projet("versionnee"), {
          copies: [copie(bac.projet("active"), { principale: true })],
          surveilles: [".claude/x"],
        }),
        "une copie sans réglages n'obéit à aucun réglage : il n'y a rien à redire",
      ).toEqual([]);
    } finally {
      bac.ranger();
    }
  });

  it("se tait quand on se trouve déjà dans la copie principale", () => {
    // Une seule copie en jeu : aucune divergence n'est possible, et se comparer à soi-même ne dit
    // rien. Le contrôle doit le reconnaître, pas comparer un fichier avec lui-même.
    const copies = [copie("/un/dossier", { principale: true })];
    expect(copieDesReglagesActifs(copies, "/un/dossier")).toBeUndefined();
    expect(copieDesReglagesActifs(copies, "/un/autre")).toBe("/un/dossier");
  });

  it("surveille au moins le crochet et ses réglages", () => {
    expect(REGLAGES_SURVEILLES).toContain(".claude/settings.json");
    expect(REGLAGES_SURVEILLES.some((r) => r.includes("refuser-gestes-destructeurs"))).toBe(true);
    // La liste doit porter le contenu des fichiers, pas seulement leurs noms : un contrôle qui
    // vérifierait l'existence sans comparer les octets passerait sur un crochet remplacé.
    expect(readFileSync(join(RACINE, ".claude/settings.json"), "utf8")).toContain("PreToolUse");
  });
});
