import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { DUREE_SESSION, entetTemoin, jetonNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { NOM_DU_TEMOIN, ouvrirParSession } from "../src/porte.js";
import { inscrireUnDroit, inscrireUnePersonne, laSessionParEmpreinte, ouvrirUneSession, revoquerLaSession } from "../src/qui-entre.js";

/** La porte : d'un témoin à une personne autorisée (SEC-02, SEC-03, étape 4.6).
 *
 *  Trois questions, dans cet ordre, et chacune peut fermer la porte :
 *  qui présente ce témoin, sa session vaut-elle encore, et a-t-il le droit de ce qu'il demande.
 *
 *  Ce qui sort est **indiscernable** : aucun refus ne dit lequel des trois a échoué. Qui
 *  apprendrait qu'il a « une session valide mais pas le droit » apprendrait que la bibliothèque
 *  existe ; qui apprendrait que sa session est « périmée » plutôt que « révoquée » apprendrait
 *  qu'on l'a mis dehors exprès. Le journal, lui, sait. */

const QUAND = "2026-10-18T09:00:00.000Z";
const MOI = "christophe";
const BIBLIOTHEQUE = "essai";

let registre: ReturnType<typeof baseEnMemoire>;

beforeEach(() => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
});

const unePersonne = async (nom = "Christophe") => {
  const fait = await inscrireUnePersonne(registre, nom, QUAND, MOI);
  if (!fait.fait) throw new Error(fait.raison);
  return fait.valeur;
};

const uneSession = async (personneId: string, quand = QUAND) => {
  const jeton = jetonNeuf();
  const fait = await ouvrirUneSession(registre, { personneId, jeton }, quand);
  if (!fait.fait) throw new Error(fait.raison);
  return { jeton, session: fait.valeur };
};

/** L'en-tête `Cookie` tel qu'un navigateur l'envoie. */
const avecTemoin = (jeton: string, autres = ""): Headers =>
  new Headers({ cookie: `${autres}${autres === "" ? "" : "; "}${NOM_DU_TEMOIN}=${jeton}` });

describe("la porte s'ouvre pour qui a une session et le droit", () => {
  it("rend la personne et sa session", async () => {
    const personne = await unePersonne();
    const { jeton, session } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);

    const vu = await ouvrirParSession(registre, avecTemoin(jeton), {
      bibliotheque: BIBLIOTHEQUE,
      action: "chercher",
      maintenant: QUAND,
    });
    expect(vu.ouverte, vu.ouverte ? "" : vu.pourLeJournal).toBe(true);
    if (!vu.ouverte) return;
    expect(vu.personneId).toBe(personne.id);
    expect(vu.session.id).toBe(session.id);
    expect(vu.niveau).toBe("lecture");
  });

  it("lit le témoin parmi d'autres, sans se laisser avoir par un nom qui le contient", async () => {
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);

    const entetes = avecTemoin(jeton, `faux_${NOM_DU_TEMOIN}=nawak; autre=1`);
    const vu = await ouvrirParSession(registre, entetes, {
      bibliotheque: BIBLIOTHEQUE,
      action: "chercher",
      maintenant: QUAND,
    });
    expect(vu.ouverte).toBe(true);
  });

  it("laisse passer une action que le niveau permet, et pas une au-dessus", async () => {
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "contribution" }, QUAND, MOI);

    const cadre = { bibliotheque: BIBLIOTHEQUE, maintenant: QUAND };
    expect((await ouvrirParSession(registre, avecTemoin(jeton), { ...cadre, action: "annoter" })).ouverte).toBe(true);
    expect((await ouvrirParSession(registre, avecTemoin(jeton), { ...cadre, action: "enroler_cle" })).ouverte).toBe(false);
  });
});

