import { useId, useState, type JSX } from "react";
import type { Axe, CardinaliteAxe, DescriptionBibliotheque, SchemaBibliotheque } from "@lienotheque/contrats";
import {
  GesteRefuse,
  ajouterAxe,
  ajouterValeur,
  changerCardinalite,
  fusionnerValeurs,
  renommerAxe,
  renommerValeur,
  retirerAxe,
  retirerValeur,
} from "@lienotheque/noyau";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import "../styles/formulaire.css";
import "./Organisation.css";

/** Organisation d'une bibliothèque (maquette 2, CLA-01 à CLA-08, REC-03).
 *
 *  Les façons de ranger, leurs valeurs, et les quatre gestes qui les font vivre : renommer,
 *  ajouter, fusionner, retirer. L'écran n'en connaît aucun par cœur — ils viennent tous de
 *  `@lienotheque/noyau`, qui garantit qu'une clé ne change jamais et qu'une modification est une
 *  version. Un geste refusé se dit ; il ne s'éteint pas en silence.
 *
 *  Aucun mot de domaine : les noms d'axes et de valeurs sont des données de la bibliothèque. */

/** Combien de valeurs un élément porte, dit sans jargon (CLA-04). */
const CARDINALITES: readonly { readonly cle: CardinaliteAxe; readonly libelle: string }[] = [
  { cle: "une", libelle: "Une valeur" },
  { cle: "plusieurs", libelle: "Plusieurs" },
  { cle: "principale_et_secondaires", libelle: "Principale et secondaires" },
];

type Edition =
  | { readonly quoi: "nom-axe"; readonly axe: string }
  | { readonly quoi: "valeur"; readonly axe: string; readonly cle: string }
  | { readonly quoi: "ajout-valeur"; readonly axe: string }
  | { readonly quoi: "ajout-axe" };

type Props = {
  readonly description: DescriptionBibliotheque;
  /** Appelé à chaque version du schéma : l'hôte écrit, l'écran ne fait que demander (JOB-06). */
  readonly onSchema: (schema: SchemaBibliotheque) => void | Promise<void>;
  readonly onValider: () => void;
  /** Combien d'éléments sont rangés sur chaque façon de ranger, par clé d'axe.
   *
   *  Sans eux, rien ne se retire : on ne propose pas un geste dont on ne sait pas ce qu'il perd. */
  readonly classes?: Readonly<Record<string, number>> | undefined;
  /** Trois éléments de la bibliothèque, pour montrer ce que cela donnera. Absents au départ :
   *  une bibliothèque qu'on vient de créer n'a rien à montrer, et on ne l'invente pas. */
  readonly exemples?: readonly { readonly titre: string; readonly situation: string; readonly valeurs: readonly string[] }[] | undefined;
};

