import type { JSX } from "react";
import type { DescriptionBibliotheque, MotsBibliotheque, Travail, TypeDeContenu } from "@lienotheque/contrats";
import { Bouton, FilAriane, Icone, Progression, ZoneDepot, type NomIcone } from "../composants/index.js";
import "../styles/formulaire.css";
import "./Depot.css";

/** Dépôt et traitement (maquette 3, JOB-01 à JOB-09, UX-03).
 *
 *  La file telle qu'elle est, et rien de plus. Chaque ligne dit de quoi elle s'occupe, où elle en
 *  est, et ce qu'on peut en faire. Ce qui a mal tourné se dit, avec de quoi aller voir.
 *
 *  Pas de « temps restant » : on ne sait pas à quelle vitesse la suite ira, et un chiffre qu'on
 *  invente est pire qu'un chiffre absent. On montre ce qu'on sait — tant de pages sur tant. */

/** L'icône qui va avec ce qu'un fichier apporte. */
const ICONES: Readonly<Record<TypeDeContenu, NomIcone>> = {
  documents: "livre",
  audio: "audio",
  videos: "video",
  images: "image",
};

/** Où en est un travail, dit avec les mots de la bibliothèque et sans jargon.
 *
 *  L'unité comptée vient du point de reprise, donc la phrase suit ce que le moteur lit vraiment :
 *  « Lecture des pages » quand il lit des pages, « Lecture des pistes » quand il lit des pistes. */
export function ouEnEst(travail: Travail, mots: MotsBibliotheque): { readonly phrase: string; readonly icone: NomIcone } {
  const unite = travail.pointReprise?.unite;
  const lu = unite === "piste" ? mots.piste.plusieurs : unite === "image" ? "images" : mots.page.plusieurs;
  switch (travail.etat) {
    case "en_file":
      return { phrase: "En attente", icone: "horloge" };
    case "verrouille":
    case "en_cours":
      return { phrase: `Lecture des ${lu}`, icone: "document" };
    case "en_pause":
      return { phrase: "En pause", icone: "pause" };
    case "termine":
      return { phrase: "Prêt", icone: "valide" };
    case "partiel":
      return { phrase: "Partiellement lu", icone: "alerte" };
    case "en_echec_recuperable":
      return { phrase: "Interrompu — à reprendre", icone: "alerte" };
    case "en_echec_definitif":
      return { phrase: "Arrêté", icone: "alerte" };
    case "annule":
      return { phrase: "Annulé", icone: "fermer" };
  }
}

/** Combien de pages sur combien, quand on le sait. Le total s'apprend en ouvrant le fichier. */
function compte(travail: Travail): string | undefined {
  const total = travail.sujet?.total;
  if (total === undefined) return undefined;
  return `${travail.pointReprise?.valeur ?? 0} / ${total}`;
}

export type ActionTravail = "pause" | "reprendre" | "annuler";

type Props = {
  readonly description: DescriptionBibliotheque;
  readonly travaux: readonly Travail[];
  /** Ce qui est déposé mais ne se lit pas seul : les enregistrements et les images attendent le
   *  document qui les nommera. */
  readonly accompagnements?: readonly { readonly nom: string; readonly contenu: TypeDeContenu }[] | undefined;
  /** Les fichiers que le dernier dépôt a refusés, et pourquoi. */
  readonly refuses?: readonly { readonly nom: string; readonly raison: string }[] | undefined;
  /** Ouvre le sélecteur de fichiers du système. Absent sur le web, qui n'en a pas. */
  readonly onParcourir?: (() => void) | undefined;
  readonly onFichiers: (fichiers: readonly File[]) => void;
  readonly onAction: (id: string, action: ActionTravail) => void;
  readonly onVerifier: () => void;
};

