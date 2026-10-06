// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BATTEMENT_VERROU_S, DELAI_ENTRE_TENTATIVES_S, EXPIRATION_VERROU_S, Travail } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { annuler, avancer, battreSiDu, dejaEnFile, echouer, mettreEnPause, prendre, prochain, repriseA, reprenable, reprendre } from "../src/travaux.js";

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const T0 = new Date("2026-10-03T10:00:00Z");
const plus = (s: number): Date => new Date(T0.getTime() + s * 1000);

const neuf = (extra: Record<string, unknown> = {}) =>
  Travail.parse({
    id: id(1),
    outil: { nom: "transcripteur", version: "1.0.0" },
    versionCible: id(2),
    etat: "en_file",
    tentative: 1,
    progression: 0,
    creeLe: T0.toISOString(),
    majLe: T0.toISOString(),
    ...extra,
  });

describe("file de travaux : persistée avant de commencer (JOB-01)", () => {
  it("naît en file, sans bail ni point de reprise", () => {
    const travail = neuf();
    expect(travail.etat).toBe("en_file");
    expect(travail.verrou).toBeUndefined();
    expect(repriseA(travail)).toBe(0);
    expect(reprenable(travail, T0)).toBe(true);
  });

  it("annonce où il s'exécute (PLT-04)", () => {
    expect(neuf().lieu).toBe("application");
    expect(neuf({ lieu: "navigateur" }).lieu).toBe("navigateur");
    expect(Travail.safeParse({ ...neuf(), lieu: "ailleurs" }).success).toBe(false);
  });
});

describe("bail renouvelé (JOB-02)", () => {
  it("expire quinze secondes après le dernier battement", () => {
    const pris = prendre(neuf(), id(9), T0);
    expect(pris.etat).toBe("en_cours");
    expect(reprenable(pris, plus(EXPIRATION_VERROU_S - 1))).toBe(false);
    expect(reprenable(pris, plus(EXPIRATION_VERROU_S))).toBe(true);
  });

  it("ne bat pas avant l'heure, et repousse d'autant quand il bat", () => {
    const pris = prendre(neuf(), id(9), T0);
    expect(battreSiDu(pris, id(9), plus(BATTEMENT_VERROU_S - 1))).toBeUndefined();

    const battu = battreSiDu(pris, id(9), plus(BATTEMENT_VERROU_S));
    expect(battu).toBeDefined();
    expect(reprenable(battu!, plus(BATTEMENT_VERROU_S + EXPIRATION_VERROU_S - 1))).toBe(false);
    expect(reprenable(battu!, plus(BATTEMENT_VERROU_S + EXPIRATION_VERROU_S))).toBe(true);
  });

  it("compte une tentative de plus quand il reprend un travail entamé", () => {
    const entame = avancer(prendre(neuf(), id(9), T0), 10, "lot", 100, plus(1));
    const repris = prendre(entame, id(8), plus(EXPIRATION_VERROU_S + 1));
    expect(repris.tentative).toBe(2);
    expect(repriseA(repris)).toBe(10);
  });

  it("refuse d'être pris deux fois tant que le bail court", () => {
    const pris = prendre(neuf(), id(9), T0);
    expect(() => prendre(pris, id(8), plus(1))).toThrow(/non reprenable/i);
  });
});

describe("points de reprise et fin (JOB-03)", () => {
  it("avance sans tout refaire, puis termine en libérant son bail", () => {
    let travail = prendre(neuf(), id(9), T0);
    travail = avancer(travail, 50, "page", 100, plus(1));
    expect(travail.progression).toBe(0.5);
    expect(travail.etat).toBe("en_cours");

    travail = avancer(travail, 100, "page", 100, plus(2));
    expect(travail.etat).toBe("termine");
    expect(travail.progression).toBe(1);
    expect(travail.verrou).toBeUndefined();
    expect(reprenable(travail, plus(10_000))).toBe(false);
  });
});

describe("idempotence (JOB-04)", () => {
  it("retrouve le travail déjà en file plutôt que d'en créer un second", () => {
    const en_file = neuf({ empreinteEntree: "abc" });
    const termine = neuf({ id: id(3), empreinteEntree: "abc", etat: "termine", progression: 1 });
    expect(dejaEnFile([en_file], "abc")?.id).toBe(id(1));
    expect(dejaEnFile([termine], "abc"), "un travail terminé ne bloque pas un nouveau").toBeUndefined();
    expect(dejaEnFile([en_file], "autre")).toBeUndefined();
  });
});

