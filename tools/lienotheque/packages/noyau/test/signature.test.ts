import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOT_DE_REFUS,
  lireSignatureDer,
  messageSigne,
  pourLeJournal,
  verifierUneSignature,
} from "../src/signature.js";

/** La vérification d'une signature d'entrée (SEC-02).
 *
 *  Deux exigences commandent ces tests, et elles tiennent ensemble.
 *
 *  **La longueur d'une signature DER varie.** Mesuré : la même cérémonie rend 70 octets une
 *  fois, 71 la suivante, parce que la longueur d'un entier dépend de son premier bit. Une
 *  découpe à offsets fixes marcherait environ une fois sur quatre et se tairait le reste du
 *  temps. Le banc d'ici tire donc des centaines de signatures réelles pour voir toutes les
 *  longueurs passer.
 *
 *  **Une signature refusée n'est pas une signature illisible.** La première est une tentative
 *  qui a échoué, la seconde est un défaut — de notre code, d'un appareil, ou d'une sonde. Les
 *  confondre dans un « faux » muet, c'est faire passer un bogue pour un mot de passe erroné et
 *  chercher pendant des jours. D'où trois issues, et jamais un booléen. */

const CEREMONIE = JSON.parse(
  readFileSync(new URL("../../../fixtures/ceremonie-webauthn.json", import.meta.url), "utf8"),
) as { spki: string; donneesAuthentificateur: string; donneesClient: string; signature: string };

const dub64 = (texte: string): Uint8Array<ArrayBuffer> => Uint8Array.from(Buffer.from(texte, "base64"));

const SPKI = dub64(CEREMONIE.spki);
const DONNEES_AUTH = dub64(CEREMONIE.donneesAuthentificateur);
const DONNEES_CLIENT = dub64(CEREMONIE.donneesClient);
const SIGNATURE = dub64(CEREMONIE.signature);

/** Emballe deux entiers en séquence DER, comme un authentificateur le fait. */
const enDer = (r: Uint8Array<ArrayBuffer>, s: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const entier = (valeur: Uint8Array<ArrayBuffer>): number[] => {
    let i = 0;
    while (i < valeur.length - 1 && valeur[i] === 0x00) i += 1; // pas de zéro superflu
    const corps = [...valeur.slice(i)];
    if ((corps[0]! & 0x80) !== 0) corps.unshift(0x00); // bourre de signe
    return [0x02, corps.length, ...corps];
  };
  const dedans = [...entier(r), ...entier(s)];
  return Uint8Array.from([0x30, dedans.length, ...dedans]);
};

