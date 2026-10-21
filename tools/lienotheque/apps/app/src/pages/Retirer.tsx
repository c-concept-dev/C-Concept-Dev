import { useId, useState, type JSX } from "react";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import "./Retirer.css";

/** Retirer une bibliothèque : deux gestes qui ne se valent pas (UX-01).
 *
 *  ## Pourquoi un écran, et non une fenêtre à écarter
 *
 *  Une fenêtre de confirmation se ferme d'un clic distrait, et la seule chose qu'elle demande est
 *  d'insister. Un écran laisse la place de dire ce qui va disparaître, de le montrer, et de
 *  demander un geste qu'on ne fait pas par accident.
 *
 *  ## Les deux gestes
 *
 *  | | |
 *  |---|---|
 *  | **oublier** | la bibliothèque sort de la liste, le dossier et les documents restent |
 *  | **supprimer** | le dossier part **à la corbeille**, d'où il se ressort |
 *
 *  Le premier est sans conséquence et se fait d'un clic. Le second demande de **retaper le nom**
 *  de la bibliothèque : c'est le seul garde-fou qui résiste à un clic machinal, parce qu'il
 *  demande de lire ce qu'on s'apprête à faire.
 *
 *  Et il mène à la corbeille, jamais à l'effacement : **une action destructrice qui se défait
 *  vaut mieux que toutes les confirmations du monde.** C'est dit à l'écran, parce qu'une personne
 *  qui sait que son geste est réversible le fait sans angoisse — et qu'une qui l'ignore hésite
 *  devant un bouton dont elle a pourtant besoin.
 */

type Props = {
  readonly nom: string;
  readonly racine: string;
  readonly onOublier: () => void;
  readonly onSupprimer: () => void;
  readonly onAnnuler: () => void;
  /** Ce qui a empêché le retrait, quand quelque chose l'a empêché. */
  readonly echec?: string | undefined;
  readonly occupe?: boolean | undefined;
};

export function Retirer({ nom, racine, onOublier, onSupprimer, onAnnuler, echec, occupe }: Props): JSX.Element {
  const [tape, setTape] = useState("");
  const champ = useId();
  // Le nom exact, espaces de bordure mis à part : on demande de lire, pas de recopier au pixel.
  const arme = tape.trim() === nom.trim();

  return (
    <main id="contenu" className="ln-layout ln-retirer" tabIndex={-1}>
      <FilAriane chemin={[{ libelle: "Accueil", href: "#" }, { libelle: nom, href: "#depot" }, { libelle: "Retirer" }]} />

      <h1 className="ln-retirer__titre">Retirer « {nom} » ?</h1>

      <section className="ln-panneau ln-retirer__geste" aria-labelledby="titre-oublier">
        <h2 id="titre-oublier" className="ln-retirer__sous-titre">
          <Icone nom="dossier" />
          L’oublier
        </h2>
        <p className="ln-retirer__quoi">
          Elle disparaît de votre liste. <strong>Le dossier et vos documents restent où ils sont</strong>, et vous
          pourrez la rouvrir plus tard en désignant ce dossier.
        </p>
        <Bouton onClick={onOublier} disabled={occupe === true}>
          Oublier cette bibliothèque
        </Bouton>
      </section>

      <section className="ln-panneau ln-retirer__geste ln-retirer__geste--grave" aria-labelledby="titre-supprimer">
        <h2 id="titre-supprimer" className="ln-retirer__sous-titre">
          <Icone nom="alerte" />
          La supprimer
        </h2>
        <p className="ln-retirer__quoi">
          Le dossier part <strong>à la corbeille</strong>, avec les documents qu’il contient et tout ce que Liénothèque
          en a tiré. Rien n’est effacé&nbsp;: vous pourrez l’en ressortir tant que vous ne videz pas la corbeille.
        </p>
        <p className="ln-retirer__ou">
          <Icone nom="dossier" />
          <code>{racine}</code>
        </p>

        <label className="ln-retirer__demande" htmlFor={champ}>
          Pour confirmer, retapez le nom de la bibliothèque&nbsp;:
        </label>
        <input
          id={champ}
          className="ln-champ ln-retirer__champ"
          type="text"
          value={tape}
          onChange={(evenement) => setTape(evenement.currentTarget.value)}
          placeholder={nom}
          autoComplete="off"
          spellCheck={false}
        />

        <Bouton variante="principal" onClick={onSupprimer} disabled={!arme || occupe === true}>
          Mettre à la corbeille
        </Bouton>
      </section>

      {echec === undefined ? null : (
        <p className="ln-retirer__echec" role="alert">
          <Icone nom="alerte" />
          {echec}
        </p>
      )}

      <button type="button" className="ln-lien-action" onClick={onAnnuler}>
        Annuler, ne rien retirer
      </button>
    </main>
  );
}
