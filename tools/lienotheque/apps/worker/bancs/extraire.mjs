// Extrait du relevé de `voie-c.mjs` les octets exacts de la cérémonie, pour les soumettre au
// banc workerd — et, à l'étape 4.4, aux tests.
//
//   node apps/worker/bancs/voie-c.mjs | node apps/worker/bancs/extraire.mjs
//
// ou bien, depuis un relevé déjà écrit :
//
//   node apps/worker/bancs/extraire.mjs < releve.json

import { writeFileSync } from "node:fs";

// L'entrée se lit en flux, et non par son descripteur : sur un tube, une lecture synchrone
// échoue en EAGAIN dès que l'écrivain n'a pas encore tout écrit.
const morceaux = [];
for await (const morceau of process.stdin) morceaux.push(morceau);
const entree = JSON.parse(Buffer.concat(morceaux).toString("utf8"));
const mene = entree.find((m) => m.enrolement !== null && m.enrolement !== undefined);
if (mene === undefined) {
  console.error("aucun navigateur n'a mené la cérémonie : rien à extraire");
  process.exit(1);
}

const charge = {
  _provenance: `${mene.navigateur}, authentificateur virtuel CTAP2, origine localhost`,
  _rappel: "aucune clé privée ici : elle n'a jamais quitté l'authentificateur, qui n'existe plus",
  spki: mene.enrolement.clePublique,
  donneesAuthentificateur: mene.authentification.donneesAuthentificateur,
  donneesClient: mene.authentification.donneesClient,
  signature: mene.authentification.signature,
};

const sortie = new URL("ceremonie-mesuree.json", import.meta.url);
writeFileSync(sortie, `${JSON.stringify(charge, null, 2)}\n`);
console.error(`octets de ${mene.navigateur} écrits dans ceremonie-mesuree.json`);
