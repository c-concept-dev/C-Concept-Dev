import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  BadgeEtat,
  Bouton,
  CarteBibliotheque,
  CarteReprise,
  ChampRecherche,
  Progression,
  ZoneDepot,
} from "../src/composants/index.js";

describe("bouton (UX-06 : parcours complet sans souris)", () => {
  it("rend son libellé et déclenche l'action au clic", async () => {
    const action = vi.fn();
    const utilisateur = userEvent.setup();
    render(<Bouton onClick={action}>Nouvelle bibliothèque</Bouton>);

    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle bibliothèque" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("s'active au clavier seul, par Entrée puis par Espace", async () => {
    const action = vi.fn();
    const utilisateur = userEvent.setup();
    render(<Bouton onClick={action}>Rechercher</Bouton>);

    await utilisateur.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await utilisateur.keyboard("{Enter}");
    await utilisateur.keyboard(" ");
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("en chargement : neutralisé et annoncé occupé", () => {
    render(
      <Bouton chargement variante="principal">
        Enregistrement…
      </Bouton>,
    );
    const bouton = screen.getByRole("button", { name: "Enregistrement…" });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveAttribute("aria-busy", "true");
  });

  it("désactivé : aucun déclenchement", async () => {
    const action = vi.fn();
    const utilisateur = userEvent.setup();
    render(
      <Bouton disabled onClick={action}>
        Indisponible
      </Bouton>,
    );

    await utilisateur.click(screen.getByRole("button", { name: "Indisponible" }));
    expect(action).not.toHaveBeenCalled();
  });
});

describe("champ de recherche (UX-06 et raccourci Cmd+K du CDC)", () => {
  const monter = (onRecherche: (texte: string) => void) =>
    render(
      <ChampRecherche
        etiquette="Rechercher dans toutes vos bibliothèques"
        placeholder="Document, auteur ou mot-clé"
        onRecherche={onRecherche}
      />,
    );

  it("porte un nom accessible et un rôle de recherche", () => {
    monter(vi.fn());
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByLabelText("Rechercher dans toutes vos bibliothèques")).toBeInTheDocument();
  });

  it("se soumet au clavier seul et nettoie la saisie", async () => {
    const chercher = vi.fn();
    const utilisateur = userEvent.setup();
    monter(chercher);

    await utilisateur.type(screen.getByRole("searchbox"), "  sociologie  {Enter}");
    expect(chercher).toHaveBeenCalledWith("sociologie");
  });

  it("Cmd+K place le curseur dans le champ depuis n'importe où", async () => {
    const utilisateur = userEvent.setup();
    monter(vi.fn());

    document.body.focus();
    await utilisateur.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("Ctrl+K fait de même sur un clavier sans touche Commande", async () => {
    const utilisateur = userEvent.setup();
    monter(vi.fn());

    await utilisateur.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });
});

describe("carte de bibliothèque (UX-09 et charte v3)", () => {
  const carte = (
    <CarteBibliotheque
      nom="Méthode d'instrument"
      href="#bibliotheque-1"
      collection="method"
      icones={["document", "audio"]}
      compteurs={["412 éléments", "380 liens"]}
      aVerifier="9 à vérifier"
      hebergement={{ libelle: "Ordinateur", icones: ["ordinateur"] }}
      etat={{ libelle: "Prêt", icone: "valide" }}
      ouverte="il y a 2 h"
      partages={2}
    />
  );

  it("nomme son lien par la bibliothèque, jamais « Ouvrir »", () => {
    render(carte);
    expect(screen.getByRole("link", { name: "Méthode d'instrument" })).toHaveAttribute("href", "#bibliotheque-1");
    expect(screen.queryByRole("link", { name: /ouvrir/i })).not.toBeInTheDocument();
  });

  it("ne met aucun texte dans le bandeau de collection (taupe sous 4,5:1)", () => {
    const { container } = render(carte);
    const bandeau = container.querySelector(".ln-carte__bandeau");
    expect(bandeau).not.toBeNull();
    expect(bandeau?.textContent).toBe("");
    expect(bandeau?.querySelectorAll("svg").length).toBe(2);
  });

  it("affiche les compteurs du schéma et l'avertissement à vérifier", () => {
    render(carte);
    expect(screen.getByText("412 éléments")).toBeInTheDocument();
    expect(screen.getByText("380 liens")).toBeInTheDocument();
    expect(screen.getByText("9 à vérifier")).toBeInTheDocument();
    expect(screen.getByText("Ouverte il y a 2 h")).toBeInTheDocument();
  });
});

describe("carte « Reprendre » (UX-01, ANC-02)", () => {
  it("nomme le document et relie l'origine à la cible", () => {
    render(
      <CarteReprise
        titre="Méthode d'instrument"
        href="#lecteur-1"
        origine="Page 127"
        cible="piste 41"
        quand="il y a 2 h"
      />,
    );
    const article = screen.getByRole("article");
    expect(within(article).getByRole("link", { name: "Méthode d'instrument" })).toBeInTheDocument();
    expect(article).toHaveTextContent("Page 127");
    expect(article).toHaveTextContent("piste 41");
    expect(article).toHaveTextContent("relié à");
  });

  it("sans ancre reliée, n'invente aucune position", () => {
    render(<CarteReprise titre="Essai de sociologie" href="#lecteur-2" origine="Chapitre 4, page 88" quand="hier" />);
    expect(screen.getByRole("article")).not.toHaveTextContent("relié à");
  });
});

describe("badge d'état (UX-07 : la couleur ne porte jamais seule l'information)", () => {
  it("affiche toujours un texte, y compris en avertissement", () => {
    render(
      <>
        <BadgeEtat>412 éléments</BadgeEtat>
        <BadgeEtat ton="avertissement" icone="alerte">
          9 à vérifier
        </BadgeEtat>
      </>,
    );
    expect(screen.getByText("412 éléments")).toBeInTheDocument();
    expect(screen.getByText("9 à vérifier")).toBeInTheDocument();
  });
});

describe("progression (JOB-03, UX-07 : pourcentage écrit et liseré)", () => {
  it("écrit le pourcentage et expose les valeurs ARIA", () => {
    render(<Progression valeur={0.6} etiquette="Transcription" complement="environ 4 min" />);
    const barre = screen.getByRole("progressbar", { name: "Transcription" });
    expect(barre).toHaveAttribute("aria-valuenow", "60");
    expect(barre).toHaveAttribute("aria-valuemin", "0");
    expect(barre).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("60 % · environ 4 min")).toBeInTheDocument();
  });

  it("borne les valeurs hors plage plutôt que de les afficher", () => {
    const { rerender } = render(<Progression valeur={-1} etiquette="Lecture" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    rerender(<Progression valeur={4} etiquette="Lecture" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("zone de dépôt (UX-06 : tout glisser-déposer a une alternative clavier)", () => {
  const monter = (onFichiers: (fichiers: readonly File[]) => void) =>
    render(
      <ZoneDepot
        titre="Déposez des fichiers ici"
        aide="Liénothèque proposera la bonne bibliothèque."
        libelleBouton="Choisir des fichiers"
        onFichiers={onFichiers}
      />,
    );

  it("expose un champ de fichiers nommé et atteignable au clavier", async () => {
    const utilisateur = userEvent.setup();
    monter(vi.fn());
    const champ = screen.getByLabelText("Choisir des fichiers");

    expect(champ).toBeEnabled();
    await utilisateur.tab();
    expect(champ).toHaveFocus();
  });

  it("traite de la même façon la sélection et le dépôt", async () => {
    const recus: string[][] = [];
    const utilisateur = userEvent.setup();
    const { container } = monter((fichiers) => recus.push(fichiers.map((f) => f.name)));

    await utilisateur.upload(
      screen.getByLabelText("Choisir des fichiers"),
      new File(["a"], "methode.pdf", { type: "application/pdf" }),
    );

    const zone = container.querySelector(".ln-depot");
    expect(zone).not.toBeNull();
    fireEvent.drop(zone as Element, {
      dataTransfer: { files: [new File(["b"], "piste.mp3", { type: "audio/mpeg" })] },
    });

    expect(recus).toEqual([["methode.pdf"], ["piste.mp3"]]);
  });

  it("annonce le nombre de fichiers retenus dans une région vivante", async () => {
    const utilisateur = userEvent.setup();
    monter(vi.fn());

    await utilisateur.upload(screen.getByLabelText("Choisir des fichiers"), [
      new File(["a"], "un.pdf"),
      new File(["b"], "deux.pdf"),
    ]);
    expect(screen.getByText("2 fichiers retenus.")).toBeInTheDocument();
  });
});