describe("la porte reste fermée, et ne dit pas pourquoi", () => {
  const ferme = async (
    entetes: Headers,
    action = "chercher",
    bibliotheque = BIBLIOTHEQUE,
    maintenant = QUAND,
  ) => {
    const vu = await ouvrirParSession(registre, entetes, { bibliotheque, action, maintenant });
    expect(vu.ouverte).toBe(false);
    return vu;
  };

  it("refuse sans témoin du tout", async () => {
    const vu = await ferme(new Headers());
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("aucun témoin");
  });

  it("refuse un témoin qui ne désigne aucune session", async () => {
    const vu = await ferme(avecTemoin(jetonNeuf()));
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("session inconnue");
  });

  it("refuse une session révoquée, et le dit au journal", async () => {
    const personne = await unePersonne();
    const { jeton, session } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);
    await revoquerLaSession(registre, session.id, MOI, QUAND);

    const vu = await ferme(avecTemoin(jeton));
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("révoquée");
  });

  it("refuse une session périmée", async () => {
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);

    const tropTard = new Date(Date.parse(QUAND) + (DUREE_SESSION + 1) * 1000).toISOString();
    const vu = await ferme(avecTemoin(jeton), "chercher", BIBLIOTHEQUE, tropTard);
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("périmée");
  });

  it("refuse une personne sans aucun droit sur cette bibliothèque", async () => {
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    // Session parfaitement valide, et aucun droit : jamais de droit par défaut.
    const vu = await ferme(avecTemoin(jeton));
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("aucun droit");
  });

  it("refuse un droit donné sur une autre bibliothèque", async () => {
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: "ailleurs", niveau: "administration" }, QUAND, MOI);

    const vu = await ferme(avecTemoin(jeton));
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("aucun droit");
  });

  it("refuse une action que la table des exigences ne connaît pas", async () => {
    // « Un geste qu'on a oublié de classer doit être refusé, jamais autorisé par défaut. »
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "administration" }, QUAND, MOI);

    const vu = await ferme(avecTemoin(jeton), "geste_jamais_classe");
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("geste_jamais_classe");
  });

  it("refuse un niveau que la base dit et que le code ne connaît pas", async () => {
    // Une main sur la console écrit « tout_permis ». La porte doit rester fermée, pas tomber.
    const personne = await unePersonne();
    const { jeton } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "administration" }, QUAND, MOI);
    registre.executer("UPDATE droit SET niveau = 'tout_permis'");

    const vu = await ferme(avecTemoin(jeton));
    if (!vu.ouverte) expect(vu.pourLeJournal).toContain("aucun droit");
  });

  it("rend exactement le même mot pour tous les refus", async () => {
    const personne = await unePersonne();
    const { jeton, session } = await uneSession(personne.id);
    const sansDroit = await ferme(avecTemoin(jeton));

    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);
    await revoquerLaSession(registre, session.id, MOI, QUAND);
    const revoquee = await ferme(avecTemoin(jeton));

    const sansTemoin = await ferme(new Headers());
    const inconnue = await ferme(avecTemoin(jetonNeuf()));

    const refus = [sansDroit, revoquee, sansTemoin, inconnue];
    for (const un of refus) if (!un.ouverte) expect(un.mot).toBe("Accès refusé.");
    // Et le statut aussi : un 403 contre un 401 dirait qu'on a été reconnu.
    for (const un of refus) if (!un.ouverte) expect(un.statut).toBe(401);

    // Les raisons internes, elles, diffèrent toutes.
    expect(new Set(refus.map((un) => (un.ouverte ? "" : un.pourLeJournal))).size).toBe(refus.length);
  });
});

describe("une session qui sert se repousse, mais pas à chaque requête", () => {
  it("repousse l'échéance quand un jour a passé", async () => {
    const personne = await unePersonne();
    const { jeton, session } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);

    const demain = new Date(Date.parse(QUAND) + 25 * 60 * 60 * 1000).toISOString();
    const vu = await ouvrirParSession(registre, avecTemoin(jeton), {
      bibliotheque: BIBLIOTHEQUE,
      action: "chercher",
      maintenant: demain,
    });
    expect(vu.ouverte).toBe(true);

    const relue = await laSessionParEmpreinte(registre, session.empreinte);
    expect(relue?.vueLe).toBe(demain);
    expect(relue?.expireLe).toBe(new Date(Date.parse(demain) + DUREE_SESSION * 1000).toISOString());
    // Quatre-vingt-dix jours d'usage quotidien ne demandent donc jamais de ressaisie.
    expect(Date.parse(relue!.expireLe)).toBeGreaterThan(Date.parse(session.expireLe));
  });

  it("n'écrit rien quand la session vient de servir", async () => {
    // Une page qui fait trente requêtes écrirait trente fois pour repousser la même échéance de
    // quelques secondes. Une fois par jour suffit, et c'est le seul but.
    const personne = await unePersonne();
    const { jeton, session } = await uneSession(personne.id);
    await inscrireUnDroit(registre, { personneId: personne.id, bibliotheque: BIBLIOTHEQUE, niveau: "lecture" }, QUAND, MOI);

    const uneHeureApres = new Date(Date.parse(QUAND) + 60 * 60 * 1000).toISOString();
    await ouvrirParSession(registre, avecTemoin(jeton), {
      bibliotheque: BIBLIOTHEQUE,
      action: "chercher",
      maintenant: uneHeureApres,
    });

    const relue = await laSessionParEmpreinte(registre, session.empreinte);
    expect(relue?.vueLe).toBe(QUAND);
    expect(relue?.expireLe).toBe(session.expireLe);
  });
});

describe("le témoin déposé chez le lecteur", () => {
  it("porte les attributs qui le protègent", () => {
    const entete = entetTemoin(NOM_DU_TEMOIN, "abc", DUREE_SESSION);
    expect(entete).toContain("HttpOnly");
    expect(entete).toContain("Secure");
    expect(entete).toContain("SameSite=Lax");
    expect(entete).toContain("Path=/");
    expect(entete).toContain(`Max-Age=${DUREE_SESSION}`);
    // Aucun domaine : le témoin reste sur l'hôte exact qui l'a posé.
    expect(entete).not.toContain("Domain");
  });

  it("a un nom qui ne ressemble à rien d'autre", () => {
    expect(NOM_DU_TEMOIN).toBe("ln_session");
  });
});
