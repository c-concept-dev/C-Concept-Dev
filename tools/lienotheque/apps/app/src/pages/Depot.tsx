import { useState, type JSX } from "react";
import type {
  AnalyseDepot,
  ArchivePreparee,
  DescriptionBibliotheque,
  MotsBibliotheque,
  Travail,
  TypeDeContenu,
} from "@lienotheque/contrats";
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
  if (travail.etat === "termine" && travail.erreur !== undefined)
    return { phrase: "Terminé avec erreur", icone: "alerte" };
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
  readonly onImporterArchive?: (() => void) | undefined;
  readonly onPreparerEnsemble?: (() => void) | undefined;
  readonly onAnalyserFichiers?: (() => Promise<AnalyseDepot | undefined>) | undefined;
  readonly onAnalyserDossier?: (() => Promise<AnalyseDepot | undefined>) | undefined;
  readonly onCreerArchive?: ((
    analyse: AnalyseDepot,
    principal: string,
    nom: string,
    deposerApres: boolean,
  ) => Promise<ArchivePreparee | undefined>) | undefined;
  readonly onFichiers: (fichiers: readonly File[]) => void;
  readonly onAction: (id: string, action: ActionTravail) => void;
  readonly onVerifier: () => void;
  /** Ouvrir l'écran qui retire cette bibliothèque — l'oublier, ou la mettre à la corbeille.
   *  Absent là où l'on ne peut pas administrer : en ligne, on ne retire rien. */
  readonly onRetirer?: (() => void) | undefined;
  /** Vers ce qui se trouve deux fois. Auprès du retrait, parce que c'est la même intention :
   *  tenir la bibliothèque, plutôt que l'alimenter. */
  readonly onDoublons?: (() => void) | undefined;
  /** Accès directs aux deux écrans de consultation. Une bibliothèque de deux cent cinquante
   *  documents ne doit pas réserver sa navigation à la palette de recherche. */
  readonly onOrganisation?: (() => void) | undefined;
  readonly onCatalogue?: (() => void) | undefined;
  /** Ouvre la manière de lire pour ce document : c'est par lui qu'on y entre, parce que c'est
   *  lui qu'on regarde en la montrant. */
  readonly onManiere?: ((empreinte: string, nom: string) => void) | undefined;
};

