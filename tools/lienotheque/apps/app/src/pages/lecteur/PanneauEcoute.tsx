import { forwardRef, type JSX } from "react";
import { departDeLecture, nommer, type ElementAffiche, type MotsBibliotheque } from "@lienotheque/contrats";
import { Bouton, Icone } from "../../composants/index.js";
import { FormeOnde } from "./FormeOnde.js";
import { LEGENDE, TEMPO_MAX, TEMPO_MIN } from "./raccourcis.js";

/** Panneau d'écoute du Lecteur (B1, UX-01).
 *
 *  Il ne lit pas le son lui-même : il montre où l'on en est et il commande. Le segment proposé
 *  est en cuivre clair, le reste de l'onde en gris pierre (correction 5), et le fil parti de la
 *  zone de la page arrive ici.
 *
 *  Les libellés n'accordent aucun adjectif aux mots du schéma : le schéma ne donne pas le genre,
 *  et « élément précédente » est le genre d'erreur qu'on ne peut pas rattraper après coup. */

type Props = {
  readonly element: ElementAffiche;
  readonly mots: MotsBibliotheque;
  readonly enLecture: boolean;
  readonly boucle: boolean;
  readonly tempo: number;
  readonly avancement: number;
  readonly onLecture: () => void;
  readonly onBoucle: () => void;
  readonly onTempo: (sens: 1 | -1) => void;
  readonly onPrecedent: () => void;
  readonly onSuivant: () => void;
};

const minutes = (secondes: number): string =>
  `${Math.floor(secondes / 60)} min ${String(Math.round(secondes % 60)).padStart(2, "0")} s`;

/** Graine de la forme d'onde : le début de l'empreinte du média. Même fichier, même onde,
 *  d'une session à l'autre. */
const graineDe = (empreinte: string): number => Number.parseInt(empreinte.slice(0, 8), 16) % 10_000;

export const PanneauEcoute = forwardRef<SVGRectElement, Props>(function PanneauEcoute(
  { element, mots, enLecture, boucle, tempo, avancement, onLecture, onBoucle, onTempo, onPrecedent, onSuivant },
  refSegment,
): JSX.Element {
  const media = element.media;
  if (media === undefined)
    return (
      <section className="ln-ecoute ln-panneau" aria-label="Écoute">
        <p className="ln-ecoute__rien ln-muted">{nommer(mots.element, element.numero)} n’a pas de média relié.</p>
      </section>
    );

  const position = media.position;
  const duree = media.duree ?? (position.segment === "connu" ? position.fin * 1.2 : 1);
  const debut = position.segment === "connu" ? Math.min(1, position.debut / duree) : 0;
  const fin = position.segment === "connu" ? Math.min(1, position.fin / duree) : 1;
  const titre = `${nommer(mots.piste, media.piste)} · ${position.segment === "connu" ? "Segment proposé" : "Segment à situer"}`;

  return (
    <section className="ln-ecoute ln-panneau" aria-labelledby="ln-ecoute-titre">
      <header className="ln-ecoute__entete">
        <h2 id="ln-ecoute-titre" className="ln-ecoute__titre">
          {titre}
        </h2>
        <span className="ln-ecoute__fichier ln-muted">{media.nom}</span>
      </header>

      <FormeOnde
        ref={refSegment}
        graine={graineDe(media.empreinte)}
        debut={debut}
        fin={fin}
        avancement={avancement}
        etiquette={titre}
      />

      <p className="ln-ecoute__bornes ln-muted">
        {position.segment === "connu"
          ? `De ${minutes(position.debut)} à ${minutes(position.fin)}`
          : `Départ de lecture à ${minutes(departDeLecture(position))}`}
      </p>

      <div className="ln-ecoute__commandes">
        <Bouton compact icone={<Icone nom="precedent" />} onClick={onPrecedent} aria-label="Précédent">
          <span className="ln-sr-only">Précédent</span>
        </Bouton>

        {/* Seul élément cuivre plein de l'écran (UX-09) : ce qu'on vient faire ici, c'est écouter. */}
        <Bouton variante="principal" icone={<Icone nom={enLecture ? "pause" : "lecture"} />} onClick={onLecture} aria-pressed={enLecture}>
          {enLecture ? "Pause" : "Écouter"}
        </Bouton>

        <Bouton compact icone={<Icone nom="suivant" />} onClick={onSuivant} aria-label="Suivant">
          <span className="ln-sr-only">Suivant</span>
        </Bouton>

        <button
          type="button"
          className={boucle ? "ln-bascule__choix ln-bascule__choix--choisi" : "ln-bascule__choix"}
          onClick={onBoucle}
          aria-pressed={boucle}
        >
          <Icone nom="boucle" />
          <span>Boucle</span>
        </button>

        <div className="ln-tempo" role="group" aria-label="Tempo">
          <Bouton compact icone={<Icone nom="moins" />} onClick={() => onTempo(-1)} disabled={tempo <= TEMPO_MIN} aria-label="Ralentir">
            <span className="ln-sr-only">Ralentir</span>
          </Bouton>
          <output className="ln-tempo__valeur">{tempo}&nbsp;%</output>
          <Bouton compact icone={<Icone nom="plus" />} onClick={() => onTempo(1)} disabled={tempo >= TEMPO_MAX} aria-label="Accélérer">
            <span className="ln-sr-only">Accélérer</span>
          </Bouton>
        </div>
      </div>

      {element.pourquoi === undefined ? null : (
        <div className="ln-pourquoi">
          <p className="ln-pourquoi__phrase">
            <Icone nom="lien" />
            {element.pourquoi.phrase}
          </p>
          <p className="ln-pourquoi__confiance ln-muted">
            Confiance&nbsp;{Math.round(element.pourquoi.confiance * 100)}&nbsp;%
            {element.aVerifier ? " · demande un œil" : ""}
          </p>
        </div>
      )}

      <ul className="ln-legende ln-muted">
        {LEGENDE.map(({ touches, quoi }) => (
          <li key={touches} className="ln-legende__item">
            <kbd className="ln-legende__touche">{touches}</kbd> {quoi}
          </li>
        ))}
      </ul>
    </section>
  );
});
