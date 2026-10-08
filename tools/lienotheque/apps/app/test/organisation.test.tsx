import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DescriptionBibliotheque, type SchemaBibliotheque } from "@lienotheque/contrats";
import { Organisation } from "../src/pages/Organisation.js";

/** L'écran d'organisation (maquette 2, CLA-01 à CLA-08, REC-03, UX-06, UX-09).
 *
 *  Les noms d'axes et de valeurs sont des données : ceux d'ici sont inventés pour le test. Aucun
 *  n'est écrit dans l'écran. */

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
      {
        cle: "second-axe",
        nom: "Second axe",
        nature: "etiquettes",
        cardinalite: "plusieurs",
      },
    ],
  },
});

/** L'écran, et le dernier schéma qu'il a demandé d'écrire. */
function poser(sur: Partial<Parameters<typeof Organisation>[0]> = {}): {
  readonly onSchema: ReturnType<typeof vi.fn>;
  readonly dernier: () => SchemaBibliotheque;
} {
  const onSchema = vi.fn();
  render(<Organisation description={DESCRIPTION} onSchema={onSchema} onValider={vi.fn()} {...sur} />);
  return {
    onSchema,
    dernier: () => (onSchema.mock.calls.at(-1) as [SchemaBibliotheque])[0],
  };
}

const axeDe = (schema: SchemaBibliotheque, cle: string): SchemaBibliotheque["axes"][number] =>
  schema.axes.find((axe) => axe.cle === cle)!;

/** Ouvre la valeur nommée du premier axe. */
async function ouvrirValeur(personne: ReturnType<typeof userEvent.setup>, nom: string): Promise<void> {
  await personne.click(screen.getByRole("button", { name: new RegExp(`^${nom}`) }));
}

describe("ce que l'écran montre (maquette 2)", () => {
  it("nomme la bibliothèque, et compte ses façons de ranger avec ses mots (CLA-01)", () => {
    poser();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Organisation de Une bibliothèque");
    expect(screen.getByText(/2 façons de ranger vos repères/)).toBeInTheDocument();
  });

  it("montre chaque façon de ranger et chacune de ses valeurs", () => {
    poser();
    for (const axe of DESCRIPTION.schema.axes) expect(screen.getByText(axe.nom)).toBeInTheDocument();
    for (const valeur of DESCRIPTION.schema.axes[0]!.valeurs)
      expect(screen.getByRole("button", { name: new RegExp(`^${valeur.nom}`) })).toBeInTheDocument();
  });

  it("dit « étiquettes libres » quand il n'y a pas encore de liste", () => {
    poser();
    expect(screen.getByText("Étiquettes libres")).toBeInTheDocument();
  });

  it("n'invente pas d'exemples quand la bibliothèque n'a encore rien", () => {
    poser();
    expect(screen.queryByText(/Ce que cela donnera/)).not.toBeInTheDocument();
  });
});

describe("renommer change le nom, et lui seul (CLA-08)", () => {
  it("une façon de ranger se renomme, et garde sa clé", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await personne.click(screen.getByRole("button", { name: "Renommer Premier axe" }));
    const champ = screen.getByLabelText("Nouveau nom de Premier axe");
    await personne.clear(champ);
    await personne.type(champ, "Autrement dit");
    await personne.click(screen.getByRole("button", { name: "Renommer" }));

    expect(axeDe(dernier(), "premier-axe").nom).toBe("Autrement dit");
    expect(screen.getByText("Autrement dit")).toBeInTheDocument();
  });

  it("une valeur se renomme, et garde sa clé", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await ouvrirValeur(personne, "Première");
    const champ = screen.getByLabelText("Son nom");
    await personne.clear(champ);
    await personne.type(champ, "Autrement dite");
    await personne.click(screen.getByRole("button", { name: "Renommer" }));

    const valeur = axeDe(dernier(), "premier-axe").valeurs.find((candidate) => candidate.cle === "premiere");
    expect(valeur?.nom).toBe("Autrement dite");
    expect(valeur?.cle).toBe("premiere");
  });

  it("un nom vide est refusé, et la raison s'affiche (UX-09)", async () => {
    const personne = userEvent.setup();
    const { onSchema } = poser();

    await personne.click(screen.getByRole("button", { name: "Renommer Premier axe" }));
    await personne.clear(screen.getByLabelText("Nouveau nom de Premier axe"));
    await personne.click(screen.getByRole("button", { name: "Renommer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Donnez un nom à cette façon de ranger.");
    expect(onSchema).not.toHaveBeenCalled();
  });
});

