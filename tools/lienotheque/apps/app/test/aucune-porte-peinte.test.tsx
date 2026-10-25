import { useState, type JSX } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { DescriptionBibliotheque, Passage, VueBibliotheque } from "@lienotheque/contrats";
import { BROUILLON_NEUF } from "@lienotheque/noyau";
import { Accueil } from "../src/pages/Accueil.js";
import { Catalogue } from "../src/pages/Catalogue.js";
import { Creer } from "../src/pages/Creer.js";
import { Depot } from "../src/pages/Depot.js";
import { EnTete } from "../src/EnTete.js";
import { Entrer } from "../src/pages/Entrer.js";
import { Lecteur } from "../src/pages/Lecteur.js";
import { LectureDuTexte } from "../src/pages/LectureDuTexte.js";
import { ManiereDeLire } from "../src/pages/ManiereDeLire.js";
import { Organisation } from "../src/pages/Organisation.js";
import { PremierLancement } from "../src/pages/PremierLancement.js";
import { Reglages } from "../src/pages/Reglages.js";
import { Retirer } from "../src/pages/Retirer.js";
import { Recherche } from "../src/pages/Recherche.js";
import { Doublons } from "../src/pages/Doublons.js";
import { Verifier } from "../src/pages/Verifier.js";
import { PanneauEcoute } from "../src/pages/lecteur/PanneauEcoute.js";
import { TextePage } from "../src/pages/lecteur/TextePage.js";

/** **Aucun bouton visible ne doit être inerte** (UX-09, et le relevé du 21 octobre 2026).
 *
 *  ## Pourquoi ce filet existe
 *
 *  Le 21 octobre, neuf défauts de la même famille ont rendu l'application inutilisable, et
 *  **chacun passait tous ses tests**. Le plus net : « Créer ma première bibliothèque » n'avait
 *  aucun gestionnaire de clic. Le bouton existait, il était au bon endroit, il portait le bon
 *  mot, et il ne menait nulle part. Un test qui vérifie qu'un bouton est dans le document ne voit
 *  rien de tout cela.
 *
 *  Le manuel du 21 octobre nomme ce filet comme le quatrième chantier à ouvrir : « une épreuve
 *  qui parcourt les écrans et vérifie qu'un bouton visible mène quelque part. Huit des neuf
 *  défauts auraient été pris par là. »
 *
 *  ## Ce que « mener quelque part » veut dire ici
 *
 *  Un clic doit faire **au moins l'une** de ces deux choses :
 *
 *  | | ce que cela prouve |
 *  |---|---|
 *  | appeler un geste de l'écran | l'écran parle à qui l'a monté — c'est par là que tout passe |
 *  | changer ce qui est affiché | l'écran se gouverne lui-même : un onglet, un dépliant, une bascule |
 *
 *  Un bouton qui ne fait ni l'un ni l'autre est **peint sur le mur**, et c'est tout ce que ce
 *  filet affirme. Il ne dit pas qu'un bouton mène au **bon** endroit : cela, c'est l'affaire des
 *  épreuves de chaque écran, et elles existent. Un filet qui prétendrait juger la destination
 *  finirait par recopier chaque écran, et ne tiendrait plus.
 *
 *  ## Ce qu'il ne regarde pas, et pourquoi
 *
 *  Les boutons **désactivés** sont hors champ : ils annoncent eux-mêmes qu'ils ne font rien, et
 *  c'est une réponse honnête. Les liens non plus ne sont pas cliqués — un `href` se vérifie en le
 *  lisant, et c'est ce que fait la dernière épreuve.
 */

afterEach(cleanup);

/** De quoi reconnaître un bouton dans un message d'échec. */
const nommer = (bouton: Element): string => {
  const texte = (bouton.textContent ?? "").replace(/\s+/g, " ").trim();
  return texte === "" ? (bouton.getAttribute("aria-label") ?? "(sans libellé)") : texte;
};

