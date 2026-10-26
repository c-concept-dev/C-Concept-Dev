import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageSure } from "../src/pages/lecteur/ImageSure.js";

class Observateur {
  static dernier: Observateur | undefined;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(private readonly rappel: IntersectionObserverCallback) {
    Observateur.dernier = this;
  }
  rendreVisible(cible: Element): void {
    this.rappel([{ isIntersecting: true, target: cible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("une image qui ne peut jamais paraître cassée", () => {
  it("ne demande la vignette signée que lorsqu'elle approche de la zone visible", async () => {
    vi.stubGlobal("IntersectionObserver", Observateur);
    const charger = vi.fn(async () => "https://exemple.test/vignette-signee");
    const { container } = render(<ImageSure source="vignette.webp" charger={charger} alt="" className="vignette" />);

    expect(charger).not.toHaveBeenCalled();
    Observateur.dernier?.rendreVisible(container.firstElementChild!);
    await waitFor(() => expect(charger).toHaveBeenCalledOnce());
    expect(container.querySelector("img")).toHaveStyle({ visibility: "hidden" });
  });

  it("ne révèle l'image qu'après son chargement complet", () => {
    const { container } = render(<ImageSure source="/pages/valide.webp" alt="Page 1" className="page" />);
    const image = container.querySelector("img")!;
    expect(image).toHaveStyle({ visibility: "hidden" });
    fireEvent.load(image);
    expect(container.querySelector("img")).toHaveStyle({ visibility: "visible" });
  });

  it("retire une image illisible et laisse seulement le repli neutre", () => {
    const { container } = render(<ImageSure source="/pages/cassee.webp" alt="Page 1" className="page" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-image-repli]"), "un emplacement sans icône cassée").toBeTruthy();
  });

  it("redemande une adresse fraîche une fois si la première a expiré", async () => {
    const charger = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce("https://exemple.test/expiree")
      .mockResolvedValueOnce("https://exemple.test/fraiche");
    const { container } = render(<ImageSure source="vignette.webp" charger={charger} alt="" className="vignette" />);

    const premiere = await waitFor(() => {
      const image = container.querySelector("img");
      expect(image).not.toBeNull();
      return image;
    });
    fireEvent.error(premiere!);
    await waitFor(() => expect(charger).toHaveBeenCalledTimes(2));
    const seconde = container.querySelector("img");
    expect(seconde?.getAttribute("src")).toBe("https://exemple.test/fraiche");
    fireEvent.load(seconde!);
    expect(seconde).toHaveStyle({ visibility: "visible" });
  });
});
