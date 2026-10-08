import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModeleBibliotheque } from "@lienotheque/contrats";
import { Creer } from "../src/pages/Creer.js";

/** L'assistant de création (maquette 1, PLT-02, CLA-01, CLA-09, UX-06, UX-09).
 *
 *  Les modèles sont des données : ceux d'ici sont inventés pour le test, et l'écran les montre
 *  sans en connaître un seul. */

const MODELES = [
  ModeleBibliotheque.parse({
    cle: "premier-modele",
    nom: "Premier rangement",
    langue: "fr",
    version: 1,
    axes: [
      { cle: "un-axe", nom: "Un axe", nature: "referentiel", cardinalite: "une", valeurs: [{ cle: "une-valeur", nom: "Une valeur" }] },
      { cle: "autre-axe", nom: "Un autre axe", nature: "etiquettes", cardinalite: "plusieurs" },
    ],
  }),
  ModeleBibliotheque.parse({
    cle: "second-modele",
    nom: "Second rangement",
    langue: "fr",
    version: 1,
    axes: [{ cle: "seul-axe", nom: "Seul axe", nature: "etiquettes", cardinalite: "plusieurs" }],
  }),
];

/** Mène l'assistant jusqu'au bout et rend ce que l'écran a demandé de créer. */
async function creerJusquAuBout(onCreer = vi.fn()): Promise<ReturnType<typeof vi.fn>> {
  const personne = userEvent.setup();
  render(<Creer modeles={MODELES} prises={[]} onCreer={onCreer} onAnnuler={vi.fn()} />);

  await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
  await personne.click(screen.getByRole("button", { name: /Continuer/ }));
  await personne.click(screen.getByRole("button", { name: /Audio/ }));
  await personne.click(screen.getByRole("button", { name: /Continuer/ }));
  await personne.click(screen.getByRole("radio", { name: /Premier rangement/ }));
  await personne.click(screen.getByRole("button", { name: /Continuer/ }));
  await personne.type(screen.getByLabelText("Dossier"), "/un/dossier");
  await personne.click(screen.getByRole("button", { name: /Créer la bibliothèque/ }));
  return onCreer;
}

describe("les quatre temps se parcourent (maquette 1)", () => {
  it("s'ouvre au premier temps, et le dit", () => {
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    expect(screen.getByText("Étape 1 sur 4")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Nom");
  });

  it("n'avance pas tant qu'il manque quelque chose, et dit quoi (UX-09)", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Continuer/ })).toBeDisabled();
    expect(screen.getByText("Donnez un nom à cette bibliothèque.")).toBeInTheDocument();

    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    expect(screen.getByRole("button", { name: /Continuer/ })).toBeEnabled();
  });

  it("le retour est éteint au premier temps : il n'y a nulle part où revenir", () => {
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Retour/ })).toBeDisabled();
  });

  it("revient en arrière sans rien oublier de ce qui a été saisi", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);

    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("button", { name: /Retour/ }));

    expect(screen.getByLabelText("Nom")).toHaveValue("Ma bibliothèque");
  });

  it("se parcourt entièrement au clavier (UX-06)", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);

    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    const tuile = screen.getByRole("button", { name: /Audio/ });
    tuile.focus();
    await personne.keyboard(" ");
    expect(tuile).toHaveAttribute("aria-pressed", "true");
  });
});

describe("le deuxième temps : ce que la bibliothèque contiendra", () => {
  it("laisse choisir plusieurs types, et le marque autrement que par la couleur", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    await personne.click(screen.getByRole("button", { name: /Audio/ }));
    await personne.click(screen.getByRole("button", { name: /Vidéos/ }));
    expect(screen.getByRole("button", { name: /Audio/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Vidéos/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Images/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("« un mélange » prend tout, et le reprendre rend tout libre", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    await personne.click(screen.getByRole("button", { name: /Un mélange/ }));
    expect(screen.getByRole("button", { name: /Audio/ })).toHaveAttribute("aria-pressed", "true");
    await personne.click(screen.getByRole("button", { name: /Un mélange/ }));
    expect(screen.getByRole("button", { name: /Audio/ })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("le troisième temps : le rangement vient des modèles (CLA-09)", () => {
  it("propose chaque modèle reçu, sans en nommer aucun dans le code", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("button", { name: /Audio/ }));
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    for (const modele of MODELES)
      expect(screen.getByRole("radio", { name: new RegExp(modele.nom) })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /La mienne/ })).toBeInTheDocument();
  });

  it("« la mienne » demande son nom, et bloque tant qu'il manque", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("button", { name: /Audio/ }));
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    await personne.click(screen.getByRole("radio", { name: /La mienne/ }));
    expect(screen.getByRole("button", { name: /Continuer/ })).toBeDisabled();
    await personne.type(screen.getByLabelText("Son nom"), "Par lieu");
    expect(screen.getByRole("button", { name: /Continuer/ })).toBeEnabled();
  });

  it("les mots de la bibliothèque se changent, au singulier et au pluriel (CLA-01)", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("button", { name: /Audio/ }));
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("radio", { name: /Premier rangement/ }));

    const singuliers = screen.getAllByLabelText("Un");
    const pluriels = screen.getAllByLabelText("Plusieurs");
    expect(singuliers).toHaveLength(3);
    expect(pluriels).toHaveLength(3);

    await personne.clear(pluriels[0]!);
    expect(screen.getByRole("button", { name: /Continuer/ })).toBeDisabled();
    await personne.type(pluriels[0]!, "pièces");
    expect(screen.getByRole("button", { name: /Continuer/ })).toBeEnabled();
  });
});

