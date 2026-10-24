import { useMemo, useState, type JSX } from "react";
import {
  accorder,
  enTete,
  citerPage,
  nommer,
  type ApercuDocument,
  type ClassementLocal,
  type ElementAffiche,
  type PageAffichee,
  type SchemaBibliotheque,
  type ValeursAxe,
  type VueBibliotheque,
} from "@lienotheque/contrats";
import { classerUnDocument } from "@lienotheque/noyau";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import { imageAffichable } from "../image-affichable.js";
import { compteursDeBibliotheque } from "../donnees/accueil.js";
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
  /** Vers ce qui se trouve deux fois. **Dans le catalogue**, parce que c'est en regardant ses
   *  documents qu'on se demande si l'un n'y est pas deux fois — pas en en déposant d'autres. */
  readonly onDoublons?: (() => void) | undefined;
  /** Les axes de la bibliothèque. Sans eux, il n'y a rien sur quoi ranger. */
  readonly schema?: SchemaBibliotheque | undefined;
  /** Le document regardé, désigné par l'empreinte de sa source. */
  readonly empreinte?: string | undefined;
  /** Ce qu'il porte déjà. En propriété séparée, jamais recopié dans la vue : le classement vit
   *  dans la table de la bibliothèque, et un fait n'a qu'un seul endroit. */
  readonly classement?: ClassementLocal | undefined;
  readonly onClasser?: ((classement: ClassementLocal) => void) | undefined;
  /** Les documents de la bibliothèque, en projection légère (B5). */
  readonly documents?: readonly ApercuDocument[] | undefined;
  /** Ce que chacun porte. Reçue à part, jamais recopiée dans la vue. */
  readonly classements?: ReadonlyMap<string, ClassementLocal> | undefined;
  readonly onDocument?: ((empreinte: string) => void) | undefined;
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

