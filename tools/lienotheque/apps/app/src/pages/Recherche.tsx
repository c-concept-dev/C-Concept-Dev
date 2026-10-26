import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from "react";
import type { CorrespondanceBibliotheque, Passage, VueBibliotheque } from "@lienotheque/contrats";
import { aLaFile, chercher, morceler, resultatsDeBibliotheque, type Action, type GenreResultat, type Resultat } from "@lienotheque/noyau";
import { Bouton, Icone, type NomIcone } from "../composants/index.js";
import { imageAffichable } from "../image-affichable.js";
import "./Recherche.css";

/** Recherche ⌘K (maquette 5, RCH, UX-02, UX-06).
 *
 *  Un voile, un champ, une liste groupée et un aperçu de ce qui est choisi. Le port commun lit
 *  l'index local au bureau et la base publiée en ligne ; l'écran reçoit la même forme.
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
  /** Le texte du document, à part de la vue : la vue porte les repères, les passages portent le
   *  texte. Un fait, un seul endroit — `PageAffichee.texte` n'est jamais rempli par la chaîne. */
  readonly passages?: readonly Passage[] | undefined;
  readonly actions?: readonly Action[] | undefined;
  readonly onFermer: () => void;
  /** Ouvrir ce qui est choisi : une page, un élément, une piste. */
  readonly onOuvrir: (resultat: Resultat) => void;
  /** Écouter la piste reliée, sans quitter la recherche. */
  readonly onEcouter: (resultat: Resultat) => void;
  readonly onAction: (cle: string) => void;
  /** Ce qui est déjà tapé à l'ouverture. Sert aux captures, où personne ne tape. */
  readonly requeteInitiale?: string | undefined;
  /** Présente dans le produit : l'index de toute la bibliothèque. Absente dans les épreuves
   * historiques C8, qui continuent d'exercer la fonction locale et ses positions exactes. */
  readonly rechercherBibliotheque?: ((requete: string) => Promise<readonly CorrespondanceBibliotheque[]>) | undefined;
  readonly nomBibliotheque?: string | undefined;
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

