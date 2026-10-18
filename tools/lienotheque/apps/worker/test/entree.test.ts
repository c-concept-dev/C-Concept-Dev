import { readFileSync } from "node:fs";
import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { DUREE_SESSION, MOT_DE_REFUS, empreinteDuJeton, etatDe } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { entrer } from "../src/entree.js";
import {
  enrolerUneCle,
  inscrireUnePersonne,
  laCleParIdentifiant,
  laSessionParEmpreinte,
  revoquerLaCle,
} from "../src/qui-entre.js";

/** L'entrée : défi, signature, vérification, session ouverte (SEC-02, étape 4.4).
 *
 *  Le premier test est le plus important de cette étape : **la cérémonie réellement mesurée le
 *  18 octobre ouvre une session, de bout en bout.** Clé publique, données de l'authentificateur,
 *  données du client et signature telles qu'un authentificateur CTAP2 les a produites — rien
 *  d'inventé pour la circonstance.
 *
 *  Le reste éprouve les refus, un par un. Ils se nomment **pour le journal**, et le demandeur
 *  reçoit toujours le même mot : apprendre qu'une signature est illisible plutôt que refusée,
 *  c'est apprendre qu'on a trouvé un défaut. */

const CEREMONIE = JSON.parse(
  readFileSync(new URL("../../../fixtures/ceremonie-webauthn.json", import.meta.url), "utf8"),
) as { spki: string; donneesAuthentificateur: string; donneesClient: string; signature: string };

/** Le défi et l'origine de la cérémonie mesurée, lus dans la fixture et non recopiés. */
const MESURE = JSON.parse(Buffer.from(CEREMONIE.donneesClient, "base64").toString("utf8")) as {
  challenge: string;
  origin: string;
};
const DOMAINE_MESURE = "localhost";

const QUAND = "2026-10-18T09:00:00.000Z";
const MOI = "christophe";
const IDENTIFIANT = "zBh4Vnw";

let registre: ReturnType<typeof baseEnMemoire>;

beforeEach(() => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
});

const unePersonne = async () => {
  const fait = await inscrireUnePersonne(registre, "Christophe", QUAND, MOI);
  if (!fait.fait) throw new Error(fait.raison);
  return fait.valeur;
};

const uneCle = async (personneId: string, clePublique: string, compteur = 0, identifiant = IDENTIFIANT) => {
  const fait = await enrolerUneCle(
    registre,
    { personneId, identifiant, clePublique, compteur, appareil: "Portable" },
    QUAND,
    MOI,
  );
  if (!fait.fait) throw new Error(fait.raison);
  return fait.valeur;
};

/** Pose un défi d'entrée **à une valeur choisie**, ce que `ouvrirUnDefi` ne fait pas — il tire
 *  au hasard, et c'est très bien. Ici on doit coller à la valeur que la cérémonie mesurée porte. */
const poserLeDefi = async (valeur: string, quand = QUAND, usage = "entree") => {
  await registre
    .prepare("INSERT INTO defi (valeur, usage, personne_id, cree_le, expire_le, consomme_le) VALUES (?, ?, NULL, ?, ?, NULL)")
    .bind(valeur, usage, quand, new Date(Date.parse(quand) + 300 * 1000).toISOString())
    .run();
};

const preuveMesuree = () => ({
  identifiant: IDENTIFIANT,
  donneesAuthentificateur: CEREMONIE.donneesAuthentificateur,
  donneesClient: CEREMONIE.donneesClient,
  signature: CEREMONIE.signature,
});

const cadreMesure = { origine: MESURE.origin, domaine: DOMAINE_MESURE, maintenant: QUAND };

const auJournal = async (): Promise<readonly { operation: string; detail: string | null }[]> => {
  const { results } = await registre
    .prepare("SELECT operation, detail FROM journal_audit")
    .bind()
    .all<{ operation: string; detail: string | null }>();
  return results;
};

