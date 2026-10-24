/** Prépare les couples de pages à relire à l'œil (BAS-02, adjudication)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/adjudication.ts \
 *       <dossier de l'échantillon> [désaccords] [accords]
 *
 *  ## Pourquoi un œil, et pourquoi en aveugle
 *
 *  `exactitude-de-la-couche.ts` ne mesure pas l'exactitude : il mesure un **désaccord** entre
 *  deux lectures. Le gros du corpus vient d'un dossier nommé d'après un logiciel de
 *  reconnaissance de texte, donc sa couche est elle-même un OCR, et deux reconnaissances sur la
 *  même image abîmée se trompent souvent ensemble. Leur accord ne prouve rien tout seul.
 *
 *  D'où deux lots, mélangés et non annoncés :
 *
 *  | lot | ce qu'il attrape |
 *  |---|---|
 *  | les pages où les deux lectures **divergent** le plus | laquelle des deux a tort |
 *  | des pages où elles **s'accordent**, tirées au hasard | le cas où elles ont tort ensemble |
 *
 *  **Les deux lectures sont présentées en aveugle**, « A » et « B », tirées au sort page par
 *  page. Savoir laquelle vient de la couche inclinerait le jugement vers elle — et c'est
 *  précisément ce jugement-là qu'on cherche à établir. Le décodage vit dans `tirage.json`, que
 *  la page ne lit pas.
 *
 *  ## Ce que la page produit
 *
 *  Un bouton recopie les réponses en une ligne compacte, à coller dans la conversation. Les
 *  réponses vivent aussi dans le stockage du navigateur, pour qu'une fenêtre fermée par erreur
 *  ne perde pas une heure de relecture.
 *
 *  ## Les œuvres restent dehors
 *
 *  La page et les images vivent dans le dossier qu'on lui donne, **hors du dépôt** : ce sont des
 *  pages d'ouvrages sous droits (règle 5). Le banc efface au passage les images des pages qui ne
 *  sont pas retenues — rien ne traîne qui ne serve pas.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const [dossier, combienDesaccords = "30", combienAccords = "20"] = process.argv.slice(2);
if (dossier === undefined) {
  console.error("Attendu : <dossier de l'échantillon> [désaccords] [accords]");
  process.exit(2);
}
const DESACCORDS = Number.parseInt(combienDesaccords, 10);
const ACCORDS = Number.parseInt(combienAccords, 10);
/** Au-dessus de quel accord une page compte comme « les deux sont d'accord ». */
const SEUIL_ACCORD = 0.95;

type Couple = {
  document: string;
  empreinte: string;
  famille: string;
  rang: number;
  image: string;
  accord: number;
  couche: string;
  ocr: string;
  motsCouche: number;
  motsOcr: number;
};

const releve = JSON.parse(readFileSync(join(dossier, "couples.json"), "utf8")) as { couples: Couple[] };

function suiteDepuis(graine: string): () => number {
  let etat = 0;
  for (const caractere of graine) etat = (etat * 31 + caractere.charCodeAt(0)) >>> 0;
  return () => {
    etat = (etat * 1_664_525 + 1_013_904_223) >>> 0;
    return etat / 0x1_0000_0000;
  };
}
const tirer = suiteDepuis("adjudication");

const parAccord = [...releve.couples].sort((a, b) => a.accord - b.accord);
const desaccords = parAccord.slice(0, DESACCORDS);
const candidatsAccord = parAccord.filter((un) => un.accord >= SEUIL_ACCORD);

const accords: Couple[] = [];
const pris = new Set<number>();
while (accords.length < Math.min(ACCORDS, candidatsAccord.length)) {
  const index = Math.floor(tirer() * candidatsAccord.length);
  if (pris.has(index)) continue;
  pris.add(index);
  accords.push(candidatsAccord[index]!);
}

