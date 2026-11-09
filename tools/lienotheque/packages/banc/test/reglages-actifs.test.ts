// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type AuCommit,
  copieDesReglagesActifs,
  copiesDuDepot,
  type CopieDuDepot,
  ecartsDeReglages,
  REGLAGES_SURVEILLES,
  reglagesDuCommit,
} from "../src/reglages-actifs.js";

/** Les réglages actifs sont ceux que le dépôt porte — et le dépôt, c'est son commit.
 *
 *  ## Pourquoi un contrôle, et non une vérification à la main
 *
 *  Un script qu'on lance quand on y pense dépend de l'attention, et ce n'est plus un garde-fou —
 *  c'est la remarque de Christophe du 7 novembre 2026. Il tourne donc dans le contrôle complet.
 *
 *  **Un réglage divergent ne se signale pas tout seul : il agit, simplement, autrement.**
 *
 *  ## Ce que la dette D19 reprochait à la première version
 *
 *  Elle comparait deux fichiers **du disque**, et appelait l'un « la copie versionnée » alors
 *  qu'aucun fichier de `.claude/` n'était suivi par Git. Remplacer le crochet dans les deux
 *  copies la laissait **verte**. Le contrôle « voit un crochet remplacé dans TOUTES les copies du
 *  disque » ci-dessous est exactement la mutation qu'elle ne tuait pas, et qui la tue.
 *
 *  ## Et une seule copie est comparée
 *
 *  Les copies du dépôt ne sont pas comparables entre elles : celle qui est posée sur un ancien
 *  commit porte légitimement une autre version du crochet. Seule compte la copie où une session
 *  lit ses réglages. C'est la remarque de Christophe du 7 novembre, la seconde sur ce sujet : un
 *  garde-fou qui accuse à tort finit désarmé. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

/** Un bac à sable de copies factices : chacune reçoit le contenu donné pour `.claude/x`. */
function bacDeCopies(contenus: Readonly<Record<string, string>>): {
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
  return { projet, ranger: () => execFileSync("rm", ["-r", dossier]) };
}

const copie = (projet: string, etat: Partial<CopieDuDepot> = {}): CopieDuDepot => ({
  projet,
  tete: "0".repeat(40),
  principale: false,
  ...etat,
});

/** Ce qu'un commit porterait pour `.claude/x`. */
const auCommit = (contenu: string | undefined): ReadonlyMap<string, AuCommit> =>
  new Map<string, AuCommit>([
    [".claude/x", contenu === undefined ? { absent: true } : { octets: Buffer.from(contenu) }],
  ]);

