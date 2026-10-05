// DÉCALAGE CONSTANT, OU DÉRIVE ? La question décide du critère « écart ≤ 0,2 s sur 5 min ».
// Un décalage constant (l'horloge murale démarre avant que le graphe audio ne livre son premier
// bloc) reste le même quelle que soit la durée. Une dérive, elle, croît avec la durée — et une
// mesure sur 6 secondes ne permet pas de les distinguer. On mesure donc à DEUX durées.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { servir } = require('./serveur.cjs');

(async () => {
  const racine = path.join(__dirname, '..');
  const { serveur, port } = await servir(racine, 0);
  const nav = await chromium.launch({ args: ['--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const releve = [];
  try {
    for (const secondes of [6, 20, 40]) {
      const ctx = await nav.newContext({ permissions: ['microphone'] });
      const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:' + port + '/essai1-micro.html');
      await page.evaluate(() => window.__essai1Api.demanderMicro());
      await page.evaluate(() => window.__essai1Api.demarrer());
      await page.waitForFunction(() => window.__essai1Api.ETAT.enCours === true, null, { timeout: 15000 });
      await page.waitForTimeout(secondes * 1000);
      await page.evaluate(() => window.__essai1Api.arreter());
      await page.waitForFunction(() => !!window.__essai1, null, { timeout: 10000 });
      const m = await page.evaluate(() => window.__essai1.mesures);
      releve.push({ consigne_s: secondes, duree_echantillons_s: m.duree_echantillons_s,
                    duree_horloge_s: m.duree_horloge_s, ecart_s: m.ecart_s,
                    ecart_par_minute_s: +(m.ecart_s / (m.duree_horloge_s / 60)).toFixed(4) });
      await ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }

  console.log('ÉCART ÉCHANTILLONS − HORLOGE, à trois durées (Chromium, micro factice)');
  console.log('  durée visée   durée échantillons   durée horloge   écart      écart/minute');
  releve.forEach((r) => console.log('  ' + String(r.consigne_s + ' s').padEnd(13)
    + String(r.duree_echantillons_s + ' s').padStart(18) + String(r.duree_horloge_s + ' s').padStart(16)
    + String(r.ecart_s + ' s').padStart(11) + String(r.ecart_par_minute_s + ' s').padStart(15)));
  // Verdict : si l'écart reste ~constant alors que la durée triple, c'est un DÉCALAGE de
  // démarrage ; s'il croît proportionnellement, c'est une DÉRIVE d'horloge.
  const e = releve.map((r) => Math.abs(r.ecart_s));
  const etendue = Math.max(...e) - Math.min(...e);
  const croissance = e[e.length - 1] / (e[0] || 1e-9);
  const dureeRatio = releve[releve.length - 1].duree_horloge_s / releve[0].duree_horloge_s;
  console.log('');
  console.log('  étendue des écarts : ' + etendue.toFixed(4) + ' s');
  console.log('  l\'écart a été multiplié par ' + croissance.toFixed(2)
    + ' quand la durée l\'a été par ' + dureeRatio.toFixed(2));
  console.log('  lecture : ' + (croissance < dureeRatio / 2
    ? 'DÉCALAGE DE DÉMARRAGE, à peu près constant — une prise de 5 min garderait le même écart'
    : 'DÉRIVE proportionnelle à la durée — à extrapoler avant de juger le critère des 5 min'));
  fs.writeFileSync(path.join(racine, 'mesures', 'essai1-ecart.json'),
    JSON.stringify({ releve, etendue_s: +etendue.toFixed(4), croissance_ecart: +croissance.toFixed(2),
                     croissance_duree: +dureeRatio.toFixed(2) }, null, 2), 'utf8');
})();
