import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DescriptionBibliotheque, type SchemaBibliotheque } from "@lienotheque/contrats";
import { Organisation } from "../src/pages/Organisation.js";

/** Les catégories depuis l'écran Organisation (CLA-02, UX-06, UX-09).
 *
 *  Écrits avant les contrôles (CLAUDE.md, règle 2). Le noyau sait rendre un axe hiérarchique et
 *  ranger une valeur sous une autre depuis l'étape 2 ; l'écran ne l'exposait pas — il ne
 *  mentionnait ni `structure` ni `parent`.
 *
 *  Les noms d'axes et de valeurs sont des données : ceux d'ici sont inventés pour le contrôle, et
 *  aucun n'est écrit dans l'écran (CLA-01).
 */

const DESCRIPTION = DescriptionBibliotheque.parse({
  id: "une-bibliotheque",
  nom: "Une bibliothèque",
  contenus: ["documents"],
  mots: {
    element: { un: "repère", plusieurs: "repères" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  schema: {
    cle: "un-schema",
    nom: "Un schéma",
    langue: "fr",
    version: 1,
    axes: [
      {
        cle: "premier-axe",
        nom: "Premier axe",
        nature: "referentiel",
        cardinalite: "une",
        valeurs: [
          { cle: "premiere", nom: "Première" },
          { cle: "seconde", nom: "Seconde" },
          { cle: "troisieme", nom: "Troisième" },
        ],
      },
      { cle: "second-axe", nom: "Second axe", nature: "etiquettes", cardinalite: "plusieurs" },
    ],
  },
});

function poser(): { readonly onSchema: ReturnType<typeof vi.fn>; readonly dernier: () => SchemaBibliotheque } {
  const onSchema = vi.fn();
  render(<Organisation description={DESCRIPTION} onSchema={onSchema} onValider={vi.fn()} />);
  return { onSchema, dernier: () => (onSchema.mock.calls.at(-1) as [SchemaBibliotheque])[0] };
}

const axeDe = (schema: SchemaBibliotheque, cle: string): SchemaBibliotheque["axes"][number] =>
  schema.axes.find((axe) => axe.cle === cle)!;

const valeurDe = (schema: SchemaBibliotheque, cle: string) => axeDe(schema, "premier-axe").valeurs.find((v) => v.cle === cle);

/** Rend le premier axe hiérarchique et range « Seconde » sous « Première ». */
async function construireUnArbre(personne: ReturnType<typeof userEvent.setup>): Promise<void> {
  await personne.click(screen.getByRole("button", { name: "Donner des catégories à Premier axe" }));
  await personne.click(screen.getByRole("button", { name: /^Seconde/ }));
  await personne.selectOptions(screen.getByLabelText("Ranger Seconde sous"), "premiere");
}

describe("donner des catégories à une façon de ranger (CLA-02)", () => {
  it("le propose sur une liste de valeurs, et pas sur des étiquettes libres", () => {
    poser();
    expect(screen.getByRole("button", { name: "Donner des catégories à Premier axe" })).toBeInTheDocument();
    // Des étiquettes libres n'ont pas de liste : il n'y a rien à ranger en arbre, et le noyau
    // refuserait. Ne pas proposer un geste qui sera refusé vaut mieux que le refuser.
    expect(screen.queryByRole("button", { name: "Donner des catégories à Second axe" })).not.toBeInTheDocument();
  });

  it("rend l'axe hiérarchique sans toucher à ses valeurs", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await personne.click(screen.getByRole("button", { name: "Donner des catégories à Premier axe" }));
    expect(axeDe(dernier(), "premier-axe").structure).toBe("hierarchique");
    expect(axeDe(dernier(), "premier-axe").valeurs.map((v) => v.cle)).toEqual(["premiere", "seconde", "troisieme"]);
  });

  it("propose alors de revenir à une liste à plat, et plus de donner des catégories", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.click(screen.getByRole("button", { name: "Donner des catégories à Premier axe" }));
    expect(screen.getByRole("button", { name: "Revenir à une liste à plat sur Premier axe" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Donner des catégories à Premier axe" })).not.toBeInTheDocument();
  });
});

describe("ranger une valeur sous une autre (CLA-02)", () => {
  it("ne propose le choix du parent que sur un axe hiérarchique", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.click(screen.getByRole("button", { name: /^Seconde/ }));
    expect(screen.queryByLabelText("Ranger Seconde sous")).not.toBeInTheDocument();
  });

  it("la range, et l'écrit dans le schéma", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();
    await construireUnArbre(personne);
    expect(valeurDe(dernier(), "seconde")?.parent).toBe("premiere");
  });

  it("ne se propose pas elle-même comme parent", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.click(screen.getByRole("button", { name: "Donner des catégories à Premier axe" }));
    await personne.click(screen.getByRole("button", { name: /^Seconde/ }));
    const choix = screen.getByLabelText("Ranger Seconde sous");
    expect(within(choix).queryByRole("option", { name: "Seconde" })).not.toBeInTheDocument();
    expect(within(choix).getByRole("option", { name: "Première" })).toBeInTheDocument();
  });

  it("la ressort de sa catégorie quand on choisit « aucune »", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();
    await construireUnArbre(personne);
    await personne.click(screen.getByRole("button", { name: /^Seconde/ }));
    await personne.selectOptions(screen.getByLabelText("Ranger Seconde sous"), "");
    expect(valeurDe(dernier(), "seconde")?.parent).toBeUndefined();
  });
});

describe("l'arbre se voit (UX-06)", () => {
  it("montre la valeur rangée sous sa catégorie, et le dit à qui n'y voit pas", async () => {
    const personne = userEvent.setup();
    poser();
    await construireUnArbre(personne);
    // Le groupe porte le nom de sa catégorie : c'est ce qui permet de savoir, au clavier comme
    // à l'œil, sous quoi l'on se trouve.
    const sousPremiere = screen.getByRole("group", { name: "Sous Première" });
    expect(within(sousPremiere).getByRole("button", { name: /^Seconde/ })).toBeInTheDocument();
  });

  it("laisse au premier niveau ce qui n'est rangé nulle part", async () => {
    const personne = userEvent.setup();
    poser();
    await construireUnArbre(personne);
    expect(screen.queryByRole("group", { name: "Sous Troisième" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Troisième/ })).toBeInTheDocument();
  });

  it("n'affiche aucun groupe tant que rien n'est rangé", async () => {
    const personne = userEvent.setup();
    poser();
    await personne.click(screen.getByRole("button", { name: "Donner des catégories à Premier axe" }));
    expect(screen.queryByRole("group", { name: /^Sous / })).not.toBeInTheDocument();
  });
});

describe("un geste refusé se dit, il ne s'éteint pas (UX-09)", () => {
  it("revenir à plat avec une valeur rangée est refusé, et le message nomme la valeur", async () => {
    const personne = userEvent.setup();
    poser();
    await construireUnArbre(personne);

    await personne.click(screen.getByRole("button", { name: "Revenir à une liste à plat sur Premier axe" }));
    const alerte = screen.getByRole("alert");
    expect(alerte).toHaveTextContent(/Seconde/);
  });

  it("et après avoir ressorti la valeur, le retour à plat passe", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();
    await construireUnArbre(personne);
    await personne.click(screen.getByRole("button", { name: /^Seconde/ }));
    await personne.selectOptions(screen.getByLabelText("Ranger Seconde sous"), "");

    await personne.click(screen.getByRole("button", { name: "Revenir à une liste à plat sur Premier axe" }));
    expect(axeDe(dernier(), "premier-axe").structure).toBe("plat");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
