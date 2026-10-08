import { useId, useState, type JSX } from "react";
import type { DescriptionBibliotheque, ModeleBibliotheque, TypeDeContenu } from "@lienotheque/contrats";
import {
  DEBUT,
  INTITULE,
  TEMPS,
  assembler,
  cleLibre,
  manque,
  precedent,
  suivant,
  type Reponses,
  type Temps,
} from "@lienotheque/noyau";
import { Bouton, FilAriane, Icone, type NomIcone } from "../composants/index.js";
import "../styles/formulaire.css";
import "./Creer.css";

/** Créer une bibliothèque, en quatre temps (maquette 1, PLT-02, CLA-01, CLA-09).
 *
 *  L'écran ne décide de rien : ce qui manque, ce qu'on peut faire ensuite et la description finale
 *  viennent de `@lienotheque/noyau`. Ici, des boutons, un aperçu qui suit la frappe, et un pied
 *  qui dit toujours que rien n'est encore créé.
 *
 *  Aucun mot de domaine : les types de contenu sont ceux du contrat, les façons de ranger viennent
 *  des modèles reçus en données, et le vocabulaire est celui que l'administrateur écrit. */

type Props = {
  readonly modeles: readonly ModeleBibliotheque[];
  /** Les clés déjà prises, pour que deux bibliothèques du même nom coexistent. */
  readonly prises: readonly string[];
  readonly onCreer: (description: DescriptionBibliotheque, dossier: string) => void | Promise<void>;
  readonly onAnnuler: () => void;
  /** Ouvre le sélecteur de dossier du système. Absent sur le web : on saisit alors le chemin. */
  readonly onChoisirDossier?: (() => Promise<string | undefined>) | undefined;
};

/** Ce que chaque type de contenu annonce, et l'icône qui l'accompagne.
 *
 *  Un type de contenu, pas un type d'élément : « audio » dit qu'il y aura des enregistrements,
 *  pas ce qu'ils représentent. Ce qu'ils sont vient du schéma (CLA-01). */
const CONTENUS: readonly {
  readonly cle: TypeDeContenu;
  readonly nom: string;
  readonly exemples: string;
  readonly icone: NomIcone;
}[] = [
  { cle: "documents", nom: "Documents et livres", exemples: "PDF, numérisations, textes", icone: "livre" },
  { cle: "audio", nom: "Audio", exemples: "disques, prises de son, dictées", icone: "audio" },
  { cle: "videos", nom: "Vidéos", exemples: "séances filmées, captations", icone: "video" },
  { cle: "images", nom: "Images", exemples: "planches, photographies, plans", icone: "image" },
];

/** Les trois mots d'une bibliothèque, désignés par ce qu'on en fait plutôt que par leur nom.
 *
 *  « Comment appelez-vous une page ? » serait une devinette. On demande ce qu'on lit, ce qu'on
 *  écoute, ce qu'on repère : la réponse est le mot. */
const MOTS: readonly { readonly role: keyof Reponses["mots"]; readonly question: string; readonly aide: string }[] = [
  { role: "element", question: "Ce que vous repérez", aide: "Ce qu'on retrouve et ce qu'on relie." },
  { role: "piste", question: "Ce que vous écoutez ou regardez", aide: "Ce qui porte un minutage." },
  { role: "page", question: "Ce que vous lisez", aide: "Ce qui porte un numéro." },
];

