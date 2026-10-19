import { useId, useState, type JSX } from "react";
import { Bouton, Icone } from "../composants/index.js";
import { amorcer, enrolerCetAppareil, entrer, type Verdict } from "../ceremonie/navigateur.js";
import "./Entrer.css";

type Props = {
  /** L'invitation d'amorçage, quand l'adresse en porte une. Le premier accès s'ouvre par là. */
  readonly invitation?: string | undefined;
  /** Vrai quand une session est déjà ouverte : l'écran propose alors d'enrôler un appareil. */
  readonly identifie?: boolean;
  readonly onEntre: () => void;
  /** De quoi remplacer la cérémonie dans une épreuve. Absent, ce sont les vraies fonctions. */
  readonly gestes?: {
    readonly entrer?: typeof entrer;
    readonly enroler?: typeof enrolerCetAppareil;
    readonly amorcer?: typeof amorcer;
  };
};

/** Entrer, enrôler, amorcer — **le seul écran qui vive avant toute session** (SEC-02).
 *
 *  C'est la moitié de l'étape 4 qui manquait. Le service savait tout faire ; rien ne savait
 *  appeler. Aucune clé ne passe par ici : la partie privée reste dans l'appareil, la session vit
 *  dans un témoin qu'aucun script ne lit (LIV-04).
 *
 *  ## Trois refus, et l'écran les montre tels qu'ils arrivent
 *
 *  | ce qui refuse | ce que l'écran dit |
 *  |---|---|
 *  | l'entrée | **le même mot pour tout** — signature fausse, clé inconnue, clé révoquée, défi périmé |
 *  | l'enrôlement | **son motif**, y compris « getPublicKey() n'a pas rendu de clé » |
 *  | la cérémonie elle-même | « interrompue » — doigt retiré, fenêtre fermée, délai dépassé |
 *
 *  L'écran n'interprète aucun de ces mots et n'en fabrique aucun à partir d'un code. Le service
 *  choisit ce qu'il dit, et c'est la seule façon de garder indiscernables les refus qui doivent
 *  l'être. Le troisième cas est le seul que cette page nomme elle-même, parce que le service n'a
 *  rien à en dire : il n'a pas été appelé. */
export function Entrer({ invitation, identifie = false, onEntre, gestes }: Props): JSX.Element {
  const [enCours, setEnCours] = useState<"entree" | "enrolement" | undefined>(undefined);
  const [refus, setRefus] = useState<string | undefined>(undefined);
  const [nom, setNom] = useState("");
  const champNom = useId();

  const lesGestes = {
    entrer: gestes?.entrer ?? entrer,
    enroler: gestes?.enroler ?? enrolerCetAppareil,
    amorcer: gestes?.amorcer ?? amorcer,
  };

  const mener = async (quoi: "entree" | "enrolement", geste: () => Promise<Verdict>): Promise<void> => {
    setEnCours(quoi);
    setRefus(undefined);
    const verdict = await geste();
    setEnCours(undefined);
    if (verdict.fait) {
      if (quoi === "entree") onEntre();
      else setRefus(undefined);
      return;
    }
    setRefus(verdict.mot);
  };

  const nomDeLAppareil = (): string => (nom.trim() === "" ? "Cet appareil" : nom.trim());

  return (
    <main id="contenu" className="ln-layout ln-entrer" tabIndex={-1}>
      <div className="ln-entrer__panneau ln-panneau-titre">
        <h1 className="ln-entrer__titre">Entrer dans votre bibliothèque</h1>

        {invitation === undefined ? (
          <p className="ln-entrer__aide">
            Votre appareil vous reconnaît. Rien à retenir, rien à saisir.
          </p>
        ) : (
          <p className="ln-entrer__aide">
            Première ouverture : cet appareil va devenir votre clé. Donnez-lui un nom que vous
            reconnaîtrez, pour pouvoir le retirer un jour.
          </p>
        )}

        {/* Le nom de l'appareil ne sert qu'à l'enrôlement : il n'y a rien à nommer pour entrer. */}
        {invitation === undefined && !identifie ? null : (
          <p className="ln-champ">
            <label className="ln-champ__etiquette" htmlFor={champNom}>
              Nom de cet appareil
            </label>
            <input
              id={champNom}
              className="ln-saisie"
              type="text"
              value={nom}
              placeholder="Portable, bureau, téléphone…"
              onChange={(evenement) => setNom(evenement.target.value)}
            />
          </p>
        )}

        <div className="ln-entrer__gestes">
          {invitation === undefined ? (
            <Bouton
              variante="principal"
              icone={<Icone nom="personnes" />}
              onClick={() => void mener("entree", () => lesGestes.entrer())}
              chargement={enCours === "entree"}
              disabled={enCours !== undefined}
            >
              {enCours === "entree" ? "Cérémonie en cours…" : "Entrer"}
            </Bouton>
          ) : (
            <Bouton
              variante="principal"
              icone={<Icone nom="personnes" />}
              onClick={() => void mener("enrolement", () => lesGestes.amorcer(nomDeLAppareil(), invitation))}
              chargement={enCours === "enrolement"}
              disabled={enCours !== undefined}
            >
              {enCours === "enrolement" ? "Cérémonie en cours…" : "Faire de cet appareil ma clé"}
            </Bouton>
          )}

          {/* Enrôler un appareil de plus demande une session : on ne propose pas un geste qui ne
              mènerait nulle part. */}
          {identifie ? (
            <Bouton
              variante="secondaire"
              icone={<Icone nom="plus" />}
              onClick={() => void mener("enrolement", () => lesGestes.enroler(nomDeLAppareil()))}
              chargement={enCours === "enrolement"}
              disabled={enCours !== undefined}
            >
              Enrôler cet appareil
            </Bouton>
          ) : null}
        </div>

        {/* Le refus, tel que le service l'a dit. Annoncé au lecteur d'écran dès qu'il paraît :
            une cérémonie refusée en silence est une cérémonie qu'on recommence sans comprendre. */}
        <p className="ln-entrer__refus" role="status" aria-live="polite">
          {refus ?? ""}
        </p>
      </div>
    </main>
  );
}
