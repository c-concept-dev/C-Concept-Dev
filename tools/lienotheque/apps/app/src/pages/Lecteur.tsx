import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { nommer, type ElementAffiche, type VueBibliotheque } from "@lienotheque/contrats";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import { PageZoomable } from "./lecteur/PageZoomable.js";
import { PanneauEcoute } from "./lecteur/PanneauEcoute.js";
import { TextePage } from "./lecteur/TextePage.js";
import { FilVersSegment } from "./lecteur/FilVersSegment.js";
import { actionDe, tempoSuivant } from "./lecteur/raccourcis.js";
import "./Lecteur.css";

/** Lecteur : la page à gauche, ce qu'on écoute à droite, le fil entre les deux (B1, UX-01).
 *
 *  L'écran tient dans la hauteur de la fenêtre (correction 3) : la barre et les panneaux restent
 *  en place, seule la page défile. On ne perd jamais la commande d'écoute en descendant dans une
 *  page haute.
 *
 *  Il ne connaît ni « morceau » ni « piste » en dur : les mots viennent du schéma de la
 *  bibliothèque (CLA-01). */

const ZOOMS = [75, 100, 125, 150, 200] as const;

type Props = {
  readonly vue: VueBibliotheque;
  /** Page ouverte et élément actif, tels que la navigation les a posés (B4). */
  readonly page: number;
  readonly ancreId?: string | undefined;
  readonly onPage: (numero: number) => void;
  readonly onElement: (ancreId: string) => void;
};

