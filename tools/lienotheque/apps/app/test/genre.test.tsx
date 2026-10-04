import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Catalogue } from "../src/pages/Catalogue.js";
import { Lecteur } from "../src/pages/Lecteur.js";
import { Verifier } from "../src/pages/Verifier.js";

/** Les mots d'une bibliothèque viennent de son schéma, qui ne donne pas leur genre (CLA-01).
 *
 *  Une phrase qui écrit « cette <mot> » ou « <mot> relié » parie donc sur un genre qu'elle ne
 *  connaît pas : juste pour un vocabulaire, fautive pour l'autre. Ces contrôles montent les trois
 *  écrans avec un vocabulaire masculin puis un vocabulaire féminin, et relisent le texte rendu :
 *  aucun déterminant accordé devant un mot du schéma, aucun adjectif accordé derrière. */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "a".repeat(64);

type Mots = { readonly un: string; readonly plusieurs: string };
type Vocabulaire = { readonly nom: string; readonly element: Mots; readonly piste: Mots; readonly page: Mots };

/** Deux vocabulaires réels, l'un entièrement masculin, l'autre entièrement féminin : c'est le
 *  couple qui fait apparaître l'accord, puisqu'une tournure accordée ne peut pas convenir aux deux. */
const VOCABULAIRES: readonly Vocabulaire[] = [
  {
    nom: "masculin",
    element: { un: "paragraphe", plusieurs: "paragraphes" },
    piste: { un: "enregistrement", plusieurs: "enregistrements" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  {
    nom: "féminin",
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "planche", plusieurs: "planches" },
  },
];

/** Déterminants et adjectifs qui exigent un genre. « des », « les », « ces » et « aux » n'y sont
 *  pas : ils s'écrivent pareil au masculin et au féminin, donc ils ne parient sur rien. « vide »
 *  non plus, invariable en genre. */
const DETERMINANTS = [
  "ce", "cet", "cette", "le", "la", "un", "une", "du", "de la", "au", "à la",
  "tout", "toute", "tous", "toutes", "aucun", "aucune",
  "quel", "quelle", "premier", "première", "dernier", "dernière", "nouveau", "nouvelle",
] as const;

const ADJECTIFS = [
  "relié", "reliée", "reliés", "reliées", "actif", "active", "suivant", "suivante",
  "précédent", "précédente", "seul", "seule", "plein", "pleine",
  "complet", "complète", "choisi", "choisie", "ouvert", "ouverte", "validé", "validée",
] as const;

const vueDe = (v: Vocabulaire, sur: Record<string, unknown> = {}): VueBibliotheque =>
  VueBibliotheque.parse({
    id: ID(1),
    nom: "Recueil de procédures",
    mots: { element: v.element, piste: v.piste, page: v.page },
    compteurs: [{ nombre: 412, mot: v.element.plusieurs }],
    aVerifier: 4,
    filtres: [
      { cle: "niveau", nom: "Niveau", valeurs: [{ cle: "debutant", nom: "Débutant", nombre: 146 }] },
    ],
    pages: [
      {
        numero: 126,
        titre: "Gammes",
        elements: [{ ancreId: ID(20), numero: "399", page: 126, aVerifier: false }],
        texte: [],
        traduction: [],
      },
      {
        numero: 127,
        titre: "Lecture et articulation",
        elements: [
          {
            ancreId: ID(21),
            numero: "400",
            page: 127,
            media: { empreinte: EMPREINTE, nom: "a.mp3", piste: 40, position: { segment: "inconnu" } },
            pourquoi: { preuve: "lu", confiance: 1, phrase: "Repère lu" },
            aVerifier: false,
          },
          { ancreId: ID(22), numero: "401", page: 127, aVerifier: true },
        ],
        texte: [],
        traduction: [],
      },
    ],
    douteux: [],
    ...sur,
  });

const cas = (v: Vocabulaire, n: number): unknown => ({
  id: ID(n),
  nature: "lien",
  etat: "confiance",
  element: {
    ancreId: ID(n + 50),
    numero: String(400 + n),
    page: 127,
    media: { empreinte: EMPREINTE, nom: "a.mp3", piste: 43, position: { segment: "inconnu" } },
    pourquoi: { preuve: "sequence", confiance: 0.6, phrase: "Déduit de la suite" },
    aVerifier: true,
  },
  proposition: `${v.element.un} ${400 + n} → ${v.piste.un} 43`,
  motif: "repère partiellement lu, déduit de la séquence",
});

/** Tout ce que l'écran donne à lire : le texte visible, et les noms que porte chaque commande —
 *  un libellé de lecteur d'écran est une phrase comme une autre. */
function tout(): string {
  const noeuds = [...document.querySelectorAll<HTMLElement>("body *")];
  const libelles = noeuds.flatMap((n) =>
    ["aria-label", "alt", "title", "aria-description"]
      .map((a) => n.getAttribute(a))
      .filter((valeur): valeur is string => valeur !== null),
  );
  return [document.body.textContent ?? "", ...libelles].join(" · ");
}

/** Les accords fautifs que porte `texte` pour le vocabulaire `v`. */
function accords(texte: string, v: Vocabulaire): readonly string[] {
  const mots = [v.element.un, v.element.plusieurs, v.piste.un, v.piste.plusieurs, v.page.un, v.page.plusieurs];
  const fautes: string[] = [];
  for (const mot of mots) {
    for (const determinant of DETERMINANTS) {
      const trouve = new RegExp(`(^|[^\\p{L}])${determinant}\\s+${mot}($|[^\\p{L}])`, "giu").exec(texte);
      if (trouve !== null) fautes.push(`« ${determinant} ${mot} »`);
    }
    for (const adjectif of ADJECTIFS) {
      const trouve = new RegExp(`(^|[^\\p{L}])${mot}\\s+${adjectif}($|[^\\p{L}])`, "giu").exec(texte);
      if (trouve !== null) fautes.push(`« ${mot} ${adjectif} »`);
    }
  }
  return fautes;
}

describe("aucune phrase ne demande le genre d’un mot du schéma (CLA-01)", () => {
  for (const v of VOCABULAIRES) {
    it(`Catalogue — vocabulaire ${v.nom}`, () => {
      render(
        <Catalogue
          vue={vueDe(v)}
          page={127}
          onPage={vi.fn()}
          onLecteur={vi.fn()}
          onAjouter={vi.fn()}
        />,
      );
      expect(accords(tout(), v), `accords fautifs, vocabulaire ${v.nom}`).toEqual([]);
    });

    it(`Catalogue sans aucune page — vocabulaire ${v.nom}`, () => {
      render(
        <Catalogue
          vue={vueDe(v, { pages: [] })}
          onPage={vi.fn()}
          onLecteur={vi.fn()}
          onAjouter={vi.fn()}
        />,
      );
      expect(accords(tout(), v), `accords fautifs, vocabulaire ${v.nom}`).toEqual([]);
    });

    it(`Lecteur — vocabulaire ${v.nom}`, () => {
      render(
        <Lecteur
          vue={vueDe(v)}
          page={127}
          element={ID(22)}
          onPage={vi.fn()}
          onElement={vi.fn()}
        />,
      );
      expect(accords(tout(), v), `accords fautifs, vocabulaire ${v.nom}`).toEqual([]);
    });

    it(`Vérifier — vocabulaire ${v.nom}`, () => {
      render(
        <Verifier
          vue={vueDe(v, { douteux: [cas(v, 5), cas(v, 6)] })}
          onDecision={vi.fn()}
          onAnnuler={vi.fn()}
        />,
      );
      expect(accords(tout(), v), `accords fautifs, vocabulaire ${v.nom}`).toEqual([]);
    });
  }

  it("le contrôle attrape bien un accord fautif", () => {
    const [masculin] = VOCABULAIRES;
    expect(accords(`On y lit « cette ${masculin!.page.un} » sans le vouloir.`, masculin!)).toEqual([
      `« cette ${masculin!.page.un} »`,
    ]);
    expect(accords(`Rien d’accordé ici : ${masculin!.page.un} 127.`, masculin!)).toEqual([]);
  });
});

/** La chaîne que les écrans reçoivent pour un accord fautif reste la même d'un vocabulaire à
 *  l'autre : c'est ce qui rend l'erreur invisible à la relecture d'un seul jeu de mots. */
describe("les deux vocabulaires lisent la même mise en page", () => {
  it("écrit les mêmes phrases, aux mots près", () => {
    const rendu = VOCABULAIRES.map((v) => {
      const { unmount } = render(
        <Catalogue vue={vueDe(v)} page={127} onPage={vi.fn()} onLecteur={vi.fn()} onAjouter={vi.fn()} />,
      );
      const sans = (texte: string, mot: string, marque: string): string =>
        texte.replace(new RegExp(mot, "giu"), marque);
      const texte = [
        [v.element.plusieurs, "ÉLÉMENTS"],
        [v.element.un, "ÉLÉMENT"],
        [v.page.plusieurs, "PAGES"],
        [v.page.un, "PAGE"],
        [v.piste.plusieurs, "PISTES"],
        [v.piste.un, "PISTE"],
      ].reduce((acc, [mot, marque]) => sans(acc, mot!, marque!), document.body.textContent ?? "");
      unmount();
      return texte;
    });
    expect(rendu[0]).toBe(rendu[1]);
  });
});

/** Les écrans ne doivent jamais écrire un mot de domaine de leur propre chef (CLA-01). */
describe("les écrans n’inventent aucun mot de domaine", () => {
  it("n’écrit ni « page », ni « élément », ni « piste » quand le schéma dit autre chose", () => {
    const [, feminin] = VOCABULAIRES;
    render(
      <Catalogue vue={vueDe(feminin!)} page={127} onPage={vi.fn()} onLecteur={vi.fn()} onAjouter={vi.fn()} />,
    );
    const texte = (screen.getByRole("main").textContent ?? "").toLowerCase();
    for (const interdit of ["élément", "piste", "ancre"]) {
      expect(texte, `mot de domaine écrit en dur : ${interdit}`).not.toContain(interdit);
    }
  });
});