describe("la lecture d'une signature DER encaisse la longueur variable", () => {
  it("lit la signature réellement mesurée", () => {
    const lu = lireSignatureDer(SIGNATURE);
    expect(lu.lu).toBe(true);
    if (lu.lu) expect(lu.brut.length).toBe(64);
  });

  it("lit toutes les longueurs qu'une signature peut prendre", async () => {
    // Trois cents signatures réelles : les trois longueurs possibles passent toutes, et c'est
    // la seule façon honnête de le montrer — une seule signature ne prouve que son cas.
    const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
      "verify",
    ]);
    const longueurs = new Set<number>();

    for (let tour = 0; tour < 300; tour += 1) {
      const message = crypto.getRandomValues(new Uint8Array(32));
      // `sign` rend r‖s brut ; on le remet en DER pour relire ce que l'authentificateur enverra.
      const brut = new Uint8Array(
        await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, paire.privateKey, message),
      );
      const der = enDer(brut.slice(0, 32), brut.slice(32));
      longueurs.add(der.length);

      const lu = lireSignatureDer(der);
      expect(lu.lu, `tour ${tour}, ${der.length} octets`).toBe(true);
      if (!lu.lu) continue;
      expect([...lu.brut], `tour ${tour}`).toEqual([...brut]);
    }

    // Les trois longueurs courantes se présentent toutes, et aucune n'est traitée à part.
    for (const attendue of [70, 71, 72]) expect(longueurs.has(attendue), `${attendue} octets`).toBe(true);

    // Et rien au-delà de ce qu'une signature de cette courbe peut faire. L'assertion n'exige
    // **pas** l'ensemble exact : une longueur plus courte est rare mais légitime, et exiger
    // exactement {70, 71, 72} rendait ce test fragile une fois sur deux — mesuré.
    for (const vue of longueurs) expect(vue, "longueur impossible").toBeLessThanOrEqual(72);
  });

  it("lit une signature plus courte que la plus courte qu'on croit possible", () => {
    // Mesuré sur vingt mille signatures : 70 octets dans 25 % des cas, 71 dans 49 %, 72 dans
    // 25 %… et **69 dans 0,24 %**, quand un des deux entiers commence par un octet nul. Un
    // lecteur qui refuserait ce qui fait moins de soixante-dix octets — une garde défensive
    // tout à fait plausible à écrire — refuserait une entrée sur quatre cent seize, au hasard,
    // sans que rien dans les journaux ne fasse de motif.
    const r = new Uint8Array(32);
    r.set([0x00, 0x42], 0); // premier octet nul : DER l'écrit sur trente-et-un octets
    const s = new Uint8Array(32).fill(0x7f); // premier bit à zéro : pas de bourre
    const der = enDer(r, s);
    expect(der.length).toBe(69);

    const lu = lireSignatureDer(der);
    expect(lu.lu).toBe(true);
    if (lu.lu) {
      expect(lu.brut.length).toBe(64);
      expect([...lu.brut.slice(0, 32)]).toEqual([...r]);
      expect([...lu.brut.slice(32)]).toEqual([...s]);
    }
  });

  it("recale un entier court sur trente-deux octets", () => {
    // Un r qui commence par des zéros est écrit plus court en DER. Le recaler à gauche serait
    // une signature différente, et elle serait refusée sans qu'on sache pourquoi.
    const r = new Uint8Array(32);
    r[31] = 1; // la valeur un
    const s = new Uint8Array(32).fill(0x11);
    const lu = lireSignatureDer(enDer(r, s));
    expect(lu.lu).toBe(true);
    if (lu.lu) {
      expect([...lu.brut.slice(0, 32)]).toEqual([...r]);
      expect([...lu.brut.slice(32)]).toEqual([...s]);
    }
  });

  it("accepte l'octet de bourre de signe, et ne le prend pas pour une valeur", () => {
    const r = new Uint8Array(32).fill(0xff); // premier bit à un : DER ajoute un 0x00 devant
    const s = new Uint8Array(32).fill(0x7f);
    const der = enDer(r, s);
    expect(der.length).toBe(71);
    const lu = lireSignatureDer(der);
    expect(lu.lu).toBe(true);
    if (lu.lu) expect([...lu.brut.slice(0, 32)]).toEqual([...r]);
  });
});

describe("une signature mal formée est refusée en le disant", () => {
  const illisible = (octets: readonly number[], attendu: string): void => {
    const lu = lireSignatureDer(Uint8Array.from(octets));
    expect(lu.lu).toBe(false);
    if (!lu.lu) expect(lu.raison).toContain(attendu);
  };

  it("refuse ce qui n'est pas une séquence", () => {
    illisible([0x31, 0x04, 0x02, 0x01, 0x01, 0x02], "séquence");
  });

  it("refuse une séquence vide", () => {
    illisible([0x30, 0x00], "entier");
  });

  it("refuse une longueur annoncée qui ne correspond pas", () => {
    // Le piège : une signature valide suivie d'octets en trop. Les ignorer laisserait deux
    // écritures différentes valoir la même signature.
    const valide = [...enDer(new Uint8Array(32).fill(2), new Uint8Array(32).fill(3))];
    illisible([...valide, 0x00, 0x00], "longueur");
  });

  it("refuse une signature tronquée", () => {
    const valide = [...enDer(new Uint8Array(32).fill(2), new Uint8Array(32).fill(3))];
    illisible(valide.slice(0, valide.length - 5), "longueur");
  });

  it("refuse un entier qui n'en est pas un", () => {
    illisible([0x30, 0x06, 0x04, 0x01, 0x01, 0x04, 0x01, 0x01], "entier");
  });

  it("refuse un entier trop grand pour la courbe", () => {
    const trenteCinq = [0x02, 0x23, ...new Array(0x23).fill(0x01)];
    illisible([0x30, trenteCinq.length * 2, ...trenteCinq, ...trenteCinq], "trop grand");
  });

  it("refuse un entier négatif, que DER n'autorise pas", () => {
    // Trente-deux octets dont le premier bit est à un, sans l'octet de bourre : c'est un nombre
    // négatif. Un lecteur indulgent le lirait comme positif, et deux écritures vaudraient la
    // même signature.
    const corps = [0xff, ...new Array(31).fill(0x11)];
    const entier = [0x02, 0x20, ...corps];
    illisible([0x30, entier.length * 2, ...entier, ...entier], "négatif");
  });

  it("refuse un entier vide", () => {
    illisible([0x30, 0x04, 0x02, 0x00, 0x02, 0x00], "vide");
  });

  it("refuse une signature vide tout court", () => {
    illisible([], "séquence");
  });
});

