import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** jsdom n'a pas de moteur audio : « play » y lève « Not implemented », et « currentTime » ne
 *  bouge jamais seul. On les remplace par le minimum qui permette de vérifier ce qui nous
 *  regarde — qu'on se place au bon endroit et qu'on s'arrête au bon moment —, et c'est tout :
 *  qu'un décodeur sache lire un MP3 n'est pas ce que ces contrôles éprouvent.
 *
 *  Chaque élément garde son état de lecture, et « timeupdate » se déclenche quand on avance à
 *  la main : c'est ainsi qu'un test fait courir une piste sans attendre.
 *
 *  Cette préparation sert tous les fichiers de contrôle, y compris ceux qui tournent sans DOM —
 *  les feuilles de style, la construction, les données. Là, « HTMLMediaElement » n'existe pas,
 *  et il n'y a rien à remplacer. */
let temps = new WeakMap<object, number>();

if (typeof HTMLMediaElement !== "undefined") {
  const joue = new WeakSet<HTMLMediaElement>();

  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return !joue.has(this);
    },
  });

  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    joue.add(this);
    return Promise.resolve();
  });

  HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
    joue.delete(this);
  });

  // jsdom ne connaît ni la vitesse de lecture ni la conservation de la hauteur : on les laisse
  // s'écrire et se relire, c'est tout ce que les contrôles demandent.
  for (const nom of ["playbackRate", "preservesPitch", "mozPreservesPitch", "webkitPreservesPitch"]) {
    const valeurs = new WeakMap<object, unknown>();
    Object.defineProperty(HTMLMediaElement.prototype, nom, {
      configurable: true,
      get(this: HTMLMediaElement) {
        return valeurs.get(this) ?? (nom === "playbackRate" ? 1 : false);
      },
      set(this: HTMLMediaElement, valeur: unknown) {
        valeurs.set(this, valeur);
      },
    });
  }

  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return temps.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, valeur: number) {
      temps.set(this, valeur);
      this.dispatchEvent(new Event("timeupdate"));
    },
  });
}

/** jsdom ne fait défiler rien du tout : « scrollIntoView » n'y existe pas. Un écran qui garde
 *  visible ce qu'on choisit au clavier l'appelle, et ce n'est pas lui qu'on éprouve ici. */
if (typeof HTMLElement !== "undefined" && HTMLElement.prototype.scrollIntoView === undefined) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
  cleanup();
  temps = new WeakMap();
});