describe("les réglages actifs sont ceux que le dépôt porte (D19)", () => {
  it("ne trouve aucun écart entre le commit et la copie où la session lit ses réglages", () => {
    expect(ecartsDeReglages(RACINE)).toEqual([]);
  });

  it("lit dans le COMMIT, et y trouve chaque réglage surveillé", () => {
    const au = reglagesDuCommit(RACINE);
    expect([...au.keys()]).toEqual([...REGLAGES_SURVEILLES]);
    for (const relatif of REGLAGES_SURVEILLES) {
      const porte = au.get(relatif);
      expect(porte, relatif).toBeDefined();
      expect("absent" in porte!, `${relatif} doit être dans le commit`).toBe(false);
    }
  });

  it("les octets du commit sont ceux du fichier, quand l'arbre est propre", () => {
    const au = reglagesDuCommit(RACINE);
    for (const relatif of REGLAGES_SURVEILLES) {
      const porte = au.get(relatif)!;
      if ("absent" in porte) continue;
      expect(porte.octets.equals(readFileSync(join(RACINE, relatif))), relatif).toBe(true);
    }
  });

  it("nomme les copies du dépôt sans les deviner, et désigne UNE principale", () => {
    const copies = copiesDuDepot(RACINE);
    expect(copies.length).toBeGreaterThan(0);
    // Chaque chemin rendu existe : la liste vient de git, pas d'une construction de chemin.
    for (const c of copies) expect(existsSync(c.projet), c.projet).toBe(true);
    expect(copies.filter((c) => c.principale)).toHaveLength(1);

    const commun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: RACINE,
      encoding: "utf8",
    }).trim();
    expect(copiesDuDepot(RACINE).find((c) => c.principale)?.projet.startsWith(dirname(commun))).toBe(true);
  });

  it("voit un crochet remplacé dans TOUTES les copies du disque, parce que la référence est le commit", () => {
    // La mutation que la première version ne tuait pas : elle comparait deux fichiers du disque,
    // et deux fichiers identiques lui suffisaient — même remplacés tous les deux.
    const bac = bacDeCopies({ principale: "remplace", liee: "remplace" });
    try {
      const copies = [copie(bac.projet("principale"), { principale: true }), copie(bac.projet("liee"))];
      const ecarts = ecartsDeReglages(bac.projet("liee"), {
        copies,
        surveilles: [".claude/x"],
        auCommit: auCommit("ce que le depot porte"),
      });
      expect(ecarts, "le commit dit autre chose que les deux copies").toHaveLength(1);
      expect(ecarts[0]).toContain("que le commit");
    } finally {
      bac.ranger();
    }
  });

  it("rougit quand le commit ne porte pas un réglage surveillé", () => {
    const bac = bacDeCopies({ principale: "quelque chose" });
    try {
      expect(
        ecartsDeReglages(bac.projet("principale"), {
          copies: [copie(bac.projet("principale"), { principale: true })],
          surveilles: [".claude/x"],
          auCommit: auCommit(undefined),
        }),
        "un réglage que le dépôt ne porte pas est précisément la dette D19",
      ).toEqual([".claude/x : absent du commit de cette copie, alors qu'il est surveillé"]);
    } finally {
      bac.ranger();
    }
  });

  it("compare la copie principale MÊME quand on s'y trouve déjà", () => {
    // L'ancienne version se taisait dans ce cas, n'ayant rien à quoi comparer. Avec le commit pour
    // référence, c'est la comparaison la plus utile : ce qui agit contre ce qui est relu.
    const bac = bacDeCopies({ principale: "autre chose" });
    try {
      const copies = [copie(bac.projet("principale"), { principale: true })];
      expect(copieDesReglagesActifs(copies)).toBe(bac.projet("principale"));
      expect(
        ecartsDeReglages(bac.projet("principale"), {
          copies,
          surveilles: [".claude/x"],
          auCommit: auCommit("ce que le depot porte"),
        }),
      ).toHaveLength(1);
    } finally {
      bac.ranger();
    }
  });

  it("voit un écart d'un seul octet dans la copie qui agit", () => {
    const bac = bacDeCopies({ principale: "a" });
    try {
      const ecarts = ecartsDeReglages(bac.projet("principale"), {
        copies: [copie(bac.projet("principale"), { principale: true })],
        surveilles: [".claude/x"],
        auCommit: auCommit("b"),
      });
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain(".claude/x");
    } finally {
      bac.ranger();
    }
  });

  it("ne fait PAS rougir une copie posée sur un ancien commit, même avec une autre version", () => {
    // Une copie de bissectage, ou le travail d'une autre session, porte la version que SON commit
    // contient. Rougir là-dessus, c'est accuser git d'avoir fait son travail.
    const bac = bacDeCopies({ principale: "neuf", ancienne: "vieux" });
    try {
      const copies = [
        copie(bac.projet("principale"), { principale: true, branche: "refs/heads/main" }),
        copie(bac.projet("ancienne")), // tête détachée, autre commit
      ];
      expect(
        ecartsDeReglages(bac.projet("ancienne"), {
          copies,
          surveilles: [".claude/x"],
          auCommit: auCommit("neuf"),
        }),
        "la copie sur un ancien commit porte légitimement une autre version",
      ).toEqual([]);
    } finally {
      bac.ranger();
    }
  });

  it("ne dit rien d'une copie qui ne porte pas le fichier", () => {
    const bac = bacDeCopies({});
    try {
      execFileSync("mkdir", ["-p", bac.projet("principale")]);
      expect(
        ecartsDeReglages(bac.projet("principale"), {
          copies: [copie(bac.projet("principale"), { principale: true })],
          surveilles: [".claude/x"],
          auCommit: auCommit("ce que le depot porte"),
        }),
        "une copie sans réglages n'obéit à aucun réglage : il n'y a rien à redire",
      ).toEqual([]);
    } finally {
      bac.ranger();
    }
  });

  it("surveille le crochet, ses réglages, et le script de diagnostic", () => {
    expect(REGLAGES_SURVEILLES).toContain(".claude/settings.json");
    expect(REGLAGES_SURVEILLES.some((r) => r.includes("refuser-gestes-destructeurs"))).toBe(true);
    expect(REGLAGES_SURVEILLES.some((r) => r.includes("verifier-reglages"))).toBe(true);
    // La liste doit porter le contenu des fichiers, pas seulement leurs noms : un contrôle qui
    // vérifierait l'existence sans comparer les octets passerait sur un crochet remplacé.
    expect(readFileSync(join(RACINE, ".claude/settings.json"), "utf8")).toContain("PreToolUse");
  });
});
