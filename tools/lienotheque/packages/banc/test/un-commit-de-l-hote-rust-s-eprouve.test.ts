// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  DOSSIER_RUST,
  EPREUVES_RUST,
  PRIX_MESURE,
  refusDeLEcartAuDisque,
  refusDesEpreuvesRust,
  rustAEprouver,
  type EpreuveRust,
} from "../src/epreuve-rust.js";

/** Lot prioritaire du 16 novembre 2026 — **un commit qui touche l'hôte Rust s'éprouve avant
 *  d'exister** : la suite entière et tous les exemples.
 *
 *  Demandé par Christophe le jour même : « C'est la troisième erreur Rust découverte après le
 *  push. » La dernière : `Refus` avait remplacé une `String` dans un rappel, douze endroits
 *  formataient encore l'ancien type, et j'avais poussé sur **165 contrôles verts** de
 *  `cargo test --lib` — qui **ne compile aucun exemple**.
 *
 *  Le prix a été mesuré avant d'être imposé, sur le cas le plus coûteux (une source de l'hôte
 *  vient de changer) : **9 s** pour les exemples, **45 s** pour la suite entière, **54 s** en tout,
 *  et seulement pour les commits qui touchent ce dossier. */

const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

describe("un commit qui touche l'hôte Rust s'éprouve (lot prioritaire du 16 novembre 2026)", () => {
  describe("quels chemins déclenchent l'épreuve", () => {
    it("retient tout ce qui est sous l'hôte, et rien d'autre", () => {
      const vus = rustAEprouver([
        "apps/app/src-tauri/src/file.rs",
        "apps/app/src-tauri/Cargo.toml",
        "apps/app/src-tauri/outils/preparer-moteurs.py",
        "apps/app/src-tauri/README.md",
        "apps/app/src/App.tsx",
        "packages/banc/src/epreuve-rust.ts",
        "docs/file-des-lots.md",
      ]);
      // `outils/*.py` fabrique les moteurs que la suite emploie, et `Cargo.toml` décide de ce qui
      // compile : un filtre sur `src/` aurait laissé passer la moitié des causes.
      expect(vus).toEqual([
        "apps/app/src-tauri/src/file.rs",
        "apps/app/src-tauri/Cargo.toml",
        "apps/app/src-tauri/outils/preparer-moteurs.py",
        "apps/app/src-tauri/README.md",
      ]);
      // `apps/app/src/` n'est pas `apps/app/src-tauri/` : l'écran ne paie pas le prix de l'hôte.
      expect(rustAEprouver(["apps/app/src/App.tsx"])).toEqual([]);
    });

    it("ne lance rien quand le commit ne touche pas l'hôte", () => {
      const jamais = (): never => {
        throw new Error("aucune épreuve ne doit partir : le commit ne touche pas l'hôte Rust");
      };
      expect(refusDesEpreuvesRust([], jamais)).toEqual([]);
    });
  });

  describe("les deux épreuves, et pourquoi jamais une seule", () => {
    it("lance la suite ET les exemples, dans cet ordre, avec le manifeste de l'hôte", () => {
      expect(EPREUVES_RUST).toHaveLength(2);
      const commandes = EPREUVES_RUST.map((une) => `${une.programme} ${une.arguments.join(" ")}`);
      expect(commandes[0]).toBe(`cargo build --manifest-path ${DOSSIER_RUST}Cargo.toml --examples`);
      expect(commandes[1]).toBe(`cargo test --manifest-path ${DOSSIER_RUST}Cargo.toml`);
      // Ni `--lib`, ni `--release` : `--lib` est la faute du jour, et `--release` triplerait le prix.
      expect(commandes.join(" ")).not.toContain("--lib");
      expect(commandes.join(" ")).not.toContain("--release");
    });

    it("lance la seconde même quand la première échoue, et nomme les deux", () => {
      // La faute du 16 novembre, exactement : les exemples cassés ET une suite verte. Un crochet
      // qui s'arrête à la première ferait recommencer le commit deux fois.
      const lances: string[] = [];
      const refus = refusDesEpreuvesRust(["apps/app/src-tauri/src/file.rs"], (epreuve: EpreuveRust) => {
        lances.push(epreuve.nom);
        return { code: 101, sortie: `erreur de ${epreuve.nom}` };
      });
      expect(lances).toEqual(["compiler tous les exemples", "la suite entière"]);
      expect(refus).toHaveLength(2);
    });

    it("porte la commande et la fin de la sortie, pour qu'un refus montre sa cause", () => {
      const refus = refusDesEpreuvesRust(["apps/app/src-tauri/src/file.rs"], (epreuve: EpreuveRust) =>
        epreuve.nom === "la suite entière"
          ? { code: 0, sortie: "" }
          : { code: 101, sortie: "ligne ignorée\nerror[E0277]: `Refus` doesn't implement `std::fmt::Display`" },
      );
      expect(refus).toHaveLength(1);
      expect(refus[0]).toContain("compiler tous les exemples");
      expect(refus[0]).toContain("cargo build --manifest-path");
      expect(refus[0]).toContain("E0277");
      expect(refus[0], "un code de sortie nu n'apprend rien").toContain("code 101");
    });

    it("se tait quand les deux passent", () => {
      expect(refusDesEpreuvesRust(["apps/app/src-tauri/src/file.rs"], () => ({ code: 0, sortie: "" }))).toEqual([]);
    });
  });

  describe("l'écart entre l'index et le disque", () => {
    it("refuse de juger quand cargo ne verrait pas le commit", () => {
      // cargo compile le DISQUE, ce crochet juge l'INDEX. S'ils diffèrent sous l'hôte, le verdict
      // ne décrit pas le commit : c'est la classe « mesure fausse », et elle se refuse.
      const refus = refusDeLEcartAuDisque(["apps/app/src-tauri/src/moteur.rs", "docs/file-des-lots.md"]);
      expect(refus).toHaveLength(1);
      expect(refus[0]).toContain("apps/app/src-tauri/src/moteur.rs");
      expect(refus[0], "le document modifié hors index n'a rien à voir avec cargo").not.toContain("file-des-lots");
    });

    it("ne dit rien quand tout ce qui bouge sous l'hôte est indexé", () => {
      expect(refusDeLEcartAuDisque(["docs/file-des-lots.md", "apps/app/src/App.tsx"])).toEqual([]);
    });
  });

  it("le prix est une donnée, mesurée et contredisible", () => {
    expect(PRIX_MESURE.secondes, "le prix du crochet, relevé et non supposé").toBeGreaterThan(0);
    expect(PRIX_MESURE.commentaire).toContain("16 novembre 2026");
  });

  /** En conditions réelles : le vrai juge, sur un dépôt fabriqué qui porte un chemin de l'hôte.
   *
   *  Ce dépôt n'a pas de `Cargo.toml` : l'épreuve échoue donc pour cette raison-là, et c'est
   *  exactement ce qu'on veut prouver ici — que la mécanique **part**. La justesse de la décision
   *  est éprouvée au-dessus, en pur. */
  const JUGE = fileURLToPath(new URL("../scripts/avant-commit.ts", import.meta.url));
  const OUTIL = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

  function depot(fichiers: Record<string, string>): string {
    const bac = mkdtempSync(join(tmpdir(), "epreuve-rust-"));
    bacs.push(bac);
    execFileSync("git", ["init", "--quiet"], { cwd: bac });
    mkdirSync(join(bac, "fixtures"), { recursive: true });
    writeFileSync(
      join(bac, "fixtures/termes-de-domaine.json"),
      JSON.stringify({ zones: [{ chemin: "paquet/src" }], termes: ["thérapie"], exceptions: [] }),
    );
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      mkdirSync(join(bac, chemin, ".."), { recursive: true });
      writeFileSync(join(bac, chemin), contenu);
    }
    execFileSync("git", ["add", "-A"], { cwd: bac });
    return bac;
  }

  const juger = (bac: string): { readonly code: number; readonly dit: string } => {
    try {
      return { code: 0, dit: execFileSync(OUTIL, [JUGE, "--racine", bac], { encoding: "utf8", stdio: "pipe" }) };
    } catch (souci) {
      const echec = souci as { status?: number; stdout?: string; stderr?: string };
      return { code: echec.status ?? -1, dit: `${echec.stdout ?? ""}${echec.stderr ?? ""}` };
    }
  };

  it("refuse en conditions réelles un commit de l'hôte dont l'épreuve échoue", () => {
    const verdict = juger(depot({ "apps/app/src-tauri/src/file.rs": "pub fn rien() {}\n" }));
    expect(verdict.code, "le crochet doit refuser, pas seulement avertir").toBe(1);
    expect(verdict.dit).toContain("l'hôte Rust");
  });

  it("ne fait pas payer l'épreuve à un commit qui ne touche pas l'hôte", () => {
    const verdict = juger(depot({ "paquet/src/index.ts": "export const rien = 1;\n" }));
    expect(verdict.code).toBe(0);
    expect(verdict.dit).toContain("rien à redire");
    expect(verdict.dit, "aucune épreuve Rust ne doit être nommée ici").not.toContain("hôte Rust");
  });
});