/** Les boutons qu'une personne peut réellement presser, et dont on peut exiger un effet.
 *
 *  Deux exclusions, et chacune est une réponse honnête de l'écran plutôt qu'une porte peinte :
 *
 *  | exclu | pourquoi |
 *  |---|---|
 *  | **désactivé** | il annonce lui-même qu'il ne fait rien, et dit souvent à quelle condition |
 *  | **déjà dans son état choisi** | presser l'onglet où l'on est déjà ne doit rien changer |
 *
 *  Sans la seconde, le filet accuserait « Tous » sur Vérifier et « Grille » sur le Catalogue —
 *  deux bascules correctes, déjà choisies. Un filet qui crie au loup finit par ne plus être lu. */
const boutonsVivants = (): HTMLElement[] =>
  screen
    .queryAllByRole("button")
    .filter((bouton) => !(bouton as HTMLButtonElement).disabled)
    .filter((bouton) => bouton.getAttribute("aria-pressed") !== "true")
    .filter((bouton) => bouton.getAttribute("aria-current") === null);

type Gestes = Record<string, Mock>;

/** Monte l'écran, presse chaque bouton tour à tour, et exige qu'il se passe quelque chose.
 *
 *  **Un montage neuf par bouton.** Presser le premier peut faire disparaître le second — un
 *  onglet qui change, un panneau qui se replie. En repartant d'un écran neuf à chaque fois, on
 *  éprouve chaque bouton dans l'état où on le trouve en arrivant, et aucun ne s'éprouve par
 *  accident dans l'état qu'un autre a laissé. */
async function aucunBoutonInerte(ecran: string, monter: () => Gestes): Promise<void> {
  monter();
  const libelles = boutonsVivants().map(nommer);
  cleanup();

  // Un écran peut n'avoir aucun bouton — les Réglages n'offrent qu'une liste déroulante — mais
  // il doit offrir **quelque chose** à manier. Un écran sans aucun contrôle est un écran mort,
  // et c'est l'autre moitié de ce que ce filet doit voir.
  if (libelles.length === 0) {
    monter();
    const combien = [
      ...screen.queryAllByRole("combobox"),
      ...screen.queryAllByRole("textbox"),
      ...screen.queryAllByRole("link"),
      ...screen.queryAllByRole("checkbox"),
    ].length;
    cleanup();
    expect(combien, `${ecran} n'offre aucun bouton et aucun autre contrôle : rien n'y est maniable`).toBeGreaterThan(0);
    return;
  }

  for (const [rang, libelle] of libelles.entries()) {
    const gestes = monter();
    const bouton = boutonsVivants()[rang];
    expect(bouton, `${ecran} — « ${libelle} » a disparu entre deux montages`).toBeDefined();

    const avant = document.body.innerHTML;
    const appelsAvant = Object.values(gestes).reduce((total, geste) => total + geste.mock.calls.length, 0);

    await userEvent.click(bouton!);

    const appelsApres = Object.values(gestes).reduce((total, geste) => total + geste.mock.calls.length, 0);
    const aParle = appelsApres > appelsAvant;
    const aChange = document.body.innerHTML !== avant;

    expect(
      aParle || aChange,
      `${ecran} — le bouton « ${libelle} » ne mène nulle part : il n'appelle aucun geste et ne change rien à l'écran.`,
    ).toBe(true);

    cleanup();
  }
}

// ── Les fixtures : le plus petit jeu valide, et les mêmes pour tous les écrans ──────────────

const ID = (n: number): string => `7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c${String(n).padStart(2, "0")}`;

const DESCRIPTION = DescriptionBibliotheque.parse({
  id: "une-bibliotheque",
  nom: "Une bibliothèque",
  contenus: ["documents"],
  mots: {
    element: { un: "repère", plusieurs: "repères" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "page", plusieurs: "pages" },
  },
  schema: {
    cle: "un-schema",
    nom: "Un schéma",
    langue: "fr",
    version: 1,
    axes: [{ cle: "un-axe", nom: "Un axe", nature: "etiquettes", cardinalite: "plusieurs" }],
  },
});

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Une bibliothèque",
  mots: DESCRIPTION.mots,
  compteurs: [{ nombre: 2, mot: "repères" }],
  aVerifier: 1,
  filtres: [{ cle: "un-axe", nom: "Un axe", valeurs: [{ cle: "une-valeur", nom: "Une valeur", nombre: 1 }] }],
  pages: [
    {
      index: 1,
      numero: 1,
      elements: [{ ancreId: ID(20), numero: "1", page: 1, aVerifier: true }],
      texte: ["Une ligne lue."],
      traduction: [],
    },
  ],
  douteux: [
    {
      id: ID(30),
      nature: "lien",
      etat: "confiance",
      element: { ancreId: ID(20), numero: "1", page: 1, aVerifier: true },
      proposition: "repère 1 → plage 1",
      motif: "repère partiellement lu",
    },
  ],
});

