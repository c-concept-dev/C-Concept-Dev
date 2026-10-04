import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { ElementAffiche, VueBibliotheque } from "@lienotheque/contrats";
import { Icone } from "../composants/index.js";
import { FilAriane } from "../composants/FilAriane.js";
import { FilVersSegment } from "./lecteur/FilVersSegment.js";
import { PageZoomable } from "./lecteur/PageZoomable.js";
import { PanneauEcoute, type Segment } from "./lecteur/PanneauEcoute.js";
import { TextePage } from "./lecteur/TextePage.js";
import { LEGENDE, actionDe, tempoSuivant } from "./lecteur/raccourcis.js";
import "./Lecteur.css";

/** Lecteur (B1 — UX-01, UX-02, ANC-03, ANC-05).
 *
 *  Trois colonnes : les pages à gauche, la page elle-même au centre, l'écoute et le contexte à
 *  droite. Un seul élément est actif à la fois, surligné sur la page et relié à son segment par
 *  un fil continu.
 *
 *  Tous les mots de métier viennent du schéma de la bibliothèque (CLA-01) : ce composant ne sait
 *  pas de quel domaine relève ce qu'il montre, et il n'a pas à le savoir. */

type Props = {
  readonly vue: VueBibliotheque;
  readonly page: number;
  readonly element: string;
  readonly onPage: (numero: number) => void;
  readonly onElement: (ancreId: string) => void;
};

const DUREE_SUPPOSEE = 44;

