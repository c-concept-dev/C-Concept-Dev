/** Ce qu'une relecture ciblée coûterait vraiment, en jetons (OUT-08, REC-04).
 *
 *  On ne pose pas un plafond sur une estimation. Cette mesure appelle la route de comptage du
 *  Worker — qui ne dépense rien, le comptage des jetons est gratuit — sur les **vrais** pavés
 *  retenus par la sélection, et à plusieurs échelles.
 *
 *  L'échelle est la question ouverte : un pavé de F4 fait environ 75 × 80 pixels, et un modèle
 *  découpe une image en tuiles de quelques dizaines de pixels. Agrandir n'ajoute aucune
 *  information, mais peut changer ce que le modèle voit — et cela se paie. On mesure donc le prix
 *  de chaque échelle avant de choisir ; la justesse de chacune se mesurera à part, en dépensant.
 *
 *  Le jeton d'accès est lu au moment de l'appel — environnement d'abord, trousseau du système
 *  ensuite — gardé en mémoire seulement, et jamais affiché. La clé du modèle n'est pas ici : elle
 *  est dans le Worker, et c'est tout l'intérêt.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/jetons-f4.ts <url>
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { DemandeVision, EstimationVision, ZONES_MAX_PAR_APPEL } from "@lienotheque/contrats";
import { agrandir, type ImageGrise } from "@lienotheque/images";
import { jetonDacces, recadrerPour, type Candidat } from "../src/index.js";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const JETON = jetonDacces();
if (JETON === undefined) {
  console.log("Aucun jeton : ni dans l'environnement, ni dans le trousseau. Rien n'a été appelé.");
  process.exit(0);
}

/** Les échelles éprouvées. 1 est la résolution d'origine ; au-delà, on agrandit sans rien ajouter. */
const ECHELLES = [1, 2, 4] as const;

/** Tarif de Claude Haiku 4.5, en dollars par million de jetons. Déclaré ici parce qu'il ne vient
 *  d'aucune mesure : c'est un prix affiché, et il change sans nous. */
const DOLLARS_PAR_MILLION_ENTREE = 1;
const DOLLARS_PAR_MILLION_SORTIE = 5;
/** Jetons de sortie observés par zone : le formulaire est court — une empreinte, un nombre, une
 *  confiance. Mesuré à part, il ne dépend pas de l'échelle. */
const SORTIE_PAR_ZONE = 30;

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const releve = join(coin(cache, "vision-candidats"), "paves.json");
if (!existsSync(releve)) {
  console.log(`Pavés absents : lancez d'abord la sélection (mesures/candidats-f4.ts).`);
  process.exit(0);
}

type Pave = { numero: number; cliche: number; cote: string; motif: string; largeur: number; hauteur: number; pixels: string };
const paves = JSON.parse(readFileSync(releve, "utf8")) as Pave[];
console.log(`Pavés retenus par la sélection : ${paves.length}`);

const imageDe = (pave: Pave): ImageGrise => ({
  largeur: pave.largeur,
  hauteur: pave.hauteur,
  pixels: new Uint8Array(Buffer.from(pave.pixels, "base64")),
});

/** Un candidat factice : `recadrerPour` ne veut qu'une boîte, et le pavé est déjà découpé. */
const candidatDe = (image: ImageGrise): Candidat => ({
  page: 0,
  numero: 0,
  motif: "lecture_incomplete",
  repere: { x: 0, y: 0, l: image.largeur, h: image.hauteur },
  recadrage: { x: 0, y: 0, l: image.largeur, h: image.hauteur },
});

