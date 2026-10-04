import { useMemo, useState, type JSX } from "react";
import { accorder, enTete, nommer, type ElementAffiche, type PageAffichee, type VueBibliotheque } from "@lienotheque/contrats";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import "./Catalogue.css";

/** Catalogue d'une bibliothèque (B3 — CLA-10, UX-01).
 *
 *  Les filtres ne sont pas écrits ici : ils viennent de la nomenclature de la bibliothèque, avec
 *  leurs compteurs. Ajouter un axe au schéma ajoute un filtre, sans toucher à ce fichier. */

type Props = {
  readonly vue: VueBibliotheque;
  readonly page?: number | undefined;
  readonly onPage: (numero: number) => void;
  readonly onLecteur: (page: number, ancreId: string) => void;
  readonly onAjouter: () => void;
};

type Vue = "grille" | "liste";

/** L'état du lien est le seul axe que l'écran connaît de lui-même.
 *
 *  Les autres viennent du schéma de la bibliothèque (CLA-01) : l'écran les affiche sans savoir ce
 *  qu'ils veulent dire. Celui-ci est différent — « validé » et « à vérifier » sont des mots de
 *  l'application, pas du domaine, et c'est elle qui décide ce qu'ils désignent. D'où le fait
 *  qu'elle puisse, elle, filtrer dessus. */
const ETAT = {
  cle: "etat",
  nom: "État du lien",
  valeurs: [
    { cle: "valide", nom: "Validé" },
    { cle: "a-verifier", nom: "À vérifier" },
  ],
} as const;

type CleEtat = (typeof ETAT.valeurs)[number]["cle"];

/** L'état d'une page : elle est à vérifier dès qu'un seul de ses éléments l'est. */
const etatDe = (p: PageAffichee): CleEtat => (p.elements.some((e) => e.aVerifier) ? "a-verifier" : "valide");