/** Mélangé, pour qu'un lot ne se devine pas à sa place dans la liste. */
const choisis = [...desaccords, ...accords];
for (let i = choisis.length - 1; i > 0; i -= 1) {
  const j = Math.floor(tirer() * (i + 1));
  [choisis[i], choisis[j]] = [choisis[j]!, choisis[i]!];
}

type Fiche = { numero: number; couple: Couple; aEstLaCouche: boolean };
const fiches: Fiche[] = choisis.map((couple, index) => ({ numero: index + 1, couple, aEstLaCouche: tirer() < 0.5 }));

// Les images non retenues partent : rien ne traîne qui ne serve pas.
const gardees = new Set(fiches.map((fiche) => fiche.couple.image.replace("pages/", "")));
let effacees = 0;
for (const nom of readdirSync(join(dossier, "pages"))) {
  if (gardees.has(nom)) continue;
  rmSync(join(dossier, "pages", nom), { force: true });
  effacees += 1;
}

writeFileSync(
  join(dossier, "tirage.json"),
  JSON.stringify(
    {
      prepareLe: new Date().toISOString(),
      seuilAccord: SEUIL_ACCORD,
      fiches: fiches.map((fiche) => ({
        numero: fiche.numero,
        document: fiche.couple.document,
        rang: fiche.couple.rang,
        famille: fiche.couple.famille,
        accord: fiche.couple.accord,
        lot: fiche.couple.accord >= SEUIL_ACCORD ? "accord" : "désaccord",
        aEstLaCouche: fiche.aEstLaCouche,
      })),
    },
    null,
    2,
  ),
  "utf8",
);

const echapper = (texte: string): string =>
  texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cartes = fiches
  .map(({ numero, couple, aEstLaCouche }) => {
    const a = aEstLaCouche ? couple.couche : couple.ocr;
    const b = aEstLaCouche ? couple.ocr : couple.couche;
    return `
<section class="fiche" id="fiche-${numero}">
  <h2>${numero} / ${fiches.length}</h2>
  <p class="source">${echapper(couple.document)} — page ${couple.rang}</p>
  <div class="corps">
    <figure><img loading="lazy" src="${echapper(couple.image)}" alt="Page ${couple.rang}"></figure>
    <div class="lectures">
      <div class="lecture"><h3>Lecture A</h3><p>${echapper(a)}</p></div>
      <div class="lecture"><h3>Lecture B</h3><p>${echapper(b)}</p></div>
    </div>
  </div>
  <fieldset class="choix" data-numero="${numero}">
    <legend>Laquelle correspond à ce qui est imprimé&nbsp;?</legend>
    <label><input type="radio" name="r${numero}" value="A"> A seule</label>
    <label><input type="radio" name="r${numero}" value="B"> B seule</label>
    <label><input type="radio" name="r${numero}" value="AB"> Les deux</label>
    <label><input type="radio" name="r${numero}" value="rien"> Aucune des deux</label>
    <label><input type="radio" name="r${numero}" value="?"> Je ne peux pas trancher</label>
  </fieldset>
</section>`;
  })
  .join("\n");