const compter = async (demande: DemandeVision): Promise<EstimationVision> => {
  const reponse = await fetch(`${BASE}/vision/jetons`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` },
    body: JSON.stringify(demande),
  });
  if (!reponse.ok) throw new Error(`Comptage refusé : statut ${reponse.status} — ${await reponse.text()}`);
  return EstimationVision.parse(await reponse.json());
};

console.log(`\nWorker interrogé : ${BASE}`);
console.log(`\n${"échelle".padEnd(8)}${"côtés".padStart(12)}${"octets/pavé".padStart(13)}${"jetons/pavé".padStart(13)}${"lot de 184".padStart(12)}${"coût".padStart(11)}`);

const releves: { echelle: number; parPave: number; cote: string; octets: number }[] = [];

for (const echelle of ECHELLES) {
  const zones = [];
  let octets = 0;
  const cotes: number[] = [];
  for (const pave of paves) {
    const image = echelle === 1 ? imageDe(pave) : agrandir(imageDe(pave), echelle);
    const produit = await recadrerPour(image, candidatDe(image));
    if (produit === undefined) {
      console.log(`  pavé ${pave.numero} à ×${echelle} : refusé par le contrat (trop grand)`);
      continue;
    }
    zones.push(produit.zone);
    octets += produit.octets.length;
    cotes.push(Math.max(produit.zone.largeur, produit.zone.hauteur));
  }
  if (zones.length === 0) continue;

  // Par paquets de ce qu'un appel transporte : la consigne compte une fois par appel, et c'est
  // justement ce que la mise en cache des invites doit amortir.
  let jetons = 0;
  for (let debut = 0; debut < zones.length; debut += ZONES_MAX_PAR_APPEL) {
    const demande = DemandeVision.parse({ alphabet: "chiffres", zones: zones.slice(debut, debut + ZONES_MAX_PAR_APPEL) });
    jetons += (await compter(demande)).jetonsEntree;
  }

  const parPave = jetons / zones.length;
  const lot = 184;
  const dollars = ((parPave * lot) / 1e6) * DOLLARS_PAR_MILLION_ENTREE + ((SORTIE_PAR_ZONE * lot) / 1e6) * DOLLARS_PAR_MILLION_SORTIE;
  releves.push({ echelle, parPave, cote: `${Math.min(...cotes)}–${Math.max(...cotes)}`, octets: Math.round(octets / zones.length) });
  console.log(
    `×${String(echelle).padEnd(7)}${`${Math.min(...cotes)}–${Math.max(...cotes)}`.padStart(12)}${String(Math.round(octets / zones.length)).padStart(13)}` +
      `${parPave.toFixed(1).padStart(13)}${String(Math.round(parPave * lot)).padStart(12)}${`${dollars.toFixed(4)} $`.padStart(11)}`,
  );
}

// Le coût fixe d'un appel : la consigne et le schéma de l'outil sont les mêmes à chaque fois, et
// c'est justement ce que la mise en cache des invites doit amortir. On le mesure en comparant un
// appel d'une zone à un appel plein.
if (paves.length > 1) {
  const une = imageDe(paves[0]!);
  const seule = await recadrerPour(une, candidatDe(une));
  if (seule !== undefined) {
    const unAppel = await compter(DemandeVision.parse({ alphabet: "chiffres", zones: [seule.zone] }));
    console.log(`\nCoût fixe d'un appel : ${unAppel.jetonsEntree} jetons pour une seule zone de ${seule.zone.largeur}×${seule.zone.hauteur} px.`);
  }
}

console.log(`\nLecture : le lot entier compte environ 184 pavés (mesuré sur les treize clichés).`);
console.log(`Les coûts supposent ${SORTIE_PAR_ZONE} jetons de sortie par pavé et le tarif affiché de Haiku 4.5`);
console.log(`(${DOLLARS_PAR_MILLION_ENTREE} $ et ${DOLLARS_PAR_MILLION_SORTIE} $ le million) ; la mise en cache de la consigne n'est pas comptée.`);
if (releves.length > 1) {
  const [un] = releves;
  for (const releve of releves.slice(1))
    console.log(`  ×${releve.echelle} coûte ${(releve.parPave / un!.parPave).toFixed(1)} fois ×1 par pavé.`);
}
