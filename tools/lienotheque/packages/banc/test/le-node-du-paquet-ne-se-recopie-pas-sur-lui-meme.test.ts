// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/** `preparer-moteur-node.py` embarque le node **de la machine**, jamais celui du paquet (lot 0u).
 *
 *  ## D'où vient ce garde-fou
 *
 *  D'un rouge de l'intégration continue du 16 novembre 2026, et d'une faute à moi. Le lot 0u avait
 *  mis `moteurs/bin` en tête du PATH **avant** cette étape. Le script prend le node du PATH
 *  (`shutil.which`) et l'écrit dans `moteurs/bin/node` : il a donc trouvé **sa propre cible**,
 *  l'a effacée — il efface avant de copier, pour ne pas écrire par-dessus un binaire déjà signé —,
 *  puis a échoué sur `FileNotFoundError`, un message qui ne disait rien de la cause.
 *
 *  L'ordre du workflow est corrigé, et un contrôle le tient. Celui-ci tient l'autre moitié : le
 *  script lui-même refuse, où qu'il soit lancé, parce qu'un PATH se compose aussi à la main.
 *
 *  ## Ce que ce contrôle prouve, et ce qu'il ne prouve pas
 *
 *  Il prouve les deux sens : PATH empoisonné → refus **et fichier intact** ; PATH propre → le
 *  garde-fou ne dit rien et la copie a bien lieu. Il ne mène pas le script jusqu'au bout — cela
 *  demanderait la chaîne, ses sources et ses codecs, c'est-à-dire le dépôt entier. Le bout, lui,
 *  a été constaté à la main le 16 novembre 2026 : 294 Mo de moteurs, sans que le garde-fou parle. */

const SCRIPT = fileURLToPath(new URL("../../../apps/app/src-tauri/outils/preparer-moteur-node.py", import.meta.url));
const DELAI = 180_000;
const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

/** Un `src-tauri` jetable : le script y est copié, donc il y lit son propre dossier `moteurs`,
 *  qu'il calcule depuis `__file__`. Rien du vrai paquet n'est touché. */
function paquetJetable(): { readonly outils: string; readonly node: string } {
  const bac = mkdtempSync(join(tmpdir(), "moteur-node-"));
  bacs.push(bac);
  const outils = join(bac, "src-tauri", "outils");
  const bin = join(bac, "src-tauri", "moteurs", "bin");
  mkdirSync(outils, { recursive: true });
  mkdirSync(bin, { recursive: true });
  copyFileSync(SCRIPT, join(outils, "preparer-moteur-node.py"));
  // Le node « déjà dans le paquet » : son contenu sert de témoin, c'est lui qu'on retrouvera.
  const node = join(bin, "node");
  writeFileSync(node, "#!/bin/sh\necho le node du paquet\n");
  chmodSync(node, 0o755);
  return { outils, node };
}

const lancer = (outils: string, chemin: string): { readonly code: number; readonly dit: string } => {
  const fait = spawnSync("python3", [join(outils, "preparer-moteur-node.py")], {
    encoding: "utf8",
    env: { ...process.env, PATH: chemin },
  });
  return { code: fait.status ?? -1, dit: `${fait.stdout ?? ""}${fait.stderr ?? ""}` };
};

describe("le node du paquet ne se recopie jamais sur lui-même (lot 0u)", () => {
  it(
    "refuse quand le PATH mène à la cible, et laisse le fichier intact",
    () => {
      const { outils, node } = paquetJetable();
      const avant = readFileSync(node, "utf8");
      const bin = join(node, "..");

      const verdict = lancer(outils, `${bin}:${process.env["PATH"] ?? ""}`);

      expect(verdict.code, "le script doit s'arrêter, pas continuer").not.toBe(0);
      expect(verdict.dit).toContain("EST la cible");
      expect(verdict.dit, "le refus doit dire quoi faire").toContain("PATH");
      // Le cœur du rouge de la CI : le fichier avait DISPARU avant que la copie échoue.
      expect(existsSync(node), "la cible a été effacée : c'est exactement le défaut").toBe(true);
      expect(readFileSync(node, "utf8"), "la cible a été réécrite").toBe(avant);
    },
    DELAI,
  );

  it(
    "ne dit rien quand le PATH est propre, et copie bien le node de la machine",
    () => {
      const { outils, node } = paquetJetable();
      // Un node de « machine » minuscule : la copie est alors instantanée, et son contenu se
      // reconnaît. Le script échouera plus loin — `lipo` n'a pas de Mach-O à lire — et c'est
      // justement la preuve qu'il a dépassé le garde-fou.
      const ailleurs = mkdtempSync(join(tmpdir(), "node-machine-"));
      bacs.push(ailleurs);
      const faux = join(ailleurs, "node");
      writeFileSync(faux, "#!/bin/sh\necho le node de la machine\n");
      chmodSync(faux, 0o755);

      const verdict = lancer(outils, `${ailleurs}:${process.env["PATH"] ?? ""}`);

      expect(verdict.dit, "le garde-fou ne doit pas parler : le PATH ne mène pas à la cible").not.toContain("EST la cible");
      expect(readFileSync(node, "utf8"), "le node de la machine n'a pas été copié dans le paquet").toContain(
        "le node de la machine",
      );
    },
    DELAI,
  );

  it("le vrai script est bien celui qu'on éprouve, et non une copie oubliée", () => {
    // Un contrôle qui lirait une copie périmée serait vert pour rien : on compare les octets.
    const { outils } = paquetJetable();
    expect(readFileSync(join(outils, "preparer-moteur-node.py"), "utf8")).toBe(readFileSync(SCRIPT, "utf8"));
    expect(execFileSync("python3", ["-c", "print(1)"], { encoding: "utf8" }).trim()).toBe("1");
  });
});
