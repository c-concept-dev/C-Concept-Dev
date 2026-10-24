import type { JSX } from "react";
import logoClair from "@kit/assets/logo-horizontal-light.svg";
import logoSombre from "@kit/assets/logo-horizontal-dark.svg";
import { Icone } from "../composants/index.js";
import type { Theme } from "../theme/theme.js";
import "./PremierLancement.css";

type Props = {
  readonly theme: Theme;
  readonly etat: "verification" | "vide";
};

/** La bibliothèque en ligne n'a encore rien de publié.
 *
 *  **Pourquoi un écran de plus plutôt que le premier lancement.** Le 20 octobre 2026, une
 *  personne entrée en ligne tombait sur « Créer ma première bibliothèque » et « Choisir un
 *  dossier » : deux gestes de bureau, impossibles dans un navigateur, dont le premier lève et le
 *  second n'apparaît même pas. L'écran disait donc à quelqu'un d'identifié qu'il n'avait rien,
 *  alors que sa bibliothèque existait et était simplement vide.
 *
 *  Ce n'est pas une panne et ce n'est pas un manque de droits : une bibliothèque dont aucune
 *  version ne s'est encore activée n'a pas d'instantané à servir, et c'est l'état normal du
 *  premier jour. L'écran le dit, et ne propose rien qu'on ne puisse faire ici.
 *
 *  Il emprunte la mise en page du premier lancement — même panneau, même logo — parce que c'est
 *  la même place dans le parcours : l'écran qu'on voit quand il n'y a rien à voir.
 *
 *  **L'attente et la bibliothèque vide ne disent plus la même chose.** Mesuré dans Safari le
 *  24 octobre : la session était bien reconnue et l'aperçu répondait 404, mais le même texte
 *  s'affichait avant et après la réponse. Christophe ne pouvait donc pas distinguer « encore en
 *  train de vérifier » de « déjà entré, rien de publié ». On ne certifie l'entrée qu'après la
 *  réponse du service ; avant elle, l'écran dit seulement qu'il vérifie. */
export function RienAMontrer({ theme, etat }: Props): JSX.Element {
  const logo = theme === "light" ? logoClair : logoSombre;
  return (
    <main id="contenu" className="ln-layout ln-premier" tabIndex={-1}>
      <div className="ln-premier__accroche ln-panneau-titre">
        <h1 className="ln-premier__titre">
          <img className="ln-premier__logo" src={logo} alt="Liénothèque" />
        </h1>
        <p className="ln-premier__signature">Vos documents et médias, enfin reliés.</p>
        <p className="ln-premier__attente">
          <Icone nom="info" />
          {etat === "verification"
            ? "Vérification de votre accès…"
            : "Vous êtes bien entré. Cette bibliothèque n’a encore rien à montrer : aucun document n’y a été publié."}
        </p>
      </div>
    </main>
  );
}