const PASSAGES = [Passage.parse({ rang: 0, page: 1, texte: "Une ligne lue.", source: "couche_texte" })];

const VUE_AVEC_MEDIA = VueBibliotheque.parse({
  ...VUE,
  pages: [
    {
      ...VUE.pages[0],
      elements: [
        {
          ...VUE.pages[0]!.elements[0],
          media: {
            empreinte: "a".repeat(64),
            nom: "un-media.mp3",
            piste: 1,
            position: { segment: "connu", debut: 2, fin: 8, confiance: 1 },
            source: "/un-media.mp3",
            duree: 10,
          },
          pourquoi: { preuve: "lu", confiance: 1, phrase: "Lien lu dans le document" },
        },
      ],
    },
  ],
});

const ACCUEIL_GARNI = {
  bibliotheques: [
    {
      id: "une-bibliotheque",
      nom: "Une bibliothèque",
      href: "#catalogue",
      collection: "research" as const,
      icones: ["livre"] as const,
      compteurs: [{ nombre: 2, mot: "repères" }],
      hebergement: { libelle: "Sur cet ordinateur", icones: ["ordinateur"] as const },
      etat: { libelle: "Prêt" },
      ouverte: "il y a deux heures",
    },
  ],
  reprises: [
    {
      documentId: ID(1),
      titre: "Un document",
      href: "#lecteur/page=1",
      origine: [{ selecteur: { type: "page" as const, index: 1 } }],
      quand: "hier",
    },
  ],
};

const TRAVAIL = {
  id: ID(40),
  outil: { nom: "traitement-de-lot", version: "1.0.0" },
  versionCible: ID(41),
  etat: "en_cours" as const,
  lieu: "application" as const,
  poids: "lourd" as const,
  tentative: 1,
  progression: 0.5,
  creeLe: "2026-10-22T10:00:00.000Z",
  majLe: "2026-10-22T10:00:00.000Z",
  sujet: { nom: "un-document.pdf", contenu: "documents" as const },
  empreinteEntree: "a".repeat(64),
};

const gestes = (...noms: string[]): Gestes => Object.fromEntries(noms.map((nom) => [nom, vi.fn()]));

// ── Le filet, écran par écran ──────────────────────────────────────────────────────────────