export function Depot({
  description,
  travaux,
  accompagnements,
  refuses,
  onParcourir,
  onFichiers,
  onAction,
  onVerifier,
}: Props): JSX.Element {
  const enCours = travaux.filter((travail) => travail.etat === "en_cours" || travail.etat === "verrouille").length;
  const aVerifier = travaux.filter((travail) => travail.erreur !== undefined).length;

  return (
    <main id="contenu" className="ln-layout ln-traitement" tabIndex={-1}>
      <div className="ln-traitement__tete ln-panneau-titre">
        <FilAriane
          chemin={[
            { libelle: "Accueil", href: "#" },
            { libelle: description.nom },
            { libelle: "Ajouter des fichiers" },
          ]}
        />
        <p className="ln-traitement__compteur">
          <Icone nom="horloge" />
          {enCours} en cours
          {aVerifier === 0 ? null : ` · ${aVerifier} à vérifier`}
        </p>
      </div>

      <ZoneDepot
        titre="Déposez vos fichiers ici"
        aide="Documents, audio, vidéos et images — ensemble ou séparément"
        libelleBouton="Parcourir mes fichiers"
        onFichiers={onFichiers}
        {...(onParcourir === undefined ? {} : { onParcourir })}
      />

      {refuses === undefined || refuses.length === 0 ? null : (
        <ul className="ln-traitement__refuses" aria-label="Fichiers refusés">
          {refuses.map((refuse) => (
            <li key={refuse.nom}>
              <Icone nom="alerte" />
              <strong>{refuse.nom}</strong> — {refuse.raison}
            </li>
          ))}
        </ul>
      )}

      <div className="ln-traitement__barre ln-panneau-titre">
        <p className="ln-section">
          En traitement · {travaux.length} fichier{travaux.length > 1 ? "s" : ""}
        </p>
        <p className="ln-muted">Vous pouvez fermer cette fenêtre&nbsp;: le traitement continue.</p>
      </div>

      {travaux.length === 0 ? (
        <p className="ln-traitement__vide ln-panneau-titre">
          Rien en traitement pour l’instant. Déposez des fichiers&nbsp;: ils partiront d’eux-mêmes.
        </p>
      ) : (
        <ul className="ln-file" aria-label="Fichiers en traitement">
          {travaux.map((travail) => {
            const etat = ouEnEst(travail, description.mots);
            const sur = compte(travail);
            const enPanne = travail.erreur !== undefined;
            return (
              <li key={travail.id} className={`ln-ligne${enPanne ? " ln-ligne--alerte" : ""}`}>
                <Icone nom={enPanne ? "alerte" : ICONES[travail.sujet?.contenu ?? "documents"]} />

                <div className="ln-ligne__quoi">
                  <p className="ln-ligne__nom">{travail.sujet?.nom ?? travail.outil.nom}</p>
                  <p className={enPanne ? "ln-ligne__panne" : "ln-muted"}>
                    {travail.erreur?.cause ??
                      (travail.sujet?.total === undefined
                        ? "Taille encore inconnue"
                        : `${travail.sujet.total} ${description.mots.page.plusieurs}`)}
                    {enPanne ? (
                      <>
                        {" "}
                        <button type="button" className="ln-lien-action" onClick={onVerifier}>
                          Ouvrir
                        </button>
                      </>
                    ) : null}
                  </p>
                </div>

                <p className="ln-ligne__etat">
                  <Icone nom={etat.icone} />
                  {etat.phrase}
                </p>

                <div className="ln-ligne__fil">
                  <Progression
                    valeur={travail.progression}
                    etiquette={`Avancement de ${travail.sujet?.nom ?? "ce travail"}`}
                    {...(sur === undefined ? {} : { complement: sur })}
                  />
                </div>

                <div className="ln-ligne__faire">
                  {travail.etat === "en_cours" || travail.etat === "verrouille" || travail.etat === "en_file" ? (
                    <Bouton
                      icone={<Icone nom="pause" />}
                      aria-label={`Mettre en pause ${travail.sujet?.nom ?? travail.id}`}
                      onClick={() => onAction(travail.id, "pause")}
                    >
                      Pause
                    </Bouton>
                  ) : null}
                  {travail.etat === "en_pause" ||
                  travail.etat === "en_echec_recuperable" ||
                  travail.etat === "en_echec_definitif" ? (
                    <Bouton
                      icone={<Icone nom="lecture" />}
                      aria-label={`Reprendre ${travail.sujet?.nom ?? travail.id}`}
                      onClick={() => onAction(travail.id, "reprendre")}
                    >
                      Reprendre
                    </Bouton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {accompagnements === undefined || accompagnements.length === 0 ? null : (
        <div className="ln-traitement__accompagnements ln-panneau-titre">
          <p className="ln-section">
            Déposés avec · {accompagnements.length} fichier{accompagnements.length > 1 ? "s" : ""}
          </p>
          <p className="ln-muted">
            Ils ne se lisent pas seuls&nbsp;: ils seront lus avec le document qui les nomme, pour
            qu’un {description.mots.element.un} mène au bon moment de sa {description.mots.piste.un}.
          </p>
          <ul className="ln-traitement__liste">
            {accompagnements.map((accompagnement) => (
              <li key={accompagnement.nom} className="ln-etiquette">
                <Icone nom={ICONES[accompagnement.contenu]} />
                {accompagnement.nom}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="ln-traitement__pied ln-panneau-titre">Vos originaux ne sont jamais modifiés.</p>
    </main>
  );
}