const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adjudication des lectures</title>
<style>
  :root { color-scheme: light dark; --fond: #F7F5F2; --encre: #1E2124; --trait: #D5CFC7; --appui: #8A5A3B; }
  @media (prefers-color-scheme: dark) { :root { --fond: #16181A; --encre: #E8E4DE; --trait: #3C4046; --appui: #C98B5E; } }
  body { margin: 0; background: var(--fond); color: var(--encre);
         font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header, .fiche, footer { max-width: 1180px; margin: 0 auto; padding: 24px 16px; }
  header { border-bottom: 1px solid var(--trait); }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .fiche { border-bottom: 1px solid var(--trait); }
  .fiche h2 { font-size: 15px; margin: 0; color: var(--appui); }
  .source { margin: 2px 0 14px; font-size: 13px; opacity: .65; }
  .corps { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
  @media (max-width: 860px) { .corps { grid-template-columns: 1fr; } }
  figure { margin: 0; }
  img { width: 100%; height: auto; border: 1px solid var(--trait); background: #fff; cursor: zoom-in; }
  img.agrandie { position: fixed; inset: 0; z-index: 9; width: 100vw; height: 100vh;
                 object-fit: contain; background: var(--fond); cursor: zoom-out; }
  .lectures { display: grid; gap: 14px; }
  .lecture { border: 1px solid var(--trait); padding: 10px 12px; background: color-mix(in srgb, var(--fond) 80%, #fff); }
  .lecture h3 { margin: 0 0 6px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; opacity: .7; }
  .lecture p { margin: 0; font-size: 14px; word-break: break-word; max-height: 15em; overflow: auto; }
  .choix { margin: 16px 0 0; border: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; }
  .choix legend { padding: 0; font-size: 14px; margin-bottom: 6px; }
  .choix label { font-size: 14px; }
  .faite { opacity: .45; }
  footer { position: sticky; bottom: 0; background: var(--fond); border-top: 1px solid var(--trait);
           display: flex; gap: 16px; align-items: center; }
  button { font: inherit; padding: 8px 16px; border: 1px solid var(--appui); background: var(--appui);
           color: #fff; cursor: pointer; }
  #compte { font-variant-numeric: tabular-nums; }
  textarea { width: 100%; height: 90px; margin-top: 10px; font-family: ui-monospace, monospace; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Adjudication des lectures</h1>
  <p>Pour chaque page : l'image telle qu'elle est imprimée, et deux lectures de son texte.
     Dites laquelle correspond. <strong>Vous ne savez pas d'où vient chacune</strong>, et c'est
     voulu — savoir inclinerait le jugement vers l'une d'elles.</p>
  <p>Cliquez une image pour l'agrandir. Vos réponses sont gardées par le navigateur&nbsp;: vous
     pouvez fermer et reprendre.</p>
</header>
${cartes}
<footer>
  <button id="copier">Copier mes réponses</button>
  <span id="compte"></span>
  <textarea id="sortie" readonly hidden></textarea>
</footer>
<script>
  const CLEF = "adjudication-bas02";
  const reponses = JSON.parse(localStorage.getItem(CLEF) || "{}");
  const total = ${fiches.length};

  const compter = () => {
    document.getElementById("compte").textContent =
      Object.keys(reponses).length + " / " + total + " relues";
  };

  for (const champ of document.querySelectorAll('input[type=radio]')) {
    const numero = champ.name.slice(1);
    if (reponses[numero] === champ.value) champ.checked = true;
    champ.addEventListener("change", () => {
      reponses[numero] = champ.value;
      localStorage.setItem(CLEF, JSON.stringify(reponses));
      document.getElementById("fiche-" + numero).classList.add("faite");
      compter();
    });
    if (reponses[numero] !== undefined) document.getElementById("fiche-" + numero).classList.add("faite");
  }

  for (const image of document.querySelectorAll("img"))
    image.addEventListener("click", () => image.classList.toggle("agrandie"));

  document.getElementById("copier").addEventListener("click", async () => {
    const ligne = Array.from({ length: total }, (_, i) => (i + 1) + "=" + (reponses[i + 1] ?? "-")).join(" ");
    const sortie = document.getElementById("sortie");
    sortie.hidden = false;
    sortie.value = ligne;
    sortie.select();
    try { await navigator.clipboard.writeText(ligne); } catch { /* la sélection suffit */ }
  });

  compter();
</script>
</body>
</html>
`;

writeFileSync(join(dossier, "adjudication.html"), page, "utf8");

const enDesaccord = fiches.filter((fiche) => fiche.couple.accord < SEUIL_ACCORD).length;
console.log(`${fiches.length} fiches préparées : ${enDesaccord} en désaccord, ${fiches.length - enDesaccord} en accord.`);
console.log(`${effacees} image(s) non retenue(s) effacée(s).`);
console.log(`\nÀ ouvrir : ${join(dossier, "adjudication.html")}`);