describe("aucune porte peinte : chaque bouton visible mène quelque part", () => {
  it("l'accueil garni", async () => {
    await aucunBoutonInerte("Accueil", () => {
      const g = gestes("onFichiers", "onCreer", "onOuvrir");
      render(<Accueil donnees={ACCUEIL_GARNI} onFichiers={g["onFichiers"]!} onCreer={g["onCreer"]!} onOuvrir={g["onOuvrir"]!} />);
      return g;
    });
  });

  it("le premier lancement", async () => {
    await aucunBoutonInerte("Premier lancement", () => {
      const g = gestes("onCreer", "onFichiers", "onOuvrir");
      render(<PremierLancement theme="light" onCreer={g["onCreer"]!} onFichiers={g["onFichiers"]!} onOuvrir={g["onOuvrir"]!} />);
      return g;
    });
  });

  it("créer une bibliothèque", async () => {
    await aucunBoutonInerte("Créer", () => {
      const g = gestes("onCreer", "onAnnuler", "onChoisirDossier");
      render(
        <Creer
          modeles={[]}
          prises={[]}
          onCreer={g["onCreer"]!}
          onAnnuler={g["onAnnuler"]!}
          onChoisirDossier={g["onChoisirDossier"]!}
        />,
      );
      return g;
    });
  });

  it("l'organisation", async () => {
    await aucunBoutonInerte("Organisation", () => {
      const g = gestes("onSchema", "onValider");
      render(<Organisation description={DESCRIPTION} onSchema={g["onSchema"]!} onValider={g["onValider"]!} />);
      return g;
    });
  });

  it("le dépôt", async () => {
    await aucunBoutonInerte("Dépôt", () => {
      const g = gestes("onParcourir", "onFichiers", "onAction", "onVerifier", "onRetirer", "onDoublons", "onManiere");
      render(
        <Depot
          description={DESCRIPTION}
          travaux={[TRAVAIL]}
          onParcourir={g["onParcourir"]!}
          onFichiers={g["onFichiers"]!}
          onAction={g["onAction"]!}
          onVerifier={g["onVerifier"]!}
          onRetirer={g["onRetirer"]!}
          onDoublons={g["onDoublons"]!}
          onManiere={g["onManiere"]!}
        />,
      );
      return g;
    });
  });

  it("la manière de lire", async () => {
    await aucunBoutonInerte("Manière de lire", () => {
      const g = gestes("onBrouillon", "onEssayer", "onEnregistrer", "onAutresPages");
      render(
        <ManiereDeLire
          description={DESCRIPTION}
          document="un-document.pdf"
          pages={[{ rang: 0, image: "data:image/webp;base64,AA" }]}
          brouillon={{ ...BROUILLON_NEUF, zones: [{ cle: "z1", role: "element", rectangle: { x: 0.1, y: 0.1, l: 0.2, h: 0.2 } }] }}
          onBrouillon={g["onBrouillon"]!}
          onEssayer={g["onEssayer"]!}
          onEnregistrer={g["onEnregistrer"]!}
          onAutresPages={g["onAutresPages"]!}
        />,
      );
      return g;
    });
  });

  it("vérifier", async () => {
    await aucunBoutonInerte("Vérifier", () => {
      const g = gestes("onDecision", "onAnnuler");
      render(<Verifier vue={VUE} onDecision={g["onDecision"]!} onAnnuler={g["onAnnuler"]!} />);
      return g;
    });
  });

  it("le catalogue", async () => {
    await aucunBoutonInerte("Catalogue", () => {
      // Les gestes facultatifs sont donnés, et c'est exprès : un bouton qu'on ne monte pas est
      // un bouton que le filet n'éprouve pas, et « Chercher les doublons » n'apparaît que si son
      // geste est là.
      const g = gestes("onPage", "onLecteur", "onAjouter", "onDocument", "onDoublons");
      render(
        <Catalogue
          vue={VUE}
          onPage={g["onPage"]!}
          onLecteur={g["onLecteur"]!}
          onAjouter={g["onAjouter"]!}
          onDocument={g["onDocument"]!}
          onDoublons={g["onDoublons"]!}
        />,
      );
      return g;
    });
  });

  it("la lecture du texte", async () => {
    await aucunBoutonInerte("Lecture du texte", () => {
      const g = gestes("onPage");
      render(<LectureDuTexte vue={VUE} passages={[...PASSAGES, Passage.parse({ rang: 1, page: 2, texte: "Deux.", source: "couche_texte" })]} page={1} onPage={g["onPage"]!} />);
      return g;
    });
  });

  it("retirer une bibliothèque", async () => {
    await aucunBoutonInerte("Retirer", () => {
      const g = gestes("onOublier", "onSupprimer", "onAnnuler");
      render(
        <Retirer
          nom="Une bibliothèque"
          racine="/quelque/part"
          onOublier={g["onOublier"]!}
          onSupprimer={g["onSupprimer"]!}
          onAnnuler={g["onAnnuler"]!}
        />,
      );
      return g;
    });
  });

  /** L'écran des doublons avec une vraie trouvaille : c'est garni qu'il porte ses boutons.
   *
   *  Monté vide, il n'offre que « Chercher les doublons » — et le filet ne verrait donc jamais
   *  les boutons de retrait, qui sont pourtant les seuls à toucher à la bibliothèque. On lui
   *  donne un groupe de deux et un document trop maigre, soit toutes ses sections.
   *
   *  Le bouton « Retirer » s'arme avant de retirer : il ne doit donc pas appeler son geste au
   *  premier clic, mais il doit changer l'écran — et le filet accepte l'un comme l'autre, parce
   *  que c'est bien là mener quelque part. */
  it("ce qui se trouve deux fois", async () => {
    await aucunBoutonInerte("Doublons", () => {
      const g = gestes("onChercher", "onRetirer", "onRetour");
      const suspect = (empreinte: string, nom: string, mots: number) => ({
        empreinte: empreinte.padEnd(64, "0"),
        nom,
        pages: 40,
        passages: 40,
        mots,
        octets: 2_200_000,
      });
      render(
        <Doublons
          nom="Une bibliothèque"
          onChercher={g["onChercher"]!}
          onRetirer={g["onRetirer"]!}
          onRetour={g["onRetour"]!}
          trouves={{
            groupes: [
              {
                documents: [suspect("aa", "Un exposé, deux par feuille.pdf", 2729), suspect("bb", "Un exposé, trois par feuille.pdf", 2729)],
                ressemblance: 0.984,
              },
            ],
            tropPeuDeTexte: [suspect("cc", "Des feuilles numérisées.pdf", 141)],
          }}
        />,
      );
      return g;
    });
  });

  it("les réglages", async () => {
    await aucunBoutonInerte("Réglages", () => {
      const g = gestes("onThemeChange");
      render(<Reglages theme="light" onThemeChange={g["onThemeChange"]!} />);
      return g;
    });
  });

  it("l'en-tête, qui est sur tous les écrans", async () => {
    // Il portait deux boutons sans gestionnaire — « Notifications » et le compte —, visibles sur
    // chaque écran d'une bibliothèque garnie. Le filet ne le couvrait pas : c'est corrigé.
    await aucunBoutonInerte("En-tête", () => {
      const g = gestes("onRecherche", "onThemeChange");
      render(
        <EnTete
          theme="light"
          onThemeChange={g["onThemeChange"]!}
          onRecherche={g["onRecherche"]!}
          donnees={{ ...ACCUEIL_GARNI, aVerifier: { nombre: 2, bibliotheque: "Une bibliothèque", href: "#verifier" }, compte: { initiales: "CB", nom: "Christophe" } }}
          enTraitement={1}
        />,
      );
      return g;
    });
  });

  it("entrer", async () => {
    await aucunBoutonInerte("Entrer", () => {
      const g = gestes("onEntre");
      render(<Entrer onEntre={g["onEntre"]!} />);
      return g;
    });
  });

  it("le Lecteur", async () => {
    await aucunBoutonInerte("Lecteur", () => {
      const g = gestes("onPage", "onElement", "onTraduire");
      g["onTraduire"]!.mockResolvedValue({
        etat: "traduite",
        page: 1,
        langueSource: "en",
        langueCible: "fr",
        traduction: ["Une ligne traduite."],
        automatique: true,
        cache: "cree",
        modele: "@cf/meta/m2m100-1.2b",
      });
      render(
        <Lecteur
          vue={VUE}
          page={1}
          element={ID(20)}
          onPage={g["onPage"]!}
          onElement={g["onElement"]!}
          onTraduire={g["onTraduire"]!}
        />,
      );
      return g;
    });
  });

  it("la recherche", async () => {
    await aucunBoutonInerte("Recherche", () => {
      const g = gestes("onFermer", "onOuvrir", "onEcouter", "onAction");
      render(
        <Recherche
          vue={VUE}
          passages={PASSAGES}
          requeteInitiale="ligne"
          onFermer={g["onFermer"]!}
          onOuvrir={g["onOuvrir"]!}
          onEcouter={g["onEcouter"]!}
          onAction={g["onAction"]!}
        />,
      );
      return g;
    });
  });

  it("le panneau d'écoute", async () => {
    await aucunBoutonInerte("Panneau d'écoute", () => {
      const g = gestes("onLecture", "onBoucle", "onTempo", "onPrecedent", "onSuivant");
      render(
        <PanneauEcoute
          element={VUE_AVEC_MEDIA.pages[0]!.elements[0]!}
          mots={VUE_AVEC_MEDIA.mots}
          segments={[{ debut: 2, fin: 8, libelle: "1", actif: true }]}
          dureeS={10}
          positionS={2}
          ecoute={{
            disponible: true,
            enPanne: false,
            enLecture: false,
            positionS: 2,
            dureeS: 10,
            basculer: g["onLecture"]!,
            arreter: vi.fn(),
          }}
          boucle={false}
          tempo={75}
          onLecture={g["onLecture"]!}
          onBoucle={g["onBoucle"]!}
          onTempo={g["onTempo"]!}
          onPrecedent={g["onPrecedent"]!}
          onSuivant={g["onSuivant"]!}
        />,
      );
      return g;
    });
  });

  it("le bouton de traduction", async () => {
    await aucunBoutonInerte("Traduction", () => {
      const g = gestes("onTraduire");
      g["onTraduire"]!.mockResolvedValue({
        etat: "traduite",
        page: 1,
        langueSource: "en",
        langueCible: "fr",
        traduction: ["Une ligne traduite."],
        automatique: true,
        cache: "cree",
        modele: "@cf/meta/m2m100-1.2b",
      });
      render(<TextePage original={["One translated line."]} traduction={[]} onTraduire={g["onTraduire"]!} />);
      return g;
    });
  });
});