describe("le message signé est celui que la norme définit", () => {
  it("colle les données de l'authentificateur et le condensat des données du client", async () => {
    const message = await messageSigne(DONNEES_AUTH, DONNEES_CLIENT);
    expect(message.length).toBe(DONNEES_AUTH.length + 32);
    expect([...message.slice(0, DONNEES_AUTH.length)]).toEqual([...DONNEES_AUTH]);

    const condensat = new Uint8Array(await crypto.subtle.digest("SHA-256", DONNEES_CLIENT));
    expect([...message.slice(DONNEES_AUTH.length)]).toEqual([...condensat]);
  });
});

describe("trois issues, jamais un booléen", () => {
  it("dit « valide » sur la signature réellement mesurée", async () => {
    const issue = await verifierUneSignature(SPKI, SIGNATURE, await messageSigne(DONNEES_AUTH, DONNEES_CLIENT));
    expect(issue.issue).toBe("valide");
  });

  it("dit « refusée » sur une signature bien formée qui ne correspond pas", async () => {
    // Même longueur, même structure, une valeur changée : c'est une tentative qui échoue, pas
    // un défaut de format. La distinction est tout l'objet de ce test.
    const lu = lireSignatureDer(SIGNATURE);
    expect(lu.lu).toBe(true);
    if (!lu.lu) return;
    const brut = new Uint8Array(lu.brut);
    brut[0] = brut[0]! ^ 0x01;
    const autre = enDer(brut.slice(0, 32), brut.slice(32));

    const issue = await verifierUneSignature(SPKI, autre, await messageSigne(DONNEES_AUTH, DONNEES_CLIENT));
    expect(issue.issue).toBe("refusee");
  });

  it("dit « refusée » quand le message n'est pas celui qui a été signé", async () => {
    const altere = new Uint8Array(DONNEES_AUTH);
    altere[32] = altere[32]! ^ 0xff; // on change les drapeaux
    const issue = await verifierUneSignature(SPKI, SIGNATURE, await messageSigne(altere, DONNEES_CLIENT));
    expect(issue.issue).toBe("refusee");
  });

  it("dit « illisible » sur une signature mal formée, et non « refusée »", async () => {
    const issue = await verifierUneSignature(
      SPKI,
      Uint8Array.from([0x30, 0x02, 0x02, 0x00]),
      await messageSigne(DONNEES_AUTH, DONNEES_CLIENT),
    );
    expect(issue.issue).toBe("illisible");
    if (issue.issue === "illisible") expect(issue.raison).toBeTruthy();
  });

  it("dit « illisible » sur une clé publique qui n'en est pas une", async () => {
    const issue = await verifierUneSignature(
      Uint8Array.from([1, 2, 3, 4]),
      SIGNATURE,
      await messageSigne(DONNEES_AUTH, DONNEES_CLIENT),
    );
    expect(issue.issue).toBe("illisible");
    if (issue.issue === "illisible") expect(issue.raison).toContain("clé");
  });

  it("ne rend jamais la clé publique d'autrui pour une autre signature", async () => {
    // Une clé valide mais étrangère : refus, pas illisible — c'est bien formé.
    const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const etrangere = new Uint8Array(await crypto.subtle.exportKey("spki", paire.publicKey));
    const issue = await verifierUneSignature(etrangere, SIGNATURE, await messageSigne(DONNEES_AUTH, DONNEES_CLIENT));
    expect(issue.issue).toBe("refusee");
  });
});

describe("ce qui sort, et ce qui reste", () => {
  it("rend le même mot au demandeur pour les trois issues", () => {
    // Le journal distingue ; la réponse ne distingue pas. Un demandeur qui apprendrait qu'une
    // signature est « illisible » plutôt que « refusée » saurait qu'il a trouvé un défaut.
    expect(MOT_DE_REFUS).toBe("Entrée refusée.");
  });

  it("écrit au journal de quoi distinguer les trois", () => {
    expect(pourLeJournal({ issue: "valide" })).toContain("valide");
    expect(pourLeJournal({ issue: "refusee" })).toContain("refusée");

    const note = pourLeJournal({ issue: "illisible", raison: "entier DER vide" });
    expect(note).toContain("illisible");
    // La raison technique est retenue : c'est elle qui fait gagner les jours de recherche.
    expect(note).toContain("entier DER vide");
  });
});
