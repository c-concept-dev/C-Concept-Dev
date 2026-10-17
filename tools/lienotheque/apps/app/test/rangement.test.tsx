import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApercuDocument, SchemaBibliotheque, VueBibliotheque, type ClassementLocal } from "@lienotheque/contrats";
import { Catalogue } from "../src/pages/Catalogue.js";

/** Ranger un document à la main, depuis le Catalogue (CLA-01, CLA-03).
 *
 *  Le geste vit ici et non dans Organisation : Organisation définit les axes et leurs valeurs,
 *  elle ne range aucun document. Ranger est un geste **sur le document**. Mélanger les deux sur
 *  un même écran inviterait à changer le vocabulaire de la bibliothèque alors qu'on voulait
 *  ranger un livre.
 *
 *  Le classement n'entre pas dans la vue : il arrive en propriété séparée, comme les passages
 *  arrivent à la recherche. Un fait, un seul endroit.
 */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;
const EMPREINTE = "c".repeat(64);

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [],
  pages: [{ index: 1, numero: 1, elements: [], texte: [] }],
});

const SCHEMA = SchemaBibliotheque.parse({
  cle: "essai",
  nom: "Essai",
  langue: "fr",
  version: 2,
  axes: [
    {
      cle: "a",
      nom: "Premier axe",
      nature: "referentiel",
      cardinalite: "une",
      valeurs: [
        { cle: "v1", nom: "Valeur une" },
        { cle: "v2", nom: "Valeur deux" },
        { cle: "v3", nom: "Valeur trois", retiree: true, redirigeVers: "v2" },
      ],
      alias: [],
    },
    {
      cle: "b",
      nom: "Second axe",
      nature: "referentiel",
      cardinalite: "plusieurs",
      valeurs: [{ cle: "w1", nom: "Valeur W1" }, { cle: "w2", nom: "Valeur W2" }],
      alias: [],
    },
  ],
});

const socle = {
  vue: VUE,
  onPage: () => undefined,
  onLecteur: () => undefined,
  onAjouter: () => undefined,
};