/** Un lien se lit, il ne se presse pas : jsdom ne navigue pas, et le presser ne prouverait rien.
 *  Ce qu'on exige de lui est plus simple et tout aussi décisif — qu'il désigne un endroit. */
describe("aucun lien ne pointe sur place", () => {
  const liensDe = (): HTMLElement[] => screen.queryAllByRole("link");

  it("sur les écrans qui en portent", () => {
    for (const [nom, monter] of [
      ["Accueil", () => render(<Accueil donnees={ACCUEIL_GARNI} onFichiers={vi.fn()} onCreer={vi.fn()} onOuvrir={vi.fn()} />)],
      ["Catalogue", () => render(<Catalogue vue={VUE} onPage={vi.fn()} onLecteur={vi.fn()} onAjouter={vi.fn()} />)],
      ["Vérifier", () => render(<Verifier vue={VUE} onDecision={vi.fn()} onAnnuler={vi.fn()} />)],
    ] as const) {
      monter();
      for (const lien of liensDe()) {
        const href = lien.getAttribute("href") ?? "";
        expect(href, `${nom} — le lien « ${nommer(lien)} » ne désigne aucun endroit`).not.toBe("");
      }
      cleanup();
    }
  });
});

/** Le filet attrape-t-il vraiment ? (même précaution que `styles.test.ts`)
 *
 *  Un garde-fou qu'on n'a jamais vu refuser quelque chose est un garde-fou dont on suppose qu'il
 *  garde. On lui donne donc une porte peinte — un bouton sans gestionnaire, exactement le défaut
 *  du 21 octobre — et l'on exige qu'il la refuse. */
