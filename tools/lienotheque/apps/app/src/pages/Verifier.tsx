import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { accorder, nommer, type CasDouteux, type NatureDoute, type VueBibliotheque } from "@lienotheque/contrats";
import { Bouton, FilAriane, Icone } from "../composants/index.js";
import "./Verifier.css";

/** Vérifier (B2 — UX-03, SYN-04, SYN-05, SYN-07).
 *
 *  Une planche de cas douteux, un cas ouvert à la fois, et trois décisions : confirmer, corriger,
 *  ignorer. Aucun chronomètre, aucun score de vitesse : on ne met pas quelqu'un en course contre
 *  sa propre bibliothèque.
 *
 *  La dernière décision se défait. C'est la seule garantie qui permette de décider vite sans
 *  crainte, et elle vaut mieux qu'une demande de confirmation à chaque geste. */

export type Decision = "confirme" | "corrige" | "ignore";

type Props = {
  readonly vue: VueBibliotheque;
  readonly onDecision: (cas: CasDouteux, decision: Decision) => void;
  readonly onAnnuler: () => void;
  /** Décision la plus récente, s'il y en a une : c'est elle qu'on peut défaire. */
  readonly derniere?: { readonly cas: CasDouteux; readonly decision: Decision } | undefined;
};

const FILTRES: readonly { readonly cle: "tous" | NatureDoute; readonly libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "lien", libelle: "Liens" },
  { cle: "page", libelle: "Pages" },
  { cle: "information", libelle: "Informations" },
];

/** Ce qu'un état signifie pour qui regarde, avec son icône. Un conflit entre deux appareils ne se
 *  traite pas comme une lecture incertaine, et l'écran doit le montrer. */
const ETATS = {
  confiance: { libelle: "Confiance moyenne", icone: "info" },
  conflit_appareils: { libelle: "Conflit entre deux appareils", icone: "appareils" },
  a_rattacher: { libelle: "À rattacher après recalcul", icone: "horloge" },
  segment_inconnu: { libelle: "Segment inconnu", icone: "lien" },
} as const;

