import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentSuspect, Doublons as DoublonsTrouves } from "@lienotheque/contrats";
import { Doublons } from "../src/pages/Doublons.js";

/** Ce qui se trouve deux fois : décrit, et jamais effacé d'office (HER-07, HER-08).
 *
 *  Ces épreuves tiennent la promesse qui fait l'écran : il **propose**, et c'est la personne qui
 *  retire. Un écran qui se mettrait à supprimer de lui-même emporterait des documents qu'on
 *  voulait garder — un même ouvrage en deux formats se ressemble autant qu'une vraie copie — et
 *  aucune mesure ne l'en empêcherait. D'où ce qu'on éprouve ici : aucun bouton de retrait en lot,
 *  un retrait qui s'arme, et des faits assez précis pour choisir. */

afterEach(cleanup);

const suspect = (empreinte: string, nom: string, trop: Partial<DocumentSuspect> = {}): DocumentSuspect => ({
  empreinte: empreinte.padEnd(64, "0"),
  nom,
  pages: 158,
  passages: 158,
  mots: 51_469,
  octets: 124_000_000,
  ...trop,
});

const deuxQuiSeRessemblent: DoublonsTrouves = {
  groupes: [
    {
      documents: [
        suspect("aa", "Un ouvrage numérisé.pdf"),
        suspect("bb", "Le même, mieux numérisé.pdf", { octets: 345_000_000, mots: 51_627 }),
      ],
      ressemblance: 0.959,
    },
  ],
  tropPeuDeTexte: [],
};

const monter = (trouves?: DoublonsTrouves) => {
  const onChercher = vi.fn();
  const onRetirer = vi.fn();
  const onRetour = vi.fn();
  render(
    <Doublons
      nom="Ma bibliothèque"
      onChercher={onChercher}
      onRetirer={onRetirer}
      onRetour={onRetour}
      {...(trouves === undefined ? {} : { trouves })}
    />,
  );
  return { onChercher, onRetirer, onRetour };
};

describe("ce qui se trouve deux fois (HER-08)", () => {
  /** « Pas encore cherché » et « rien trouvé » ne sont pas la même chose, et le dire à la place
   *  de l'autre est un mensonge : annoncer une bibliothèque propre avant de l'avoir lue. */
  it("HER-08 : avant toute recherche, il ne prétend pas que la bibliothèque est propre", () => {
    monter();
    expect(screen.queryByText(/Aucun document n’en double un autre/)).toBeNull();
    expect(screen.getByRole("button", { name: /Chercher les doublons/ })).toBeTruthy();
  });

  it("HER-08 : une recherche qui n’a rien trouvé le dit", () => {
    monter({ groupes: [], tropPeuDeTexte: [] });
    expect(screen.getByText(/Aucun document n’en double un autre/)).toBeTruthy();
  });

  /** Les faits qui distinguent deux documents sont ce qui permet de choisir. Sans le poids, deux
   *  numérisations du même livre sont indiscernables à l'écran — et c'est justement le cas
   *  mesuré le 22 octobre : 118 Mo contre 329 Mo pour le même nombre de pages. */
  it("HER-08 : chaque document montre de quoi le distinguer de son jumeau", () => {
    monter(deuxQuiSeRessemblent);
    expect(screen.getByText("Un ouvrage numérisé.pdf")).toBeTruthy();
    expect(screen.getByText("Le même, mieux numérisé.pdf")).toBeTruthy();
    // Le poids, en mégaoctets lisibles : c'est lui qui sépare les deux.
    expect(screen.getByText(/118 Mo/)).toBeTruthy();
    expect(screen.getByText(/329 Mo/)).toBeTruthy();
    expect(screen.getByText(/96\s*%/)).toBeTruthy();
  });

  /** **Le cœur de l'écran.** Aucun bouton ne doit proposer de retirer un groupe, « les doublons »,
   *  ou quoi que ce soit en lot : c'est précisément le geste qu'aucune mesure ne justifie. */
  it("HER-08 : il ne propose aucun retrait en lot, seulement document par document", () => {
    monter(deuxQuiSeRessemblent);
    const boutons = screen.getAllByRole("button").map((bouton) => bouton.textContent ?? "");
    const enLot = boutons.filter((libelle) => /tout|doublons|groupe|lot/i.test(libelle) && /[Rr]etir|[Ss]upprim/.test(libelle));
    expect(enLot, `un retrait en lot est proposé : ${enLot.join(", ")}`).toEqual([]);
    // Un bouton de retrait par document, et pas un de plus.
    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(2);
  });

  /** Un premier clic arme, un second retire. Deux documents qui se ressemblent se confondent :
   *  un retrait qui part au premier clic emporterait le mauvais. */
  it("HER-07 : le retrait s’arme avant de partir, et n’appelle rien au premier clic", async () => {
    const { onRetirer } = monter(deuxQuiSeRessemblent);
    await userEvent.click(screen.getAllByRole("button", { name: "Retirer" })[0]!);
    expect(onRetirer).not.toHaveBeenCalled();

    const confirmer = screen.getByRole("button", { name: /Confirmer le retrait/ });
    await userEvent.click(confirmer);
    expect(onRetirer).toHaveBeenCalledWith("aa".padEnd(64, "0"));
  });

  /** Un seul document armé à la fois : deux boutons « Confirmer » côte à côte invitent à se
   *  tromper, et ce sont justement des documents qui se ressemblent. */
  it("HER-07 : un seul document peut être armé à la fois", async () => {
    monter(deuxQuiSeRessemblent);
    await userEvent.click(screen.getAllByRole("button", { name: "Retirer" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(screen.getAllByRole("button", { name: /Confirmer le retrait/ })).toHaveLength(1);
  });

  /** Ce qui part va à la corbeille, et c'est écrit : une personne qui sait son geste réversible
   *  le fait sans angoisse, et une qui l'ignore hésite devant un bouton dont elle a besoin. */
  it("HER-07 : l’écran dit que ce qui part va à la corbeille", () => {
    monter(deuxQuiSeRessemblent);
    expect(screen.getByText(/à la corbeille/)).toBeTruthy();
  });

  /** Les documents dont on n'a presque rien lu ne sont pas comparés — et ne sont pas tus.
   *  Les taire les ferait passer pour comparés, donc pour uniques. */
  it("HER-08 : les documents trop peu lus sont montrés à part, avec pourquoi", () => {
    monter({
      groupes: [],
      tropPeuDeTexte: [suspect("cc", "Des feuilles numérisées.pdf", { mots: 141, pages: 96 })],
    });
    expect(screen.getByText(/n’ont pas pu être comparés|n’a pas pu être comparé/)).toBeTruthy();
    expect(screen.getByText(/deux textes de cent mots se ressemblent toujours/)).toBeTruthy();
    expect(screen.getByText("Des feuilles numérisées.pdf")).toBeTruthy();
  });

  /** Pendant une recherche de dix secondes, le bouton ne doit pas se représenter comme prêt. */
  it("HER-08 : pendant la recherche, le bouton dit ce qui se passe et ne se represse pas", () => {
    render(
      <Doublons nom="Ma bibliothèque" onChercher={vi.fn()} onRetirer={vi.fn()} onRetour={vi.fn()} occupe={true} />,
    );
    const bouton = screen.getByRole("button", { name: /Je lis la bibliothèque/ });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
  });
});
