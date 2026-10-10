import { describe, expect, it } from "vitest";
import {
  DUREE_SESSION,
  aRepousser,
  empreinteDuJeton,
  entetRetrait,
  entetTemoin,
  etatDe,
  jetonNeuf,
  temoinDe,
  type Session,
} from "../src/session.js";

const MAINTENANT = 1_800_000_000;
const JOUR = 24 * 60 * 60;
const session = (modifications: Partial<Session> = {}): Session => ({
  id: "s1",
  utilisateurId: "u1",
  empreinte: "0".repeat(64),
  vueLe: MAINTENANT,
  expireLe: MAINTENANT + DUREE_SESSION,
  ...modifications,
});

describe("la session qui évite toute ressaisie (SEC-02)", () => {
  it("dure au moins quatre-vingt-dix jours", () => {
    expect(DUREE_SESSION).toBe(90 * JOUR);
  });

  it("tient un usage quotidien pendant un an sans jamais demander de ressaisie", () => {
    // L'exigence se mesure ainsi, et pas autrement : on simule 365 jours d'usage, et la session
    // ne doit pas périmer une seule fois.
    let courante = session();
    for (let jour = 1; jour <= 365; jour += 1) {
      const instant = MAINTENANT + jour * JOUR;
      const etat = etatDe(courante, instant);
      expect(etat.valide, `périmée au jour ${jour}`).toBe(true);
      if (etat.valide && aRepousser(courante, instant)) courante = { ...courante, expireLe: etat.repousserA, vueLe: instant };
    }
  });

  it("périme quand on cesse de s'en servir, et pas avant", () => {
    const courante = session();
    expect(etatDe(courante, MAINTENANT + DUREE_SESSION - 1).valide).toBe(true);
    expect(etatDe(courante, MAINTENANT + DUREE_SESSION)).toMatchObject({ valide: false, raison: "périmée" });
  });

  it("se révoque à distance, même si elle n'est pas périmée", () => {
    // Un jeton ne peut pas se retirer lui-même : c'est pour cela que le registre est consulté à
    // chaque usage plutôt que de se fier à la seule signature.
    const revoquee = session({ revoqueeLe: MAINTENANT - 1 });
    expect(etatDe(revoquee, MAINTENANT)).toMatchObject({ valide: false, raison: "révoquée" });
  });

  it("dit « révoquée » plutôt que « périmée » quand elle est les deux", () => {
    const deux = session({ expireLe: MAINTENANT - 10, revoqueeLe: MAINTENANT - 20 });
    expect(etatDe(deux, MAINTENANT)).toMatchObject({ raison: "révoquée" });
  });

  it("n'écrit dans le registre qu'une fois par jour, pas à chaque requête", () => {
    const fraiche = session();
    expect(aRepousser(fraiche, MAINTENANT)).toBe(false);
    expect(aRepousser(fraiche, MAINTENANT + JOUR / 2)).toBe(false);
    expect(aRepousser(fraiche, MAINTENANT + JOUR + 1)).toBe(true);
  });
});

describe("le témoin déposé chez le lecteur", () => {
  it("porte les attributs qui le mettent hors de portée des scripts", () => {
    const entete = entetTemoin("ln_session", "abc", DUREE_SESSION);
    expect(entete).toMatch(/HttpOnly/);
    expect(entete).toMatch(/Secure/);
    expect(entete).toMatch(/SameSite=Lax/);
    expect(entete).toMatch(/Max-Age=7776000/);
  });

  it("ne porte aucun domaine : il reste sur l'hôte exact qui l'a posé", () => {
    expect(entetTemoin("ln_session", "abc", 10)).not.toMatch(/Domain=/i);
  });

  it("se retire avec les mêmes attributs et une durée nulle", () => {
    expect(entetRetrait("ln_session")).toMatch(/Max-Age=0/);
    expect(entetRetrait("ln_session")).toMatch(/HttpOnly/);
  });

  it("se lit par son nom exact, jamais par ressemblance", () => {
    expect(temoinDe("ln_session=bon", "ln_session")).toBe("bon");
    expect(temoinDe("autre=x; ln_session=bon; encore=y", "ln_session")).toBe("bon");
    // Le piège : un nom qui contient l'autre.
    expect(temoinDe("fausse_ln_session=mauvais", "ln_session")).toBeUndefined();
    expect(temoinDe("ln_session_bis=mauvais", "ln_session")).toBeUndefined();
    expect(temoinDe(null, "ln_session")).toBeUndefined();
  });
});

describe("le jeton et son empreinte", () => {
  it("ne se devine pas : deux jetons de suite n'ont rien en commun", () => {
    const jetons = new Set([...Array(50).keys()].map(() => jetonNeuf()));
    expect(jetons.size).toBe(50);
    for (const jeton of jetons) expect(jeton.length).toBeGreaterThanOrEqual(43);
  });

  it("le registre garde l'empreinte, et l'empreinte ne rend pas le jeton", async () => {
    const jeton = jetonNeuf();
    const empreinte = await empreinteDuJeton(jeton);
    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte).not.toContain(jeton);
    expect(await empreinteDuJeton(jeton)).toBe(empreinte);
    expect(await empreinteDuJeton(jetonNeuf())).not.toBe(empreinte);
  });
});
