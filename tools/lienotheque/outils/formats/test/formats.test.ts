// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Arrivee, IdentificationFormat } from "@lienotheque/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accueillir,
  decrireLecteur,
  empreinteDe,
  formatParSignature,
  identifier,
  registreVide,
  siegfriedDisponible,
  tableauDesFormats,
  typesMimeDe,
} from "../src/index.js";

let dossier = "";
const chemin = (nom: string) => join(dossier, nom);

/** Un PDF minimal mais réel, et quelques en-têtes vrais : on identifie par le contenu. */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(64).fill(0)]);

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-formats-"));
  writeFileSync(chemin("document.pdf"), PDF);
  writeFileSync(chemin("mal-nomme.txt"), PDF); // un PDF déguisé en texte
  writeFileSync(chemin("image.png"), PNG);
  writeFileSync(chemin("mystere.xyz"), Buffer.from("rien de connu ici, vraiment rien", "utf8"));
});

afterAll(() => rmSync(dossier, { recursive: true, force: true }));

const lecteurPdf = decrireLecteur({
  nom: "lecteur-pdf",
  version: "1.0.0",
  pronoms: ["fmt/19"],
  typesMime: ["application/pdf"],
  capacites: { texte: true, positions: true, pages: true, images: true, metadonnees: true },
});

const lecteurImage = decrireLecteur({
  nom: "lecteur-image",
  version: "1.0.0",
  pronoms: ["fmt/13"],
  typesMime: ["image/png", "image/jpeg"],
  capacites: { images: true, metadonnees: true },
});

describe("identification par le contenu (FMT-01)", () => {
  it("reconnaît un format par ses octets, pas par son nom", async () => {
    const identification = await identifier(chemin("document.pdf"));
    expect(IdentificationFormat.safeParse(identification).success).toBe(true);
    expect(identification.typeMime).toBe("application/pdf");
    expect(identification.preuve).not.toBe("extension");
    expect(identification.extensionTrompeuse).toBe(false);
  });

  it("démasque un fichier mal nommé : le contenu l'emporte", async () => {
    const identification = await identifier(chemin("mal-nomme.txt"));
    expect(identification.typeMime).toBe("application/pdf");
    expect(identification.extensionTrompeuse, "l'extension contredit le contenu").toBe(true);
  });

  it("donne la même empreinte au même contenu, quel que soit le nom", async () => {
    expect(await empreinteDe(chemin("document.pdf"))).toBe(await empreinteDe(chemin("mal-nomme.txt")));
  });

  it("avoue ne pas savoir plutôt que de deviner", async () => {
    const identification = await identifier(chemin("mystere.xyz"));
    expect(identification.preuve).toBe("inconnu");
    expect(identification.pronom).toBeUndefined();
    expect(identification.typeMime).toBe("application/octet-stream");
  });

  it("lit les signatures sans toucher au disque", async () => {
    expect(formatParSignature(await readFile(chemin("image.png")))?.typeMime).toBe("image/png");
    expect(formatParSignature(Buffer.from("texte ordinaire"))).toBeUndefined();
  });

  it("nomme l'outil qui a tranché, et ne porte un identifiant de registre que s'il en a un", async () => {
    const identification = await identifier(chemin("document.pdf"));
    if (siegfriedDisponible()) {
      expect(identification.outil).toBe("siegfried");
      expect(identification.pronom).toMatch(/^(fmt|x-fmt)\/\d+$/);
    } else {
      expect(identification.outil).toBe("signatures intégrées");
      expect(identification.pronom, "sans registre, pas d'identifiant PRONOM inventé").toBeUndefined();
    }
  });
});

describe("lecteurs de format en modules (FMT-02)", () => {
  it("chaque lecteur déclare ce qu'il sait faire", () => {
    expect(lecteurPdf.capacites.positions).toBe(true);
    expect(lecteurImage.capacites.texte).toBe(false);
    expect(typesMimeDe(lecteurImage)).toContain("image/jpeg");
  });

  it("en ajouter un ne touche pas les autres", () => {
    const registre = registreVide();
    registre.inscrire(lecteurPdf);
    expect(registre.lecteurs()).toHaveLength(1);

    registre.inscrire(lecteurImage);
    expect(registre.lecteurs().map((l) => l.nom)).toEqual(["lecteur-pdf", "lecteur-image"]);

    registre.inscrire({ ...lecteurPdf, version: "2.0.0" });
    expect(registre.lecteurs(), "réinscrire remplace, sans doubler").toHaveLength(2);
    expect(registre.lecteurs()[0]?.version).toBe("2.0.0");
  });
});

describe("arrivée d'un fichier (FMT-04, FMT-08)", () => {
  const registre = registreVide();
  registre.inscrire(lecteurPdf);
  registre.inscrire(lecteurImage);

  it("accepte un format pris en charge et nomme son lecteur", async () => {
    const arrivee = await accueillir(chemin("document.pdf"), registre, { dossierSources: join(dossier, "sources") });
    expect(Arrivee.safeParse(arrivee).success).toBe(true);
    expect(arrivee.priseEnCharge).toBe("complete");
    expect(arrivee.lecteur).toBe("lecteur-pdf");
  });

  it("dit « partielle » quand le lecteur ne sait pas tout faire", async () => {
    const arrivee = await accueillir(chemin("image.png"), registre, { dossierSources: join(dossier, "sources") });
    expect(arrivee.priseEnCharge).toBe("partielle");
    expect(arrivee.lecteur).toBe("lecteur-image");
  });

  it("ne refuse jamais un format inconnu : il devient une pièce jointe", async () => {
    const arrivee = await accueillir(chemin("mystere.xyz"), registre, { dossierSources: join(dossier, "sources") });
    expect(arrivee.priseEnCharge).toBe("piece_jointe");
    expect(arrivee.lecteur).toBeUndefined();
    expect(arrivee.identification.empreinte, "une pièce jointe garde son empreinte").toMatch(/^[0-9a-f]{64}$/);
  });

  it("laisse l'original intact, empreinte relue après copie", async () => {
    const arrivee = await accueillir(chemin("document.pdf"), registre, { dossierSources: join(dossier, "sources") });
    expect(arrivee.originalIntact).toBe(true);
    expect(await empreinteDe(join(dossier, "sources", arrivee.identification.empreinte))).toBe(arrivee.identification.empreinte);
  });

  it("dresse le tableau de ce qui est pris en charge (FMT-10)", async () => {
    const arrivees = await Promise.all(
      ["document.pdf", "image.png", "mystere.xyz"].map((nom) =>
        accueillir(chemin(nom), registre, { dossierSources: join(dossier, "sources") }),
      ),
    );
    const tableau = tableauDesFormats(arrivees);
    expect(tableau).toHaveLength(3);
    expect(tableau.find((l) => l.typeMime === "application/pdf")?.priseEnCharge).toBe("complete");
    expect(tableau.find((l) => l.typeMime === "application/octet-stream")?.priseEnCharge).toBe("piece_jointe");
  });
});
