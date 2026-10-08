import { useState, type JSX } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bouton, Progression } from "../composants/index.js";
import "./Prototype.css";

type Mesure = { readonly nom: string; readonly resultat: string };

type MesurePdf = { pages: number; octets: number; ms_ouverture: number; ms_page: number };
type MesureOcr = { version: string; texte: string; ms: number };
type Servi = { url: string; octets: number; port: number };

const mo = (octets: number): string => `${(octets / 1_000_000).toFixed(2)} Mo`;

/** Panneau de mesure du lot 0 : il sert à décider du socle, pas à l'usage quotidien. */
export function Prototype(): JSX.Element {
  const [mesures, setMesures] = useState<readonly Mesure[]>([]);
  const [media, setMedia] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);

  const ajouter = (nom: string, resultat: string): void =>
    setMesures((anciennes) => [...anciennes.filter((m) => m.nom !== nom), { nom, resultat }]);

  const mesurer = async (nom: string, action: () => Promise<string>): Promise<void> => {
    setOccupe(nom);
    try {
      ajouter(nom, await action());
    } catch (erreur) {
      ajouter(nom, `échec : ${String(erreur)}`);
    } finally {
      setOccupe(null);
    }
  };

  const chemins = async (): Promise<Record<string, string>> => invoke<Record<string, string>>("fixtures");

  return (
    <section className="ln-prototype" aria-labelledby="titre-prototype">
      <h2 id="titre-prototype" className="ln-accueil__titre ln-panneau-titre">
        Prototype bureau — mesures du lot 0
      </h2>
      <p className="ln-muted">
        Quatre capacités à éprouver avant de décider du socle. Les résultats sont consignés dans
        docs/decisions.md ; la décision reste à prendre.
      </p>

      <div className="ln-row">
        <Bouton
          chargement={occupe === "PDF"}
          onClick={() =>
            void mesurer("PDF", async () => {
              const fichiers = await chemins();
              const chemin = fichiers["500-pages-scan.pdf"] ?? fichiers["500-pages.pdf"];
              if (chemin === undefined) return "fixture absente";
              const m = await invoke<MesurePdf>("ouvrir_pdf", { chemin });
              return `${m.pages} pages, ${mo(m.octets)}, ouverture ${m.ms_ouverture} ms, page ${m.ms_page} ms`;
            })
          }
        >
          Ouvrir un PDF de 500 pages
        </Bouton>

        <Bouton
          chargement={occupe === "Sidecar"}
          onClick={() =>
            void mesurer("Sidecar", async () => {
              const chemin = (await chemins())["page-ocr.png"];
              if (chemin === undefined) return "fixture absente";
              const m = await invoke<MesureOcr>("lancer_ocr", { chemin, langue: "fra" });
              return `${m.version}, ${m.ms} ms — « ${m.texte.split("\n")[0] ?? ""} »`;
            })
          }
        >
          Lancer le sidecar Tesseract
        </Bouton>

        <Bouton
          chargement={occupe === "Lecture par plages"}
          onClick={() =>
            void mesurer("Lecture par plages", async () => {
              const chemin = (await chemins())["piste.mp3"];
              if (chemin === undefined) return "fixture absente";
              const servi = await invoke<Servi>("servir_media", { chemin });
              setMedia(servi.url);
              return `${mo(servi.octets)} servis sur ${servi.url}`;
            })
          }
        >
          Servir un MP3 par plages
        </Bouton>

        <Bouton
          chargement={occupe === "Plages servies"}
          onClick={() =>
            void mesurer("Plages servies", async () => `${await invoke<number>("plages_servies")} requêtes en 206`)
          }
        >
          Compter les plages servies
        </Bouton>
      </div>

      {media === null ? null : (
        <p className="ln-prototype__lecteur">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- piste de mesure, sans parole */}
          <audio controls src={media} preload="none">
            Votre navigateur ne lit pas l’audio.
          </audio>
        </p>
      )}

      <Progression
        valeur={mesures.length / 4}
        etiquette="Mesures du prototype"
        complement={`${mesures.length} sur 4`}
      />

      <dl className="ln-prototype__mesures">
        {mesures.map((mesure) => (
          <div key={mesure.nom}>
            <dt>{mesure.nom}</dt>
            <dd className="ln-muted">{mesure.resultat}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