export function Verifier({ vue, onDecision, onAnnuler, derniere }: Props): JSX.Element {
  const [filtre, setFiltre] = useState<"tous" | NatureDoute>("tous");
  const [ouvert, setOuvert] = useState<string | undefined>(vue.douteux[0]?.id);
  const [zoom, setZoom] = useState(100);

  const cas = useMemo(() => vue.douteux.filter((c) => filtre === "tous" || c.nature === filtre), [vue.douteux, filtre]);
  const actif = cas.find((c) => c.id === ouvert) ?? cas[0];

  const decider = useCallback(
    (decision: Decision) => {
      if (actif === undefined) return;
      onDecision(actif, decision);
      const rang = cas.indexOf(actif);
      setOuvert(cas[rang + 1]?.id ?? cas[rang - 1]?.id);
    },
    [actif, cas, onDecision],
  );

  useEffect(() => {
    const ecouter = (evenement: KeyboardEvent): void => {
      const cible = evenement.target;
      if (cible instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(cible.tagName)) return;
      if (evenement.key === "Enter") {
        evenement.preventDefault();
        decider("confirme");
      }
      if (evenement.key === "c" || evenement.key === "C") {
        evenement.preventDefault();
        decider("corrige");
      }
      if (evenement.key === "Escape") {
        evenement.preventDefault();
        decider("ignore");
      }
    };
    globalThis.addEventListener("keydown", ecouter);
    return () => globalThis.removeEventListener("keydown", ecouter);
  }, [decider]);

  return (
    <main id="contenu" className="ln-verifier" tabIndex={-1}>
      <div className="ln-verifier__entete ln-panneau-titre">
        <div>
          <FilAriane
            chemin={[
              { libelle: "Accueil", href: "#" },
              { libelle: vue.nom, href: "#catalogue" },
              { libelle: "Vérifier" },
            ]}
          />
          <h1 className="ln-verifier__titre">Vérifier</h1>
        </div>
        <p className="ln-verifier__reste">
          <strong className="ln-verifier__nombre">{vue.douteux.length}</strong>
          <span>
            restants dans
            <br />
            {vue.nom}
          </span>
        </p>
      </div>

      <div className="ln-verifier__filtres ln-panneau-titre" role="group" aria-label="Filtrer les cas">
        {FILTRES.map((entree) => (
          <button
            key={entree.cle}
            type="button"
            className={filtre === entree.cle ? "ln-bascule__choix ln-bascule__choix--choisi" : "ln-bascule__choix"}
            onClick={() => setFiltre(entree.cle)}
            aria-pressed={filtre === entree.cle}
          >
            {entree.libelle}
          </button>
        ))}
      </div>

      <div className="ln-verifier__corps">
        <ol className="ln-planche" aria-label="Cas à vérifier">
          {cas.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === actif?.id ? "ln-planche__carte ln-planche__carte--ouvert" : "ln-planche__carte"}
                onClick={() => setOuvert(c.id)}
                aria-current={c.id === actif?.id ? "true" : undefined}
                aria-label={nommer(vue.mots.element, c.element.numero)}
              >
                <span className="ln-planche__apercu" aria-hidden="true">
                  {c.element.numero}
                </span>
                <span className="ln-planche__nom">
                  {nommer(vue.mots.element, c.element.numero)}
                </span>
                <span className="ln-planche__page">
                  {vue.mots.page.un[0]}. {c.element.page}
                </span>
                {c.element.media === undefined ? null : (
                  <span className="ln-planche__vers">
                    → {nommer(vue.mots.piste, c.element.media.piste)}
                  </span>
                )}
                <span className={`ln-etiquette ln-etiquette--${c.etat}`}>
                  <Icone nom={ETATS[c.etat].icone} />
                  {ETATS[c.etat].libelle}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <aside className="ln-cas ln-panneau" aria-label="Cas ouvert">
          {actif === undefined ? (
            <p className="ln-cas__fini">Rien à vérifier. Tout est relié.</p>
          ) : (
            <>
              <header className="ln-cas__entete">
                <h2 className="ln-cas__titre">
                  {nommer(vue.mots.element, actif.element.numero)}
                </h2>
                <p className="ln-cas__page">
                  {nommer(vue.mots.page, actif.element.page)}
                </p>
              </header>

              <div className="ln-cas__vue">
                <div className="ln-cas__image" style={{ width: `${zoom}%` }} role="img" aria-label={`Vue agrandie — ${nommer(vue.mots.element, actif.element.numero)}`}>
                  <span className="ln-cas__image-numero">{actif.element.numero}</span>
                </div>
              </div>

              {/* Les mêmes commandes qu'au Lecteur, et le même bouton du kit : icône en
                  currentColor, nom accessible, état désactivé aux bornes. « Plein écran » n'était
                  relié à rien ; il ramène la vue à sa taille d'origine. */}
              <div className="ln-cas__zoom" role="group" aria-label="Zoom">
                <Bouton compact icone={<Icone nom="moins" />} onClick={() => setZoom(Math.max(50, zoom - 10))} disabled={zoom <= 50} aria-label="Réduire">
                  <span className="ln-sr-only">Réduire</span>
                </Bouton>
                <output>{zoom} %</output>
                <Bouton compact icone={<Icone nom="plus" />} onClick={() => setZoom(Math.min(200, zoom + 10))} disabled={zoom >= 200} aria-label="Agrandir">
                  <span className="ln-sr-only">Agrandir</span>
                </Bouton>
                <Bouton compact icone={<Icone nom="pleinEcran" />} onClick={() => setZoom(100)} disabled={zoom === 100} aria-label="Ajuster à la fenêtre">
                  <span className="ln-sr-only">Ajuster à la fenêtre</span>
                </Bouton>
              </div>

              <p className="ln-cas__proposition">
                Le système propose : <strong>{actif.proposition}</strong>
              </p>
              <p className="ln-cas__motif">
                Pourquoi : <span>{actif.motif}</span>
              </p>

              {actif.element.media === undefined ? null : (
                <section className="ln-cas__apercu" aria-label="Aperçu du segment proposé">
                  <h3 className="ln-cas__apercu-titre">
                    {nommer(vue.mots.piste, actif.element.media.piste)} · Segment proposé
                  </h3>
                  <div className="ln-cas__onde">
                    <button type="button" className="ln-cas__ecouter" aria-label="Écouter le segment proposé">
                      <Icone nom="lecture" />
                    </button>
                    <span className="ln-cas__onde-trace" aria-hidden="true" />
                  </div>
                </section>
              )}

              <div className="ln-cas__decisions">
                <Bouton variante="principal" onClick={() => decider("confirme")}>
                  <Icone nom="valide" />
                  Confirmer <kbd>Entrée</kbd>
                </Bouton>
                <button type="button" className="ln-cas__decision" onClick={() => decider("corrige")}>
                  <Icone nom="crayon" />
                  Corriger <kbd>C</kbd>
                </button>
                {/* « Ignorer » passe au suivant : une icône de passage, jamais une corbeille —
                    rien n'est détruit ici. */}
                <button type="button" className="ln-cas__decision" onClick={() => decider("ignore")}>
                  <Icone nom="passer" />
                  Ignorer <kbd>Échap</kbd>
                </button>
              </div>

              {/* Correction 6 : un lien cuivre souligné sous la ligne, jamais un quatrième bouton au
                  même rang que « Confirmer ». Avant la première décision, l'écran le dit au lieu
                  d'offrir un bouton inerte. */}
              <p className="ln-cas__annuler">
                {derniere === undefined ? (
                  <span className="ln-muted">Aucune décision à annuler</span>
                ) : (
                  <button type="button" className="ln-lien-action" onClick={onAnnuler}>
                    Annuler la dernière décision
                  </button>
                )}
              </p>

              <p className="ln-cas__garantie">
                <Icone nom="info" />
                Vos corrections sont conservées même après un nouveau traitement.
              </p>
            </>
          )}
        </aside>
      </div>

      <p className="ln-sr-only" aria-live="polite">
        {accorder(cas.length, { un: "cas à vérifier", plusieurs: "cas à vérifier" })}
      </p>
    </main>
  );
}
