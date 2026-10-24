import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextePage } from "../src/pages/lecteur/TextePage.js";

describe("traduction au clic dans le Lecteur (OUT-11)", () => {
  it("montre la traduction automatique puis bascule localement vers l'original", async () => {
    const user = userEvent.setup();
    const traduire = vi.fn(async () => ({
      etat: "traduite" as const,
      page: 7,
      langueSource: "en",
      langueCible: "fr" as const,
      traduction: ["Le texte français visible."],
      automatique: true as const,
      cache: "cree" as const,
      modele: "@cf/meta/m2m100-1.2b" as const,
    }));
    render(<TextePage original={["The visible English text."]} traduction={[]} onTraduire={traduire} />);

    await user.click(screen.getByRole("button", { name: /traduire en français/i }));
    expect(await screen.findByText("Le texte français visible.")).toBeInTheDocument();
    expect(screen.getByText("Traduction automatique")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /voir le texte original/i }));
    expect(screen.getByText("The visible English text.")).toBeInTheDocument();
    expect(traduire).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /voir la traduction/i }));
    expect(screen.getByText("Le texte français visible.")).toBeInTheDocument();
    expect(traduire).toHaveBeenCalledTimes(1);
  });

  it("garde l'original et permet de réessayer après un échec", async () => {
    const user = userEvent.setup();
    const traduire = vi.fn().mockRejectedValueOnce(new Error("indisponible")).mockResolvedValueOnce({
      etat: "traduite",
      page: 7,
      langueSource: "en",
      langueCible: "fr",
      traduction: ["Réussi au second essai."],
      automatique: true,
      cache: "cree",
      modele: "@cf/meta/m2m100-1.2b",
    });
    render(<TextePage original={["Original preserved."]} traduction={[]} onTraduire={traduire} />);

    await user.click(screen.getByRole("button", { name: /traduire en français/i }));
    expect(await screen.findByText(/échec de la traduction automatique/i)).toBeInTheDocument();
    expect(screen.getByText("Original preserved.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /réessayer/i }));
    expect(await screen.findByText("Réussi au second essai.")).toBeInTheDocument();
  });
});
