import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from "react";
import type { VueBibliotheque } from "@lienotheque/contrats";
import { aLaFile, chercher, morceler, type Action, type GenreResultat, type Resultat } from "@lienotheque/noyau";
import { Bouton, Icone, type NomIcone } from "../composants/index.js";
import "./Recherche.css";

/** Recherche ⌘K (maquette 5, RCH, UX-02, UX-06).
 *
 *  Un voile, un champ, une liste groupée et un aperçu de ce qui est choisi. Rien ne part de la
 *  machine : la recherche lit la vue qui est déjà là.
 *
 *  Tout se fait au clavier, et le pied le dit — une palette qu'on ne peut conduire qu'à la souris
 *  n'a aucune raison d'exister. */

const ICONES: Readonly<Record<GenreResultat, NomIcone>> = {
  element: "livre",
  page: "document",
  piste: "audio",
  action: "etiquette",
};

type Props = {
  readonly vue: VueBibliotheque;
  readonly actions?: readonly Action[] | undefined;
  readonly onFermer: () => void;
  /** Ouvrir ce qui est choisi : une page, un élément, une piste. */
  readonly onOuvrir: (resultat: Resultat) => void;
  /** Écouter la piste reliée, sans quitter la recherche. */
  readonly onEcouter: (resultat: Resultat) => void;
  readonly onAction: (cle: string) => void;
};

/** Le texte, ses correspondances marquées. L'écran ne calcule rien : le noyau a déjà découpé. */
function Marque({ texte, surlignes }: { readonly texte: string; readonly surlignes: readonly { debut: number; fin: number }[] }): JSX.Element {
  return (
    <>
      {morceler(texte, surlignes).map((morceau, rang) =>
        morceau.marque ? <mark key={rang}>{morceau.texte}</mark> : <span key={rang}>{morceau.texte}</span>,
      )}
    </>
  );
}