export function Organisation({ description, onSchema, onValider, classes, exemples }: Props): JSX.Element {
  const [schema, setSchema] = useState<SchemaBibliotheque>(description.schema);
  const [edition, setEdition] = useState<Edition | undefined>(undefined);
  const [saisie, setSaisie] = useState("");
  const [echec, setEchec] = useState<string | undefined>(undefined);
  const base = useId();

  /** Pose une version du schéma, ou dit pourquoi le geste a été refusé. */
  const appliquer = (geste: () => SchemaBibliotheque): void => {
    try {
      const suivant = geste();
      setSchema(suivant);
      setEdition(undefined);
      setSaisie("");
      setEchec(undefined);
      void onSchema(suivant);
    } catch (erreur) {
      setEchec(erreur instanceof GesteRefuse || erreur instanceof Error ? erreur.message : String(erreur));
    }
  };

  const ouvrir = (prochaine: Edition, valeurInitiale = ""): void => {
    setEdition(prochaine);
    setSaisie(valeurInitiale);
    setEchec(undefined);
  };

  const vivantes = (axe: Axe): readonly Axe["valeurs"][number][] => axe.valeurs.filter((valeur) => !valeur.retiree);

  return (
    <main id="contenu" className="ln-layout ln-organisation" tabIndex={-1}>
      <div className="ln-organisation__tete ln-panneau-titre">
        <FilAriane
          chemin={[{ libelle: "Accueil", href: "#" }, { libelle: description.nom }, { libelle: "Organisation" }]}
        />
        <div className="ln-organisation__dit">
          <h1 className="ln-organisation__titre">Organisation de {description.nom}</h1>
          <p className="ln-muted">
            {schema.axes.length} façon{schema.axes.length > 1 ? "s" : ""} de ranger vos{" "}
            {description.mots.element.plusieurs}. Chacune se modifie, se renomme ou se retire.
          </p>
        </div>
        <p className="ln-organisation__bandeau">
          <Icone nom="info" />
          Proposé d’après vos fichiers · modifiable à tout moment
        </p>
      </div>

      {echec === undefined ? null : (
        <p className="ln-organisation__echec" role="alert">
          <Icone nom="alerte" />
          {echec}
        </p>
      )}

      <div className="ln-axes">
        {schema.axes.map((axe) => (
          <section key={axe.cle} className="ln-axe" aria-labelledby={`${base}-${axe.cle}`}>
            <div className="ln-axe__tete">
              <Icone nom="etiquette" />
              {edition?.quoi === "nom-axe" && edition.axe === axe.cle ? (
                <form
                  className="ln-axe__renommage"
                  onSubmit={(evenement) => {
                    evenement.preventDefault();
                    appliquer(() => renommerAxe(schema, axe.cle, saisie));
                  }}
                >
                  <label className="ln-sr-only" htmlFor={`${base}-${axe.cle}-nom`}>
                    Nouveau nom de {axe.nom}
                  </label>
                  <input
                    id={`${base}-${axe.cle}-nom`}
                    className="ln-saisie"
                    value={saisie}
                    autoFocus
                    onChange={(evenement) => setSaisie(evenement.target.value)}
                  />
                  <Bouton type="submit" variante="principal" icone={<Icone nom="valide" />}>
                    Renommer
                  </Bouton>
                  <Bouton icone={<Icone nom="fermer" />} onClick={() => setEdition(undefined)}>
                    Renoncer
                  </Bouton>
                </form>
              ) : (
                <>
                  <strong id={`${base}-${axe.cle}`} className="ln-axe__nom">
                    {axe.nom}
                  </strong>
                  <button
                    type="button"
                    className="ln-axe__crayon"
                    onClick={() => ouvrir({ quoi: "nom-axe", axe: axe.cle }, axe.nom)}
                  >
                    <Icone nom="crayon" />
                    <span className="ln-sr-only">Renommer {axe.nom}</span>
                  </button>
                </>
              )}
            </div>

            <div>
              <p className="ln-section">Combien de valeurs par {description.mots.element.un}</p>
              <div className="ln-bascule" role="radiogroup" aria-label={`Valeurs par ${description.mots.element.un} sur ${axe.nom}`}>
                {CARDINALITES.map((cardinalite) => (
                  <button
                    key={cardinalite.cle}
                    type="button"
                    role="radio"
                    aria-checked={axe.cardinalite === cardinalite.cle}
                    className={`ln-bascule__choix${axe.cardinalite === cardinalite.cle ? " ln-bascule__choix--choisi" : ""}`}
                    onClick={() => appliquer(() => changerCardinalite(schema, axe.cle, cardinalite.cle))}
                  >
                    {cardinalite.libelle}
                  </button>
                ))}
              </div>
            </div>

            {axe.nature === "nombre" || axe.nature === "date" ? (
              <p className="ln-muted">Cette façon de ranger ne porte pas de liste&nbsp;: sa valeur se lit du document.</p>
            ) : (
              <div>
                <p className="ln-section">
                  {axe.valeurs.length === 0
                    ? "Étiquettes libres"
                    : `Valeurs · ${vivantes(axe).length}${axe.valeurs.length > vivantes(axe).length ? ` et ${axe.valeurs.length - vivantes(axe).length} retirée${axe.valeurs.length - vivantes(axe).length > 1 ? "s" : ""}` : ""}`}
                </p>
                <div className="ln-axe__valeurs">
                  {axe.valeurs.map((valeur) => (
                    <button
                      key={valeur.cle}
                      type="button"
                      className={`ln-etiquette${valeur.retiree ? " ln-etiquette--retiree" : ""}`}
                      aria-label={valeur.retiree ? `${valeur.nom} (retirée)` : valeur.nom}
                      aria-pressed={edition?.quoi === "valeur" && edition.axe === axe.cle && edition.cle === valeur.cle}
                      onClick={() =>
                        edition?.quoi === "valeur" && edition.axe === axe.cle && edition.cle === valeur.cle
                          ? setEdition(undefined)
                          : ouvrir({ quoi: "valeur", axe: axe.cle, cle: valeur.cle }, valeur.nom)
                      }
                    >
                      {valeur.nom}
                    </button>
                  ))}
                  {edition?.quoi === "ajout-valeur" && edition.axe === axe.cle ? (
                    <form
                      className="ln-axe__ajout"
                      onSubmit={(evenement) => {
                        evenement.preventDefault();
                        appliquer(() => ajouterValeur(schema, axe.cle, saisie));
                      }}
                    >
                      <label className="ln-sr-only" htmlFor={`${base}-${axe.cle}-ajout`}>
                        Nom de la valeur à ajouter sur {axe.nom}
                      </label>
                      <input
                        id={`${base}-${axe.cle}-ajout`}
                        className="ln-saisie"
                        value={saisie}
                        autoFocus
                        onChange={(evenement) => setSaisie(evenement.target.value)}
                      />
                      <Bouton type="submit" variante="principal" aria-label="Ajouter cette valeur" icone={<Icone nom="valide" />}>
                        Ajouter
                      </Bouton>
                      <Bouton icone={<Icone nom="fermer" />} onClick={() => setEdition(undefined)}>
                        Renoncer
                      </Bouton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="ln-etiquette ln-etiquette--action"
                      aria-label={`Ajouter une valeur sur ${axe.nom}`}
                      onClick={() => ouvrir({ quoi: "ajout-valeur", axe: axe.cle })}
                    >
                      <Icone nom="plus" />
                      Ajouter
                    </button>
                  )}
                </div>

                {edition?.quoi === "valeur" && edition.axe === axe.cle ? (
                  <ValeurOuverte
                    axe={axe}
                    cle={edition.cle}
                    base={base}
                    saisie={saisie}
                    onSaisie={setSaisie}
                    onRenommer={() => appliquer(() => renommerValeur(schema, axe.cle, edition.cle, saisie))}
                    onFusionner={(vers) => appliquer(() => fusionnerValeurs(schema, axe.cle, edition.cle, vers))}
                    onRetirer={(vers) => appliquer(() => retirerValeur(schema, axe.cle, edition.cle, vers))}
                    onFermer={() => setEdition(undefined)}
                  />
                ) : null}
              </div>
            )}

            {schema.axes.length > 1 ? (
              <p className="ln-axe__retrait">
                <button
                  type="button"
                  className="ln-lien-action ln-axe__retirer"
                  aria-label={`Retirer ${axe.nom}`}
                  onClick={() => appliquer(() => retirerAxe(schema, axe.cle, classes?.[axe.cle] ?? 0))}
                >
                  <Icone nom="corbeille" />
                  Retirer cette façon de ranger
                </button>
              </p>
            ) : null}
          </section>
        ))}

        {edition?.quoi === "ajout-axe" ? (
          <form
            className="ln-axe ln-axe--ajout"
            onSubmit={(evenement) => {
              evenement.preventDefault();
              appliquer(() => ajouterAxe(schema, saisie));
            }}
          >
            <label className="ln-champ" htmlFor={`${base}-axe-neuf`}>
              Nom de cette façon de ranger
              <input
                id={`${base}-axe-neuf`}
                className="ln-saisie"
                value={saisie}
                autoFocus
                onChange={(evenement) => setSaisie(evenement.target.value)}
              />
            </label>
            <p className="ln-muted">Elle partira d’étiquettes libres&nbsp;: vous l’emplirez en chemin faisant.</p>
            <div className="ln-organisation__actions">
              <Bouton icone={<Icone nom="fermer" />} onClick={() => setEdition(undefined)}>
                Renoncer
              </Bouton>
              <Bouton type="submit" variante="principal" aria-label="Ajouter cette façon de ranger" icone={<Icone nom="plus" />}>
                Ajouter
              </Bouton>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="ln-axe ln-axe--ajout"
            aria-label="Ajouter une façon de ranger"
            onClick={() => ouvrir({ quoi: "ajout-axe" })}
          >
            <Icone nom="plus" />
            <span className="ln-axe__nom">Ajouter une façon de ranger</span>
            <span className="ln-muted">— par exemple une date, un auteur ou un lieu</span>
          </button>
        )}
      </div>

      {exemples === undefined || exemples.length === 0 ? null : (
        <div>
          <p className="ln-section ln-sur-photo">
            Ce que cela donnera · {exemples.length} {description.mots.element.plusieurs} de votre bibliothèque
          </p>
          <div className="ln-organisation__exemples">
            {exemples.map((exemple) => (
              <div key={exemple.titre} className="ln-panneau ln-organisation__exemple">
                <Icone nom="livre" />
                <div>
                  <p className="ln-organisation__exemple-nom">{exemple.titre}</p>
                  <p className="ln-muted">{exemple.situation}</p>
                  <div className="ln-axe__valeurs">
                    {exemple.valeurs.map((valeur) => (
                      <span key={valeur} className="ln-etiquette">
                        {valeur}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ln-organisation__pied ln-panneau-titre">
        <p className="ln-muted">
          Vos originaux ne sont jamais modifiés. L’organisation se change à tout moment, même après
          l’import. Retirer une façon de ranger est le seul geste qui perd quelque chose&nbsp;: il
          se refuse tant que des {description.mots.element.plusieurs} y sont rangés.
        </p>
        <div className="ln-organisation__actions">
          <button
            type="button"
            className="ln-lien-action"
            disabled={schema.version === description.schema.version}
            onClick={() => {
              setSchema(description.schema);
              setEdition(undefined);
              setEchec(undefined);
              void onSchema(description.schema);
            }}
          >
            Revenir aux propositions
          </button>
          <Bouton variante="principal" icone={<Icone nom="valide" />} onClick={onValider}>
            Valider l’organisation
          </Bouton>
        </div>
      </div>
    </main>
  );
}

/** Une valeur ouverte : la renommer, la fusionner vers une autre, ou la retirer vers une autre.
 *
 *  Fusionner et retirer demandent tous deux vers quoi : sans remplaçante, un élément classé là
 *  deviendrait introuvable (CLA-03, CLA-08). */
function ValeurOuverte({
  axe,
  cle,
  base,
  saisie,
  onSaisie,
  onRenommer,
  onFusionner,
  onRetirer,
  onFermer,
}: {
  readonly axe: Axe;
  readonly cle: string;
  readonly base: string;
  readonly saisie: string;
  readonly onSaisie: (valeur: string) => void;
  readonly onRenommer: () => void;
  readonly onFusionner: (vers: string) => void;
  readonly onRetirer: (vers: string) => void;
  readonly onFermer: () => void;
}): JSX.Element {
  const valeur = axe.valeurs.find((candidate) => candidate.cle === cle);
  const [vers, setVers] = useState("");
  const autres = axe.valeurs.filter((candidate) => !candidate.retiree && candidate.cle !== cle);

  return (
    <div className="ln-valeur-ouverte" aria-label={`Modifier ${valeur?.nom ?? ""}`}>
      <form
        className="ln-valeur-ouverte__ligne"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          onRenommer();
        }}
      >
        <label className="ln-champ ln-champ--serre" htmlFor={`${base}-${cle}-renommer`}>
          Son nom
          <input
            id={`${base}-${cle}-renommer`}
            className="ln-saisie"
            value={saisie}
            autoFocus
            onChange={(evenement) => onSaisie(evenement.target.value)}
          />
        </label>
        <Bouton type="submit" icone={<Icone nom="crayon" />}>
          Renommer
        </Bouton>
      </form>

      {autres.length === 0 ? (
        <p className="ln-muted">
          C’est la seule valeur vivante&nbsp;: ajoutez-en une autre avant de fusionner ou de retirer
          celle-ci.
        </p>
      ) : (
        <div className="ln-valeur-ouverte__ligne">
          <label className="ln-champ ln-champ--serre" htmlFor={`${base}-${cle}-vers`}>
            Vers quelle valeur
            <select
              id={`${base}-${cle}-vers`}
              className="ln-saisie"
              value={vers}
              onChange={(evenement) => setVers(evenement.target.value)}
            >
              <option value="">Choisissez…</option>
              {autres.map((autre) => (
                <option key={autre.cle} value={autre.cle}>
                  {autre.nom}
                </option>
              ))}
            </select>
          </label>
          <Bouton icone={<Icone nom="fusion" />} disabled={vers === ""} onClick={() => onFusionner(vers)}>
            Fusionner
          </Bouton>
          <Bouton
            variante="danger"
            icone={<Icone nom="corbeille" />}
            disabled={vers === "" || valeur?.retiree === true}
            onClick={() => onRetirer(vers)}
          >
            Retirer
          </Bouton>
        </div>
      )}

      <p className="ln-muted">
        Fusionner joint deux noms qui désignaient la même chose. Retirer garde celui-ci, barré, et
        le fait mener à l’autre. Dans les deux cas, rien de ce qui était rangé ne se perd.
      </p>
      <Bouton icone={<Icone nom="fermer" />} onClick={onFermer}>
        Fermer
      </Bouton>
    </div>
  );
}