describe("la cérémonie réellement mesurée ouvre une session", () => {
  it("entre de bout en bout, avec les octets du 18 octobre", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id, CEREMONIE.spki, 1); // la cérémonie porte le compteur 2
    await poserLeDefi(MESURE.challenge);

    const entree = await entrer(registre, preuveMesuree(), cadreMesure);
    expect(entree.fait, entree.fait ? "" : entree.pourLeJournal).toBe(true);
    if (!entree.fait) return;

    expect(entree.session.personneId).toBe(personne.id);
    expect(entree.session.expireLe).toBe(new Date(Date.parse(QUAND) + DUREE_SESSION * 1000).toISOString());

    // La session se relit par l'empreinte du jeton, et le jeton n'est rangé nulle part.
    const relue = await laSessionParEmpreinte(registre, await empreinteDuJeton(entree.jeton));
    expect(relue?.id).toBe(entree.session.id);
    expect(etatDe(
      {
        id: relue!.id,
        utilisateurId: relue!.personneId,
        empreinte: relue!.empreinte,
        vueLe: Math.floor(Date.parse(relue!.vueLe) / 1000),
        expireLe: Math.floor(Date.parse(relue!.expireLe) / 1000),
      },
      Math.floor(Date.parse(QUAND) / 1000),
    ).valide).toBe(true);

    // Le compteur a avancé jusqu'à celui que l'authentificateur a annoncé.
    expect((await laCleParIdentifiant(registre, IDENTIFIANT))?.compteur).toBe(2);
    expect(cle.compteur).toBe(1);
  });

  it("refuse la même preuve une seconde fois : le défi est dépensé", async () => {
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    await poserLeDefi(MESURE.challenge);

    expect((await entrer(registre, preuveMesuree(), cadreMesure)).fait).toBe(true);

    const rejouee = await entrer(registre, preuveMesuree(), cadreMesure);
    expect(rejouee.fait).toBe(false);
    if (!rejouee.fait) expect(rejouee.pourLeJournal).toContain("déjà");
  });

  it("refuse une preuve rejouée même si le défi est rouvert : le compteur n'a pas avancé", async () => {
    // La seconde garde, indépendante de la première. Un défi réémis à la même valeur — ce qui ne
    // devrait jamais arriver — ne suffirait pas à rejouer une entrée.
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    await poserLeDefi(MESURE.challenge);
    expect((await entrer(registre, preuveMesuree(), cadreMesure)).fait).toBe(true);

    await registre.prepare("DELETE FROM defi").bind().run();
    await poserLeDefi(MESURE.challenge);

    const rejouee = await entrer(registre, preuveMesuree(), cadreMesure);
    expect(rejouee.fait).toBe(false);
    if (!rejouee.fait) expect(rejouee.pourLeJournal).toContain("rejouée");
  });

  it("ne laisse pas deux requêtes simultanées ouvrir deux sessions", async () => {
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    await poserLeDefi(MESURE.challenge);

    const [un, autre] = await Promise.all([
      entrer(registre, preuveMesuree(), cadreMesure),
      entrer(registre, preuveMesuree(), cadreMesure),
    ]);
    expect([un.fait, autre.fait].filter(Boolean)).toHaveLength(1);

    const { results } = await registre.prepare("SELECT id FROM session").bind().all<{ id: string }>();
    expect(results).toHaveLength(1);
  });
});

