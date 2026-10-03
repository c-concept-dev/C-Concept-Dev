import type { JSX } from "react";
import { Icone, type NomIcone } from "./Icone.js";
import "./BadgeEtat.css";

export type TonBadge = "neutre" | "avertissement";

type Props = {
  /** Toujours obligatoire : la couleur ne porte jamais seule l'information (UX-07). */
  readonly children: string;
  readonly icone?: NomIcone | undefined;
  readonly ton?: TonBadge | undefined;
};

export function BadgeEtat({ children, icone, ton = "neutre" }: Props): JSX.Element {
  return (
    <span className={`ln-badge ln-badge--${ton}`}>
      {icone === undefined ? null : <Icone nom={icone} />}
      {children}
    </span>
  );
}

type PropsEtat = {
  readonly children: string;
  readonly icone?: NomIcone | undefined;
  readonly enCours?: boolean | undefined;
};

/** État sans fond : « Prêt », « En traitement », « Synchronisé ». */
export function Etat({ children, icone, enCours = false }: PropsEtat): JSX.Element {
  return (
    <span className="ln-etat">
      {enCours ? <span className="ln-rouage" aria-hidden="true" /> : icone === undefined ? null : <Icone nom={icone} />}
      {children}
    </span>
  );
}
