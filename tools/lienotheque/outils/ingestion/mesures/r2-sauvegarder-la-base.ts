/** La sauvegarde que R2-oracle exige, vérifiée par **empreinte de contenu**.
 *
 *  R2-oracle réécrit `base/` d'une vraie bibliothèque : `base/versions/<version>.json` reçoit un
 *  nouveau producteur et `base/actives.json` le désigne. Rien d'autre ne bouge — les originaux
 *  sont immuables et adressés par leur empreinte, les dérivés se refabriquent. **C'est donc
 *  `base/` qu'il faut pouvoir rendre à l'identique**, et c'est tout ce que ce script copie : 114
 *  Mo au lieu de 13 Go, sur le disque interne au lieu du volume amovible qui porte déjà
 *  l'original — une copie à côté de l'original ne sauve de rien.
 *
 *  **Vérifiée par empreinte de contenu, jamais par chemin, taille et date.** Cette forme faible a
 *  déjà trompé deux fois dans ce projet : elle a dit « identique » d'une copie différente, et elle
 *  a dit « différent » du même contenu, ce qui a coûté seize minutes d'océrisation (registre du
 *  5 novembre 2026). Une sauvegarde dont on n'a pas relu les octets n'est pas une sauvegarde.
 *
 *  Usage :
 *    tsx mesures/r2-sauvegarder-la-base.ts <racine-bibliothèque> <dossier-de-sauvegarde> [--a-blanc]
 *
 *  `--a-blanc` relève et compare sans rien écrire : c'est ainsi qu'on éprouve le script avant de
 *  le lancer pour de bon. Le script **refuse d'écrire dans un dossier qui existe déjà** — une
 *  sauvegarde qui en écrase une autre n'en laisse qu'une.
 *
 *  Il n'écrit JAMAIS dans la bibliothèque : il ne l'ouvre qu'en lecture. */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const arguments_ = process.argv.slice(2);
const aBlanc = arguments_.includes("--a-blanc");
const [racine, destination] = arguments_.filter((un) => !un.startsWith("--"));
if (racine === undefined || destination === undefined) {
  console.error("usage : r2-sauvegarder-la-base.ts <racine-bibliothèque> <dossier-de-sauvegarde> [--a-blanc]");
  process.exit(2);
}

const base = join(racine, "base");
if (!existsSync(join(base, "actives.json"))) {
  console.error(`« ${base} » ne porte pas de « actives.json » : ce n'est pas la base d'une bibliothèque.`);
  process.exit(2);
}
if (!aBlanc && existsSync(destination)) {
  console.error(`« ${destination} » existe déjà. Donnez un dossier neuf : on n'écrase pas une sauvegarde.`);
  process.exit(2);
}

/** L'empreinte d'un fichier, lue sur ses octets. */
const empreinteDe = (chemin: string): string =>
  createHash("sha256").update(readFileSync(chemin)).digest("hex");

/** Tous les fichiers sous un dossier, chemins relatifs, dans un ordre stable. */
function fichiersDe(dossier: string, prefixe = ""): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(join(dossier, prefixe), { withFileTypes: true }).sort((un, autre) =>
    un.name.localeCompare(autre.name),
  )) {
    const relatif = join(prefixe, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDe(dossier, relatif));
    else if (entree.isFile()) trouves.push(relatif);
  }
  return trouves;
}

const debut = Date.now();
const fichiers = fichiersDe(base);
const avant = new Map(fichiers.map((relatif) => [relatif, empreinteDe(join(base, relatif))] as const));
const octets = fichiers.reduce((somme, relatif) => somme + statSync(join(base, relatif)).size, 0);

/** L'empreinte de l'ensemble : les empreintes de chaque fichier, avec son chemin, dans l'ordre.
 *
 *  Un seul chiffre à consigner au registre, qui change si **n'importe quoi** change — un octet,
 *  un nom, un fichier en plus ou en moins. */
const empreinteDeLEnsemble = (etat: Map<string, string>): string => {
  const somme = createHash("sha256");
  for (const relatif of [...etat.keys()].sort()) somme.update(relatif).update("\0").update(etat.get(relatif)!).update("\n");
  return somme.digest("hex");
};

console.log(`Base lue : ${fichiers.length} fichiers, ${(octets / 1e6).toFixed(1)} Mo, en ${((Date.now() - debut) / 1000).toFixed(1)} s`);
console.log(`Empreinte de l'ensemble, AVANT : ${empreinteDeLEnsemble(avant)}`);

if (aBlanc) {
  console.log("\n--a-blanc : rien n'a été écrit. Le relevé ci-dessus est ce que la sauvegarde copierait.");
  process.exit(0);
}

for (const relatif of fichiers) {
  const vers = join(destination, relatif);
  mkdirSync(dirname(vers), { recursive: true });
  copyFileSync(join(base, relatif), vers);
}

// La vérification : on relit les octets **écrits**, et on les compare un à un. Une copie dont on
// n'a relu que la taille est une copie dont on ne sait rien.
const apres = new Map(fichiers.map((relatif) => [relatif, empreinteDe(join(destination, relatif))] as const));
const differents = fichiers.filter((relatif) => avant.get(relatif) !== apres.get(relatif));
const enTrop = fichiersDe(destination).filter((relatif) => !avant.has(relatif));

const manifeste = {
  bibliotheque: racine,
  sauvegardee_le: new Date().toISOString(),
  fichiers: fichiers.length,
  octets,
  empreinte_de_l_ensemble: empreinteDeLEnsemble(avant),
  empreinte_relue: empreinteDeLEnsemble(apres),
  verifiee: differents.length === 0 && enTrop.length === 0,
  par_fichier: Object.fromEntries([...avant]),
};
// Le manifeste reste **à côté de la sauvegarde**, hors du dépôt : il nomme les documents d'une
// vraie bibliothèque. Seule l'empreinte de l'ensemble se consigne au registre.
writeFileSync(join(destination, "MANIFESTE.json"), `${JSON.stringify(manifeste, null, 1)}\n`);

console.log(`Empreinte de l'ensemble, RELUE : ${manifeste.empreinte_relue}`);
console.log(`Durée : ${((Date.now() - debut) / 1000).toFixed(1)} s`);
if (manifeste.verifiee) {
  console.log(`\nSauvegarde VÉRIFIÉE : ${fichiers.length} fichiers relus octet pour octet, aucun écart.`);
  console.log(`  ${destination}`);
  process.exit(0);
}
console.error(`\nSauvegarde NON vérifiée : ${differents.length} fichier(s) différent(s), ${enTrop.length} en trop.`);
for (const relatif of [...differents, ...enTrop].slice(0, 20)) console.error(`  ${relative(base, join(base, relatif))}`);
process.exit(1);