export function Lecteur({ vue, page, element, onPage, onElement }: Props): JSX.Element {
  const [enLecture, setEnLecture] = useState(false);
  const [boucle, setBoucle] = useState(false);
  const [tempo, setTempo] = useState(75);
  const [zoom, setZoom] = useState(100);
  const [aDistance, setADistance] = useState(false);
  const [note, setNote] = useState("");

  const cadre = useRef<HTMLDivElement>(null);
  const zoneActive = useRef<HTMLButtonElement>(null);
  const segmentActif = useRef<HTMLDivElement>(null);

  const pageCourante = vue.pages.find((p) => p.numero === page) ?? vue.pages[0];
  const elements = pageCourante?.elements ?? [];
  const actif: ElementAffiche | undefined = elements.find((e) => e.ancreId === element) ?? elements[0];
  const rang = actif === undefined ? -1 : elements.indexOf(actif);

  const aller = useCallback(
    (sens: 1 | -1) => {
      if (elements.length === 0) return;
      const suivant = elements[Math.min(elements.length - 1, Math.max(0, rang + sens))];
      if (suivant !== undefined) onElement(suivant.ancreId);
    },
    [elements, rang, onElement],
  );

  useEffect(() => {
    const ecouter = (evenement: KeyboardEvent): void => {
      const action = actionDe(evenement.key, evenement.target);
      if (action === undefined) return;
      evenement.preventDefault();
      if (action === "lecture") setEnLecture((avant) => !avant);
      if (action === "precedent") aller(-1);
      if (action === "suivant") aller(1);
      if (action === "boucle") setBoucle((avant) => !avant);
      if (action === "ralentir") setTempo((avant) => tempoSuivant(avant, -1));
      if (action === "accelerer") setTempo((avant) => tempoSuivant(avant, 1));
      if (action === "distance") setADistance((avant) => !avant);
    };
    globalThis.addEventListener("keydown", ecouter);
    return () => globalThis.removeEventListener("keydown", ecouter);
  }, [aller]);

  /** Les segments de la piste de l'élément actif : le sien, et ceux de ses voisins sur la même
   *  piste. Faute de segment vérifié, on montre la piste entière et on le dit. */
  const segments: readonly Segment[] = useMemo(() => {
    if (actif?.media === undefined) return [];
    const surLaMemePiste = elements.filter((e) => e.media?.piste === actif.media?.piste);
    const duree = DUREE_SUPPOSEE;
    return surLaMemePiste.map((e, position) => {
      const connu = e.media?.position.segment === "connu" ? e.media.position : undefined;
      return {
        debut: connu?.debut ?? (position * duree) / Math.max(1, surLaMemePiste.length),
        fin: connu?.fin ?? ((position + 1) * duree) / Math.max(1, surLaMemePiste.length),
        libelle: e.numero,
        actif: e.ancreId === actif.ancreId,
      };
    });
  }, [actif, elements]);

  const departS = actif?.media?.position.segment === "connu" ? actif.media.position.debut : 0;

  return (
    <main id="contenu" className="ln-lecteur" tabIndex={-1}>
      <div className="ln-lecteur__entete ln-panneau-titre">
        <FilAriane
          chemin={[
            { libelle: "Accueil", href: "#" },
            { libelle: vue.nom, href: "#catalogue" },
            { libelle: `${vue.mots.page.un} ${pageCourante?.numero ?? ""}` },
          ]}
        />
        <div className="ln-lecteur__pas">
          <button type="button" className="ln-lecteur__fleche" onClick={() => aller(-1)} aria-label={`${vue.mots.element.un} précédent`}>
            <Icone nom="chevronGauche" />
          </button>
          <p className="ln-lecteur__rang">
            {vue.mots.element.un} <strong>{rang + 1}</strong> sur <strong>{elements.length}</strong> sur cette {vue.mots.page.un}
          </p>
          <button type="button" className="ln-lecteur__fleche" onClick={() => aller(1)} aria-label={`${vue.mots.element.un} suivant`}>
            <Icone nom="chevronDroite" />
          </button>
        </div>
      </div>

      <div className="ln-lecteur__corps" ref={cadre}>
        <nav className="ln-vignettes" aria-label={`${vue.mots.page.plusieurs} du document`}>
          <ol className="ln-vignettes__liste">
            {vue.pages.map((p) => (
              <li key={p.numero}>
                <button
                  type="button"
                  className={p.numero === pageCourante?.numero ? "ln-vignettes__page ln-vignettes__page--actif" : "ln-vignettes__page"}
                  onClick={() => onPage(p.numero)}
                  aria-current={p.numero === pageCourante?.numero ? "page" : undefined}
                  aria-label={`${vue.mots.page.un} ${p.numero}${p.elements.some((e) => e.media !== undefined) ? `, ${vue.mots.element.plusieurs} reliés` : ""}`}
                >
                  <span className="ln-vignettes__feuille" aria-hidden="true" />
                  <span className="ln-vignettes__numero">{p.numero}</span>
                  {p.elements.some((e) => e.media !== undefined) ? <span className="ln-vignettes__repere" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="ln-lecteur__page">
          {pageCourante === undefined ? null : (
            <PageZoomable ref={zoneActive} page={pageCourante} mots={vue.mots} actif={actif?.ancreId ?? ""} zoom={zoom} onElement={onElement} />
          )}
        </div>

        <aside className="ln-lecteur__cote" aria-label="Écoute et contexte">
          {actif === undefined ? null : (
            <PanneauEcoute
              ref={segmentActif}
              element={actif}
              mots={vue.mots}
              segments={segments}
              dureeS={DUREE_SUPPOSEE}
              positionS={departS}
              enLecture={enLecture}
              boucle={boucle}
              tempo={tempo}
              onLecture={() => setEnLecture(!enLecture)}
              onBoucle={() => setBoucle(!boucle)}
              onTempo={setTempo}
              onPrecedent={() => aller(-1)}
              onSuivant={() => aller(1)}
            />
          )}

          {actif?.pourquoi === undefined ? null : (
            <section className="ln-pourquoi ln-panneau" aria-labelledby="titre-pourquoi">
              <h2 id="titre-pourquoi" className="ln-pourquoi__titre">
                Pourquoi ce lien
              </h2>
              <p className="ln-pourquoi__confiance">
                <Icone nom="lien" />
                {actif.pourquoi.confiance >= 0.8 ? "Confiance haute" : actif.pourquoi.confiance >= 0.6 ? "Confiance moyenne" : "Confiance basse"}
              </p>
              <p className="ln-pourquoi__phrase">{actif.pourquoi.phrase}</p>
              <a className="ln-pourquoi__corriger" href="#verifier">
                Corriger ce lien
              </a>
            </section>
          )}

          {pageCourante === undefined ? null : <TextePage original={pageCourante.texte} traduction={pageCourante.traduction} />}

          <section className="ln-note ln-panneau" aria-labelledby="titre-note">
            <h2 id="titre-note" className="ln-note__titre">
              <Icone nom="document" />
              Note
            </h2>
            {/* Le schéma donne les mots sans leur genre : aucune tournure ne doit en demander un.
                « Note — clause 401 » vaut pour tous les domaines, « cette clause » non. */}
            <label className="ln-sr-only" htmlFor="note">
              Note — {vue.mots.element.un} {actif?.numero ?? ""}
            </label>
            <textarea
              id="note"
              className="ln-note__champ"
              placeholder="Ajouter une note…"
              value={note}
              onChange={(evenement) => setNote(evenement.currentTarget.value)}
            />
          </section>
        </aside>

        <FilVersSegment depuis={zoneActive} vers={segmentActif} dans={cadre} clef={actif?.ancreId ?? ""} />
      </div>

      <div className="ln-lecteur__pied ln-panneau-titre">
        <p className="ln-lecteur__compte">
          <span className="ln-sr-only">Position dans le document : </span>
          {vue.mots.page.un} {pageCourante?.numero ?? "—"} sur {vue.pages.length}
        </p>
        <div className="ln-lecteur__zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => setZoom(Math.max(50, zoom - 10))} aria-label="Réduire">
            <Icone nom="moins" />
          </button>
          <span className="ln-lecteur__zoom-valeur">{zoom} %</span>
          <button type="button" onClick={() => setZoom(Math.min(200, zoom + 10))} aria-label="Agrandir">
            <Icone nom="plus" />
          </button>
          <button type="button" aria-label="Plein écran">
            <Icone nom="pleinEcran" />
          </button>
        </div>
        <p className="ln-lecteur__raccourcis">
          {LEGENDE.map((entree) => (
            <span key={entree.touches} className="ln-lecteur__raccourci">
              <kbd>{entree.touches}</kbd> {entree.quoi}
            </span>
          ))}
          {aDistance ? <span className="ln-lecteur__distance">Mode à distance actif</span> : null}
        </p>
      </div>
    </main>
  );
}
