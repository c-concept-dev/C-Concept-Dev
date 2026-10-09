import type { JSX } from "react";
import "./Icone.css";

/** Tracés repris tels quels de docs/ui-kit/assets/icons.svg (kit UI v1.1).
 *  Le test « icônes » vérifie qu'ils ne divergent jamais du sprite du kit. */
export const CHEMINS = {
  plus: "M12 5v14M5 12h14",
  document: "M14 2H6v20h12V6zM14 2v4h4M9 11h6M9 15h6",
  livre: "M12 5v16M12 5C7 2 3 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-2-7-2-10 1",
  audio: "M3 13v-2a9 9 0 0 1 18 0v2M3 12h4v9H3zM17 12h4v9h-4z",
  video: "M3 4h18v16H3zM10 8l6 4-6 4z",
  image: "M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M7 7h.01",
  nuage: "M7 18H5a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 2 10z",
  ordinateur: "M2 3h20v14H2zM8 21h8M12 17v4",
  valide: "M20 6 9 17l-5-5",
  depot: "M12 16V3M7 8l5-5 5 5M3 15v6h18v-6",
  cloche: "M5 17h14l-2-4V8a5 5 0 0 0-10 0v5zM10 21h4",
  personnes: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 8M22 21v-3a6 6 0 0 0-4-5",
  recherche: "M21 21l-6-6M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14",
  alerte: "M12 3 2 21h20zM12 9v5M12 17h.01",
  fermer: "M6 6l12 12M18 6 6 18",
} as const;

/** Nom du symbole correspondant dans le sprite du kit, pour le contrôle de non-divergence. */
export const SYMBOLES_DU_KIT: Readonly<Record<keyof typeof CHEMINS, string>> = {
  plus: "plus",
  document: "file",
  livre: "book",
  audio: "audio",
  video: "video",
  image: "image",
  nuage: "cloud",
  ordinateur: "screen",
  valide: "check",
  depot: "upload",
  cloche: "bell",
  personnes: "users",
  recherche: "search",
  alerte: "warning",
  fermer: "close",
};

/** Tracés que le kit v1.1 ne fournit pas : il ne couvre ni lecteur de média, ni écran de
 *  vérification. Dessinés dans sa grille — 24 sur 24, trait de 2, bouts arrondis — et tenus à
 *  part, pour qu'on ne les confonde jamais avec le kit. Ils y entreront à sa prochaine version. */
export const CHEMINS_APPLICATION = {
  lecture: "M8 5l11 7-11 7z",
  pause: "M9 5v14M15 5v14",
  precedent: "M18 5 8 12l10 7zM6 5v14",
  suivant: "M6 5l10 7L6 19zM18 5v14",
  boucle: "M4 9h12a4 4 0 0 1 0 8H8M7 6 4 9l3 3",
  passer: "M4 5l8 7-8 7zM13 5l8 7-8 7z",
  crayon: "M4 20h4L19 9l-4-4L4 16zM15 5l4 4",
  grille: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  liste: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  chevronGauche: "M15 18 9 12l6-6",
  chevronDroite: "M9 6l6 6-6 6",
  pleinEcran: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
  moins: "M5 12h14",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 8h.01M11 12h1v5h1",
  lien: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  horloge: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
  appareils: "M2 4h12v9H2zM16 8h6v11h-6zM6 17h4M8 13v4",
  etiquette: "M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01",
  dossier: "M3 6h6l2 3h10v11H3zM3 6v3",
  corbeille: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3",
  fusion: "M6 3v6a4 4 0 0 0 4 4h8M18 9l3 4-3 4",
} as const;

/** Tous les tracés, du kit et de l'application. */
export const TOUS_CHEMINS = { ...CHEMINS, ...CHEMINS_APPLICATION } as const;

export type NomIcone = keyof typeof TOUS_CHEMINS;

type Props = {
  readonly nom: NomIcone;
  /** Renseigné seulement si l'icône porte une information que le texte ne donne pas. */
  readonly titre?: string | undefined;
};

export function Icone({ nom, titre }: Props): JSX.Element {
  return (
    <svg
      className="ln-icone"
      viewBox="0 0 24 24"
      role={titre === undefined ? undefined : "img"}
      aria-hidden={titre === undefined ? true : undefined}
      aria-label={titre}
    >
      <path d={TOUS_CHEMINS[nom]} />
    </svg>
  );
}