describe("chaque refus se nomme, et le demandeur n'en sait rien", () => {
  /** Remet le décor à neuf : une clé jamais utilisée, et le défi de la cérémonie mesurée.
   *
   *  Chaque tentative a besoin des deux. Une clé réutilisée se heurte à l'unicité de son
   *  identifiant, et un défi déjà posé à sa clé primaire — deux contraintes qui font bien leur
   *  travail, et que mes premières aides prenaient pour des échecs du code. */
  let tour = 0;
  const unDecorNeuf = async (): Promise<string> => {
    const personne = await unePersonne();
    const identifiant = `cle-${(tour += 1)}`;
    await uneCle(personne.id, CEREMONIE.spki, 1, identifiant);
    await registre.prepare("DELETE FROM defi").bind().run();
    await poserLeDefi(MESURE.challenge);
    return identifiant;
  };

  const entrerAvec = async (
    retouches: Record<string, unknown>,
    cadre: Partial<typeof cadreMesure> = {},
  ) => {
    const identifiant = await unDecorNeuf();
    return entrer(
      registre,
      { ...preuveMesuree(), identifiant, ...retouches },
      { ...cadreMesure, ...cadre },
    );
  };

  it("rend toujours le même mot, quel que soit le refus", async () => {
    const refus = [
      await entrerAvec({ identifiant: "inconnu" }),
      await entrerAvec({ signature: "MEUCIQDnawak" }),
      await entrerAvec({}, { origine: "https://ailleurs.exemple" }),
      await entrerAvec({}, { domaine: "ailleurs.exemple" }),
    ];
    for (const un of refus) {
      expect(un.fait).toBe(false);
      if (!un.fait) expect(un.mot).toBe(MOT_DE_REFUS);
    }
    // Et les raisons internes, elles, diffèrent toutes.
    const raisons = new Set(refus.map((un) => (un.fait ? "" : un.pourLeJournal)));
    expect(raisons.size).toBe(refus.length);
  });

  it("distingue une signature refusée d'une signature illisible", async () => {
    // L'exigence du 18 octobre, jusqu'au bout de la chaîne : les deux refusent, et le journal
    // sait laquelle s'est produite.
    const brute = Uint8Array.from(Buffer.from(CEREMONIE.signature, "base64"));
    const changee = new Uint8Array(brute);
    changee[changee.length - 1] = changee[changee.length - 1]! ^ 0x01;

    const refusee = await entrerAvec({ signature: Buffer.from(changee).toString("base64") });
    expect(refusee.fait).toBe(false);
    if (!refusee.fait) expect(refusee.pourLeJournal).toContain("refusée");

    const illisible = await entrerAvec({ signature: Buffer.from([0x30, 0x02, 0x02, 0x00]).toString("base64") });
    expect(illisible.fait).toBe(false);
    if (!illisible.fait) expect(illisible.pourLeJournal).toContain("illisible");
  });

  it("dépense le défi même quand la signature est refusée", async () => {
    // La règle de ce module : un défi est dépensé dès qu'une signature a été **jugée** contre
    // lui. Sans cela, on pourrait essayer mille signatures sur le même défi.
    //
    // C'est la différence de principe avec l'enrôlement, où un refus de clé survient avant toute
    // vérification et laisse donc le défi intact.
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    await poserLeDefi(MESURE.challenge);

    const brute = Uint8Array.from(Buffer.from(CEREMONIE.signature, "base64"));
    const changee = new Uint8Array(brute);
    changee[changee.length - 1] = changee[changee.length - 1]! ^ 0x01;
    const fausse = await entrer(
      registre,
      { ...preuveMesuree(), signature: Buffer.from(changee).toString("base64") },
      cadreMesure,
    );
    expect(fausse.fait).toBe(false);

    // Et maintenant la **vraie** preuve, sur le même défi : elle doit être refusée aussi.
    const vraie = await entrer(registre, preuveMesuree(), cadreMesure);
    expect(vraie.fait).toBe(false);
    if (!vraie.fait) expect(vraie.pourLeJournal).toContain("déjà");
  });

  it("refuse une clé inconnue, et une clé révoquée, autrement", async () => {
    const inconnue = await entrerAvec({ identifiant: "jamaisVu" });
    expect(inconnue.fait).toBe(false);
    if (!inconnue.fait) expect(inconnue.pourLeJournal).toContain("inconnue");

    const identifiant = await unDecorNeuf();
    const aRevoquer = await laCleParIdentifiant(registre, identifiant);
    await revoquerLaCle(registre, aRevoquer!.id, MOI, QUAND);

    const revoquee = await entrer(registre, { ...preuveMesuree(), identifiant }, cadreMesure);
    expect(revoquee.fait).toBe(false);
    if (!revoquee.fait) expect(revoquee.pourLeJournal).toContain("révoquée");
  });

  it("refuse un défi émis pour enrôler", async () => {
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    await poserLeDefi(MESURE.challenge, QUAND, "enrolement");

    const entree = await entrer(registre, preuveMesuree(), cadreMesure);
    expect(entree.fait).toBe(false);
    if (!entree.fait) expect(entree.pourLeJournal).toContain("usage");
  });

  it("refuse un défi périmé", async () => {
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    await poserLeDefi(MESURE.challenge);

    const tropTard = new Date(Date.parse(QUAND) + 301 * 1000).toISOString();
    const entree = await entrer(registre, preuveMesuree(), { ...cadreMesure, maintenant: tropTard });
    expect(entree.fait).toBe(false);
    if (!entree.fait) expect(entree.pourLeJournal).toContain("périmé");
  });

  it("refuse un défi inconnu, et n'écrit rien au journal", async () => {
    // Le défi inconnu n'est pas journalisé, à dessein : sans cela, n'importe qui pourrait
    // remplir le journal en envoyant des valeurs au hasard, et le noyer.
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);

    const entree = await entrer(registre, preuveMesuree(), cadreMesure);
    expect(entree.fait).toBe(false);
    if (!entree.fait) expect(entree.pourLeJournal).toContain("inconnu");

    expect((await auJournal()).filter((ligne) => ligne.operation === "entree_refusee")).toEqual([]);
  });

  it("journalise les refus qui ont présenté un défi valide", async () => {
    // Ceux-là sont bornés par les défis qu'on a émis : on ne peut pas en produire à volonté.
    const refusee = await entrerAvec({ identifiant: "jamaisVu" });
    expect(refusee.fait).toBe(false);

    const lignes = (await auJournal()).filter((ligne) => ligne.operation === "entree_refusee");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.detail).toContain("inconnue");
  });

  it("n'ouvre aucune session quand il refuse", async () => {
    await entrerAvec({ signature: Buffer.from([0x30, 0x02, 0x02, 0x00]).toString("base64") });
    const { results } = await registre.prepare("SELECT id FROM session").bind().all<{ id: string }>();
    expect(results).toEqual([]);
  });

  it("refuse une entrée déguisée en création", async () => {
    const personne = await unePersonne();
    await uneCle(personne.id, CEREMONIE.spki, 1);
    const donneesClient = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: MESURE.challenge, origin: MESURE.origin, crossOrigin: false }),
      "utf8",
    ).toString("base64url");
    await poserLeDefi(MESURE.challenge);

    const entree = await entrer(registre, { ...preuveMesuree(), donneesClient }, cadreMesure);
    expect(entree.fait).toBe(false);
    // La signature ne couvre plus ces données : elle sera refusée avant même le type. Les deux
    // refus sont légitimes ; ce qui compte est qu'aucune session ne s'ouvre.
    if (!entree.fait) expect(entree.pourLeJournal.length).toBeGreaterThan(0);
  });

  it("refuse des données d'authentificateur tronquées", async () => {
    const brutes = Uint8Array.from(Buffer.from(CEREMONIE.donneesAuthentificateur, "base64"));
    const entree = await entrerAvec({
      donneesAuthentificateur: Buffer.from(brutes.slice(0, 20)).toString("base64"),
    });
    expect(entree.fait).toBe(false);
    if (!entree.fait) expect(entree.pourLeJournal).toContain("trop courtes");
  });

  it("refuse ce qui n'est même pas de la base64", async () => {
    for (const champ of ["donneesAuthentificateur", "donneesClient", "signature"]) {
      const entree = await entrerAvec({ [champ]: "pas de la base64 !!" });
      expect(entree.fait, champ).toBe(false);
      if (!entree.fait) expect(entree.pourLeJournal.length, champ).toBeGreaterThan(0);
    }
  });
});
