#!/usr/bin/env node
// COMPLÉMENT 5, POINT 6 — contrôles des quatre diagnostics ajoutés à la page de l'essai 1.
//
// Ces diagnostics existent pour que Christophe puisse interpréter SA prise sans rien deviner :
//   (a) RMS par canal et corrélation gauche/droite, en disant si les canaux sont identiques ;
//   (b) niveau par demi-seconde sur la fenêtre de silence, pour voir si quelqu'un a parlé ;
//   (c) journal de TOUS les appuis reçus, pour distinguer « aucun appui » de « appui non capté » ;
//   (d) durée de la prise et nombre de repères dans mesures.json.
//
// Chaque contrôle porte sa falsification : un appui qui ne pose PAS de repère est envoyé
// exprès, et l'on exige que le journal le montre tout en laissant le compte de repères inchangé.
// Sans cela, (c) ne distinguerait rien.

const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { servir } = require('./outils/serveur.cjs');

const RACINE = __dirname;
const SORTIE = path.join(RACINE, 'mesures');

(async () => {
  const { serveur, port } = await servir(RACINE, 0);
  const base = 'http://127.0.0.1:' + port;
  const navigateur = await chromium.launch({ args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ] });
  let n = 0;
  const releve = { environnement: 'Chromium (Playwright) — micro factice', controles: [] };
  try {
    const ctx = await navigateur.newContext({ permissions: ['microphone'] });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(base + '/essai1-micro.html');
    assert.equal(await page.evaluate(() => window.__essai1Api.demanderMicro()), true,
      'le micro factice doit être accordé');

    await page.evaluate(() => window.__essai1Api.demarrer());
    await page.waitForFunction(() => window.__essai1Api.ETAT.enCours === true, null, { timeout: 15000 });
    await page.waitForTimeout(3400);                   // laisse passer les 3 s de silence

    // 3 appuis qui posent un repère, puis 2 appuis qui n'en posent pas : c'est la falsification
    // de (c). Si le journal ne retenait que les repères, les deux derniers seraient invisibles.
    for (let k = 0; k < 3; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(380); }
    await page.keyboard.press('KeyB'); await page.waitForTimeout(180);
    await page.keyboard.press('Escape'); await page.waitForTimeout(380);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__essai1Api.arreter());
    await page.waitForFunction(() => !!window.__essai1Api.ETAT.mesures, null, { timeout: 15000 });

    const m = await page.evaluate(() => window.__essai1Api.ETAT.mesures);
    const lire = (sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' tbody tr')]
      .map((tr) => [tr.children[0].textContent, tr.children[1].textContent]), sel);

    // ── 1 — (c) LE JOURNAL DISTINGUE L'APPUI NON CAPTÉ DE L'ABSENCE D'APPUI ─────────────────
    const frappes = m.frappes || [];
    const posants = frappes.filter((f) => f.pose_un_repere);
    const nonPosants = frappes.filter((f) => !f.pose_un_repere);
    assert.equal(frappes.length, 5, 'les 5 appuis envoyés doivent TOUS être journalisés, pas seulement ceux qui posent un repère');
    assert.equal(posants.length, 3, '3 appuis doivent être marqués comme posant un repère');
    assert.ok(nonPosants.length === 2, '2 appuis doivent être marqués comme n\'en posant pas');
    assert.ok(nonPosants.some((f) => f.touche === 'b' || f.touche === 'B'), 'la touche B doit figurer au journal');
    assert.ok(nonPosants.some((f) => f.touche === 'Escape'), 'la touche Échap doit figurer au journal');
    assert.equal(m.nombre_de_reperes, 3, 'et le compte de repères doit rester à 3 : un appui journalisé n\'est pas un repère');
    frappes.forEach((f, i) => assert.ok(Number.isFinite(f.instant_echantillons) && f.instant_echantillons >= 0,
      'l\'appui ' + (i + 1) + ' doit porter un instant en échantillons'));
    const tFrappes = await lire('#tblFrappes');
    assert.equal(tFrappes.length, 5, 'le tableau des appuis doit montrer les 5 appuis');
    assert.ok(tFrappes.some(([, v]) => /ne pose pas de repère/.test(v)),
      'le tableau doit dire explicitement qu\'un appui ne pose pas de repère');
    releve.controles.push({ controle: 'journal_des_appuis', appuis: frappes.length,
      posent_un_repere: posants.length, n_en_posent_pas: nonPosants.length,
      reperes: m.nombre_de_reperes, touches: frappes.map((f) => f.touche) });
    console.log('PASS ' + (++n) + '/4 — journal des appuis : ' + frappes.length + ' appuis reçus ('
      + posants.length + ' posant un repère, ' + nonPosants.length + ' non : '
      + nonPosants.map((f) => f.touche).join(', ') + '), ' + m.nombre_de_reperes + ' repères');

    // ── 2 — (a) RMS PAR CANAL, ET LA QUESTION DES CANAUX IDENTIQUES TRANCHÉE ────────────────
    assert.ok(Array.isArray(m.rms_par_canal) && m.rms_par_canal.length >= 1,
      'le RMS doit être donné pour au moins un canal');
    assert.equal(m.rms_par_canal.length, m.canaux_livres,
      'il doit y avoir autant de RMS que de canaux livrés');
    m.rms_par_canal.forEach((c) => assert.ok(Number.isFinite(c.rms_dbfs) && c.rms_dbfs < 0,
      'le RMS du canal ' + c.canal + ' doit être un dBFS fini et négatif, pas une estimation'));
    const tCanaux = await lire('#tblCanaux');
    if (m.canaux_livres <= 1) {
      assert.equal(m.canaux_identiques, null, 'avec un seul canal, la question « identiques » est sans objet');
      assert.ok(tCanaux.some(([, v]) => /un seul canal livré/.test(v)),
        'la page doit DIRE qu\'un seul canal est livré, au lieu de masquer la ligne');
    } else {
      assert.ok(typeof m.canaux_identiques === 'boolean', 'avec deux canaux, la question doit être tranchée');
      assert.ok(tCanaux.some(([k]) => /identiques/.test(k)), 'la page doit poser la question dans le tableau');
      assert.ok(Number.isFinite(m.ecart_max_entre_canaux), 'l\'écart maximal entre canaux doit être mesuré');
    }
    releve.controles.push({ controle: 'canaux', canaux_livres: m.canaux_livres,
      rms_par_canal: m.rms_par_canal, correlation: m.correlation_gauche_droite,
      ecart_max: m.ecart_max_entre_canaux, identiques: m.canaux_identiques });
    console.log('PASS ' + (++n) + '/4 — canaux : ' + m.canaux_livres + ' livré(s), RMS '
      + m.rms_par_canal.map((c) => c.rms_dbfs + ' dBFS').join(' / ')
      + ', corrélation ' + m.correlation_gauche_droite
      + ', identiques : ' + (m.canaux_identiques === null ? 'sans objet' : m.canaux_identiques));

    // ── 3 — (b) LA FENÊTRE DE SILENCE EST DÉCOUPÉE ET NON VIDE ─────────────────────────────
    const sil = m.silence_rms_par_demi_seconde || [];
    assert.equal(sil.length, 6, 'la fenêtre de 3 s doit donner 6 tranches d\'une demi-seconde');
    sil.forEach((x, i) => {
      assert.equal(x.debut_s, +(i * 0.5).toFixed(2), 'la tranche ' + i + ' doit commencer à ' + (i * 0.5) + ' s');
      assert.ok(Number.isFinite(x.rms_dbfs), 'la tranche ' + i + ' doit porter un dBFS mesuré');
    });
    // NON-VACUITÉ : avec un micro factice qui émet un bip continu, les tranches ne doivent pas
    // toutes être au silence absolu — sinon le découpage ne mesurerait rien.
    assert.ok(sil.some((x) => x.rms_dbfs > -120), 'au moins une tranche doit porter du signal');
    assert.ok(Number.isFinite(m.silence_amplitude_db), 'l\'amplitude sur la fenêtre doit être calculée');
    const tSil = await lire('#tblSilence');
    assert.ok(tSil.length >= 6, 'les 6 tranches doivent être affichées');
    releve.controles.push({ controle: 'fenetre_de_silence', tranches: sil,
      amplitude_db: m.silence_amplitude_db });
    console.log('PASS ' + (++n) + '/4 — fenêtre de silence : 6 tranches, de '
      + m.silence_plus_calme_dbfs + ' à ' + m.silence_plus_fort_dbfs + ' dBFS (amplitude '
      + m.silence_amplitude_db + ' dB)');

    // ── 4 — (d) mesures.json PORTE LA DURÉE ET LE NOMBRE DE REPÈRES ────────────────────────
    const json = JSON.parse(await page.evaluate(() => JSON.stringify(window.__essai1Api.ETAT.mesures)));
    assert.ok(Number.isFinite(json.duree_prise_s) && json.duree_prise_s > 3,
      'mesures.json doit porter la durée de la prise, mesurée et supérieure aux 3 s de silence');
    assert.equal(json.nombre_de_reperes, 3, 'mesures.json doit porter le nombre de repères posés');
    assert.equal(json.frappes_recues, 5, 'et le nombre d\'appuis reçus, qui en diffère');
    assert.ok(Math.abs(json.duree_prise_s - json.duree_echantillons_s) < 1e-6,
      'la durée de la prise doit être celle des échantillons, pas une horloge murale');
    const tMes = await lire('#tblMesures');
    assert.ok(tMes.some(([k]) => /durée de la prise/.test(k)), 'la page doit afficher la durée de la prise');
    assert.ok(tMes.some(([k]) => /repères posés/.test(k)), 'la page doit afficher les repères posés');
    releve.controles.push({ controle: 'mesures_json', duree_prise_s: json.duree_prise_s,
      nombre_de_reperes: json.nombre_de_reperes, frappes_recues: json.frappes_recues });
    console.log('PASS ' + (++n) + '/4 — mesures.json : durée ' + json.duree_prise_s + ' s, '
      + json.nombre_de_reperes + ' repères, ' + json.frappes_recues + ' appuis');

    assert.deepEqual(erreurs, [], 'aucune erreur de page ne doit survenir');
    fs.mkdirSync(SORTIE, { recursive: true });
    fs.writeFileSync(path.join(SORTIE, 'essai1-diagnostics.json'),
      JSON.stringify(releve, null, 2), 'utf8');
    console.log('\nLES QUATRE DIAGNOSTICS DE L\'ESSAI 1 PASSENT (' + n + '/4)'
      + ' — relevé dans mesures/essai1-diagnostics.json');
  } finally {
    await navigateur.close(); serveur.close();
  }
})().catch((e) => { console.error('\nROUGE : ' + e.message); process.exit(1); });
