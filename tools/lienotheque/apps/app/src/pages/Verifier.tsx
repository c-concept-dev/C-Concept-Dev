import { useMemo, useState, type JSX } from "react";
import { nommer, type CasDouteux, type VueBibliotheque } from "@lienotheque/contrats";
import { Bouton, FilAriane, Icone, Progression } from "../composants/index.js";
import "./Verifier.css";

/** Vérifier : la file des cas douteux, un par écran, trois gestes (B2, UX-03, SYN-04).
 *
 *  Un seul cas à la fois. Ce qu'on vérifie, c'est une proposition — elle est dite en toutes
 *  lettres, avec le motif qui l'a produite : personne ne peut arbitrer sans savoir pourquoi la
 *  machine a proposé cela.
 *
 *  Correction 6 : les trois actions sont sur une seule ligne, et l'annulation est un lien, pas un
 *  quatrième bouton — on ne met pas « annuler » au même rang que « valider ». */

export type Decision = { readonly casId: string; readonly geste: "valide" | "corrige" | "ignore" };

type Props = {
  readonly vue: VueBibliotheque;
  readonly casId?: string | undefined;
  readonly onCas: (casId: string) => void;
  readonly onOuvrir: (page: number, ancreId: string) => void;
};

export function Verifier({ vue, casId, onCas, onOuvrir }: Props): JSX.Element {
  const [decisions, setDecisions] = useState<readonly Decision[]>([]);

  const reste = useMemo<readonly CasDouteux[]>(
    () => vue.douteux.filter((cas) => !decisions.some((decision) => decision.casId === cas.id)),
    [vue.douteux, decisions],
  );

  const courant = useMemo<CasDouteux | undefined>(
    () => reste.find((cas) => cas.id === casId) ?? reste[0],
    [reste, casId],
  );

  const decider = (geste: Decision["geste"]): void => {
    if (courant === undefined) return;
    const suivantes = [...decisions, { casId: courant.id, geste }];
    setDecisions(suivantes);
    const suivant = vue.douteux.find((cas) => !suivantes.some((decision) => decision.casId === cas.id));
    if (suivant !== undefined) onCas(suivant.id);
  };

  const annuler = (): void => {
    const derniere = decisions.at(-1);
    if (derniere === undefined) return;
    setDecisions(decisions.slice(0, -1));
    onCas(derniere.casId);
  };

  const chemin = [
    { libelle: "Accueil", href: "#accueil" },
    { libelle: vue.nom, href: `#bibliotheque/${vue.id}` },
    { libelle: "Vérifier" },
  ];

  return (
    <main className="ln-verifier ln-layout" id="contenu">
      <div className="ln-verifier__barre ln-panneau-titre">
        <FilAriane chemin={chemin} />
        <h1 className="ln-verifier__titre">Vérifier</h1>
        <Progression
          valeur={vue.douteux.length === 0 ? 1 : decisions.length / vue.douteux.length}
          etiquette="Avancement de la vérification"
          complement={`${decisions.length} sur ${vue.douteux.length}`}
        />
      </div>

      {courant === undefined ? (
        <section className="ln-verifier__fini ln-panneau" aria-label="File terminée">
          <p className="ln-verifier__fini-phrase">
            <Icone nom="valide" />
            Plus rien à vérifier pour le moment.
          </p>
          {decisions.length === 0 ? null : (
            <button type="button" className="ln-lien-action" onClick={annuler}>
              Annuler la dernière décision
            </button>
          )}
        </section>
      ) : (
        <section className="ln-cas ln-panneau" aria-labelledby="ln-cas-titre">
          <h2 id="ln-cas-titre" className="ln-cas__titre">
            {nommer(vue.mots.element, courant.element.numero)}
            {courant.element.titre === undefined ? "" : ` — ${courant.element.titre}`}
          </h2>

          <p className="ln-cas__situation ln-muted">
            {nommer(vue.mots.page, courant.element.page)}
            {courant.element.media === undefined ? "" : ` · ${nommer(vue.mots.piste, courant.element.media.piste)}`}
          </p>

          <p className="ln-cas__proposition">{courant.proposition}</p>
          <p className="ln-cas__motif ln-muted">
            <Icone nom="info" />
            {courant.motif}
          </p>

          {/* Correction 6 : les trois gestes sur une ligne, l'annulation en lien dessous. */}
          <div className="ln-cas__gestes">
            <Bouton variante="principal" icone={<Icone nom="valide" />} onClick={() => decider("valide")}>
              Valider
            </Bouton>
            <Bouton icone={<Icone nom="crayon" />} onClick={() => onOuvrir(courant.element.page, courant.element.ancreId)}>
              Corriger
            </Bouton>
            {/* Une icône de saut, jamais une corbeille : ignorer ne supprime rien (SYN-04). */}
            <Bouton icone={<Icone nom="passer" />} onClick={() => decider("ignore")}>
              Ignorer
            </Bouton>
          </div>

          <p className="ln-cas__annuler">
            {decisions.length === 0 ? (
              <span className="ln-muted">Aucune décision à annuler</span>
            ) : (
              <button type="button" className="ln-lien-action" onClick={annuler}>
                Annuler la dernière décision
              </button>
            )}
          </p>
        </section>
      )}

      <p className="ln-verifier__file ln-muted">{reste.length} cas en attente</p>
    </main>
  );
}