export function Catalogue({
  vue,
  page,
  onPage,
  onLecteur,
  onAjouter,
  onDoublons,
  schema,
  empreinte,
  classement,
  onClasser,
  documents,
  classements,
  onDocument,
}: Props): JSX.Element {
  const [mode, setMode] = useState<Vue>("grille");
  const [choisis, setChoisis] = useState<ReadonlySet<string>>(new Set());

  const basculer = (clef: string): void => {
    const suivant = new Set(choisis);
    if (suivant.has(clef)) suivant.delete(clef);
    else suivant.add(clef);
    setChoisis(suivant);
  };

  // Les axes sur lesquels un document se range : ceux qui portent un référentiel. Ce sont les
  // mêmes qui servent à ranger et à filtrer — un axe qu'on ne peut pas choisir ne filtre rien.
  const axesClassants = useMemo(
    () => (schema?.axes ?? []).filter((axe) => axe.nature === "referentiel" || axe.nature === "liste_semi_ouverte"),
    [schema],
  );

  // Les documents retenus par les filtres de classement.
  //
  // Le Catalogue filtrait jusqu'ici les **pages** d'un document, sur des valeurs portées page par
  // page. Le classement, lui, est par document : il faut donc compter sur la table des
  // classements, et non sur la vue. Un document rangé nulle part ne passe pas « partout » — il
  // sort dès qu'un filtre est posé, parce que « non rangé » n'est pas « rangé sous tout ».
  const documentsRetenus = useMemo(() => {
    if (documents === undefined) return [];
    return documents.filter((document) => {
      const range = classements?.get(document.empreinte);
      for (const axe of axesClassants) {
        const voulues = axe.valeurs.map((valeur) => valeur.cle).filter((cle) => choisis.has(`doc:${axe.cle}/${cle}`));
        if (voulues.length === 0) continue;
        const portees = range?.axes[axe.cle];
        const cles = portees?.type === "reference" ? portees.valeurs : [];
        if (!voulues.some((cle) => cles.includes(cle))) return false;
      }
      return true;
    });
  }, [documents, classements, choisis, axesClassants]);

  // Ranger ce document sur un axe. On reprend le classement entier et l'on y remplace un axe :
  // c'est le noyau qui sait lire un schéma, et lui seul doit le vérifier. L'écran compare des
  // clés et ne sait rien de ce qu'elles veulent dire (CLA-01).
  const ranger = (cleAxe: string, valeurs: readonly string[]): void => {
    if (schema === undefined || empreinte === undefined || onClasser === undefined) return;
    const apres: Record<string, ValeursAxe> = { ...(classement?.axes ?? {}) };
    // Plus aucune valeur : l'axe sort du classement au lieu de garder une liste vide. « Non
    // rangé » est une réponse, et ce n'est pas la même chose qu'une valeur par défaut.
    if (valeurs.length === 0) delete apres[cleAxe];
    else apres[cleAxe] = { type: "reference", valeurs: [...valeurs] };
    onClasser(classerUnDocument(schema, empreinte, apres, "manuel"));
  };

  const pages = useMemo(() => {
    // Coché dans un même axe : l'un ou l'autre. D'un axe à l'autre : les deux à la fois. C'est
    // ce qu'on attend d'une liste de cases, et c'est vrai de l'axe de l'application comme de
    // ceux du schéma — l'écran ne sait pas ce qu'ils veulent dire, il compare des clés.
    const retenues = (cleAxe: string, possibles: readonly string[]): readonly string[] =>
      possibles.filter((cle) => choisis.has(`${cleAxe}/${cle}`));

    // Aucun état coché vaut tous les états : une liste vide n'est pas un filtre, c'est l'absence
    // de filtre — et un écran qui se vide au premier clic de décochage se lit comme un bogue.
    const etats = retenues(
      ETAT.cle,
      ETAT.valeurs.map((v) => v.cle),
    );

    return vue.pages.filter((page) => {
      if (etats.length > 0 && !etats.includes(etatDe(page))) return false;
      for (const filtre of vue.filtres) {
        if (!filtre.filtrable) continue;
        const voulues = retenues(
          filtre.cle,
          filtre.valeurs.map((v) => v.cle),
        );
        if (voulues.length === 0) continue;
        const portees = page.valeurs[filtre.cle] ?? [];
        if (!voulues.some((cle) => portees.includes(cle))) return false;
      }
      return true;
    });
  }, [vue.pages, vue.filtres, choisis]);
  const detail: PageAffichee | undefined = pages.find((p) => p.index === page) ?? pages[0];

  // Ce qui attend un arbitrage et ce qui attend seulement d'être lu ne se comptent pas ensemble.
  const informations = vue.douteux.filter((cas) => cas.nature === "information").length;
  const aTrancher = vue.douteux.length - informations;
  const compteurs = documents === undefined ? vue.compteurs : compteursDeBibliotheque(documents);

  const relies = (p: PageAffichee): number => p.elements.filter((e) => e.media !== undefined).length;
  const aVerifier = (p: PageAffichee): number => p.elements.filter((e) => e.aVerifier).length;

  return (
    <main id="contenu" className="ln-catalogue" tabIndex={-1}>
      <div className="ln-catalogue__entete ln-panneau-titre">
        <div className="ln-catalogue__identite">
          <FilAriane chemin={[{ libelle: "Accueil", href: "#" }, { libelle: vue.nom }]} />
          <h1 className="ln-catalogue__titre">{vue.nom}</h1>
          <p className="ln-catalogue__compteurs">
            {compteurs.map((compteur) => (
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
            {onDoublons === undefined ? null : (
              <button type="button" className="ln-lien-action ln-catalogue__doublons" onClick={onDoublons}>
                <Icone nom="recherche" />
                Chercher les doublons
              </button>
            )}
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

          {documents === undefined
            ? null
            : axesClassants.map((axe) => (
                <section key={`doc-${axe.cle}`} className="ln-filtres__axe" role="group" aria-labelledby={`filtre-doc-${axe.cle}`}>
                  <h3 id={`filtre-doc-${axe.cle}`} className="ln-filtres__nom">
                    {axe.nom}
                  </h3>
                  <ul className="ln-filtres__valeurs">
                    {axe.valeurs
                      .filter((valeur) => !valeur.retiree)
                      .map((valeur) => {
                        const clef = `doc:${axe.cle}/${valeur.cle}`;
                        const combien = (documents ?? []).filter((document) => {
                          const portees = classements?.get(document.empreinte)?.axes[axe.cle];
                          return portees?.type === "reference" && portees.valeurs.includes(valeur.cle);
                        }).length;
                        return (
                          <li key={clef}>
                            <label className={choisis.has(clef) ? "ln-filtres__valeur ln-filtres__valeur--choisi" : "ln-filtres__valeur"}>
                              <input type="checkbox" checked={choisis.has(clef)} onChange={() => basculer(clef)} />
                              <span className="ln-filtres__libelle">{valeur.nom}</span>
                              <span className="ln-filtres__nombre">{combien}</span>
                            </label>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              ))}
        </nav>

        {documents === undefined ? null : (
          <section className="ln-catalogue__documents" aria-labelledby="titre-documents">
            <h2 id="titre-documents" className="ln-filtres__nom">
              Documents
            </h2>
            {documentsRetenus.length === 0 ? (
              <p className="ln-muted">Aucun document ne porte ce classement.</p>
            ) : (
              <ul aria-labelledby="titre-documents" className="ln-catalogue__documents-liste">
                {documentsRetenus.map((document) => (
                  <li key={document.empreinte}>
                    <Bouton
                      variante={document.empreinte === empreinte ? "principal" : "secondaire"}
                      onClick={() => onDocument?.(document.empreinte)}
                    >
                      {document.nom}
                    </Bouton>
                    {classements?.get(document.empreinte) === undefined ? (
                      <span className="ln-muted"> · non rangé</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {schema === undefined || empreinte === undefined || onClasser === undefined ? null : (
          <section className="ln-catalogue__ranger" role="group" aria-labelledby="titre-ranger">
            <h2 id="titre-ranger" className="ln-filtres__nom">
              Ranger ce document
            </h2>
            {schema.axes
              .filter((axe) => axe.nature === "referentiel" || axe.nature === "liste_semi_ouverte")
              .map((axe) => {
                const portees = classement?.axes[axe.cle];
                const choisies = portees?.type === "reference" ? portees.valeurs : [];
                // Une valeur retirée redirige, elle ne s'offre plus au rangement (CLA-03) : on
                // garde ce qu'un document porte déjà, on ne propose plus de l'y mettre.
                const offertes = axe.valeurs.filter((valeur) => !valeur.retiree);

                if (axe.cardinalite === "une")
                  return (
                    <p key={axe.cle} className="ln-catalogue__ranger-axe">
                      <label>
                        <span className="ln-filtres__nom">{axe.nom}</span>
                        <select
                          className="ln-catalogue__ranger-choix"
                          value={choisies[0] ?? ""}
                          onChange={(evenement) => ranger(axe.cle, evenement.target.value === "" ? [] : [evenement.target.value])}
                        >
                          <option value="">Non rangé</option>
                          {offertes.map((valeur) => (
                            <option key={valeur.cle} value={valeur.cle}>
                              {valeur.nom}
                            </option>
                          ))}
                        </select>
                      </label>
                    </p>
                  );

                return (
                  <section key={axe.cle} className="ln-filtres__axe" role="group" aria-labelledby={`ranger-${axe.cle}`}>
                    <h3 id={`ranger-${axe.cle}`} className="ln-filtres__nom">
                      {axe.nom}
                    </h3>
                    <ul className="ln-filtres__valeurs">
                      {offertes.map((valeur) => (
                        <li key={valeur.cle}>
                          <label className="ln-filtres__valeur">
                            <input
                              type="checkbox"
                              checked={choisies.includes(valeur.cle)}
                              onChange={() =>
                                ranger(
                                  axe.cle,
                                  choisies.includes(valeur.cle)
                                    ? choisies.filter((cle) => cle !== valeur.cle)
                                    : [...choisies, valeur.cle],
                                )
                              }
                            />
                            <span className="ln-filtres__libelle">{valeur.nom}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
          </section>
        )}

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
                  className={p.index === detail?.index ? "ln-pages__carte ln-pages__carte--ouvert" : "ln-pages__carte"}
                  onClick={() => onPage(p.index)}
                  aria-current={p.index === detail?.index ? "true" : undefined}
                  aria-label={enTete(citerPage(vue.mots, p))}
                >
                  {/* La vignette de la page quand le lot en porte une (OUT-04) ; son numéro
                      sinon. Décorative dans les deux cas : le nom accessible est sur le bouton. */}
                  {imageAffichable(p.vignette) === undefined ? (
                    <span className="ln-pages__apercu" aria-hidden="true">
                      {p.numero}
                    </span>
                  ) : (
                    <img className="ln-pages__apercu" src={imageAffichable(p.vignette)} alt="" loading="lazy" decoding="async" />
                  )}
                  {/* Le nom et le titre dans **une seule cellule**, et non deux.
                      En liste, la carte déclare quatre colonnes ; elle portait quatre ou cinq
                      enfants selon qu'une page a un titre, si bien que la grille changeait de
                      forme d'une ligne à l'autre et que les deux libellés se chevauchaient.
                      Réunis, ils comptent pour un, et la carte a toujours le même nombre
                      d'enfants. */}
                  <span className="ln-pages__intitule">
                    <span className="ln-pages__nom">{enTete(citerPage(vue.mots, p))}</span>
                    {p.titre === undefined ? null : <span className="ln-pages__titre">{p.titre}</span>}
                  </span>
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
                {enTete(citerPage(vue.mots, detail))}
              </h2>
              {imageAffichable(detail.vignette) === undefined ? (
                <div className="ln-detail__apercu" role="img" aria-label={enTete(citerPage(vue.mots, detail))}>
                  <span>{detail.numero ?? detail.index}</span>
                  {detail.titre === undefined ? null : <span className="ln-detail__sous-titre">{detail.titre}</span>}
                </div>
              ) : (
                <img
                  className="ln-detail__apercu ln-detail__apercu--image"
                  src={imageAffichable(detail.vignette)}
                  alt={enTete(citerPage(vue.mots, detail))}
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
                onClick={() => onLecteur(detail.index, detail.elements[0]?.ancreId ?? "")}
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
