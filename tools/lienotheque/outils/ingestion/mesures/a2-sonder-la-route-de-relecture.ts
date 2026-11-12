/** Quel statut la route de relecture rend, et rien d'autre (A2, OUT-08).
 *
 *  Né d'un défaut d'instrumentation : le 12 novembre 2026, l'étage distant a compté **40 pannes
 *  sur 62 demandes** au cours d'un document réel, et la chaîne les avait avalées — on savait
 *  qu'elles avaient eu lieu, pas pourquoi. **Une panne dont la cause est perdue ne se répare
 *  pas.**
 *
 *  Ce banc envoie **une** zone minuscule et rapporte le statut. Le jeton est lu par le trousseau,
 *  dans ce processus, et n'est jamais affiché — ce qui est imprimé est un statut et un message de
 *  notre propre route, qui ne porte aucun secret.
 *
 *  Usage : tsx mesures/a2-sonder-la-route-de-relecture.ts <adresse du Worker> [combien]
 */
import { DemandeVision } from "@lienotheque/contrats";
import { encoderWebp } from "@lienotheque/images";
import { empreinteDuRecadrage, jetonDacces, rvbaDepuisGris, transportVersWorker } from "@lienotheque/vision";

const [adresse, combienBrut] = process.argv.slice(2) as [string, string | undefined];
if (adresse === undefined) {
  console.error("usage : a2-sonder-la-route-de-relecture.ts <adresse du Worker> [combien]");
  process.exit(2);
}
const combien = Number(combienBrut ?? "1");

async function principal(): Promise<void> {
  const jeton = jetonDacces();
  if (jeton === undefined) {
    console.error("aucun jeton dans le trousseau : rien à sonder");
    process.exit(3);
  }
  const transport = transportVersWorker(adresse, jeton);

  // Un carré de 64 × 32, un trait sombre au milieu : assez pour que la route ait quelque chose à
  // lire, assez petit pour que la sonde coûte le minimum.
  const largeur = 64;
  const hauteur = 32;
  const pixels = Uint8Array.from({ length: largeur * hauteur }, (_, rang) =>
    Math.floor(rang / largeur) > 12 && Math.floor(rang / largeur) < 20 ? 20 : 240,
  );
  const octets = await encoderWebp(rvbaDepuisGris({ largeur, hauteur, pixels }), { lossless: 1 });

  for (let essai = 1; essai <= combien; essai += 1) {
    const demande = DemandeVision.parse({
      alphabet: "chiffres",
      zones: [
        {
          empreinte: empreinteDuRecadrage(octets),
          image: octets.toString("base64"),
          typeMime: "image/webp",
          largeur,
          hauteur,
          cherche: "numero",
        },
      ],
    });
    const depart = Date.now();
    try {
      const reponse = await transport(demande);
      console.log(
        `essai ${essai} : OK en ${Date.now() - depart} ms · ${JSON.stringify(reponse.zones)} · jetons ${JSON.stringify(reponse.jetons)}`,
      );
    } catch (leve) {
      const statut = (leve as { statut?: number }).statut;
      console.log(
        `essai ${essai} : REFUS en ${Date.now() - depart} ms · statut ${statut ?? "inconnu"} · ${leve instanceof Error ? leve.message : String(leve)}`,
      );
    }
  }
}

void principal();