export function Creer({ modeles, prises, onCreer, onAnnuler, onChoisirDossier }: Props): JSX.Element {
  const [temps, setTemps] = useState<Temps>("nom");
  const [reponses, setReponses] = useState<Reponses>(DEBUT);
  const [occupe, setOccupe] = useState(false);
  const [echec, setEchec] = useState<string | undefined>(undefined);
  const base = useId();

  const rang = TEMPS.indexOf(temps) + 1;
  const raison = manque(temps, reponses);
  const avant = precedent(temps);
  const apres = suivant(temps);
  const changer = (parties: Partial<Reponses>): void => setReponses((anciennes) => ({ ...anciennes, ...parties }));

  const creer = async (): Promise<void> => {
    setOccupe(true);
    setEchec(undefined);
    try {
      await onCreer(assembler(reponses, modeles, prises), reponses.dossier.trim());
    } catch (erreur) {
      setEchec(erreur instanceof Error ? erreur.message : String(erreur));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <main id="contenu" className="ln-layout ln-creer" tabIndex={-1}>
      <div className="ln-creer__tete">
        <FilAriane chemin={[{ libelle: "Accueil", href: "#" }, { libelle: "Nouvelle bibliothèque" }]} />
        <button type="button" className="ln-creer__annuler" onClick={onAnnuler}>
          Annuler
        </button>
      </div>

      <div className="ln-creer__barre">
        <ol className="ln-etapes" aria-label="Avancement de la création">
          {TEMPS.map((etape, index) => {
            const etat = index + 1 < rang ? "faite" : etape === temps ? "courante" : "a-venir";
            return (
              <li key={etape} className={`ln-etape ln-etape--${etat}`} aria-current={etape === temps ? "step" : undefined}>
                <span className="ln-etape__rond" aria-hidden="true">
                  {etat === "faite" ? <Icone nom="valide" /> : index + 1}
                </span>
                {INTITULE[etape]}
              </li>
            );
          })}
        </ol>
        <p className="ln-muted ln-creer__rang">
          Étape {rang} sur {TEMPS.length}
        </p>
      </div>

      <div className="ln-creer__colonnes">
        <section className="ln-creer__question" aria-labelledby={`${base}-titre`}>
          {temps === "nom" ? (
            <>
              <h1 id={`${base}-titre`}>Comment s’appellera cette bibliothèque&nbsp;?</h1>
              <p className="ln-muted">Vous pourrez la renommer plus tard&nbsp;: son adresse ne changera pas.</p>
              <label className="ln-champ" htmlFor={`${base}-nom`}>
                Nom
                <input
                  id={`${base}-nom`}
                  className="ln-saisie"
                  value={reponses.nom}
                  autoFocus
                  onChange={(evenement) => changer({ nom: evenement.target.value })}
                />
              </label>
              <label className="ln-champ" htmlFor={`${base}-description`}>
                En un mot, ce qu’elle réunit <span className="ln-muted">— facultatif</span>
                <textarea
                  id={`${base}-description`}
                  className="ln-saisie ln-saisie--texte"
                  rows={3}
                  value={reponses.description ?? ""}
                  onChange={(evenement) => changer({ description: evenement.target.value })}
                />
              </label>
            </>
          ) : null}

          {temps === "contenu" ? (
            <>
              <h1 id={`${base}-titre`}>Que contiendra cette bibliothèque&nbsp;?</h1>
              <p className="ln-muted">Vous pourrez ajouter d’autres types plus tard, sans rien refaire.</p>
              <div className="ln-tuiles" role="group" aria-label="Types de contenu">
                {CONTENUS.map((contenu) => {
                  const choisi = reponses.contenus.includes(contenu.cle);
                  return (
                    <button
                      key={contenu.cle}
                      type="button"
                      className={`ln-tuile${choisi ? " ln-tuile--choisie" : ""}`}
                      aria-pressed={choisi}
                      onClick={() =>
                        changer({
                          contenus: choisi
                            ? reponses.contenus.filter((autre) => autre !== contenu.cle)
                            : [...reponses.contenus, contenu.cle],
                        })
                      }
                    >
                      {choisi ? (
                        <span className="ln-tuile__marque" aria-hidden="true">
                          <Icone nom="valide" />
                        </span>
                      ) : null}
                      <Icone nom={contenu.icone} />
                      <span className="ln-tuile__corps">
                        <span className="ln-tuile__nom">{contenu.nom}</span>
                        <span className="ln-muted">{contenu.exemples}</span>
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`ln-tuile ln-tuile--large${reponses.contenus.length === CONTENUS.length ? " ln-tuile--choisie" : ""}`}
                  aria-pressed={reponses.contenus.length === CONTENUS.length}
                  onClick={() =>
                    changer({
                      contenus:
                        reponses.contenus.length === CONTENUS.length ? [] : CONTENUS.map((contenu) => contenu.cle),
                    })
                  }
                >
                  {reponses.contenus.length === CONTENUS.length ? (
                    <span className="ln-tuile__marque" aria-hidden="true">
                      <Icone nom="valide" />
                    </span>
                  ) : null}
                  <Icone nom="grille" />
                  <span className="ln-tuile__corps">
                    <span className="ln-tuile__nom">Un mélange</span>
                    <span className="ln-muted">
                      Plusieurs types dans une même bibliothèque, reliés entre eux
                    </span>
                  </span>
                </button>
              </div>
              <p className="ln-creer__note">
                <Icone nom="info" />
                Liénothèque vous proposera une organisation adaptée.
              </p>
            </>
          ) : null}

          {temps === "rangement" ? (
            <>
              <h1 id={`${base}-titre`}>Comment rangerez-vous ce qu’elle contient&nbsp;?</h1>
              <p className="ln-muted">
                Choisissez un point de départ&nbsp;: tout se modifie ensuite, et rien ne se perd.
              </p>
              <div className="ln-rangements" role="radiogroup" aria-label="Façon de ranger">
                {modeles.map((modele) => {
                  const choisi = reponses.rangement?.type === "modele" && reponses.rangement.cle === modele.cle;
                  return (
                    <button
                      key={modele.cle}
                      type="button"
                      role="radio"
                      aria-checked={choisi}
                      className={`ln-rangement${choisi ? " ln-rangement--choisi" : ""}`}
                      onClick={() => changer({ rangement: { type: "modele", cle: modele.cle } })}
                    >
                      <Icone nom="etiquette" />
                      <span className="ln-rangement__corps">
                        <span className="ln-tuile__nom">{modele.nom}</span>
                        <span className="ln-muted">
                          {modele.axes.length} façon{modele.axes.length > 1 ? "s" : ""} de ranger&nbsp;·{" "}
                          {modele.axes.map((axe) => axe.nom).join(", ")}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <div className={`ln-rangement${reponses.rangement?.type === "libre" ? " ln-rangement--choisi" : ""}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={reponses.rangement?.type === "libre"}
                    className="ln-rangement__choix"
                    onClick={() =>
                      changer({
                        rangement: {
                          type: "libre",
                          nom: reponses.rangement?.type === "libre" ? reponses.rangement.nom : "",
                        },
                      })
                    }
                  >
                    <Icone nom="plus" />
                    <span className="ln-rangement__corps">
                      <span className="ln-tuile__nom">La mienne</span>
                      <span className="ln-muted">Une seule façon de ranger, à étiquettes libres</span>
                    </span>
                  </button>
                  {reponses.rangement?.type === "libre" ? (
                    <label className="ln-champ" htmlFor={`${base}-libre`}>
                      Son nom
                      <input
                        id={`${base}-libre`}
                        className="ln-saisie"
                        value={reponses.rangement.nom}
                        autoFocus
                        onChange={(evenement) => changer({ rangement: { type: "libre", nom: evenement.target.value } })}
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              <p className="ln-section">Les mots de cette bibliothèque</p>
              <p className="ln-muted">
                Ils remplaceront les nôtres dans tous les écrans. Au singulier et au pluriel&nbsp;:
                «&nbsp;1 éléments&nbsp;» n’a pas été écrit pour des gens.
              </p>
              <div className="ln-mots">
                {MOTS.map((mot) => (
                  <div key={mot.role} className="ln-mots__ligne">
                    <span className="ln-mots__question">
                      {mot.question}
                      <span className="ln-muted">{mot.aide}</span>
                    </span>
                    <label className="ln-champ ln-champ--serre" htmlFor={`${base}-${mot.role}-un`}>
                      <span className="ln-muted">Un</span>
                      <input
                        id={`${base}-${mot.role}-un`}
                        className="ln-saisie"
                        value={reponses.mots[mot.role].un}
                        onChange={(evenement) =>
                          changer({
                            mots: {
                              ...reponses.mots,
                              [mot.role]: { ...reponses.mots[mot.role], un: evenement.target.value },
                            },
                          })
                        }
                      />
                    </label>
                    <label className="ln-champ ln-champ--serre" htmlFor={`${base}-${mot.role}-plusieurs`}>
                      <span className="ln-muted">Plusieurs</span>
                      <input
                        id={`${base}-${mot.role}-plusieurs`}
                        className="ln-saisie"
                        value={reponses.mots[mot.role].plusieurs}
                        onChange={(evenement) =>
                          changer({
                            mots: {
                              ...reponses.mots,
                              [mot.role]: { ...reponses.mots[mot.role], plusieurs: evenement.target.value },
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {temps === "acces" ? (
            <>
              <h1 id={`${base}-titre`}>Où vivra cette bibliothèque&nbsp;?</h1>
              <p className="ln-muted">
                Un dossier à vous, qui se déplace et se sauvegarde comme n’importe quel autre. Vos
                originaux y sont copiés, jamais modifiés.
              </p>
              <div className="ln-creer__dossier">
                <label className="ln-champ" htmlFor={`${base}-dossier`}>
                  Dossier
                  <input
                    id={`${base}-dossier`}
                    className="ln-saisie"
                    value={reponses.dossier}
                    onChange={(evenement) => changer({ dossier: evenement.target.value })}
                  />
                </label>
                {onChoisirDossier === undefined ? null : (
                  <Bouton
                    icone={<Icone nom="dossier" />}
                    onClick={() =>
                      void onChoisirDossier().then((choisi) => {
                        if (choisi !== undefined) changer({ dossier: choisi });
                      })
                    }
                  >
                    Choisir un dossier
                  </Bouton>
                )}
              </div>
              {echec === undefined ? null : (
                <p className="ln-creer__echec" role="alert">
                  <Icone nom="alerte" />
                  {echec}
                </p>
              )}
            </>
          ) : null}
        </section>

        <aside className="ln-creer__apercu" aria-label="Aperçu">
          <p className="ln-section">Aperçu</p>
          <div className="ln-panneau ln-creer__carte">
            <div className="ln-creer__dos" aria-hidden="true">
              <Icone nom={CONTENUS.find((contenu) => reponses.contenus.includes(contenu.cle))?.icone ?? "livre"} />
            </div>
            <div>
              <h2 className="ln-creer__nom">{reponses.nom.trim() === "" ? "Sans nom pour l’instant" : reponses.nom}</h2>
              <p className="ln-muted">
                {reponses.nom.trim() === ""
                  ? "Son adresse apparaîtra ici."
                  : `Adresse : ${cleLibre(reponses.nom, prises) ?? "—"}`}
              </p>
            </div>
            {reponses.description === undefined || reponses.description.trim() === "" ? null : (
              <p className="ln-creer__resume">{reponses.description}</p>
            )}
            <div>
              {CONTENUS.map((contenu) => (
                <div key={contenu.cle} className="ln-creer__ligne">
                  <span>{contenu.nom}</span>
                  <span className="ln-muted">{reponses.contenus.includes(contenu.cle) ? "attendu" : "—"}</span>
                </div>
              ))}
            </div>
            <div className="ln-creer__ligne">
              <span>Rangement</span>
              <span className="ln-muted">
                {nomDuRangement(reponses.rangement, modeles)}
              </span>
            </div>
            <div className="ln-creer__ligne">
              <span>Dossier</span>
              <span className="ln-muted ln-creer__chemin">
                {reponses.dossier.trim() === "" ? "—" : reponses.dossier}
              </span>
            </div>
            <p className="ln-muted">
              {reponses.mots.page.plusieurs} et {reponses.mots.piste.plusieurs} seront reliées&nbsp;: un{" "}
              {reponses.mots.element.un} mènera au bon moment de sa {reponses.mots.piste.un}.
            </p>
          </div>
        </aside>
      </div>

      <div className="ln-creer__pied">
        <p className="ln-muted">
          {raison ?? "Rien n’est encore créé. Vous pourrez revenir en arrière à chaque étape."}
        </p>
        <div className="ln-creer__actions">
          <Bouton
            icone={<Icone nom="chevronGauche" />}
            disabled={avant === undefined}
            onClick={() => {
              if (avant !== undefined) setTemps(avant);
            }}
          >
            Retour
          </Bouton>
          {apres === undefined ? (
            <Bouton
              variante="principal"
              icone={<Icone nom="valide" />}
              chargement={occupe}
              disabled={raison !== undefined}
              onClick={() => void creer()}
            >
              Créer la bibliothèque
            </Bouton>
          ) : (
            <Bouton variante="principal" disabled={raison !== undefined} onClick={() => setTemps(apres)}>
              Continuer
              <Icone nom="chevronDroite" />
            </Bouton>
          )}
        </div>
      </div>
    </main>
  );
}

/** Le rangement tel que l'aperçu le nomme, avant qu'il n'existe. */
function nomDuRangement(rangement: Reponses["rangement"], modeles: readonly ModeleBibliotheque[]): string {
  if (rangement === undefined) return "—";
  if (rangement.type === "libre") return rangement.nom.trim() === "" ? "la vôtre" : rangement.nom;
  return modeles.find((modele) => modele.cle === rangement.cle)?.nom ?? "—";
}
