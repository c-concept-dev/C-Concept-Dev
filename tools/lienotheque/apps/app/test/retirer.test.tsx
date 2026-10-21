import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Retirer } from "../src/pages/Retirer.js";

/** Retirer une bibliothèque : deux gestes, et un seul qui demande à être armé (UX-01)
 *
 *  ## Ce que ces épreuves gardent
 *
 *  Qu'**oublier reste à un clic** — il ne détruit rien, et le rendre pénible ferait hésiter
 *  devant le geste inoffensif — et que **supprimer demande de retaper le nom**. Ce garde-fou-là
 *  n'est pas une case à cocher de plus : il oblige à lire ce qu'on s'apprête à faire, ce qu'aucune
 *  confirmation par oui/non n'obtient.
 *
 *  Et que l'écran **dise où va le dossier**. Une personne qui sait son geste réversible le fait
 *  sans angoisse ; une qui l'ignore hésite devant un bouton dont elle a pourtant besoin.
 */

const poser = (sur: Partial<Parameters<typeof Retirer>[0]> = {}) => {
  const onOublier = vi.fn();
  const onSupprimer = vi.fn();
  const onAnnuler = vi.fn();
  render(
    <Retirer
      nom="Prof de basse"
      racine="/Volumes/Disque/Prof de basse"
      onOublier={onOublier}
      onSupprimer={onSupprimer}
      onAnnuler={onAnnuler}
      {...sur}
    />,
  );
  return { onOublier, onSupprimer, onAnnuler };
};

describe("retirer une bibliothèque (UX-01)", () => {
  it("dit ce que chaque geste fait, et où part le dossier", () => {
    poser();
    expect(screen.getByRole("heading", { level: 1, name: /Prof de basse/ })).toBeInTheDocument();
    const vu = screen.getByRole("main").textContent ?? "";
    expect(vu, "l’oubli doit se dire inoffensif").toMatch(/restent où ils sont/);
    expect(vu, "la suppression doit se dire réversible").toMatch(/corbeille/);
    expect(vu, "on montre le dossier qu’on s’apprête à jeter").toContain("/Volumes/Disque/Prof de basse");
  });

  it("oublier se fait d’un clic : il ne détruit rien", async () => {
    const { onOublier, onSupprimer } = poser();
    await userEvent.click(screen.getByRole("button", { name: /Oublier cette bibliothèque/ }));
    expect(onOublier).toHaveBeenCalledTimes(1);
    expect(onSupprimer).not.toHaveBeenCalled();
  });

  it("supprimer reste désarmé tant que le nom n’est pas retapé", async () => {
    poser();
    const bouton = screen.getByRole("button", { name: /Mettre à la corbeille/ });
    expect(bouton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/retapez le nom/i), "Prof de bass");
    expect(bouton, "un nom approchant ne suffit pas").toBeDisabled();
  });

  it("et s’arme au nom exact", async () => {
    const { onSupprimer } = poser();
    await userEvent.type(screen.getByLabelText(/retapez le nom/i), "Prof de basse");

    const bouton = screen.getByRole("button", { name: /Mettre à la corbeille/ });
    expect(bouton).toBeEnabled();
    await userEvent.click(bouton);
    expect(onSupprimer).toHaveBeenCalledTimes(1);
  });

  it("laisse partir sans rien faire", async () => {
    const { onAnnuler, onOublier, onSupprimer } = poser();
    await userEvent.click(screen.getByRole("button", { name: /Annuler/ }));
    expect(onAnnuler).toHaveBeenCalledTimes(1);
    expect(onOublier).not.toHaveBeenCalled();
    expect(onSupprimer).not.toHaveBeenCalled();
  });

  it("dit ce qui a empêché le retrait, au lieu de se taire", () => {
    poser({ echec: "Ce dossier ne porte pas de bibliothèque : rien n’a été touché." });
    expect(screen.getByRole("alert")).toHaveTextContent(/rien n’a été touché/);
  });

  it("n’arme rien pendant qu’un retrait est en cours", async () => {
    poser({ occupe: true });
    await userEvent.type(screen.getByLabelText(/retapez le nom/i), "Prof de basse");
    expect(screen.getByRole("button", { name: /Mettre à la corbeille/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Oublier/ })).toBeDisabled();
  });
});
