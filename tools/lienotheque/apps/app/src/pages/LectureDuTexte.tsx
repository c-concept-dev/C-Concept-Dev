import { useCallback, useEffect, type JSX } from "react";
import { citerPage, enTete, type Passage, type VueBibliotheque } from "@lienotheque/contrats";
import { Bouton, Icone } from "../composants/index.js";
import { FilAriane } from "../composants/FilAriane.js";
import { actionDe } from "./lecteur/raccourcis.js";
import "./LectureDuTexte.css";

/** Lire un document qui n'a aucune image (RCH-07, RCH-09, CLA-01).
 *
 *  Les pages de la vue viennent de la chaîne d'images : un document composé en texte n'en porte
 *  aucune, donc sa vue n'a aucune page, et le Lecteur n'avait rien à montrer. Son texte, lui, est
 *  lu entièrement — il manquait seulement l'écran qui le montre. C'est la route A du chantier
 *  ouvert le 21 octobre, et elle n'ajoute aucune donnée : tout ce qui suit existait déjà dans les
 *  passages.
 *
 *  **Cet écran ne montre pas le document tel qu'il est imprimé**, et ne le prétend pas. Une
 *  figure, des colonnes, une mise en page n'y sont pas. Il donne ce qu'on peut donner sans
 *  moteur de rendu : le texte, sur sa vraie page, citable.
 *
 *  Les mots viennent du schéma de la bibliothèque, jamais d'ici (CLA-01). */

type Props = {
  readonly vue: VueBibliotheque;
  readonly document?: string | undefined;
  /** Dans l'ordre de lecture, sans trou : c'est `PassagesDuDocument` qui le garantit. */
  readonly passages: readonly Passage[];
  /** Le rang de page demandé par l'adresse, à partir de un — la même convention que le Lecteur. */
  readonly page: number;
  /** Le document porte **quelques** images, mais elles ne le couvrent pas : une couverture, une
   *  planche. Le dire évite de laisser croire qu'il n'en existe aucune, et explique pourquoi
   *  l'on est ici plutôt que devant elles. */
  readonly imagesPartielles?: boolean | undefined;
  readonly onPage: (page: number) => void;
};

/** Le texte, en paragraphes.
 *
 *  Un passage porte le texte d'une page **tel quel**, retours à la ligne compris : les recoller
 *  en un seul bloc rendrait illisible ce que la mise en page séparait. Les lignes vides ne
 *  comptent pas — elles séparent, elles ne se montrent pas. */
const enParagraphes = (texte: string): readonly string[] =>
  texte
    .split(/\n+/)
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "");

export function LectureDuTexte({ vue, document, passages, page, imagesPartielles = false, onPage }: Props): JSX.Element {
  // Par le rang de page, et non par la position dans le tableau : un document peut porter
  // plusieurs passages sur une même page, et c'est la page que l'adresse désigne.
  const courant = passages.find((passage) => passage.page === page) ?? passages[0];
  const rang = courant === undefined ? -1 : passages.indexOf(courant);

  const aller = useCallback(
    (sens: 1 | -1) => {
      const suivant = passages[rang + sens];
      if (suivant !== undefined) onPage(suivant.page);
    },
    [passages, rang, onPage],
  );

  useEffect(() => {
    const ecouter = (evenement: KeyboardEvent): void => {
      const action = actionDe(evenement.key, evenement.target);
      if (action === "precedent") aller(-1);
      if (action === "suivant") aller(1);
    };
    globalThis.addEventListener("keydown", ecouter);
    return () => globalThis.removeEventListener("keydown", ecouter);
  }, [aller]);

  if (courant === undefined)
    return (
      <main id="contenu" className="ln-texte-lu" tabIndex={-1}>
        <div className="ln-texte-lu__entete ln-panneau-titre">
          <FilAriane chemin={[
            { libelle: "Accueil", href: "#" },
            { libelle: vue.nom, href: "#catalogue" },
            ...(document === undefined ? [] : [{ libelle: document }]),
          ]} />
        </div>
        <section className="ln-texte-lu__corps ln-panneau">
          <p className="ln-texte-lu__avis">Ce document n’a aucun texte lu.</p>
        </section>
      </main>
    );

  const citation = enTete(citerPage(vue.mots, { index: courant.page, numero: courant.pageImprimee }));
  const paragraphes = enParagraphes(courant.texte);

  return (
    <main id="contenu" className="ln-texte-lu" tabIndex={-1}>
      <div className="ln-texte-lu__entete ln-panneau-titre">
        {/* Le fil s'arrête à la bibliothèque : la position est le titre de l'écran, juste
            dessous, et l'écrire aux deux endroits donnerait deux fois la même chose à lire. */}
        <FilAriane chemin={[
          { libelle: "Accueil", href: "#" },
          { libelle: vue.nom, href: "#catalogue" },
          ...(document === undefined ? [] : [{ libelle: document }]),
        ]} />
        <span className="ln-texte-lu__rang">
          {rang + 1} / {passages.length}
        </span>
      </div>

      <section className="ln-texte-lu__corps ln-panneau" aria-labelledby="titre-texte-lu">
        <header className="ln-texte-lu__titre-bloc">
          <h1 id="titre-texte-lu" className="ln-texte-lu__titre">
            {citation}
          </h1>
          {courant.emplacement === undefined ? null : <p className="ln-texte-lu__emplacement">{courant.emplacement}</p>}
        </header>

        {imagesPartielles ? (
          <p className="ln-texte-lu__avis">
            <Icone nom="info" />
            Ce document porte quelques images — une couverture, une planche — mais elles ne
            couvrent pas son texte. C’est donc son texte qu’on lit ici.
          </p>
        ) : null}

        {courant.lisible ? null : (
          <p className="ln-texte-lu__avis ln-texte-lu__avis--reserve">
            <Icone nom="alerte" />
            Rien de lisible n’a été tiré de cette {vue.mots.page.un} : ni la couche de texte du document, ni la
            reconnaissance n’y ont trouvé de mots.
          </p>
        )}

        <div className="ln-texte-lu__texte">
          {paragraphes.map((paragraphe, place) => (
            // Le rang suffit à distinguer deux paragraphes identiques, et leur ordre ne bouge pas.
            <p key={`${courant.rang}-${place}`}>{paragraphe}</p>
          ))}
        </div>

        {courant.source === "ocr" ? (
          <p className="ln-texte-lu__avis">
            <Icone nom="info" />
            Texte reconnu sur l’image de la {vue.mots.page.un} : il peut comporter des fautes que le document, lui, n’a
            pas.
          </p>
        ) : null}
      </section>

      <div className="ln-texte-lu__pied ln-panneau-titre">
        <Bouton icone={<Icone nom="precedent" />} disabled={rang <= 0} onClick={() => aller(-1)}>
          Précédent
        </Bouton>
        <span className="ln-texte-lu__legende">
          <b>← →</b> {vue.mots.page.un}
        </span>
        <Bouton icone={<Icone nom="suivant" />} disabled={rang >= passages.length - 1} onClick={() => aller(1)}>
          Suivant
        </Bouton>
      </div>
    </main>
  );
}