export function Recherche({
  vue,
  passages,
  actions,
  onFermer,
  onOuvrir,
  onEcouter,
  onAction,
  requeteInitiale,
  rechercherBibliotheque,
  nomBibliotheque,
}: Props): JSX.Element {
  const [requete, setRequete] = useState(requeteInitiale ?? "");
  const [choisi, setChoisi] = useState(0);
  const base = useId();
  const liste = useRef<HTMLDivElement>(null);
  const [correspondances, setCorrespondances] = useState<readonly CorrespondanceBibliotheque[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState(false);

  useEffect(() => {
    if (rechercherBibliotheque === undefined || requete.trim() === "") {
      setCorrespondances([]);
      setRechercheEnCours(false);
      setErreurRecherche(false);
      return undefined;
    }
    let vivante = true;
    setRechercheEnCours(true);
    setErreurRecherche(false);
    const attente = window.setTimeout(() => {
      void rechercherBibliotheque(requete).then((trouves) => {
        if (vivante) setCorrespondances(trouves);
      }).catch(() => {
        if (vivante) {
          setCorrespondances([]);
          setErreurRecherche(true);
        }
      }).finally(() => {
        if (vivante) setRechercheEnCours(false);
      });
    }, 120);
    return () => {
      vivante = false;
      window.clearTimeout(attente);
    };
  }, [requete, rechercherBibliotheque]);

  const groupes = useMemo(
    () => rechercherBibliotheque === undefined
      ? chercher(vue, requete, {
        ...(actions === undefined ? {} : { actions }),
        ...(passages === undefined ? {} : { passages }),
      })
      : resultatsDeBibliotheque(correspondances, requete, vue.mots.page),
    [vue, requete, actions, passages, correspondances, rechercherBibliotheque],
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
        className="ln-chercher"
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        onMouseDown={(evenement) => evenement.stopPropagation()}
        onKeyDown={auClavier}
      >
        <div className="ln-chercher__champ">
          <Icone nom="recherche" />
          <label className="ln-sr-only" htmlFor={`${base}-champ`}>
            Rechercher dans {nomBibliotheque ?? vue.nom}
          </label>
          <input
            id={`${base}-champ`}
            className="ln-chercher__saisie"
            value={requete}
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-expanded={file.length > 0}
            aria-controls={`${base}-liste`}
            aria-activedescendant={actif === undefined ? undefined : `${base}-${actif.cle}`}
            placeholder={`Chercher dans ${nomBibliotheque ?? vue.nom}`}
            onChange={(evenement) => setRequete(evenement.target.value)}
          />
          <span className="ln-chercher__portee">{nomBibliotheque ?? vue.nom}</span>
          <Bouton compact icone={<Icone nom="fermer" />} onClick={onFermer}>
            Fermer
          </Bouton>
        </div>

        <div className="ln-chercher__corps">
          <div className="ln-chercher__liste" id={`${base}-liste`} role="listbox" aria-label="Résultats" ref={liste}>
            {requete.trim() === "" ? (
              <p className="ln-chercher__vide">
                Cherchez un {vue.mots.element.un}, un mot d’une {vue.mots.page.un}, une{" "}
                {vue.mots.piste.un}.
              </p>
            ) : erreurRecherche ? (
              <p className="ln-chercher__vide">La recherche n’a pas pu aboutir. Réessayez.</p>
            ) : rechercheEnCours ? (
              <p className="ln-chercher__vide">Recherche dans la bibliothèque…</p>
            ) : file.length === 0 ? (
              <p className="ln-chercher__vide">Rien ici ne correspond à «&nbsp;{requete.trim()}&nbsp;».</p>
            ) : (
              groupes.map((groupe) => (
                <div key={groupe.genre} className="ln-chercher__groupe" role="group" aria-label={groupe.libelle}>
                  <p className="ln-section ln-chercher__intitule">
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

          <aside className="ln-chercher__apercu" aria-label="Aperçu">
            <p className="ln-section">Aperçu</p>
            {actif === undefined || actif.page === undefined ? (
              <p className="ln-muted ln-chercher__sans-apercu">
                Choisissez un résultat&nbsp;: sa {vue.mots.page.un} s’affichera ici.
              </p>
            ) : actif.document !== undefined ? (
              <div className="ln-chercher__sans-apercu">
                <p>{actif.titre}</p>
                <p className="ln-muted">{actif.cote}</p>
                {actif.extrait === undefined ? null : <p>« {actif.extrait} »</p>}
                <Bouton onClick={() => ouvrir(actif)}>Ouvrir cette page</Bouton>
              </div>
            ) : (
              <Apercu vue={vue} resultat={actif} onOuvrir={() => ouvrir(actif)} onEcouter={() => onEcouter(actif)} />
            )}
          </aside>
        </div>

        <p className="ln-chercher__pied">
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
          <span className="ln-chercher__fin">
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
  const page = vue.pages.find((candidate) => candidate.index === resultat.page);
  const element = page?.elements.find((candidate) => candidate.ancreId === resultat.element);
  // Sur le bureau, `/donnees/pages/...` est un repère pour l'hôte, pas une URL du WebView.
  // Le Lecteur le remplace par une data URL à la demande ; la recherche attend cette adresse
  // réellement servie au lieu d'afficher une image cassée.
  const image = imageAffichable(page?.image, false);

  return (
    <>
      <div className="ln-chercher__page">
        {image === undefined ? (
          <p className="ln-muted">
            Cette {vue.mots.page.un} n’a pas encore d’image&nbsp;: le traitement ne l’a pas produite.
          </p>
        ) : (
          <img src={image} alt={`${vue.mots.page.un} ${page?.numero ?? page?.index ?? resultat.page}`} />
        )}
      </div>
      <div>
        <p className="ln-chercher__quoi">
          {resultat.titre} · {vue.mots.page.un} {resultat.page}
        </p>
        <p className="ln-muted">
          {element?.media === undefined
            ? `Aucune ${vue.mots.piste.un} reliée.`
            : `Relié à la ${vue.mots.piste.un} ${element.media.piste}.`}
        </p>
      </div>
      <div className="ln-chercher__faire">
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
