import { useMemo, useState, type JSX } from "react";
import { accorder, nommer, type VueBibliotheque } from "@lienotheque/contrats";
import { BadgeEtat, Bouton, ChampRecherche, FilAriane, Icone } from "../composants/index.js";
import { axesDe, basculer, correspond, retenu, type Choix } from "./catalogue/filtres.js";
import "./Catalogue.css";

/** Catalogue : tous les éléments d'une bibliothèque, filtrés par les axes de son schéma
 *  (B3, CLA-10).
 *
 *  Correction 1 : le panneau des filtres porte son fond et sa couleur de texte ensemble. En
 *  hybride, un panneau qui prenait le fond ivoire des cartes et le texte ivoire de la barre
 *  sombre devenait illisible — ivoire sur ivoire. Les deux ne se déclarent plus séparément.
 *
 *  Correction 7 : les valeurs d'un axe sont serrées, comme dans la maquette, et le groupe
 *  « Validé / À vérifier » est toujours présent. */

type Props = {
  readonly vue: VueBibliotheque;
  readonly onOuvrir: (page: number, ancreId: string) => void;
  readonly onVerifier: () => void;
};

export function Catalogue({ vue, onOuvrir, onVerifier }: Props): JSX.Element {
  const [choix, setChoix] = useState<Choix>({});
  const [texte, setTexte] = useState("");
  const [disposition, setDisposition] = useState<"grille" | "liste">("grille");

  const axes = useMemo(() => axesDe(vue), [vue]);
  const tous = useMemo(() => vue.pages.flatMap((page) => page.elements), [vue.pages]);
  const montres = useMemo(
    () => tous.filter((element) => retenu(element, choix) && correspond(element, texte)),
    [tous, choix, texte],
  );

  return (
    <main className="ln-catalogue ln-layout" id="contenu">
      <div className="ln-catalogue__barre ln-panneau-titre">
        <FilAriane chemin={[{ libelle: "Accueil", href: "#accueil" }, { libelle: vue.nom }]} />
        <h1 className="ln-catalogue__titre">{vue.nom}</h1>
        <p className="ln-catalogue__compteurs ln-muted">
          {vue.compteurs.map(({ nombre, mot }) => `${nombre} ${mot}`).join(" · ")}
        </p>
      </div>

      <div className="ln-catalogue__corps">
        {/* Correction 1 : `.ln-panneau` pose le fond et la couleur du texte dans la même règle. */}
        <form className="ln-filtres ln-panneau" aria-label="Filtres">
          <h2 className="ln-filtres__titre">Filtres</h2>

          {axes.map((axe) => (
            <fieldset key={axe.cle} className="ln-filtres__axe">
              <legend className="ln-filtres__nom">{axe.nom}</legend>
              <div className="ln-filtres__valeurs">
                {axe.valeurs.map((valeur) => {
                  const coche = (choix[axe.cle] ?? []).includes(valeur.cle);
                  return (
                    <label key={valeur.cle} className={coche ? "ln-filtre ln-filtre--retenu" : "ln-filtre"}>
                      <input
                        type="checkbox"
                        className="ln-sr-only"
                        checked={coche}
                        onChange={() => setChoix(basculer(choix, axe.cle, valeur.cle))}
                      />
                      <span className="ln-filtre__nom">{valeur.nom}</span>
                      <span className="ln-filtre__nombre">{valeur.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {Object.values(choix).every((valeurs) => valeurs.length === 0) ? null : (
            <button type="button" className="ln-lien-action" onClick={() => setChoix({})}>
              Tout afficher
            </button>
          )}
        </form>

        <section className="ln-catalogue__resultats" aria-label={vue.mots.element.plusieurs}>
          <div className="ln-catalogue__outils">
            <ChampRecherche
              etiquette={`Chercher dans ${vue.nom}`}
              placeholder={`Numéro ou titre de ${vue.mots.element.un}`}
              onRecherche={setTexte}
            />

            <div className="ln-bascule" role="group" aria-label="Disposition">
              {(["grille", "liste"] as const).map((lequel) => (
                <button
                  key={lequel}
                  type="button"
                  className={disposition === lequel ? "ln-bascule__choix ln-bascule__choix--choisi" : "ln-bascule__choix"}
                  onClick={() => setDisposition(lequel)}
                  aria-pressed={disposition === lequel}
                >
                  <Icone nom={lequel === "grille" ? "grille" : "liste"} />
                  <span>{lequel === "grille" ? "Grille" : "Liste"}</span>
                </button>
              ))}
            </div>

            {vue.aVerifier === 0 ? null : (
              <Bouton variante="principal" icone={<Icone nom="alerte" />} onClick={onVerifier}>
                {`Vérifier ${vue.aVerifier} ${vue.aVerifier <= 1 ? "cas" : "cas"}`}
              </Bouton>
            )}
          </div>

          <p className="ln-catalogue__nombre ln-muted" role="status">
            {accorder(montres.length, vue.mots.element)}
          </p>

          <ul className={`ln-grille ln-grille--${disposition}`}>
            {montres.map((element) => (
              <li key={element.ancreId}>
                <button type="button" className="ln-carte-element" onClick={() => onOuvrir(element.page, element.ancreId)}>
                  <span className="ln-carte-element__numero">{nommer(vue.mots.element, element.numero)}</span>
                  {element.titre === undefined ? null : <span className="ln-carte-element__titre">{element.titre}</span>}
                  <span className="ln-carte-element__situation ln-muted">
                    {nommer(vue.mots.page, element.page)}
                    {element.media === undefined ? "" : ` · ${nommer(vue.mots.piste, element.media.piste)}`}
                  </span>
                  <span className="ln-carte-element__etat">
                    {element.aVerifier ? (
                      <BadgeEtat ton="avertissement" icone="alerte">
                        À vérifier
                      </BadgeEtat>
                    ) : (
                      <BadgeEtat icone="valide">Validé</BadgeEtat>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {montres.length === 0 ? <p className="ln-catalogue__vide ln-muted">Aucun résultat avec ces filtres.</p> : null}
        </section>
      </div>
    </main>
  );
}