describe("erreurs enregistrées (JOB-05)", () => {
  it("retient la cause, les éléments touchés et si la reprise est possible", () => {
    const echoue = echouer(prendre(neuf(), id(9), T0), { cause: "page illisible", elements: ["page 12"], reprisePossible: true }, plus(1));
    expect(echoue.etat).toBe("en_echec_recuperable");
    expect(echoue.erreur?.cause).toBe("page illisible");
    expect(echoue.verrou, "un travail en échec libère son bail").toBeUndefined();
    // Il ne repart pas dans la seconde : sans délai, les trois tentatives se consommeraient avant
    // que la cause ait eu le temps de disparaître (JOB-05).
    expect(reprenable(echoue, plus(2))).toBe(false);
    expect(reprenable(echoue, plus(1 + DELAI_ENTRE_TENTATIVES_S))).toBe(true);

    const definitif = echouer(neuf(), { cause: "format refusé", elements: [], reprisePossible: false }, plus(1));
    expect(definitif.etat).toBe("en_echec_definitif");
    expect(reprenable(definitif, plus(10_000))).toBe(false);
  });

  it("reste conforme à son contrat : un échec sans cause est refusé", () => {
    expect(Travail.safeParse({ ...neuf(), etat: "en_echec_recuperable" }).success).toBe(false);
  });
});

describe("pause et annulation (JOB-08)", () => {
  it("mettent le travail de côté sans rien activer ni désactiver", () => {
    const enCours = avancer(prendre(neuf(), id(9), T0), 50, "lot", 100, plus(1));

    const pause = mettreEnPause(enCours, plus(2));
    expect(pause.etat).toBe("en_pause");
    expect(pause.verrou).toBeUndefined();
    expect(reprenable(pause, plus(10_000)), "une pause attend une reprise explicite").toBe(false);
    expect(repriseA(pause), "le point de reprise est intact").toBe(50);
    expect(pause.versionCible, "la version cible ne bouge pas").toBe(enCours.versionCible);

    const reprise = reprendre(pause, plus(3));
    expect(reprise.etat).toBe("en_file");
    expect(reprenable(reprise, plus(3))).toBe(true);

    const annule = annuler(enCours, plus(2));
    expect(annule.etat).toBe("annule");
    expect(reprenable(annule, plus(10_000))).toBe(false);
  });
});

describe("ordre de service", () => {
  it("reprend d'abord ce qui était entamé, puis sert les plus anciens", () => {
    const vieux = neuf({ id: id(1), creeLe: "2026-10-01T00:00:00Z" });
    const recent = neuf({ id: id(2), creeLe: "2026-10-02T00:00:00Z" });
    const entame = neuf({ id: id(3), creeLe: "2026-10-03T00:00:00Z", pointReprise: { unite: "lot", valeur: 7 }, progression: 0.07 });

    expect(prochain([recent, vieux, entame], T0)?.id).toBe(id(3));
    expect(prochain([recent, vieux], T0)?.id).toBe(id(1));
    expect(prochain([], T0)).toBeUndefined();
  });
});

describe("un seul endroit pour la cadence du bail", () => {
  it("le noyau ne réécrit pas les constantes : il les reprend du contrat", () => {
    const source = readFileSync(fileURLToPath(new URL("../src/travaux.ts", import.meta.url)), "utf8");
    expect(source).toMatch(/import \{[\s\S]*BATTEMENT_VERROU_S[\s\S]*\} from "@lienotheque\/contrats"/);
    expect(source.replace(/BATTEMENT_VERROU_S|EXPIRATION_VERROU_S/g, "")).not.toMatch(/\b(5|15)\s*\*\s*1000\b/);
  });

  // Ce contrôle comparait deux copies de la cadence, l'une en TypeScript, l'autre en Rust. Il n'y
  // a plus de copies à comparer : les deux côtés lisent `packages/contrats/limites.json`. Ce qui
  // se vérifie maintenant, c'est que l'hôte va bien la chercher là, et pas qu'il la redit juste.
  it("l'hôte de bureau lit la même donnée, au lieu de la redire", () => {
    const rust = readFileSync(fileURLToPath(new URL("../../../apps/app/src-tauri/src/travail.rs", import.meta.url)), "utf8");
    expect(rust, "le bail vient des limites, pas d'un littéral").toMatch(/LIMITES\.battement_verrou_s/);
    expect(rust).toMatch(/LIMITES\.expiration_verrou_s/);

    const limites = readFileSync(fileURLToPath(new URL("../../../apps/app/src-tauri/src/limites.rs", import.meta.url)), "utf8");
    expect(limites, "et les limites viennent du fichier que le TypeScript lit aussi").toMatch(
      /include_str!\("\.\.\/\.\.\/\.\.\/\.\.\/packages\/contrats\/limites\.json"\)/,
    );
  });
});