describe("ranger un document à la main, depuis le Catalogue", () => {
  it("ne propose rien à ranger quand la bibliothèque n’a pas de schéma", () => {
    render(<Catalogue {...socle} />);
    expect(screen.queryByRole("group", { name: /ranger ce/i })).toBeNull();
  });

  it("propose les axes de la bibliothèque, et jamais une valeur retirée", () => {
    render(<Catalogue {...socle} schema={SCHEMA} empreinte={EMPREINTE} onClasser={() => undefined} />);

    expect(screen.getByRole("combobox", { name: "Premier axe" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Second axe" })).toBeTruthy();
    // CLA-03 : une valeur retirée redirige, elle ne s’offre plus au rangement.
    expect(screen.queryByRole("option", { name: "Valeur trois" })).toBeNull();
  });

  it("range sur un axe à valeur unique, en disant que le geste vient de la main", async () => {
    const range = vi.fn();
    render(<Catalogue {...socle} schema={SCHEMA} empreinte={EMPREINTE} onClasser={range} />);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Premier axe" }), "v1");

    expect(range).toHaveBeenCalledTimes(1);
    const ecrit = range.mock.calls[0]?.[0] as ClassementLocal;
    expect(ecrit.empreinte).toBe(EMPREINTE);
    expect(ecrit.origine, "un geste de la main n’est pas un import").toBe("manuel");
    expect(ecrit.axes["a"]).toEqual({ type: "reference", valeurs: ["v1"] });
  });

  it("ajoute puis retire une valeur sur un axe qui en prend plusieurs", async () => {
    const range = vi.fn();
    const deja: ClassementLocal = {
      empreinte: EMPREINTE,
      schema: "essai",
      schemaVersion: 2,
      axes: { b: { type: "reference", valeurs: ["w1"] } },
      origine: "import",
    };
    // L'écran est **contrôlé** : il ne garde aucune copie du classement, il lit celui qu'on lui
    // donne. C'est au parent de le mettre à jour, comme l'application le fait après écriture —
    // une copie interne serait un second endroit pour le même fait, et l'un des deux dériverait.
    const { rerender } = render(
      <Catalogue {...socle} schema={SCHEMA} empreinte={EMPREINTE} classement={deja} onClasser={range} />,
    );

    const w1 = () => screen.getByRole("checkbox", { name: "Valeur W1" }) as HTMLInputElement;
    expect(w1().checked, "le classement déjà porté doit se voir").toBe(true);

    await userEvent.click(screen.getByRole("checkbox", { name: "Valeur W2" }));
    const apresAjout = range.mock.calls[0]?.[0] as ClassementLocal;
    expect(apresAjout.axes["b"]).toEqual({ type: "reference", valeurs: ["w1", "w2"] });

    rerender(<Catalogue {...socle} schema={SCHEMA} empreinte={EMPREINTE} classement={apresAjout} onClasser={range} />);
    await userEvent.click(w1());
    expect((range.mock.calls[1]?.[0] as ClassementLocal).axes["b"]).toEqual({ type: "reference", valeurs: ["w2"] });
  });

  it("retirer la dernière valeur d’un axe le laisse vide, sans inventer de valeur par défaut", async () => {
    const range = vi.fn();
    const deja: ClassementLocal = {
      empreinte: EMPREINTE,
      schema: "essai",
      schemaVersion: 2,
      axes: { a: { type: "reference", valeurs: ["v1"] } },
      origine: "manuel",
    };
    render(<Catalogue {...socle} schema={SCHEMA} empreinte={EMPREINTE} classement={deja} onClasser={range} />);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Premier axe" }), "");
    expect((range.mock.calls[0]?.[0] as ClassementLocal).axes["a"], "non rangé est une réponse").toBeUndefined();
  });
});

describe("filtrer les documents de la bibliothèque sur leur classement (CLA-10)", () => {
  /** Le Catalogue filtrait les **pages** d'un document, sur des valeurs portées page par page.
   *  Le classement, lui, est par document. Les filtres comptent donc sur la table des
   *  classements — reçue à part, jamais recopiée dans la vue. */
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  const C = "c".repeat(64);

  const apercu = (empreinte: string, nom: string): unknown => ({
    empreinte,
    version: ID(9),
    activeeLe: 1,
    nom,
    compteurs: [],
    aVerifier: 0,
  });

  const DOCUMENTS = [apercu(A, "Premier document"), apercu(B, "Deuxième document"), apercu(C, "Troisième document")].map(
    (un) => ApercuDocument.parse(un),
  );

  const range = (empreinte: string, valeur: string): ClassementLocal => ({
    empreinte,
    schema: "essai",
    schemaVersion: 2,
    axes: { a: { type: "reference", valeurs: [valeur] } },
    origine: "import",
  });

  // Le troisième n'est rangé nulle part : c'est le cas qu'il faut pouvoir dire.
  const CLASSEMENTS = new Map([
    [A, range(A, "v1")],
    [B, range(B, "v2")],
  ]);

  const avecDocuments = {
    ...socle,
    schema: SCHEMA,
    documents: DOCUMENTS,
    classements: CLASSEMENTS,
  };

  it("montre tous les documents quand aucun filtre n’est posé", () => {
    render(<Catalogue {...avecDocuments} onDocument={() => undefined} />);
    const liste = screen.getByRole("list", { name: /documents/i });
    expect(within(liste).getAllByRole("listitem")).toHaveLength(3);
  });

  it("ne rend que les documents rangés sous la valeur choisie", async () => {
    render(<Catalogue {...avecDocuments} onDocument={() => undefined} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /Valeur une/ }));

    const liste = screen.getByRole("list", { name: /documents/i });
    const restants = within(liste).getAllByRole("listitem");
    expect(restants).toHaveLength(1);
    expect(restants[0]?.textContent).toContain("Premier document");
  });

  it("un document rangé nulle part disparaît dès qu’un filtre est posé, au lieu de passer partout", async () => {
    render(<Catalogue {...avecDocuments} onDocument={() => undefined} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /Valeur deux/ }));

    const liste = screen.getByRole("list", { name: /documents/i });
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Troisième document")).toBeNull();
  });

  it("choisir un document le dit à l’application", async () => {
    const choisi = vi.fn();
    render(<Catalogue {...avecDocuments} onDocument={choisi} />);

    await userEvent.click(screen.getByRole("button", { name: /Deuxième document/ }));
    expect(choisi).toHaveBeenCalledWith(B);
  });
});
