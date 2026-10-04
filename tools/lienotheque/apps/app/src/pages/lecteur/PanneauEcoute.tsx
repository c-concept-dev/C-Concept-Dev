import { forwardRef, type JSX } from "react";
import { nommer, type ElementAffiche, type MotsBibliotheque } from "@lienotheque/contrats";
import { Bouton, Icone } from "../../composants/index.js";
import { minutage } from "../../donnees/positions.js";
import { TEMPO_MAX, TEMPO_MIN, TEMPO_PAS } from "./raccourcis.js";

/** Panneau d'écoute du Lecteur (B1, UX-01, ANC-03).
 *
 *  La forme d'onde montre les segments de la piste ; celui de l'élément actif est marqué. Quand
 *  le segment n'a pas été vérifié, on le dit et la lecture commence au début de la piste — on ne
 *  pose pas un curseur là où l'on ne sait pas. */

export type Segment = { readonly debut: number; readonly fin: number; readonly libelle: string; readonly actif: boolean };

type Props = {
  readonly element: ElementAffiche;
  readonly mots: MotsBibliotheque;
  readonly segments: readonly Segment[];
  readonly dureeS: number;
  readonly positionS: number;
  readonly enLecture: boolean;
  readonly boucle: boolean;
  readonly tempo: number;
  readonly onLecture: () => void;
  readonly onBoucle: () => void;
  readonly onTempo: (tempo: number) => void;
  readonly onPrecedent: () => void;
  readonly onSuivant: () => void;
};

/** Forme d'onde dessinée à partir des segments : une barre par tranche, celles du segment actif
 *  en relief. Sans mesure réelle, on dessine une enveloppe régulière — la forme d'onde du dépôt
 *  la remplacera sans changer la mise en page. */
function Onde({ segments, dureeS }: { segments: readonly Segment[]; dureeS: number }): JSX.Element {
  const barres = 96;
  return (
    <svg className="ln-onde" viewBox={`0 0 ${barres} 24`} preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: barres }, (_, rang) => {
        const t = (rang / barres) * dureeS;
        const dans = segments.find((segment) => t >= segment.debut && t < segment.fin);
        const hauteur = 4 + ((rang * 37) % 17);
        return (
          <rect
            key={rang}
            className={dans?.actif === true ? "ln-onde__barre ln-onde__barre--actif" : "ln-onde__barre"}
            x={rang}
            y={12 - hauteur / 2}
            width={0.7}
            height={hauteur}
            rx={0.35}
          />
        );
      })}
    </svg>
  );
}

export const PanneauEcoute = forwardRef<HTMLDivElement, Props>(function PanneauEcoute(
  { element, mots, segments, dureeS, positionS, enLecture, boucle, tempo, onLecture, onBoucle, onTempo, onPrecedent, onSuivant },
  refSegmentActif,
): JSX.Element {
  const media = element.media;
  const inconnu = media?.position.segment === "inconnu";

  return (
    <section className="ln-ecoute ln-panneau" aria-labelledby="titre-ecoute">
      <h2 id="titre-ecoute" className="ln-ecoute__titre">
        Écoute
      </h2>
      {media === undefined ? (
        <p className="ln-ecoute__sans">Aucun enregistrement relié.</p>
      ) : (
        <>
          {/* Un numéro, pas un compte : « Piste 43 », jamais « pistes 43 ». */}
          <p className="ln-ecoute__piste">
            {nommer(mots.piste, media.piste)}
          </p>

          <div className="ln-ecoute__onde">
            <Onde segments={segments} dureeS={dureeS} />
            <ol className="ln-ecoute__segments">
              {segments.map((segment) => (
                <li
                  key={segment.libelle}
                  className={segment.actif ? "ln-ecoute__segment ln-ecoute__segment--actif" : "ln-ecoute__segment"}
                  style={{ left: `${(segment.debut / dureeS) * 100}%`, width: `${((segment.fin - segment.debut) / dureeS) * 100}%` }}
                  {...(segment.actif ? { ref: refSegmentActif as never } : {})}
                >
                  <span className="ln-ecoute__segment-nom">{segment.libelle}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="ln-ecoute__temps">
            <span className="ln-sr-only">Position : </span>
            {minutage(positionS)} / {minutage(dureeS)}
          </p>

          {inconnu ? (
            <p className="ln-ecoute__inconnu">
              <Icone nom="info" />
              Segment inconnu : la lecture commence au début — {mots.piste.un} {media.piste}.
            </p>
          ) : null}

          <div className="ln-ecoute__transport">
            <button type="button" className="ln-ecoute__pas" onClick={onPrecedent} aria-label="Segment précédent">
              <Icone nom="precedent" />
            </button>
            <Bouton variante="principal" onClick={onLecture} aria-pressed={enLecture}>
              <Icone nom={enLecture ? "pause" : "lecture"} />
              <span className="ln-sr-only">{enLecture ? "Interrompre" : "Lire"}</span>
            </Bouton>
            <button type="button" className="ln-ecoute__pas" onClick={onSuivant} aria-label="Segment suivant">
              <Icone nom="suivant" />
            </button>
            <button
              type="button"
              className={boucle ? "ln-ecoute__pas ln-ecoute__pas--choisi" : "ln-ecoute__pas"}
              onClick={onBoucle}
              aria-pressed={boucle}
              aria-label="Boucler sur le segment"
            >
              <Icone nom="boucle" />
            </button>
          </div>

          <div className="ln-ecoute__tempo">
            <label className="ln-ecoute__tempo-titre" htmlFor="tempo">
              Tempo {tempo} %
            </label>
            <input
              id="tempo"
              type="range"
              min={TEMPO_MIN}
              max={TEMPO_MAX}
              step={TEMPO_PAS}
              value={tempo}
              onChange={(evenement) => onTempo(Number(evenement.currentTarget.value))}
            />
            <span className="ln-ecoute__tempo-note">hauteur conservée</span>
          </div>
        </>
      )}
    </section>
  );
});
