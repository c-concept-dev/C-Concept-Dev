// Fixtures vidéo des tests d'aperçu (verify-video-preview-click) et de stockage Cloudflare
// (verify-video-cloudflare-storage) — GÉNÉRÉES AU LANCEMENT dans un dossier ignoré par git, jamais
// commitées : le dépôt est public et aucun binaire média n'y a jamais été versé.
//
// Pourquoi de VRAIES vidéos, et pas des octets quelconques : les deux tests attendent
// `readyState >= 2` (HAVE_CURRENT_DATA — une frame réellement décodée), et celui du curseur lit
// `v.duration` pour sauter à 50 %. Un fichier factice ne franchit ni l'un ni l'autre.
//
// Pourquoi l'enregistreur de Playwright et JAMAIS MediaRecorder : mesuré sur cette machine, un WebM
// produit par MediaRecorder est bien décodable (readyState 3) mais annonce `duration === Infinity`,
// car un flux d'enregistrement en direct n'écrit pas de durée. Le test ferait alors
// `v.currentTime = Infinity * 0.5` et lèverait « The provided double value is non-finite ». Les
// vidéos de l'enregistreur Playwright portent une durée finie : 20,84 s mesurées sur le clip long.
//
// ffmpeg/ffprobe/vpxenc/mkvmerge sont absents de cet environnement : cette voie est la seule qui
// produise un WebM conforme sans dépendance externe.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const DOSSIER = path.join(__dirname, 'fixtures-video');

// Le test du curseur sert au plus 150 Ko par requête et exige d'observer un Range dont le décalage
// de départ DÉPASSE ce plafond — seule preuve d'un vrai saut, par opposition au chargement
// séquentiel initial. Le clip long doit donc peser plus de deux plafonds. Mesuré à 640×360 sur 20 s :
// 504 827 octets, Range observé à 491 520. La marge est confortable, mais on la vérifie plutôt que
// de la supposer : une fixture trop légère rendrait l'assertion vide au lieu de la faire échouer.
const PLANCHER_CLIP_LONG = 2 * 150 * 1024;

const CLIPS = [
  { nom: 'test-a.webm', ms: 1500, plancher: 1 },
  { nom: 'test-b.webm', ms: 1500, plancher: 1 },
  { nom: 'test-large.webm', ms: 20000, plancher: PLANCHER_CLIP_LONG },
];

// Animation sobre : un arc qui progresse et un compteur. Assez de mouvement pour un flux vidéo
// réel, assez peu pour que VP8 ne gonfle pas le fichier (du bruit coloré plein écran triplerait le
// poids sans rien apporter au test).
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#101418">
<canvas id="c" width="640" height="360"></canvas><script>
const x = document.getElementById('c').getContext('2d');
let f = 0;
function dessine() {
  f++;
  x.fillStyle = '#101418'; x.fillRect(0, 0, 640, 360);
  x.strokeStyle = '#4aa3ff'; x.lineWidth = 6;
  x.beginPath(); x.arc(320, 180, 90, 0, (f / 30) % (2 * Math.PI)); x.stroke();
  x.fillStyle = '#e8eef5'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center';
  x.fillText((f / 30).toFixed(1) + ' s', 320, 200);
  requestAnimationFrame(dessine);
}
dessine();
</script>`;

function estPresent(clip) {
  const p = path.join(DOSSIER, clip.nom);
  return fs.existsSync(p) && fs.statSync(p).size >= clip.plancher;
}

async function enregistrer(browser, clip) {
  const contexte = await browser.newContext({
    recordVideo: { dir: DOSSIER, size: { width: 640, height: 360 } },
    viewport: { width: 640, height: 360 },
  });
  const page = await contexte.newPage();
  await page.setContent(PAGE);
  await page.waitForTimeout(clip.ms);
  const video = page.video();
  // La vidéo n'est écrite qu'à la fermeture du contexte : path() n'est exploitable qu'après.
  await contexte.close();
  const source = await video.path();
  const cible = path.join(DOSSIER, clip.nom);
  fs.renameSync(source, cible);
  const poids = fs.statSync(cible).size;
  if (poids < clip.plancher) {
    throw new Error('Fixture ' + clip.nom + ' trop légère : ' + poids + ' octets pour un plancher de '
      + clip.plancher + '. Le test du curseur deviendrait vide au lieu d\'échouer — fixture refusée.');
  }
  return poids;
}

// Régénère uniquement ce qui manque ; un lancement suivant ne coûte rien.
async function assurerFixturesVideo() {
  const manquants = CLIPS.filter((c) => !estPresent(c));
  if (manquants.length === 0) return DOSSIER;
  fs.mkdirSync(DOSSIER, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const clip of manquants) {
      const poids = await enregistrer(browser, clip);
      console.log('Fixture vidéo générée : ' + clip.nom + ' (' + poids + ' octets, ' + (clip.ms / 1000) + ' s)');
    }
  } finally {
    await browser.close();
  }
  return DOSSIER;
}

module.exports = { assurerFixturesVideo, DOSSIER };
