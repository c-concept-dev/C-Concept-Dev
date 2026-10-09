import { useId, useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from "react";
import type { DescriptionBibliotheque } from "@lienotheque/contrats";
import {
  MINIMUM,
  deplacer,
  entre,
  enRecette,
  manqueALaManiere,
  redimensionner,
  versionSuivante,
  type Brouillon,
  type Coin,
  type Rectangle,
  type RoleZone,
  type ZoneTracee,
} from "@lienotheque/noyau";
import { Bouton, FilAriane, Icone, type NomIcone } from "../composants/index.js";
import "../styles/formulaire.css";
import "./ManiereDeLire.css";

/** Montrez à Liénothèque où regarder (maquette 4, REC-01, REC-03, REC-07, UX-06).
 *
 *  On trace une zone sur une page ; elle sera cherchée au même endroit sur toutes les autres.
 *  L'écran ne calcule aucune géométrie — déplacer, redimensionner et borner vivent dans le noyau,
 *  où ils s'éprouvent sans navigateur.
 *
 *  Tout se fait aussi au clavier : une zone se choisit, se déplace aux flèches, s'agrandit avec
 *  majuscule, se retire avec la touche d'effacement. Un éditeur qu'on ne peut conduire qu'à la
 *  souris n'est pas un éditeur pour tout le monde. */

/** Les types de zone que le contrat sait situer, et le mot qu'on en dit.
 *
 *  Deux seulement : le numéro imprimé de la page et le numéro d'un élément. Le repère de piste
 *  ne se trace pas — il se cherche à côté de l'élément. */
const TYPES: readonly { readonly role: RoleZone; readonly icone: NomIcone }[] = [
  { role: "page_imprimee", icone: "document" },
  { role: "element", icone: "liste" },
];

/** Ce que chaque pas de clavier déplace. Un pas fin, et un pas large avec la touche alt. */
const PAS = 0.002;
const PAS_LARGE = 0.02;

export type PageAApercevoir = { readonly rang: number; readonly image: string };

/** Ce qu'un essai a donné, page par page. */
export type Essai = {
  readonly pages: readonly {
    readonly numero: number;
    readonly elements: readonly string[];
    readonly aVerifier: number;
  }[];
  readonly lus: number;
  readonly attendus: number;
};

type Props = {
  readonly description: DescriptionBibliotheque;
  /** Le document qu'on regarde, et les pages déjà exportées pour lui. */
  readonly document: string;
  readonly pages: readonly PageAApercevoir[];
  readonly brouillon: Brouillon;
  readonly onBrouillon: (brouillon: Brouillon) => void;
  readonly onEssayer: () => void;
  readonly onEnregistrer: (brouillon: Brouillon) => void;
  readonly onAutresPages: (depuis: number) => void;
  readonly essai?: Essai | undefined;
  readonly occupe?: boolean | undefined;
  readonly echec?: string | undefined;
};

export function ManiereDeLire({
  description,
  document: nomDuDocument,
  pages,
  brouillon,
  onBrouillon,
  onEssayer,
  onEnregistrer,
  onAutresPages,
  essai,
  occupe,
  echec,
}: Props): JSX.Element {
  const [rang, setRang] = useState(0);
  const [choisie, setChoisie] = useState<string | undefined>(undefined);
  const [trace, setTrace] = useState<Rectangle | undefined>(undefined);
  const depart = useRef<{ x: number; y: number } | undefined>(undefined);
  const planche = useRef<HTMLDivElement>(null);
  const base = useId();

  /** Le nom d'un type se compose avec les mots de la bibliothèque : jamais « ancre », jamais un
   *  mot écrit ici — celui qu'elle emploie pour ce qu'elle contient. */
  const motDuRole = (role: RoleZone): string =>
    role === "page_imprimee"
      ? `Numéro de ${description.mots.page.un}`
      : `Numéro d’${description.mots.element.un}`;

  const page = pages[Math.min(rang, Math.max(0, pages.length - 1))];
  const raison = manqueALaManiere(brouillon, {
    element: description.mots.element.un,
    page: description.mots.page.un,
  });

  /** Où un événement est tombé sur la page, en part de sa largeur et de sa hauteur. */
  const ou = (evenement: PointerEvent<HTMLDivElement>): { x: number; y: number } | undefined => {
    const boite = planche.current?.getBoundingClientRect();
    if (boite === undefined || boite.width === 0 || boite.height === 0) return undefined;
    return { x: (evenement.clientX - boite.left) / boite.width, y: (evenement.clientY - boite.top) / boite.height };
  };

  const poser = (zones: readonly ZoneTracee[]): void => onBrouillon({ ...brouillon, zones });

  const changerZone = (cle: string, rectangle: Rectangle): void =>
    poser(brouillon.zones.map((zone) => (zone.cle === cle ? { ...zone, rectangle } : zone)));

  /** Le tracé commence sur la page vide ; sur une zone, on la choisit. */
  const commencer = (evenement: PointerEvent<HTMLDivElement>): void => {
    const point = ou(evenement);
    if (point === undefined) return;
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    depart.current = point;
    setTrace(entre(point, point));
  };

  const suivre = (evenement: PointerEvent<HTMLDivElement>): void => {
    const point = ou(evenement);
    if (point === undefined || depart.current === undefined) return;
    setTrace(entre(depart.current, point));
  };

  const finir = (): void => {
    const fait = trace;
    depart.current = undefined;
    setTrace(undefined);
    // Un clic n'est pas un tracé : au-dessous de la plus petite zone qui ait un sens, on ne
    // crée rien — sans quoi chaque clic laisserait un confetti sur la page.
    if (fait === undefined || fait.l <= MINIMUM || fait.h <= MINIMUM) return;
    const cle = `zone-${Date.now()}`;
    // La première zone tracée est celle des éléments : c'est elle qu'on vient montrer, et sans
    // elle il n'y a rien à lire.
    const role: RoleZone = brouillon.zones.some((zone) => zone.role === "element") ? "page_imprimee" : "element";
    poser([...brouillon.zones, { cle, role, rectangle: fait }]);
    setChoisie(cle);
  };

  const auClavier = (evenement: KeyboardEvent<HTMLDivElement>, zone: ZoneTracee): void => {
    const pas = evenement.altKey ? PAS_LARGE : PAS;
    const sens: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    };
    const vers = sens[evenement.key];
    if (vers !== undefined) {
      evenement.preventDefault();
      // Avec majuscule, on agrandit par le coin bas-droit au lieu de déplacer.
      changerZone(
        zone.cle,
        evenement.shiftKey
          ? redimensionner(zone.rectangle, "se", vers[0], vers[1])
          : deplacer(zone.rectangle, vers[0], vers[1]),
      );
      return;
    }
    if (evenement.key === "Backspace" || evenement.key === "Delete") {
      evenement.preventDefault();
      retirer(zone.cle);
    }
  };

  const retirer = (cle: string): void => {
    poser(brouillon.zones.filter((zone) => zone.cle !== cle));
    setChoisie(undefined);
  };

  return (
    <main id="contenu" className="ln-layout ln-maniere" tabIndex={-1}>
      <div className="ln-maniere__tete ln-panneau-titre">
        <FilAriane
          chemin={[{ libelle: "Accueil", href: "#" }, { libelle: description.nom }, { libelle: "Manière de lire" }]}
        />
        <div className="ln-maniere__dit">
          <h1 className="ln-maniere__titre">Montrez à Liénothèque où regarder</h1>
          <p className="ln-muted">
            Tracez une zone sur la {description.mots.page.un}&nbsp;: elle sera cherchée au même
            endroit sur toutes les autres.
          </p>
        </div>
        <p className="ln-maniere__page">
          {pages.length === 0 ? (
            `Aucune ${description.mots.page.un} à montrer`
          ) : (
            <>
              {description.mots.page.un} {(page?.rang ?? 0) + 1} · {nomDuDocument}
            </>
          )}
          <button
            type="button"
            className="ln-lien-action"
            disabled={rang === 0}
            onClick={() => setRang((courant) => Math.max(0, courant - 1))}
          >
            Précédente
          </button>
          <button
            type="button"
            className="ln-lien-action"
            onClick={() => {
              if (rang + 1 < pages.length) setRang(rang + 1);
              else onAutresPages((page?.rang ?? 0) + 1);
            }}
          >
            Suivante
          </button>
        </p>
      </div>

      {echec === undefined ? null : (
        <p className="ln-maniere__echec" role="alert">
          <Icone nom="alerte" />
          {echec}
        </p>
      )}

      <div className="ln-maniere__colonnes">
        <div className="ln-maniere__gauche">
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="ln-maniere__planche"
            ref={planche}
            onPointerDown={commencer}
            onPointerMove={suivre}
            onPointerUp={finir}
            onPointerCancel={finir}
          >
            {page === undefined ? (
              <p className="ln-muted ln-maniere__planche-vide">
                Les {description.mots.page.plusieurs} de ce document n’ont pas encore été
                préparées.
              </p>
            ) : (
              <img src={page.image} alt={`${description.mots.page.un} ${page.rang + 1}`} draggable={false} />
            )}

            {brouillon.zones.map((zone) => (
              <div
                key={zone.cle}
                role="button"
                tabIndex={0}
                aria-label={`${motDuRole(zone.role)}, zone tracée`}
                aria-pressed={zone.cle === choisie}
                className={`ln-zone ln-zone--${zone.role}${zone.cle === choisie ? " ln-zone--choisie" : ""}${
                  // Près du bord droit, l'étiquette se range à droite : sinon elle sort de la
                  // page et se fait couper.
                  zone.rectangle.x + zone.rectangle.l > 0.7 ? " ln-zone--au-bord" : ""
                }`}
                style={{
                  left: `${zone.rectangle.x * 100}%`,
                  top: `${zone.rectangle.y * 100}%`,
                  width: `${zone.rectangle.l * 100}%`,
                  height: `${zone.rectangle.h * 100}%`,
                }}
                onPointerDown={(evenement) => {
                  evenement.stopPropagation();
                  setChoisie(zone.cle);
                }}
                onKeyDown={(evenement) => auClavier(evenement, zone)}
                onFocus={() => setChoisie(zone.cle)}
              >
                <span className="ln-zone__nom">{motDuRole(zone.role)}</span>
                {(["no", "ne", "so", "se"] as readonly Coin[]).map((coin) => (
                  <Poignee
                    key={coin}
                    coin={coin}
                    planche={planche}
                    rectangle={zone.rectangle}
                    onRectangle={(rectangle) => changerZone(zone.cle, rectangle)}
                  />
                ))}
              </div>
            ))}

            {trace === undefined ? null : (
              <div
                className="ln-zone ln-zone--trace"
                aria-hidden="true"
                style={{
                  left: `${trace.x * 100}%`,
                  top: `${trace.y * 100}%`,
                  width: `${trace.l * 100}%`,
                  height: `${trace.h * 100}%`,
                }}
              />
            )}
          </div>

          <div className="ln-palette">
            <p className="ln-section">Zones tracées</p>
            {brouillon.zones.length === 0 ? (
              <p className="ln-muted">Aucune zone pour l’instant.</p>
            ) : (
              <ul className="ln-palette__liste">
                {brouillon.zones.map((zone) => (
                  <li key={zone.cle} className="ln-zone-tracee">
                    <span className={`ln-zone-tracee__pastille ln-zone-tracee__pastille--${zone.role}`} aria-hidden="true" />
                    <label className="ln-sr-only" htmlFor={`${base}-${zone.cle}`}>
                      Ce que cette zone contient
                    </label>
                    <select
                      id={`${base}-${zone.cle}`}
                      className="ln-saisie ln-zone-tracee__type"
                      value={zone.role}
                      onChange={(evenement) =>
                        poser(
                          brouillon.zones.map((autre) =>
                            autre.cle === zone.cle ? { ...autre, role: evenement.target.value as RoleZone } : autre,
                          ),
                        )
                      }
                    >
                      {TYPES.map((type) => (
                        <option key={type.role} value={type.role}>
                          {motDuRole(type.role)}
                        </option>
                      ))}
                    </select>
                    <Bouton
                      compact
                      icone={<Icone nom="fermer" />}
                      onClick={() => retirer(zone.cle)}
                    >
                      {`Retirer ${motDuRole(zone.role)}`}
                    </Bouton>
                  </li>
                ))}
              </ul>
            )}
            <label className="ln-champ" htmlFor={`${base}-exemple`}>
              À quoi ressemble un numéro
              <input
                id={`${base}-exemple`}
                className="ln-saisie"
                value={brouillon.exempleDeNumero ?? ""}
                placeholder="par exemple 400, ou 2.46"
                onChange={(evenement) =>
                  onBrouillon({ ...brouillon, exempleDeNumero: evenement.target.value })
                }
              />
            </label>
            <p className="ln-muted ln-palette__note">
              <Icone nom="info" />
              Écrivez-en un, tel qu’il est imprimé. Chaque groupe de chiffres vaudra un à trois
              chiffres, et le reste sera repris tel quel. Laissé vide, un numéro est un nombre.
            </p>

            <p className="ln-muted ln-palette__note">
              <Icone nom="info" />
              Les types viennent de ce que la bibliothèque sait relier. Une zone peut rester vide
              sur certaines {description.mots.page.plusieurs}&nbsp;: rien ne sera inventé.
            </p>
          </div>
        </div>

        <aside className="ln-maniere__droite" aria-label="Ce que Liénothèque va lire">
          <div>
            <h2 className="ln-maniere__sous-titre">Ce que Liénothèque va lire</h2>
            <p className="ln-muted">Mis à jour à chaque essai.</p>
          </div>

          {essai === undefined ? (
            <p className="ln-muted ln-maniere__sans-essai">
              Essayez sur dix {description.mots.page.plusieurs}&nbsp;: vous verrez ici ce qui a été
              lu, {description.mots.page.un} par {description.mots.page.un}.
            </p>
          ) : (
            <>
              <p className="ln-maniere__bilan">
                {essai.lus} {essai.lus > 1 ? description.mots.element.plusieurs : description.mots.element.un} lus
                sur {essai.pages.length} {description.mots.page.plusieurs}
              </p>
              <ul className="ln-maniere__essai">
                {essai.pages.map((lue) => (
                  <li key={lue.numero} className="ln-panneau ln-maniere__lue">
                    <p className="ln-maniere__numero">
                      {description.mots.page.un} {lue.numero}
                    </p>
                    <p className="ln-muted">
                      {lue.elements.length === 0
                        ? `Aucun ${description.mots.element.un} lu`
                        : `${description.mots.element.plusieurs} ${lue.elements.join(", ")}`}
                    </p>
                    {lue.aVerifier === 0 ? null : (
                      <p className="ln-maniere__doute">
                        <Icone nom="alerte" />
                        {lue.aVerifier} à vérifier
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      <div className="ln-maniere__pied ln-panneau-titre">
        <p className="ln-muted">
          {raison ?? `Les autres ${description.mots.page.plusieurs} suivront le même tracé.`}
        </p>
        <div className="ln-maniere__actions">
          <Bouton
            disabled={raison !== undefined || occupe === true}
            onClick={() => onEnregistrer(versionSuivante(brouillon))}
          >
            Enregistrer la manière de lire
          </Bouton>
          <Bouton
            variante="principal"
            icone={<Icone nom="lecture" />}
            chargement={occupe === true}
            disabled={raison !== undefined}
            onClick={onEssayer}
          >
            Essayer sur 10 {description.mots.page.plusieurs}
          </Bouton>
        </div>
      </div>
    </main>
  );
}

/** Une poignée de coin. Elle n'existe que pour la souris : le clavier redimensionne par les
 *  flèches, qui n'ont pas besoin qu'on vise. */
function Poignee({
  coin,
  planche,
  rectangle,
  onRectangle,
}: {
  readonly coin: Coin;
  readonly planche: React.RefObject<HTMLDivElement | null>;
  readonly rectangle: Rectangle;
  readonly onRectangle: (rectangle: Rectangle) => void;
}): JSX.Element {
  const dernier = useRef<{ x: number; y: number } | undefined>(undefined);

  return (
    <span
      className={`ln-poignee ln-poignee--${coin}`}
      aria-hidden="true"
      onPointerDown={(evenement) => {
        evenement.stopPropagation();
        evenement.currentTarget.setPointerCapture(evenement.pointerId);
        dernier.current = { x: evenement.clientX, y: evenement.clientY };
      }}
      onPointerMove={(evenement) => {
        const boite = planche.current?.getBoundingClientRect();
        if (dernier.current === undefined || boite === undefined || boite.width === 0) return;
        const dx = (evenement.clientX - dernier.current.x) / boite.width;
        const dy = (evenement.clientY - dernier.current.y) / boite.height;
        dernier.current = { x: evenement.clientX, y: evenement.clientY };
        onRectangle(redimensionner(rectangle, coin, dx, dy));
      }}
      onPointerUp={() => {
        dernier.current = undefined;
      }}
    />
  );
}

/** Ce que l'écran rend quand on enregistre : la recette, prête à écrire. */
export function recetteDuBrouillon(brouillon: Brouillon): ReturnType<typeof enRecette> {
  return enRecette(brouillon);
}
