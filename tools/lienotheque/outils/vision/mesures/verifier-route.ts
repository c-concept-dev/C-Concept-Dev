/** La route de relecture, éprouvée sans rien dépenser (OUT-08, SEC-01).
 *
 *  Quatre contrôles : la santé, le refus sans jeton, le refus avec un mauvais jeton, et une
 *  réponse conforme au contrat avec le bon. Le dernier passe par le comptage des jetons, qui est
 *  gratuit — on éprouve la porte et le contrat, pas la lecture.
 *
 *  Et l'on cherche dans chaque réponse ce qui ne doit jamais y être. Une précision honnête : la
 *  clé du modèle, nous ne l'avons pas, donc nous ne pouvons pas la chercher littéralement. On
 *  cherche sa **forme** — le préfixe d'une clé Anthropic — et l'on cherche le jeton d'accès, que
 *  ce script tient en mémoire. Un troisième filet est dans les tests du Worker, où la clé est
 *  connue parce qu'elle est inventée.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/verifier-route.ts <url>
 */
import { DemandeVision, EstimationVision, EtatService } from "@lienotheque/contrats";
import { encoderWebp } from "@lienotheque/images";
import { empreinteDuRecadrage, rvbaDepuisGris } from "../src/index.js";
import { jetonDacces } from "../src/index.js";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (base === "") {
  console.log("Adresse du Worker attendue en premier argument.");
  process.exit(1);
}
const jeton = jetonDacces();
if (jeton === undefined) {
  console.log("Aucun jeton : ni dans l'environnement, ni dans le trousseau. Rien n'a été appelé.");
  process.exit(1);
}

/** Un pavé minuscule mais **réellement** encodé : on éprouve la route, pas la lecture.
 *
 *  Une image inventée ne suffit pas — l'API du modèle refuse ce qui n'est pas une image, et la
 *  route rend alors un 502 qui ressemble à une panne alors que c'est la demande qui était fausse.
 *  On encode donc un vrai rectangle, à la taille d'un vrai pavé. */
const paveDEssai = async (): Promise<DemandeVision> => {
  const largeur = 80;
  const hauteur = 85;
  // Un fond sombre et deux barres claires : la forme d'un repère, sans en être un.
  const pixels = new Uint8Array(largeur * hauteur).fill(40);
  for (let y = 20; y < 65; y += 1) for (const x of [28, 29, 30, 48, 49, 50]) pixels[y * largeur + x] = 230;
  const octets = await encoderWebp(rvbaDepuisGris({ largeur, hauteur, pixels }), { lossless: 1 });
  return DemandeVision.parse({
    alphabet: "chiffres",
    zones: [
      {
        empreinte: empreinteDuRecadrage(octets),
        image: octets.toString("base64"),
        typeMime: "image/webp",
        largeur,
        hauteur,
        attendu: { min: 1, max: 92 },
      },
    ],
  });
};

type Resultat = { nom: string; attendu: string; obtenu: string; juste: boolean; corps: string; entetes: string };

const appeler = async (chemin: string, options: { jeton?: string; corps?: unknown } = {}): Promise<{ statut: number; corps: string; entetes: string }> => {
  const reponse = await fetch(`${base}${chemin}`, {
    ...(options.corps === undefined ? {} : { method: "POST", body: JSON.stringify(options.corps) }),
    headers: {
      "content-type": "application/json",
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
  });
  return { statut: reponse.status, corps: await reponse.text(), entetes: [...reponse.headers].map(([nom, valeur]) => `${nom}: ${valeur}`).join("\n") };
};

const demande = await paveDEssai();

const resultats: Resultat[] = [];
const noter = (nom: string, attendu: string, obtenu: string, juste: boolean, vue: { corps: string; entetes: string }): void => {
  resultats.push({ nom, attendu, obtenu, juste, corps: vue.corps, entetes: vue.entetes });
  console.log(`  ${juste ? "✓" : "✗"} ${nom.padEnd(46)} attendu ${attendu.padEnd(22)} obtenu ${obtenu}`);
};

console.log(`Worker : ${base}\n`);
console.log("Contrôles de la porte et du contrat :");

const sante = await appeler("/sante");
const etat = EtatService.safeParse(JSON.parse(sante.corps || "{}"));
noter("santé : conforme à son contrat", "200 + contrat", `${sante.statut} + ${etat.success ? "contrat" : "hors contrat"}`, sante.statut === 200 && etat.success, sante);
if (etat.success) console.log(`      service « ${etat.data.service} » version ${etat.data.version}, capacités : ${etat.data.capacites.join(", ")}`);

const sans = await appeler("/vision", { corps: demande });
noter("sans jeton : refusé", "401", String(sans.statut), sans.statut === 401, sans);

// Un mauvais jeton de la même longueur que le bon : la comparaison ne doit pas se décider dessus.
const mauvais = await appeler("/vision", { jeton: "z".repeat(jeton.length), corps: demande });
noter("mauvais jeton, même longueur : refusé", "401", String(mauvais.statut), mauvais.statut === 401, mauvais);

const court = await appeler("/vision", { jeton: "trop-court", corps: demande });
noter("mauvais jeton, autre longueur : refusé", "401", String(court.statut), court.statut === 401, court);

const horsContrat = await appeler("/vision", { jeton, corps: { alphabet: "lettres", zones: [] } });
noter("demande hors contrat : refusée", "400", String(horsContrat.statut), horsContrat.statut === 400, horsContrat);

// Le bon jeton, sur le comptage : gratuit, et il rend une réponse validée par son contrat.
const compte = await appeler("/vision/jetons", { jeton, corps: demande });
const estimation = EstimationVision.safeParse(JSON.parse(compte.corps || "{}"));
noter(
  "bon jeton : réponse conforme au contrat",
  "200 + contrat",
  `${compte.statut} + ${estimation.success ? "contrat" : "hors contrat"}`,
  compte.statut === 200 && estimation.success,
  compte,
);
if (estimation.success) console.log(`      ${estimation.data.zones} zone(s), ${estimation.data.jetonsEntree} jetons d'entrée — rien n'a été dépensé`);
else console.log(`      corps rendu : ${compte.corps.slice(0, 200)}`);

const inconnue = await appeler("/vision/inexistante", { jeton });
noter("route inconnue : refusée", "404", String(inconnue.statut), inconnue.statut === 404, inconnue);

console.log(`\nCe qu'aucune réponse ne doit porter :`);
let propre = true;
for (const resultat of resultats) {
  const cherchable = `${resultat.corps}\n${resultat.entetes}`;
  if (cherchable.includes(jeton)) {
    console.log(`  ✗ « ${resultat.nom} » porte le jeton d'accès`);
    propre = false;
  }
  for (const forme of [/sk-ant-[A-Za-z0-9_-]{4,}/, /x-api-key/i, /anthropic-version/i]) {
    const trouve = forme.exec(cherchable);
    if (trouve !== null) {
      console.log(`  ✗ « ${resultat.nom} » porte « ${trouve[0].slice(0, 12)}… »`);
      propre = false;
    }
  }
}
if (propre) console.log(`  ✓ ni le jeton d'accès, ni la forme d'une clé, ni les en-têtes de l'API du modèle`);

const justes = resultats.filter((resultat) => resultat.juste).length;
console.log(`\n${justes} / ${resultats.length} contrôles passés, et ${propre ? "rien" : "QUELQUE CHOSE"} à cacher dans les réponses.`);
process.exit(justes === resultats.length && propre ? 0 : 1);