export function Lecteur({ vue, page, ancreId, onPage, onElement }: Props): JSX.Element {
  const [zoom, setZoom] = useState<number>(100);
  const [enLecture, setEnLecture] = useState(false);
  const [boucle, setBoucle] = useState(false);
  const [tempo, setTempo] = useState(100);

  const corps = useRef<HTMLDivElement>(null);
  const zoneActive = useRef<HTMLButtonElement>(null);
  const segment = useRef<SVGRectElement>(null);

  const courante = useMemo(
    () => vue.pages.find((candidate) => candidate.numero === page) ?? vue.pages[0],
    [vue.pages, page],
  );

  // Tous les éléments de la bibliothèque, dans l'ordre de lecture : les flèches traversent les
  // pages, parce qu'un élément n'a aucune raison de s'arrêter au bas d'une feuille (A3).
  const suite = useMemo<readonly ElementAffiche[]>(() => vue.pages.flatMap((p) => p.elements), [vue.pages]);

  const actif = useMemo<ElementAffiche | undefined>(() => {
    if (ancreId !== undefined) {
      const voulu = suite.find((element) => element.ancreId === ancreId);
      if (voulu !== undefined) return voulu;
    }
    return courante?.elements[0] ?? suite[0];
  }, [ancreId, suite, courante]);

  const deplacer = useCallback(
    (sens: 1 | -1) => {
      if (actif === undefined) return;
      const rang = suite.findIndex((element) => element.ancreId === actif.ancreId);
      const voisin = suite[rang + sens];
      if (voisin === undefined) return;
      onElement(voisin.ancreId);
      if (voisin.page !== page) onPage(voisin.page);
    },
    [actif, suite, page, onElement, onPage],
  );

  const changerTempo = useCallback((sens: 1 | -1) => setTempo((valeur) => tempoSuivant(valeur, sens)), []);

  useEffect(() => {
    const ecouter = (evenement: KeyboardEvent): void => {
      const action = actionDe(evenement.key, evenement.target);
      if (action === undefined || action === "distance") return;
      evenement.preventDefault();
      if (action === "lecture") setEnLecture((valeur) => !valeur);
      else if (action === "boucle") setBoucle((valeur) => !valeur);
      else if (action === "precedent") deplacer(-1);
      else if (action === "suivant") deplacer(1);
      else changerTempo(action === "accelerer" ? 1 : -1);
    };
    globalThis.addEventListener("keydown", ecouter);
    return () => globalThis.removeEventListener("keydown", ecouter);
  }, [deplacer, changerTempo]);

  if (courante === undefined || actif === undefined)
    return (
      <main className="ln-lecteur ln-lecteur--vide" id="contenu">
        <p className="ln-muted">Cette bibliothèque n’a encore aucune page lue.</p>
      </main>
    );

  const rangZoom = ZOOMS.indexOf(zoom as (typeof ZOOMS)[number]);

  return (
    <main className="ln-lecteur" id="contenu">
      <div className="ln-lecteur__barre">
        <div className="ln-lecteur__situation ln-panneau-titre">
          <FilAriane chemin={[{ libelle: "Accueil", href: "#accueil" }, { libelle: vue.nom, href: `#bibliotheque/${vue.id}` }, { libelle: "Lecteur" }]} />
          <h1 className="ln-lecteur__titre">{nommer(vue.mots.page, courante.numero)}</h1>
        </div>

        {/* Correction 2 : les commandes portent une icône visible, sur un fond qui la détache. */}
        <div className="ln-lecteur__zoom" role="group" aria-label="Zoom">
          <Bouton compact icone={<Icone nom="moins" />} onClick={() => setZoom(ZOOMS[Math.max(0, rangZoom - 1)] ?? 75)} disabled={rangZoom <= 0} aria-label="Réduire">
            <span className="ln-sr-only">Réduire</span>
          </Bouton>
          <output className="ln-lecteur__facteur">{zoom}&nbsp;%</output>
          <Bouton compact icone={<Icone nom="plus" />} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, rangZoom + 1)] ?? 200)} disabled={rangZoom >= ZOOMS.length - 1} aria-label="Agrandir">
            <span className="ln-sr-only">Agrandir</span>
          </Bouton>
          <Bouton compact icone={<Icone nom="pleinEcran" />} onClick={() => setZoom(100)} aria-label="Ajuster à la fenêtre">
            <span className="ln-sr-only">Ajuster à la fenêtre</span>
          </Bouton>
        </div>
      </div>

      <div className="ln-lecteur__corps" ref={corps}>
        {/* Correction 2 : en hybride, le numéro de vignette a son propre panneau graphite —
            aucun texte ne tombe sur la photo. */}
        <nav className="ln-vignettes" aria-label={vue.mots.page.plusieurs}>
          <ol className="ln-vignettes__liste">
            {vue.pages.map((candidate) => (
              <li key={candidate.numero}>
                <button
                  type="button"
                  className={candidate.numero === courante.numero ? "ln-vignette ln-vignette--courante" : "ln-vignette"}
                  onClick={() => onPage(candidate.numero)}
                  aria-current={candidate.numero === courante.numero ? "page" : undefined}
                >
                  <span className="ln-vignette__feuille" aria-hidden="true" />
                  <span className="ln-vignette__numero ln-sur-photo">{candidate.numero}</span>
                  <span className="ln-sr-only">{nommer(vue.mots.page, candidate.numero)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="ln-lecteur__feuille">
          <PageZoomable ref={zoneActive} page={courante} mots={vue.mots} actif={actif.ancreId} zoom={zoom} onElement={onElement} />
        </div>

        <aside className="ln-lecteur__cote" aria-label="Écoute et texte">
          <PanneauEcoute
            ref={segment}
            element={actif}
            mots={vue.mots}
            enLecture={enLecture}
            boucle={boucle}
            tempo={tempo}
            avancement={0}
            onLecture={() => setEnLecture(!enLecture)}
            onBoucle={() => setBoucle(!boucle)}
            onTempo={changerTempo}
            onPrecedent={() => deplacer(-1)}
            onSuivant={() => deplacer(1)}
          />
          <TextePage original={courante.texte} traduction={courante.traduction} />
        </aside>

        <FilVersSegment depuis={zoneActive} vers={segment} dans={corps} clef={actif.ancreId} />
      </div>
    </main>
  );
}