export function Depot({
  description,
  travaux,
  accompagnements,
  refuses,
  onParcourir,
  onImporterArchive,
  onPreparerEnsemble,
  onAnalyserFichiers,
  onAnalyserDossier,
  onCreerArchive,
  onFichiers,
  onAction,
  onVerifier,
  onRetirer,
  onDoublons,
  onOrganisation,
  onCatalogue,
  onManiere,
}: Props): JSX.Element {
  const enCours = travaux.filter((travail) => travail.etat === "en_cours" || travail.etat === "verrouille").length;
  const enErreur = travaux.filter((travail) => travail.erreur !== undefined).length;
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  const [analyse, setAnalyse] = useState<AnalyseDepot | undefined>(undefined);
  const [principal, setPrincipal] = useState("");
  const [nomArchive, setNomArchive] = useState("Ensemble");
  const [archive, setArchive] = useState<ArchivePreparee | undefined>(undefined);
  const [souciAssistant, setSouciAssistant] = useState<string | undefined>(undefined);
  const [assistantOccupe, setAssistantOccupe] = useState(false);

  const analyser = async (choisir: (() => Promise<AnalyseDepot | undefined>) | undefined): Promise<void> => {
    if (choisir === undefined) return;
    setAssistantOccupe(true);
    setSouciAssistant(undefined);
    setArchive(undefined);
    try {
      const resultat = await choisir();
      if (resultat === undefined) return;
      setAnalyse(resultat);
      const premier = resultat.fichiers.find((fichier) => fichier.role === "principal")?.chemin ?? "";
      setPrincipal(premier);
      const nom = resultat.fichiers.find((fichier) => fichier.chemin === premier)?.nom.replace(/\.[^.]+$/, "");
      if (nom !== undefined && nom !== "") setNomArchive(nom);
    } catch (souci) {
      setSouciAssistant(souci instanceof Error ? souci.message : String(souci));
    } finally {
      setAssistantOccupe(false);
    }
  };

  const fabriquer = async (deposerApres: boolean): Promise<void> => {
    if (analyse === undefined || onCreerArchive === undefined || principal === "") return;
    setAssistantOccupe(true);
    setSouciAssistant(undefined);
    try {
      const creee = await onCreerArchive(analyse, principal, nomArchive, deposerApres);
      if (creee !== undefined) setArchive(creee);
    } catch (souci) {
      setSouciAssistant(souci instanceof Error ? souci.message : String(souci));
    } finally {
      setAssistantOccupe(false);
    }
  };

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
        <nav className="ln-traitement__navigation" aria-label="Bibliothèque">
          {onCatalogue === undefined ? null : (
            <button type="button" className="ln-lien-action" onClick={onCatalogue}>Catalogue</button>
          )}
          {onOrganisation === undefined ? null : (
            <button type="button" className="ln-lien-action" onClick={onOrganisation}>Organisation</button>
          )}
        </nav>
        {/* Dans l'en-tête, et non en pied : sous une liste de deux cent cinquante documents, un
            lien de pied est à des milliers de pixels et n'existe pas. Discret, mais atteignable.  */}
        {onDoublons === undefined ? null : (
          <button type="button" className="ln-lien-action ln-traitement__retirer" onClick={onDoublons}>
            <Icone nom="recherche" />
            Chercher les doublons…
          </button>
        )}
        {onRetirer === undefined ? null : (
          <button type="button" className="ln-lien-action ln-traitement__retirer" onClick={onRetirer}>
            <Icone nom="alerte" />
            Retirer cette bibliothèque…
          </button>
        )}
        <p className="ln-traitement__compteur">
          <Icone nom="horloge" />
          {enCours} en cours
          {enErreur === 0 ? null : ` · ${enErreur} erreur${enErreur > 1 ? "s" : ""}`}
        </p>
      </div>

      <section className="ln-assistant-depot ln-panneau-titre" aria-labelledby="choix-depot">
        <div>
          <p id="choix-depot" className="ln-section">Comment voulez-vous ajouter cet ensemble&nbsp;?</p>
          <p className="ln-muted">Les trois chemins produisent la même bibliothèque autonome.</p>
        </div>
        <div className="ln-assistant-depot__choix">
          <button type="button" className="ln-btn ln-btn--secondaire" onClick={onParcourir} disabled={onParcourir === undefined}>
            Déposer directement
          </button>
          <button type="button" className="ln-btn ln-btn--secondaire" onClick={onImporterArchive} disabled={onImporterArchive === undefined}>
            Importer un ZIP
          </button>
          <button
            type="button"
            className="ln-btn ln-btn--primaire"
            onClick={() => {
              setAssistantOuvert((ouvert) => !ouvert);
              onPreparerEnsemble?.();
            }}
            disabled={onAnalyserFichiers === undefined && onAnalyserDossier === undefined && onPreparerEnsemble === undefined}
          >
            Préparer un ensemble
          </button>
        </div>

        {!assistantOuvert ? null : (
          <div className="ln-assistant-depot__panneau">
            <div className="ln-assistant-depot__choix">
              <button type="button" className="ln-btn ln-btn--secondaire" onClick={() => void analyser(onAnalyserFichiers)} disabled={assistantOccupe || onAnalyserFichiers === undefined}>
                Choisir des fichiers
              </button>
              <button type="button" className="ln-btn ln-btn--secondaire" onClick={() => void analyser(onAnalyserDossier)} disabled={assistantOccupe || onAnalyserDossier === undefined}>
                Choisir un dossier
              </button>
            </div>

            {analyse === undefined ? (
              <p className="ln-muted">Les dossiers sont parcourus récursivement. Rien n’est copié avant votre validation.</p>
            ) : (
              <>
                <p className="ln-section">
                  {analyse.fichiers.length} fichier{analyse.fichiers.length > 1 ? "s" : ""} reconnu{analyse.fichiers.length > 1 ? "s" : ""}
                  {analyse.doublons.length === 0 ? " · aucun doublon exact" : ` · ${analyse.doublons.length} groupe${analyse.doublons.length > 1 ? "s" : ""} de doublons`}
                </p>
                {analyse.avertissements.length === 0 ? null : (
                  <ul className="ln-traitement__refuses">
                    {analyse.avertissements.map((avertissement) => <li key={avertissement}><Icone nom="alerte" />{avertissement}</li>)}
                  </ul>
                )}
                <fieldset className="ln-assistant-depot__documents">
                  <legend>Document principal</legend>
                  {analyse.fichiers.filter((fichier) => fichier.contenu === "documents").map((fichier) => (
                    <label key={fichier.chemin}>
                      <input type="radio" name="document-principal" value={fichier.chemin} checked={principal === fichier.chemin} onChange={() => setPrincipal(fichier.chemin)} />
                      <span>{fichier.nom}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="ln-champ">
                  <span>Nom du ZIP</span>
                  <input value={nomArchive} onChange={(evenement) => setNomArchive(evenement.currentTarget.value)} />
                </label>
                <div className="ln-assistant-depot__choix">
                  <button type="button" className="ln-btn ln-btn--secondaire" disabled={assistantOccupe || principal === "" || onCreerArchive === undefined} onClick={() => void fabriquer(false)}>
                    Créer le ZIP
                  </button>
                  <button type="button" className="ln-btn ln-btn--primaire" disabled={assistantOccupe || principal === "" || onCreerArchive === undefined} onClick={() => void fabriquer(true)}>
                    Créer puis déposer
                  </button>
                </div>
              </>
            )}
            {assistantOccupe ? <p role="status">Analyse en cours…</p> : null}
            {souciAssistant === undefined ? null : <p className="ln-message-erreur" role="alert">{souciAssistant}</p>}
            {archive === undefined ? null : <p className="ln-message-succes" role="status">ZIP créé et vérifié&nbsp;: {archive.chemin}</p>}
          </div>
        )}
      </section>

      <ZoneDepot
        titre="Déposez vos fichiers ici"
        aide="Documents, audio, vidéos et images — séparés ou dans un ZIP contenant un PDF et ses MP3, ou d’autres formats reconnus"
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
          Fichiers déposés · {travaux.length} fichier{travaux.length > 1 ? "s" : ""}
        </p>
        <p className="ln-muted">Vous pouvez fermer cette fenêtre&nbsp;: le traitement continue.</p>
      </div>

      {travaux.length === 0 ? (
        <p className="ln-traitement__vide ln-panneau-titre">
          Rien en traitement pour l’instant. Déposez des fichiers&nbsp;: ils partiront d’eux-mêmes.
        </p>
      ) : (
        <ul className="ln-file" aria-label="Fichiers déposés">
          {travaux.map((travail) => {
            const etat = ouEnEst(travail, description.mots);
            const sur = compte(travail);
            const enPanne = travail.erreur !== undefined;
            return (
              <li key={travail.id} className={`ln-ligne${enPanne ? " ln-ligne--alerte" : ""}`}>
                <Icone nom={enPanne ? "alerte" : ICONES[travail.sujet?.contenu ?? "documents"]} />

                <div className="ln-ligne__quoi">
                  <p className="ln-ligne__nom">
                    {onManiere === undefined || travail.sujet === undefined ? (
                      travail.sujet?.nom ?? travail.outil.nom
                    ) : (
                      <button
                        type="button"
                        className="ln-lien-action ln-ligne__ouvrir"
                        onClick={() => onManiere(travail.empreinteEntree ?? "", travail.sujet!.nom)}
                      >
                        {travail.sujet.nom}
                      </button>
                    )}
                  </p>
                  <p className={enPanne ? "ln-ligne__panne" : "ln-muted"}>
                    {travail.erreur?.cause ??
                      (travail.sujet?.total === undefined
                        ? "Taille encore inconnue"
                        : `${travail.sujet.total} ${description.mots.page.plusieurs}`)}
                    {enPanne ? (
                      <>
                        {" "}
                        {/* Vers l'éditeur de manière de lire, et non vers la vérification : un
                            travail arrêté faute de manière de lire ne se répare qu'en lui en
                            apprenant une. La vérification, elle, n'a rien à montrer tant que rien
                            n'a tourné — et renvoyait donc à l'accueil, ce qui faisait tourner en
                            rond le premier geste d'une bibliothèque neuve. */}
                        <button
                          type="button"
                          className="ln-lien-action"
                          onClick={() =>
                            onManiere !== undefined && travail.sujet !== undefined
                              ? onManiere(travail.empreinteEntree ?? "", travail.sujet.nom)
                              : onVerifier()
                          }
                        >
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