export function Catalogue({ vue, page, onPage, onLecteur, onAjouter }: Props): JSX.Element {
  const [mode, setMode] = useState<Vue>("grille");
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set());

  const basculer = (clef: string): void => {
    const suivant = new Set(choisis);
    if (suivant.has(clef)) suivant.delete(clef);
    else suivant.add(clef);
    setChoisis(suivant);
  };

  const pages = useMemo(() => {
    const etats = ETAT.valeurs.map((v) => v.cle).filter((cle) => choisis.has(`${ETAT.cle}/${cle}`));
    // Aucun état coché vaut tous les états : une liste vide n'est pas un filtre, c'est l'absence
    // de filtre — et un écran qui se vide au premier clic de décochage se lit comme un bogue.
    return etats.length === 0 ? vue.pages : vue.pages.filter((p) => etats.includes(etatDe(p)));
  }, [vue.pages, choisis]);
  const detail: PageAffichee | undefined = pages.find((p) => p.numero === page) ?? pages[0];

  // Ce qui attend un arbitrage et ce qui attend seulement d'être lu ne se comptent pas ensemble.
  const informations = vue.douteux.filter((cas) => cas.nature === "information").length;
  const aTrancher = vue.douteux.length - informations;

  const relies = (p: PageAffichee): number => p.elements.filter((e) => e.media !== undefined).length;
  const aVerifier = (p: PageAffichee): number => p.elements.filter((e) => e.aVerifier).length;

  return (
    <main id="contenu" className="ln-catalogue" tabIndex={-1}>
      <div className="ln-catalogue__entete ln-panneau-titre">
        <div className="ln-catalogue__identite">
          <FilAriane chemin={[{ libelle: "Accueil", href: "#" }, { libelle: vue.nom }]} />
          <h1 className="ln-catalogue__titre">{vue.nom}</h1>
          <p className="ln-catalogue__compteurs">
            {vue.compteurs.map((compteur) => (
              <span key={compteur.mot}>
                {compteur.nombre} {compteur.mot}
              </span>
            ))}
            {/* Deux comptes, pas un seul. « 7 à vérifier » en tête pendant que le filtre
                annonçait « À vérifier : 0 », c'était l'écran qui se contredisait : les sept
                étaient des informations, qui ne se tranchent pas. Chacune son compte. */}
            {aTrancher > 0 ? (
              <a className="ln-catalogue__averifier" href="#verifier">
                <Icone nom="alerte" />
                {accorder(aTrancher, { un: "à vérifier", plusieurs: "à vérifier" })}
              </a>
            ) : null}
            {informations > 0 ? (
              <a className="ln-catalogue__informations" href="#verifier">
                <Icone nom="info" />
                {accorder(informations, { un: "information", plusieurs: "informations" })}
              </a>
            ) : null}
          </p>
        </div>
        <Bouton variante="principal" icone={<Icone nom="plus" />} onClick={onAjouter}>
          Ajouter des fichiers
        </Bouton>
      </div>

      <div className="ln-catalogue__corps">
        <nav className="ln-filtres ln-panneau ln-panneau-titre" aria-label="Filtres">
          <h2 className="ln-filtres__titre">Filtres</h2>

          <section className="ln-filtres__axe" role="group" aria-labelledby={`axe-${ETAT.cle}`}>
            <h3 id={`axe-${ETAT.cle}`} className="ln-filtres__nom">
              {ETAT.nom}
            </h3>
            <ul className="ln-filtres__valeurs">
              {ETAT.valeurs.map((valeur) => {
                const clef = `${ETAT.cle}/${valeur.cle}`;
                // Le compte porte sur toutes les pages, pas sur celles que le filtre laisse
                // passer : un nombre qui tombe à zéro dès qu'on coche ne renseigne plus.
                const nombre = vue.pages.filter((p) => etatDe(p) === valeur.cle).length;
                return (
                  <li key={clef}>
                    <label className={choisis.has(clef) ? "ln-filtres__valeur ln-filtres__valeur--choisi" : "ln-filtres__valeur"}>
                      <input type="checkbox" checked={choisis.has(clef)} onChange={() => basculer(clef)} />
                      <span className="ln-filtres__libelle">{valeur.nom}</span>
                      <span className="ln-filtres__nombre">{nombre}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Seuls les axes qui peuvent vraiment trier se montrent (CLA-10). Un axe que
              l'instantané déclare sans l'avoir compté s'affichait avec des comptes à zéro et des
              cases sans effet : l'écran promettait un tri qui n'existait pas. Le groupe
              reparaîtra de lui-même le jour où les pages porteront leurs valeurs. */}
          {vue.filtres.filter((filtre) => filtre.filtrable).map((filtre) => (
            <section key={filtre.cle} className="ln-filtres__axe" role="group" aria-labelledby={`axe-${filtre.cle}`}>
              <h3 id={`axe-${filtre.cle}`} className="ln-filtres__nom">
                {filtre.nom}
              </h3>
              <ul className="ln-filtres__valeurs">
                {filtre.valeurs.map((valeur) => {
                  const clef = `${filtre.cle}/${valeur.cle}`;
                  return (
                    <li key={clef}>
                      <label className={choisis.has(clef) ? "ln-filtres__valeur ln-filtres__valeur--choisi" : "ln-filtres__valeur"}>
                        <input type="checkbox" checked={choisis.has(clef)} onChange={() => basculer(clef)} />
                        <span className="ln-filtres__libelle">{valeur.nom}</span>
                        <span className="ln-filtres__nombre">{valeur.nombre}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <section className="ln-catalogue__liste" aria-labelledby="titre-pages">
          <div className="ln-catalogue__barre ln-panneau-titre">
            <h2 id="titre-pages" className="ln-catalogue__sous-titre">
              {enTete(vue.mots.page.plusieurs)}
            </h2>
            <div className="ln-bascule" role="group" aria-label="Affichage">
              {(["grille", "liste"] as const).map((lequel) => (
                <button
                  key={lequel}
                  type="button"
                  className={mode === lequel ? "ln-bascule__choix ln-bascule__choix--choisi" : "ln-bascule__choix"}
                  onClick={() => setMode(lequel)}
                  aria-pressed={mode === lequel}
                >
                  <Icone nom={lequel === "grille" ? "grille" : "liste"} />
                  {lequel === "grille" ? "Grille" : "Liste"}
                </button>
              ))}
            </div>
          </div>

          <ol className={mode === "grille" ? "ln-pages ln-pages--grille" : "ln-pages ln-pages--liste"}>
            {pages.map((p) => (
              <li key={p.numero}>
                <button
                  type="button"
                  className={p.numero === detail?.numero ? "ln-pages__carte ln-pages__carte--ouvert" : "ln-pages__carte"}
                  onClick={() => onPage(p.numero)}
                  aria-current={p.numero === detail?.numero ? "true" : undefined}
                  aria-label={nommer(vue.mots.page, p.numero)}
                >
                  {/* La vignette de la page quand le lot en porte une (OUT-04) ; son numéro
                      sinon. Décorative dans les deux cas : le nom accessible est sur le bouton. */}
                  {p.vignette === undefined ? (
                    <span className="ln-pages__apercu" aria-hidden="true">
                      {p.numero}
                    </span>
                  ) : (
                    <img className="ln-pages__apercu" src={p.vignette} alt="" loading="lazy" decoding="async" />
                  )}
                  <span className="ln-pages__nom">
                    {nommer(vue.mots.page, p.numero)}
                  </span>
                  {p.titre === undefined ? null : <span className="ln-pages__titre">{p.titre}</span>}
                  <span className="ln-pages__relies">
                    <Icone nom="lien" />
                    {enTete(vue.mots.element.plusieurs)} : {relies(p)}
                  </span>
                  {aVerifier(p) > 0 ? (
                    <span className="ln-pages__averifier">
                      <Icone nom="alerte" />
                      {accorder(aVerifier(p), { un: "à vérifier", plusieurs: "à vérifier" })}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <aside className="ln-detail ln-panneau" aria-label={`Détail — ${nommer(vue.mots.page, detail?.numero ?? "")}`}>
          {detail === undefined ? (
            <p>Aucun résultat dans cette bibliothèque.</p>
          ) : (
            <>
              <h2 className="ln-detail__titre">
                {nommer(vue.mots.page, detail.numero)}
              </h2>
              {detail.vignette === undefined ? (
                <div className="ln-detail__apercu" role="img" aria-label={nommer(vue.mots.page, detail.numero)}>
                  <span>{detail.numero}</span>
                  {detail.titre === undefined ? null : <span className="ln-detail__sous-titre">{detail.titre}</span>}
                </div>
              ) : (
                <img
                  className="ln-detail__apercu ln-detail__apercu--image"
                  src={detail.vignette}
                  alt={nommer(vue.mots.page, detail.numero)}
                  loading="lazy"
                  decoding="async"
                />
              )}

              <h3 className="ln-detail__sous">
                {enTete(vue.mots.element.plusieurs)}
              </h3>
              <ul className="ln-detail__elements">
                {detail.elements.map((element: ElementAffiche) => (
                  <li key={element.ancreId} className="ln-detail__element">
                    <Icone nom="document" />
                    <span className="ln-detail__nom">
                      {nommer(vue.mots.element, element.numero)}
                    </span>
                    {element.media === undefined ? (
                      <span className="ln-detail__sans">Sans {vue.mots.piste.un}</span>
                    ) : (
                      <span className="ln-detail__vers">
                        → {nommer(vue.mots.piste, element.media.piste)}
                      </span>
                    )}
                    {/* Une étiquette commence par une majuscule comme n'importe quel libellé :
                        c'est `enTete` qui la pose, la même fonction partout. */}
                    <span className={element.aVerifier ? "ln-detail__etat ln-detail__etat--doute" : "ln-detail__etat"}>
                      <Icone nom={element.aVerifier ? "alerte" : "valide"} />
                      {enTete(element.aVerifier ? "à vérifier" : "lien validé")}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="ln-detail__ouvrir"
                onClick={() => onLecteur(detail.numero, detail.elements[0]?.ancreId ?? "")}
                disabled={detail.elements.length === 0}
              >
                Ouvrir dans le Lecteur <Icone nom="chevronDroite" />
              </button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