describe("ajouter", () => {
  it("une valeur apparaît dans la liste", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await personne.click(screen.getByRole("button", { name: "Ajouter une valeur sur Premier axe" }));
    await personne.type(screen.getByLabelText("Nom de la valeur à ajouter sur Premier axe"), "Quatrième");
    await personne.click(screen.getByRole("button", { name: "Ajouter cette valeur" }));

    expect(axeDe(dernier(), "premier-axe").valeurs.at(-1)?.nom).toBe("Quatrième");
    expect(screen.getByRole("button", { name: /^Quatrième/ })).toBeInTheDocument();
  });

  it("une façon de ranger neuve part d'étiquettes libres", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await personne.click(screen.getByRole("button", { name: /Ajouter une façon de ranger/ }));
    await personne.type(screen.getByLabelText("Nom de cette façon de ranger"), "Troisième axe");
    await personne.click(screen.getByRole("button", { name: "Ajouter cette façon de ranger" }));

    expect(dernier().axes).toHaveLength(3);
    expect(dernier().axes.at(-1)?.nature).toBe("etiquettes");
  });

  it("refuse un nom déjà porté, et le dit", async () => {
    const personne = userEvent.setup();
    poser();

    await personne.click(screen.getByRole("button", { name: /Ajouter une façon de ranger/ }));
    await personne.type(screen.getByLabelText("Nom de cette façon de ranger"), "Premier axe");
    await personne.click(screen.getByRole("button", { name: "Ajouter cette façon de ranger" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Une façon de ranger porte déjà ce nom.");
  });
});

describe("fusionner et retirer demandent toujours vers quoi (CLA-03, CLA-08)", () => {
  it("fusionner joint les deux : la valeur de départ s'en va, sa clé reste joignable", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await ouvrirValeur(personne, "Première");
    await personne.selectOptions(screen.getByLabelText("Vers quelle valeur"), "seconde");
    await personne.click(screen.getByRole("button", { name: "Fusionner" }));

    const axe = axeDe(dernier(), "premier-axe");
    expect(axe.valeurs.some((valeur) => valeur.cle === "premiere")).toBe(false);
    expect(axe.valeurs.find((valeur) => valeur.cle === "seconde")?.alias).toContain("premiere");
  });

  it("retirer garde la valeur, barrée, et la fait mener à l'autre", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await ouvrirValeur(personne, "Première");
    await personne.selectOptions(screen.getByLabelText("Vers quelle valeur"), "seconde");
    await personne.click(screen.getByRole("button", { name: "Retirer" }));

    const valeur = axeDe(dernier(), "premier-axe").valeurs.find((candidate) => candidate.cle === "premiere");
    expect(valeur?.retiree).toBe(true);
    expect(valeur?.redirigeVers).toBe("seconde");
    expect(screen.getByRole("button", { name: /^Première/ })).toHaveClass("ln-etiquette--retiree");
    expect(screen.getByText(/1 retirée/)).toBeInTheDocument();
  });

  it("les deux gestes restent éteints tant qu'aucune remplaçante n'est choisie", async () => {
    const personne = userEvent.setup();
    poser();

    await ouvrirValeur(personne, "Première");
    expect(screen.getByRole("button", { name: "Fusionner" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retirer" })).toBeDisabled();
  });

  it("une façon de ranger sans autre valeur vivante le dit, au lieu d'offrir un geste impossible", async () => {
    const personne = userEvent.setup();
    const seule = DescriptionBibliotheque.parse({
      ...DESCRIPTION,
      schema: {
        ...DESCRIPTION.schema,
        axes: [{ ...DESCRIPTION.schema.axes[0]!, valeurs: [DESCRIPTION.schema.axes[0]!.valeurs[0]] }],
      },
    });
    render(<Organisation description={seule} onSchema={vi.fn()} onValider={vi.fn()} />);

    await ouvrirValeur(personne, "Première");
    expect(screen.getByText(/seule valeur vivante/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fusionner" })).not.toBeInTheDocument();
  });
});

describe("la cardinalité se change sans jargon (CLA-04)", () => {
  it("les trois choix sont là, et le choisi se lit autrement que par la couleur", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    const groupe = screen.getByRole("radiogroup", { name: "Valeurs par repère sur Premier axe" });
    expect(within(groupe).getByRole("radio", { name: "Une valeur" })).toHaveAttribute("aria-checked", "true");

    await personne.click(within(groupe).getByRole("radio", { name: "Plusieurs" }));
    expect(axeDe(dernier(), "premier-axe").cardinalite).toBe("plusieurs");
  });
});

describe("retirer une façon de ranger est le seul geste qui perd quelque chose", () => {
  it("se refuse tant que des éléments y sont rangés, en disant combien", async () => {
    const personne = userEvent.setup();
    const { onSchema } = poser({ classes: { "premier-axe": 12 } });

    await personne.click(
      screen.getByRole("button", { name: "Retirer Premier axe" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("12 éléments y sont rangés");
    expect(onSchema).not.toHaveBeenCalled();
  });

  it("passe quand rien n'y est rangé", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    await personne.click(
      screen.getByRole("button", { name: "Retirer Premier axe" }),
    );
    expect(dernier().axes.some((axe) => axe.cle === "premier-axe")).toBe(false);
  });
});

describe("une modification est une version (REC-03)", () => {
  it("chaque geste monte la version d'un cran", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    const groupe = screen.getByRole("radiogroup", { name: "Valeurs par repère sur Premier axe" });
    await personne.click(within(groupe).getByRole("radio", { name: "Plusieurs" }));
    expect(dernier().version).toBe(DESCRIPTION.schema.version + 1);

    await personne.click(within(groupe).getByRole("radio", { name: "Principale et secondaires" }));
    expect(dernier().version).toBe(DESCRIPTION.schema.version + 2);
  });

  it("« revenir aux propositions » rend le schéma de départ, et n'est offert qu'après une modification", async () => {
    const personne = userEvent.setup();
    const { dernier } = poser();

    const retour = screen.getByRole("button", { name: "Revenir aux propositions" });
    expect(retour).toBeDisabled();

    const groupe = screen.getByRole("radiogroup", { name: "Valeurs par repère sur Premier axe" });
    await personne.click(within(groupe).getByRole("radio", { name: "Plusieurs" }));
    await personne.click(screen.getByRole("button", { name: "Revenir aux propositions" }));

    expect(dernier().version).toBe(DESCRIPTION.schema.version);
    expect(axeDe(dernier(), "premier-axe").cardinalite).toBe("une");
  });
});

describe("l'écran se parcourt au clavier (UX-06)", () => {
  it("une valeur s'ouvre à la barre d'espace", async () => {
    const personne = userEvent.setup();
    poser();

    const etiquette = screen.getByRole("button", { name: /^Première/ });
    etiquette.focus();
    await personne.keyboard(" ");
    expect(screen.getByLabelText("Son nom")).toHaveValue("Première");
  });

  it("valider rend la main à qui a ouvert l'écran", async () => {
    const personne = userEvent.setup();
    const onValider = vi.fn();
    render(<Organisation description={DESCRIPTION} onSchema={vi.fn()} onValider={onValider} />);

    await personne.click(screen.getByRole("button", { name: /Valider l’organisation/ }));
    expect(onValider).toHaveBeenCalledTimes(1);
  });
});