describe("le filet refuse bien une porte peinte", () => {
  it("un bouton sans gestionnaire est signalé", async () => {
    const PortePeinte = (): JSX.Element => (
      <main>
        <button type="button">Créer ma première bibliothèque</button>
      </main>
    );
    await expect(
      aucunBoutonInerte("Écran d'essai", () => {
        render(<PortePeinte />);
        return {};
      }),
    ).rejects.toThrow(/ne mène nulle part/);
  });

  it("et laisse passer un bouton qui appelle son geste", async () => {
    const Porte = ({ onPousser }: { onPousser: () => void }): JSX.Element => (
      <main>
        <button type="button" onClick={onPousser}>
          Une vraie porte
        </button>
      </main>
    );
    await expect(
      aucunBoutonInerte("Écran d'essai", () => {
        const g = { onPousser: vi.fn() };
        render(<Porte onPousser={g.onPousser} />);
        return g;
      }),
    ).resolves.toBeUndefined();
  });

  it("et laisse passer un bouton qui ne change que l'écran", async () => {
    // Un dépliant ne parle à personne : il se gouverne lui-même, et c'est légitime.
    const Depliant = (): JSX.Element => {
      const [ouvert, setOuvert] = useState(false);
      return (
        <main>
          <button type="button" onClick={() => setOuvert(!ouvert)}>
            Déplier
          </button>
          {ouvert ? <p>Le contenu déplié.</p> : null}
        </main>
      );
    };
    await expect(
      aucunBoutonInerte("Écran d'essai", () => {
        render(<Depliant />);
        return {};
      }),
    ).resolves.toBeUndefined();
  });
});
