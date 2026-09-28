// LOT A0 — une génération RÉELLE de Présentation, de bout en bout, par le vrai pipeline.
//
// Jamais faite jusqu'ici : tout ce qui précède était éprouvé sur des documents forgés à la main.
// Celle-ci appelle réellement le modèle, à travers adocGenerateStructuredDocument — la fonction
// que l'application appelle elle-même — puis mesure ce qui en est sorti.
//
// Ce qui est rapporté, sans rien déduire :
//   — l'appel a-t-il abouti (HTTP 200) ;
//   — deepDives est-il présent, et combien de pages ;
//   — combien de NIVEAUX de liens en profondeur ;
//   — pour CHAQUE renvoi interne, l'expression a-t-elle été retrouvée dans le paragraphe qui la
//     porte, ou le repli « premier paragraphe » a-t-il joué ;
//   — des cycles ont-ils été coupés (avertissement réel de la console).
// Le document produit est conservé comme pièce.
//
//   STUDIO_WORKER_API_KEY=... node tests/lot-a/generation-reelle.cjs [sujet]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

// Adresse VERROUILLÉE EN DUR. Sans cela, A0 passait par adocGetWorkerUrl() de l'application, qui
// lit d'abord localStorage.getItem('workerUrl') : l'adresse réellement appelée dépendait donc du
// profil du navigateur, et n'était garantie que par un raisonnement sur ce profil — pas par le
// script. Elle est maintenant imposée de trois façons, dont deux vérifiables à l'exécution :
// posée dans localStorage avant le chargement, passée explicitement à la génération, et toute
// requête vers un autre hôte est BLOQUÉE puis signalée.
const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const CLE = (process.env.STUDIO_WORKER_API_KEY || '').trim();
if (!CLE || /[^\x20-\x7E]/.test(CLE)) { console.error('Cle du Worker absente ou invalide. Aucun appel emis.'); process.exit(2); }
const SUJET = process.argv.filter(a => !a.startsWith('--'))[2] || "le cortisol et le systeme nerveux dans le stress chronique du couple";
// --publie : ouvrir la version REELLEMENT SERVIE par GitHub Pages plutot que le fichier local.
// C'est la seule facon de verifier ce que Christophe utilisera : un fichier local peut differer
// de ce qui est publie, et l'a deja fait.
const PUBLIE = process.argv.includes('--publie');
const PAGES = 'https://c-concept-dev.github.io/C-Concept-Dev/tools/Projet%20therapeutes/Conseiller%20Clinique/studio-clinique.html';
const ORIGINE_PAGES = 'https://c-concept-dev.github.io';

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const avertissements = [], erreurs = [], journal = [];
    page.on('pageerror', e => erreurs.push(e.message));
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'warning') avertissements.push(t);
      if (/appel 2|HTTP|approfondissement/i.test(t)) journal.push(m.type() + ': ' + t.slice(0, 200));
    });
    // Rien ne doit sortir ailleurs que vers le Worker. Blocage RÉEL, et tout hôte refusé est
    // rapporté : si un appel partait vers un tiers, ce test le dirait au lieu de le laisser passer.
    const hotesBloques = new Set();
    const hotesContactes = new Set();
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      // En mode --publie, l'origine GitHub Pages doit evidemment etre jointe : c'est la page
      // elle-meme. Elle est relevee comme les autres, jamais laissee implicite.
      if (PUBLIE && u.startsWith(ORIGINE_PAGES)) { hotesContactes.add(new URL(u).host); return route.continue(); }
      if (u.startsWith(WORKER)) { hotesContactes.add(new URL(u).host); return route.continue(); }
      try { hotesBloques.add(new URL(u).host); } catch (_) { hotesBloques.add(u.slice(0, 40)); }
      return route.abort();
    });
    // La clé et l'adresse sont posées AVANT le chargement, par le mécanisme de l'application
    // elle-même. La clé ne traverse jamais la sortie ni un fichier de résultats.
    await page.addInitScript(o => {
      try { localStorage.setItem('workerApiKey', o.c); localStorage.setItem('workerUrl', o.w); } catch (_) {}
    }, { c: CLE, w: WORKER });
    const adresse = PUBLIE ? PAGES : 'file://' + path.join(__dirname, '..', '..', 'studio-clinique.html');
    console.log('Page ouverte : ' + (PUBLIE ? 'VERSION PUBLIEE — ' + adresse : 'fichier local'));
    await page.goto(adresse);
    await page.evaluate(() => document.getElementById('cc-login-screen')?.remove());
    await page.waitForFunction(() => typeof window.adocGenerateStructuredDocument === 'function');
    // L'adresse n'est PAS vérifiée en interrogeant l'application : adocGetWorkerUrl est une
    // fonction de MODULE, pas une propriété de window — l'appeler faisait échouer A0 avant tout
    // appel (« window.adocGetWorkerUrl is not a function »). Elle est vérifiée par le
    // COMPORTEMENT : on relève les adresses réellement contactées, et on exige qu'elles soient
    // toutes celle du Worker. Une preuve vaut mieux qu'une interrogation.
    console.log('Adresse imposee : ' + WORKER + ' (verifiee sur les requetes reellement emises)');

    console.log('Sujet : ' + SUJET);
    console.log('Appel REEL en cours (le modele ecrit la presentation entiere)...\n');
    const t0 = Date.now();
    const sortie = await page.evaluate(async ([sujet, w]) => {
      try {
        const r = await window.adocGenerateStructuredDocument(
          'presentation', sujet, { documentKind: 'presentation', audience_type: 'praticien', duree_minutes: 20 },
          null, null, w, null);
        return { ok: true, doc: r.doc };
      } catch (e) {
        return { ok: false, erreur: (e && e.message) || String(e), statut: e && e.httpStatus, corps: e && e.httpBody };
      }
    }, [SUJET, WORKER]);
    const secondes = Math.round((Date.now() - t0) / 1000);

    if (!sortie.ok) {
      console.error('ECHEC de la generation apres ' + secondes + ' s');
      console.error('  ' + sortie.erreur);
      if (sortie.statut) console.error('  statut HTTP : ' + sortie.statut);
      if (sortie.corps) console.error('  corps : ' + sortie.corps);
      journal.forEach(l => console.error('  journal | ' + l));
      process.exit(1);
    }

    const doc = sortie.doc;
    const piece = path.join(__dirname, 'preuve-generation-reelle.json');
    fs.writeFileSync(piece, JSON.stringify(doc, null, 1));

    // ── Mesures sur le document RÉELLEMENT produit ─────────────────────────────────────────────
    const dives = doc.deepDives || [];
    const parId = {}; dives.forEach(d => { parId[d.id] = d; });
    const texteDe = p => (typeof p === 'string' ? p : p.text) || '';
    const liensDe = p => (typeof p === 'string' ? [] : (p.deepDiveLinks || []));

    // Liens portés par les BLOCS de diapositive (entrée dans le réseau).
    const liensDeBloc = [];
    (doc.blocks || []).forEach(c => ((c.content && c.content.blocks) || []).forEach(b => {
      (b.deepDiveLinks || []).forEach(l => liensDeBloc.push({ bloc: b.id, type: b.type, ...l }));
    }));

    // Profondeur réelle : plus long chemin depuis une entrée, sans repasser deux fois (le graphe
    // est acyclique après la coupe, mais on se garde quand même d'une boucle).
    function profondeur(id, vus) {
      if (!parId[id] || vus.has(id)) return 0;
      vus.add(id);
      let max = 1;
      parId[id].paragraphs.forEach(p => liensDe(p).forEach(l => { max = Math.max(max, 1 + profondeur(l.targetId, new Set(vus))); }));
      return max;
    }
    const niveaux = liensDeBloc.length ? Math.max(...liensDeBloc.map(l => profondeur(l.targetId, new Set()))) : 0;

    // Le point qui ne se voit pas autrement : le renvoi est-il tombé sur le paragraphe qui
    // contient vraiment l'expression, ou sur le repli « premier paragraphe » ?
    const repartition = [];
    dives.forEach(d => d.paragraphs.forEach((p, i) => liensDe(p).forEach(l => {
      const dedans = texteDe(p).toLowerCase().indexOf((l.text || '').toLowerCase()) !== -1;
      repartition.push({ page: d.id, paragraphe: i, texte: l.text, cible: l.targetId, retrouve: dedans, premier: i === 0 });
    })));
    const retrouves = repartition.filter(r => r.retrouve).length;
    const replis = repartition.filter(r => !r.retrouve).length;
    const coupes = avertissements.filter(a => /lien\(s\) d'approfondissement retire/i.test(a));

    console.log('RESULTAT — ' + secondes + ' s');
    console.log('  HTTP 200                        : oui (le document a ete produit)');
    console.log('  titre                           : ' + doc.title);
    console.log('  diapositives                    : ' + (doc.blocks || []).length);
    console.log('  deepDives present               : ' + (dives.length ? 'oui, ' + dives.length + ' page(s)' : 'NON'));
    console.log('  renvois depuis les diapositives : ' + liensDeBloc.length
      + (liensDeBloc.length ? ' (' + liensDeBloc.map(l => l.type).join(', ') + ')' : ''));
    console.log('  profondeur reelle               : ' + niveaux + ' niveau(x)');
    console.log('  renvois internes (page -> page) : ' + repartition.length);
    console.log('    expression RETROUVEE          : ' + retrouves);
    console.log('    repli premier paragraphe      : ' + replis);
    console.log('  cycles coupes                   : ' + (coupes.length ? coupes.join(' | ') : 'aucun'));
    if (erreurs.length) console.log('  erreurs de page                 : ' + erreurs.join(' | '));
    if (replis) {
      console.log('\n  Detail des replis :');
      repartition.filter(r => !r.retrouve).forEach(r =>
        console.log('    page ' + r.page + ', paragraphe ' + r.paragraphe + ' : « ' + r.texte + ' » -> ' + r.cible));
    }
    console.log('  adresses reellement contactees   : ' + ([...hotesContactes].join(', ') || 'AUCUNE'));
    if (hotesBloques.size) console.log('  hotes BLOQUES (aucun appel emis) : ' + [...hotesBloques].join(', '));
    if (!hotesContactes.size) console.log('  ATTENTION : aucune requete vers le Worker n\'a ete observee.');
    console.log('\nPiece conservee (jamais commitee, cf. .gitignore) : ' + piece);
    fs.writeFileSync(path.join(__dirname, 'resultats-a0.json'), JSON.stringify({
      date: new Date().toISOString(), sujet: SUJET, secondes, titre: doc.title,
      diapositives: (doc.blocks || []).length, pages: dives.length, liensDeBloc, niveaux,
      repartition, retrouves, replis, cyclesCoupes: coupes,
    }, null, 1));
  } finally { await browser.close(); }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1); });