describe("l'aperçu suit la frappe", () => {
  it("montre le nom, puis l'adresse qu'il donnera", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    const apercu = screen.getByRole("complementary", { name: "Aperçu" });

    expect(within(apercu).getByText("Sans nom pour l’instant")).toBeInTheDocument();
    await personne.type(screen.getByLabelText("Nom"), "Été 1977");
    expect(within(apercu).getByText("Adresse : ete-1977")).toBeInTheDocument();
  });

  it("écarte l'adresse de celles déjà prises", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={["ete-1977"]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);

    await personne.type(screen.getByLabelText("Nom"), "Été 1977");
    expect(screen.getByText("Adresse : ete-1977-2")).toBeInTheDocument();
  });

  it("reprend les mots de la bibliothèque, jamais les nôtres (CLA-01)", async () => {
    const personne = userEvent.setup();
    render(<Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} />);
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("button", { name: /Audio/ }));
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    const singuliers = screen.getAllByLabelText("Un");
    await personne.clear(singuliers[0]!);
    await personne.type(singuliers[0]!, "repère");
    expect(screen.getByRole("complementary", { name: "Aperçu" })).toHaveTextContent(/un repère mènera/);
  });
});

describe("au bout, l'hôte écrit — jamais la page (JOB-06)", () => {
  it("rend une description validée par son contrat, et le dossier choisi", async () => {
    const onCreer = await creerJusquAuBout();
    expect(onCreer).toHaveBeenCalledTimes(1);

    const [description, dossier] = onCreer.mock.calls[0] as [{ id: string; schema: { axes: unknown[] } }, string];
    expect(description.id).toBe("ma-bibliotheque");
    expect(description.schema.axes).toHaveLength(MODELES[0]!.axes.length);
    expect(dossier).toBe("/un/dossier");
  });

  it("dit l'échec plutôt que de prétendre avoir créé (JOB-05)", async () => {
    const onCreer = vi.fn().mockRejectedValue(new Error("Ce dossier porte déjà une bibliothèque."));
    await creerJusquAuBout(onCreer);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce dossier porte déjà une bibliothèque.");
  });

  it("n'offre le sélecteur de dossier que là où il existe", async () => {
    const personne = userEvent.setup();
    const choisir = vi.fn().mockResolvedValue("/dossier/choisi");
    render(
      <Creer modeles={MODELES} prises={[]} onCreer={vi.fn()} onAnnuler={vi.fn()} onChoisirDossier={choisir} />,
    );
    await personne.type(screen.getByLabelText("Nom"), "Ma bibliothèque");
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("button", { name: /Audio/ }));
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));
    await personne.click(screen.getByRole("radio", { name: /Premier rangement/ }));
    await personne.click(screen.getByRole("button", { name: /Continuer/ }));

    await personne.click(screen.getByRole("button", { name: "Choisir un dossier" }));
    expect(screen.getByLabelText("Dossier")).toHaveValue("/dossier/choisi");
  });

  it("annuler ne crée rien", async () => {
    const personne = userEvent.setup();
    const onAnnuler = vi.fn();
    const onCreer = vi.fn();
    render(<Creer modeles={MODELES} prises={[]} onCreer={onCreer} onAnnuler={onAnnuler} />);

    await personne.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onAnnuler).toHaveBeenCalledTimes(1);
    expect(onCreer).not.toHaveBeenCalled();
  });
});
