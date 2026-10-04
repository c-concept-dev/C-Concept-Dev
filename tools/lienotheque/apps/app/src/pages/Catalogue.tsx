import { useMemo, useState, type JSX } from "react";
import { accorder, type ElementAffiche, type PageAffichee, type VueBibliotheque } from "@lienotheque/contrats";
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

export function Catalogue({ vue, page, onPage, onLecteur, onAjouter }: Props): JSX.Element {
  const [mode, setMode] = useState<Vue>("grille");
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set());

  const basculer = (clef: string): void => {
    const suivant = new Set(choisis);
    if (suivant.has(clef)) suivant.delete(clef);
    else suivant.add(clef);
    setChoisis(suivant);
  };

  const pages = useMemo(() => vue.pages, [vue.pages]);
  const detail: PageAffichee | undefined = pages.find((p) => p.numero === page) ?? pages[0];

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
            {vue.aVerifier > 0 ? (
              <a className="ln-catalogue__averifier" href="#verifier">
                <Icone nom="alerte" />
                {accorder(vue.aVerifier, { un: "à vérifier", plusieurs: "à vérifier" })}
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
          {vue.filtres.map((filtre) => (
            <section key={filtre.cle} className="ln-filtres__axe" aria-labelledby={`axe-${filtre.cle}`}>
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
              {vue.mots.page.plusieurs[0]!.toUpperCase() + vue.mots.page.plusieurs.slice(1)}
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
                  aria-label={`${vue.mots.page.un} ${p.numero}`}
                >
                  <span className="ln-pages__apercu" aria-hidden="true">
                    {p.numero}
                  </span>
                  <span className="ln-pages__nom">
                    {vue.mots.page.un} {p.numero}
                  </span>
                  {p.titre === undefined ? null : <span className="ln-pages__titre">{p.titre}</span>}
                  <span className="ln-pages__relies">
                    <Icone nom="lien" />
                    {accorder(relies(p), { un: `${vue.mots.element.un} relié`, plusieurs: `${vue.mots.element.plusieurs} reliés` })}
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

        <aside className="ln-detail ln-panneau" aria-label={`Détail — ${vue.mots.page.un} ${detail?.numero ?? ""}`}>
          {detail === undefined ? (
            <p>Aucune {vue.mots.page.un} dans cette bibliothèque.</p>
          ) : (
            <>
              <h2 className="ln-detail__titre">
                {vue.mots.page.un} {detail.numero}
              </h2>
              <div className="ln-detail__apercu" role="img" aria-label={`${vue.mots.page.un} ${detail.numero}`}>
                <span>{detail.numero}</span>
                {detail.titre === undefined ? null : <span className="ln-detail__sous-titre">{detail.titre}</span>}
              </div>

              <h3 className="ln-detail__sous">
                {vue.mots.element.plusieurs[0]!.toUpperCase() + vue.mots.element.plusieurs.slice(1)} de la {vue.mots.page.un}
              </h3>
              <ul className="ln-detail__elements">
                {detail.elements.map((element: ElementAffiche) => (
                  <li key={element.ancreId} className="ln-detail__element">
                    <Icone nom="document" />
                    <span className="ln-detail__nom">
                      {vue.mots.element.un} {element.numero}
                    </span>
                    {element.media === undefined ? (
                      <span className="ln-detail__sans">pas d’enregistrement</span>
                    ) : (
                      <span className="ln-detail__vers">
                        → {vue.mots.piste.un} {element.media.piste}
                      </span>
                    )}
                    <span className={element.aVerifier ? "ln-detail__etat ln-detail__etat--doute" : "ln-detail__etat"}>
                      <Icone nom={element.aVerifier ? "alerte" : "valide"} />
                      {element.aVerifier ? "à vérifier" : "lien validé"}
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