export function Recherche({ vue, actions, onFermer, onOuvrir, onEcouter, onAction }: Props): JSX.Element {
  const [requete, setRequete] = useState("");
  const [choisi, setChoisi] = useState(0);
  const base = useId();
  const liste = useRef<HTMLDivElement>(null);

  const groupes = useMemo(
    () => chercher(vue, requete, { ...(actions === undefined ? {} : { actions }) }),
    [vue, requete, actions],
  );
  const file = useMemo(() => aLaFile(groupes), [groupes]);
  const actif = file[Math.min(choisi, Math.max(0, file.length - 1))];

  // Une requête neuve repart du premier résultat : rester au cinquième d'une liste qu'on vient de
  // remplacer n'a aucun sens.
  useEffect(() => setChoisi(0), [requete]);

  // Le résultat choisi reste visible quand on descend au clavier.
  useEffect(() => {
    if (actif === undefined) return;
    liste.current?.querySelector(`#${CSS.escape(`${base}-${actif.cle}`)}`)?.scrollIntoView({ block: "nearest" });
  }, [actif, base]);

  const ouvrir = (resultat: Resultat): void => {
    if (resultat.genre === "action") onAction(resultat.cle.replace(/^action:/, ""));
    else onOuvrir(resultat);
  };

  /** Le rang du premier résultat du groupe suivant : ⇥ saute de groupe, pas de ligne. */
  const groupeSuivant = (depuis: number): number => {
    let rang = 0;
    for (const groupe of groupes) {
      if (rang > depuis) return rang;
      rang += groupe.resultats.length;
    }
    return 0;
  };

  const auClavier = (evenement: KeyboardEvent<HTMLDivElement>): void => {
    if (evenement.key === "Escape") {
      evenement.preventDefault();
      onFermer();
      return;
    }
    if (file.length === 0) return;

    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      setChoisi((rang) => (rang + 1) % file.length);
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      setChoisi((rang) => (rang - 1 + file.length) % file.length);
    } else if (evenement.key === "Tab") {
      evenement.preventDefault();
      setChoisi(groupeSuivant(choisi));
    } else if (evenement.key === "Enter" && actif !== undefined) {
      evenement.preventDefault();
      if ((evenement.metaKey || evenement.ctrlKey) && actif.piste !== undefined) onEcouter(actif);
      else ouvrir(actif);
    }
  };

  return (
    <div className="ln-voile" role="presentation" onMouseDown={onFermer}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="ln-recherche"
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        onMouseDown={(evenement) => evenement.stopPropagation()}
        onKeyDown={auClavier}
      >
        <div className="ln-recherche__champ">
          <Icone nom="recherche" />
          <label className="ln-sr-only" htmlFor={`${base}-champ`}>
            Rechercher dans {vue.nom}
          </label>
          <input
            id={`${base}-champ`}
            className="ln-recherche__saisie"
            value={requete}
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-expanded={file.length > 0}
            aria-controls={`${base}-liste`}
            aria-activedescendant={actif === undefined ? undefined : `${base}-${actif.cle}`}
            placeholder={`Chercher dans ${vue.nom}`}
            onChange={(evenement) => setRequete(evenement.target.value)}
          />
          <span className="ln-recherche__portee">{vue.nom}</span>
          <Bouton compact icone={<Icone nom="fermer" />} onClick={onFermer}>
            Fermer
          </Bouton>
        </div>

        <div className="ln-recherche__corps">
          <div className="ln-recherche__liste" id={`${base}-liste`} role="listbox" aria-label="Résultats" ref={liste}>
            {requete.trim() === "" ? (
              <p className="ln-recherche__vide">
                Cherchez un {vue.mots.element.un}, un mot d’une {vue.mots.page.un}, une{" "}
                {vue.mots.piste.un}.
              </p>
            ) : file.length === 0 ? (
              <p className="ln-recherche__vide">Rien ici ne correspond à «&nbsp;{requete.trim()}&nbsp;».</p>
            ) : (
              groupes.map((groupe) => (
                <div key={groupe.genre} className="ln-recherche__groupe" role="group" aria-label={groupe.libelle}>
                  <p className="ln-section ln-recherche__intitule">
                    {groupe.libelle} · {groupe.resultats.length}
                  </p>
                  {groupe.resultats.map((resultat) => (
                    <div
                      key={resultat.cle}
                      id={`${base}-${resultat.cle}`}
                      role="option"
                      aria-selected={resultat.cle === actif?.cle}
                      tabIndex={-1}
                      className={`ln-resultat${resultat.cle === actif?.cle ? " ln-resultat--choisi" : ""}`}
                      onMouseEnter={() => setChoisi(file.findIndex((autre) => autre.cle === resultat.cle))}
                      onClick={() => ouvrir(resultat)}
                    >
                      <Icone nom={ICONES[resultat.genre]} />
                      <div className="ln-resultat__corps">
                        <p className="ln-resultat__titre">
                          <Marque texte={resultat.titre} surlignes={resultat.surlignesTitre} />
                        </p>
                        {resultat.source === "" ? null : <p className="ln-muted">{resultat.source}</p>}
                        {resultat.extrait === undefined ? null : (
                          <p className="ln-resultat__extrait">
                            «&nbsp;
                            <Marque texte={resultat.extrait} surlignes={resultat.surlignesExtrait ?? []} />
                            &nbsp;»
                          </p>
                        )}
                      </div>
                      <span className="ln-muted ln-resultat__cote">
                        {resultat.genre === "action" ? <span className="ln-touche">↵</span> : resultat.cote}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <aside className="ln-recherche__apercu" aria-label="Aperçu">
            <p className="ln-section">Aperçu</p>
            {actif === undefined || actif.page === undefined ? (
              <p className="ln-muted ln-recherche__sans-apercu">
                Choisissez un résultat&nbsp;: sa {vue.mots.page.un} s’affichera ici.
              </p>
            ) : (
              <Apercu vue={vue} resultat={actif} onOuvrir={() => ouvrir(actif)} onEcouter={() => onEcouter(actif)} />
            )}
          </aside>
        </div>

        <p className="ln-recherche__pied">
          <span>
            <span className="ln-touche">↑</span> <span className="ln-touche">↓</span> parcourir
          </span>
          <span>
            <span className="ln-touche">↵</span> ouvrir
          </span>
          <span>
            <span className="ln-touche">⌘</span>
            <span className="ln-touche">↵</span> écouter
          </span>
          <span>
            <span className="ln-touche">⇥</span> changer de groupe
          </span>
          <span className="ln-recherche__fin">
            <span className="ln-touche">échap</span> fermer
          </span>
        </p>
      </div>
    </div>
  );
}

/** Ce que le résultat choisi montre : sa page, ce qu'il est, et ce qu'on peut en faire. */
function Apercu({
  vue,
  resultat,
  onOuvrir,
  onEcouter,
}: {
  readonly vue: VueBibliotheque;
  readonly resultat: Resultat;
  readonly onOuvrir: () => void;
  readonly onEcouter: () => void;
}): JSX.Element {
  const page = vue.pages.find((candidate) => candidate.numero === resultat.page);
  const element = page?.elements.find((candidate) => candidate.ancreId === resultat.element);

  return (
    <>
      <div className="ln-recherche__page">
        {page?.image === undefined ? (
          <p className="ln-muted">
            Cette {vue.mots.page.un} n’a pas encore d’image&nbsp;: le traitement ne l’a pas produite.
          </p>
        ) : (
          <img src={page.image} alt={`${vue.mots.page.un} ${page.numero}`} />
        )}
      </div>
      <div>
        <p className="ln-recherche__quoi">
          {resultat.titre} · {vue.mots.page.un} {resultat.page}
        </p>
        <p className="ln-muted">
          {element?.media === undefined
            ? `Aucune ${vue.mots.piste.un} reliée.`
            : `Relié à la ${vue.mots.piste.un} ${element.media.piste}.`}
        </p>
      </div>
      <div className="ln-recherche__faire">
        {resultat.piste === undefined ? null : (
          <Bouton icone={<Icone nom="lecture" />} onClick={onEcouter}>
            Écouter
          </Bouton>
        )}
        <Bouton variante="principal" icone={<Icone nom="pleinEcran" />} onClick={onOuvrir}>
          Ouvrir la {vue.mots.page.un}
        </Bouton>
      </div>
    </>
  );
}
