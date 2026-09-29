// LOT B — la campagne RÉELLE du cours en modules. Deux phases, choisies par --phase.
//
//   --phase=a  le PLAN seul : un appel Haiku, aucun module généré. < 0,01 $.
//   --phase=b  3 modules × 10 diapositives, de bout en bout, export ouvert et cliqué. ~4 appels.
//
// La clé arrive par l'environnement (STUDIO_WORKER_API_KEY), posée par LANCER-COURS.sh qui la
// demande sans écho. Elle ne traverse ni le dépôt, ni la conversation, ni les fichiers de résultat.
//
//   STUDIO_WORKER_API_KEY=... node tests/lot-b/campagne-cours.cjs --phase=a [--local]
//
// L'adresse du Worker est FIGÉE ici. Toute requête vers un autre hôte est BLOQUÉE puis signalée.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const CLE = (process.env.STUDIO_WORKER_API_KEY || '').trim();
// Le placeholder « … » a déjà fait accuser l'API à tort : rejeté nommément, avant tout appel.
if (!CLE || /[^\x20-\x7E]/.test(CLE) || /^[.…]+$/.test(CLE)) {
  console.error('Cle du Worker absente, incomplete ou contenant un caractere non ASCII. AUCUN appel emis.');
  process.exit(2);
}
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const PHASE = arg('phase', '');
if (PHASE !== 'a' && PHASE !== 'b') { console.error('Preciser --phase=a ou --phase=b.'); process.exit(2); }
// --local : sert les fichiers LOCAUX sous l'adresse publiee. Le CORS du Worker n'accepte qu'une
// origine fixe ; un fichier ouvert en file:// presente une origine `null` qu'il refuse. On ne
// touche JAMAIS au CORS du Worker pour cela : c'est la page qui prend la bonne origine.
const LOCAL = !process.argv.includes('--publie');
const ORIGINE = 'https://c-concept-dev.github.io';
const BASE = ORIGINE + '/C-Concept-Dev/tools/Projet%20therapeutes/Conseiller%20Clinique/';
const PAGE = BASE + 'studio-clinique.html';
const RACINE = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const DEMANDE_A = "un cours de 3 heures pour des etudiants de Master 2 en psychologie clinique sur "
  + "les troubles de l'attachement dans le couple adulte : reperage, conceptualisation et "
  + "interventions";
const DEMANDE_B = "un cours de 45 minutes pour des praticiens sur les styles d'attachement dans le "
  + "couple adulte";
const SORTIE = f => path.join(__dirname, f);

// Tout ce qui sera écrit dans le fichier de résultats. JAMAIS la clé, jamais un extrait de livre.
const releve = { phase: PHASE, debut: new Date().toISOString(), mode: LOCAL ? 'local-sous-origine' : 'publie',
  hotesContactes: [], hotesBloques: [], journal: [], erreursPage: [], resultat: null, echec: null };

async function preparer(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let servies = 0;
  const serviesListe = [], lecturesRatees = [];
  const contactes = new Set(), bloques = new Set();
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('file:')) return route.continue();
    if (LOCAL && u.startsWith(BASE)) {
      const rel = decodeURIComponent(u.slice(BASE.length).split('?')[0].split('#')[0]);
      const f = path.join(RACINE, rel);
      if (!f.startsWith(RACINE)) return route.abort();
      try {
        const corps = fs.readFileSync(f); servies++; serviesListe.push(rel);
        return route.fulfill({ status: 200, body: corps,
          contentType: TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      } catch (e) {
        // Jamais un repli silencieux vers la version PUBLIEE : la campagne mesurerait alors un
        // autre code que celui du disque, et son rapport serait faux sans que rien ne le dise.
        lecturesRatees.push(rel + ' (' + e.code + ')');
        return route.abort();
      }
    }
    if (!LOCAL && u.startsWith(ORIGINE)) { contactes.add(new URL(u).host); return route.continue(); }
    if (u.startsWith(WORKER)) { contactes.add(new URL(u).host); return route.continue(); }
    // Dependances DECLAREES de l'application : de simples GET statiques, qui n'emportent rien.
    if (/^https:\/\/(cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|images\.pexels\.com)\//.test(u)) {
      contactes.add(new URL(u).host); return route.continue();
    }
    try { bloques.add(new URL(u).host); } catch (_) { bloques.add(u.slice(0, 40)); }
    return route.abort();
  });
  page.on('pageerror', e => releve.erreursPage.push(e.message));
  page.on('console', m => {
    const t = m.text().replace(/\s+/g, ' ');
    // On ne relève que les lignes qui DISENT quelque chose de vérifiable. Le contenu clinique
    // n'est jamais journalisé : le dépôt est public et la bibliothèque est celle de Christophe.
    if (/stop_reason|tool_use|repli|QC bloquant|429|HTTP \d\d\d|tronqu|max_tokens|Génération structurée|clarifi/i.test(t)) {
      releve.journal.push(m.type() + ': ' + t.slice(0, 260));
    }
  });
  // La cle et l'adresse sont posees AVANT le chargement, par le mecanisme de l'application.
  await page.addInitScript(o => {
    try { localStorage.setItem('workerApiKey', o.c); localStorage.setItem('workerUrl', o.w); } catch (_) {}
  }, { c: CLE, w: WORKER });
  await page.goto(LOCAL ? PAGE : PAGE);
  await page.evaluate(() => {
    document.getElementById('cc-login-screen')?.remove();
    document.getElementById('assistdoc-screen')?.classList.add('active');
  });
  await page.waitForFunction(() => typeof window.adocRunCourseGeneration === 'function'
    && typeof window.adocBuildCoursePlan === 'function');
  return { page, contactes, bloques, serviesListe: serviesListe, lecturesRatees: lecturesRatees,
           servies: () => servies };
}

// Verifie, AVANT le premier appel paye, que le code mesure est bien celui du disque. Le 29/09/2026
// une campagne a tourne sur la version d'avant un correctif pousse quatre minutes plus tard : rien
// ne le disait, et il a fallu comparer des horodatages apres coup pour le comprendre.
function verifierFraicheur(ctx) {
  if (!LOCAL) return null;
  if (ctx.lecturesRatees.length) return 'fichiers illisibles sur le disque : ' + ctx.lecturesRatees.join(', ');
  const requis = ['studio-clinique.html', 'studio-clinique-core.js'];
  const manquants = requis.filter(f => !ctx.serviesListe.includes(f));
  if (manquants.length) return 'non servis depuis le disque : ' + manquants.join(', ');
  return null;
}

function finir(ctx, code) {
  releve.fichiersServisDepuisLeDisque = ctx.serviesListe;
  releve.hotesContactes = [...ctx.contactes].sort();
  releve.hotesBloques = [...ctx.bloques].sort();
  releve.fin = new Date().toISOString();
  fs.writeFileSync(SORTIE('resultats-phase-' + PHASE + '.json'), JSON.stringify(releve, null, 2));
  console.log('\nReleve ecrit : tests/lot-b/resultats-phase-' + PHASE + '.json (jamais commite)');
  if (releve.hotesBloques.length) console.log('HOTES BLOQUES : ' + releve.hotesBloques.join(', '));
  console.log('Hotes contactes : ' + releve.hotesContactes.join(', '));
  process.exitCode = code;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  let ctx = null;
  try {
    ctx = await preparer(browser);
    const page = ctx.page;
    console.log('Adresse imposee : ' + WORKER + ' (verifiee sur les requetes reellement emises)');
    console.log('Mode : ' + (LOCAL ? 'fichiers LOCAUX servis sous l\'adresse publiee' : 'VERSION PUBLIEE'));
    const pasFrais = verifierFraicheur(ctx);
    if (pasFrais) {
      console.error('ECHEC AVANT TOUT APPEL — ' + pasFrais);
      console.error('  La campagne ne mesurerait pas le code du disque. Aucun appel emis.');
      releve.echec = 'fraicheur : ' + pasFrais;
      return finir(ctx, 2);
    }
    if (LOCAL) console.log('Fraicheur : ' + ctx.serviesListe.length + ' fichier(s) servi(s) depuis le disque ('
      + ctx.serviesListe.join(', ') + ')');
    // Repere de version : ce que git a sous la main au moment du lancement, pour que le releve dise
    // sur QUEL code il porte — jamais deduit apres coup.
    try {
      releve.commit = require('node:child_process').execSync('git rev-parse --short HEAD',
        { cwd: RACINE, encoding: 'utf8' }).trim();
      releve.arbreModifie = require('node:child_process').execSync('git status --porcelain -- studio-clinique-core.js',
        { cwd: RACINE, encoding: 'utf8' }).trim().length > 0;
      console.log('Code mesure : ' + releve.commit + (releve.arbreModifie ? ' + modifications NON COMMITEES' : ''));
    } catch (_) { releve.commit = '(inconnu)'; }

    // ── PHASE A — le plan seul ────────────────────────────────────────────────────────────────
    if (PHASE === 'a') {
      console.log('\n=== PHASE A — plan d\'un cours de 3 h pour un Master 2 (1 appel Haiku) ===\n');
      console.log('Demande : ' + DEMANDE_A + '\n');
      const t0 = Date.now();
      const r = await page.evaluate(async ([d, w]) => {
        try {
          const plan = await window.adocBuildCoursePlan(d, 180, w, 'cours-campagne-a');
          return { ok: true, plan: plan };
        } catch (e) { return { ok: false, erreur: (e && e.message) || String(e) }; }
      }, [DEMANDE_A, WORKER]);
      const secondes = ((Date.now() - t0) / 1000).toFixed(1);
      if (!r.ok) {
        console.error('ECHEC du decoupage : ' + r.erreur);
        releve.echec = r.erreur; return finir(ctx, 1);
      }
      const p = r.plan;
      console.log('Plan obtenu en ' + secondes + ' s — « ' + p.titre + ' »');
      console.log('  ' + p.modules.length + ' modules · ' + p.dureeMinutes + ' min · '
        + p.modules[0].dureeMinutes + ' min et ' + p.modules[0].slideCount + ' diapositives par module');
      console.log('  total livre : ' + p.modules.reduce((a, m) => a + m.slideCount + 1, 0) + ' diapositives\n');
      p.modules.forEach((m, i) => {
        console.log('  ' + (i + 1) + '. ' + m.titre);
        if (m.objectifs.length) console.log('     objectifs : ' + m.objectifs.join(' ; '));
        if (m.notionsCles.length) console.log('     notions   : ' + m.notionsCles.join(', '));
        console.log('     recherche : ' + m.requeteBibliotheque);
      });
      // Recouvrement : signal GROSSIER, et dit comme tel. Deux modules qui partagent une notion
      // mot pour mot est un indice, pas une preuve de redite — seul un humain en juge.
      const notions = {};
      p.modules.forEach((m, i) => (m.notionsCles || []).forEach(n => {
        const k = n.toLowerCase().trim(); (notions[k] = notions[k] || []).push(i + 1);
      }));
      const partagees = Object.entries(notions).filter(([, v]) => v.length > 1);
      console.log('\n  notions apparaissant dans plusieurs modules : '
        + (partagees.length ? partagees.map(([k, v]) => '« ' + k +' » (modules ' + v.join(', ') + ')').join(', ')
                            : 'aucune')
        + '\n    (indice grossier de recouvrement — la redite reelle se juge sur le contenu, pas sur les mots-cles)');
      releve.resultat = { secondes: Number(secondes), titre: p.titre, modules: p.modules.length,
        dureeMinutes: p.dureeMinutes, parModule: p.modules[0].dureeMinutes,
        slideCountParModule: p.modules[0].slideCount,
        totalDiapositivesAnnonce: p.modules.reduce((a, m) => a + m.slideCount + 1, 0),
        titresModules: p.modules.map(m => m.titre), notionsPartagees: partagees.length };
      console.log('\nPHASE A TERMINEE — aucun module genere, aucune generation lancee.');
      return finir(ctx, 0);
    }

    // ── PHASE B — 3 modules de bout en bout ───────────────────────────────────────────────────
    console.log('\n=== PHASE B — 3 modules x 10 diapositives, de bout en bout ===\n');
    console.log('Demande : ' + DEMANDE_B + '\n');

    // 1) Le plan du cours, et le plan du PLANIFICATEUR (approach_filter) : la campagne doit partir
    //    du meme etat que la production, sinon elle ne mesure pas la meme chose.
    console.log('[1/5] plan du cours + plan du planificateur…');
    const prep = await page.evaluate(async ([dem, w]) => {
      try {
        // adocPlanQuery rend `null` en cas d'echec, jamais un plan par defaut : c'est ce qui
        // permet de refuser de mesurer une campagne partie d'un plan degrade.
        const planOrigine = await window.adocPlanQuery(dem);
        const plan = await window.adocBuildCoursePlan(dem, 45, w, 'cours-campagne-b');
        return { ok: true, plan: plan, planOrigine: planOrigine };
      } catch (e) { return { ok: false, erreur: (e && e.message) || String(e) }; }
    }, [DEMANDE_B, WORKER]);
    if (!prep.ok) { console.error('ECHEC en preparation : ' + prep.erreur); releve.echec = prep.erreur; return finir(ctx, 1); }
    if (!prep.planOrigine) {
      // Sans plan du planificateur, la campagne mesurerait un parcours que l'utilisatrice ne prend
      // jamais : pas d'approach_filter, donc pas de balayage cible de la bibliotheque.
      console.error('ECHEC : le planificateur n\'a rien rendu (plan `null`) — la campagne ne mesurerait');
      console.error('        pas le parcours reel. Rien n\'a ete genere.');
      releve.echec = 'adocPlanQuery a rendu null : plan du planificateur indisponible';
      return finir(ctx, 1);
    }
    const plan = prep.plan;
    console.log('  « ' + plan.titre + ' » — ' + plan.modules.length + ' modules x '
      + plan.modules[0].slideCount + ' diapositives (' + plan.modules[0].dureeMinutes + ' min chacun)');
    console.log('  approach_filter du planificateur : ' + (prep.planOrigine.approach_filter || '(aucun)'));
    plan.modules.forEach((m, i) => console.log('    ' + (i + 1) + '. ' + m.titre));
    if (plan.modules.length !== 3) {
      console.error('ECHEC : ' + plan.modules.length + ' modules au lieu de 3 — la phase B ne mesurerait pas ce qui etait prevu.');
      releve.echec = 'plan de ' + plan.modules.length + ' modules'; return finir(ctx, 1);
    }

    // 2) La generation, par le VRAI chemin de l'interface (adocCoursePlanLaunch) : rendu par
    //    module, enregistrement au fil de l'eau, assemblage et recapitulatif inclus.
    console.log('\n[2/5] generation par le VRAI chemin de l\'interface — plusieurs minutes…');
    const t0 = Date.now();
    await page.evaluate(([p, po, w]) => {
      window.__jalons = [];
      window.adocRenderCoursePlanCard(p, { plan: po, workerUrl: w });
      const orig = window.adocRenderCourseProgressCard;
      // Les jalons sont releves DEPUIS l'interface, jamais reconstitues : ce sont les durees que
      // l'utilisatrice attend reellement.
      const t = Date.now();
      window.__marquer = () => {
        const ui = window._adocCourseUI; if (!ui || !ui.etats) return;
        Object.keys(ui.etats).forEach(id => {
          if (ui.etats[id] === 'ok' && !window.__jalons.some(j => j.id === id)) {
            window.__jalons.push({ id: id, secondes: (Date.now() - t) / 1000 });
          }
        });
      };
      window.__minuteur = setInterval(window.__marquer, 500);
      window.adocCoursePlanLaunch();
    }, [plan, prep.planOrigine, WORKER]);
    // 20 minutes de plafond : au-dela, quelque chose ne repond plus et il vaut mieux le dire que
    // d'attendre indefiniment.
    try {
      await page.waitForFunction(() => !!document.getElementById('cc-course-recap-card'), null, { timeout: 20 * 60 * 1000 });
    } catch (e) {
      console.error('ECHEC : aucun recapitulatif apres 20 minutes.');
      releve.echec = 'delai depasse (20 min) sans recapitulatif';
      const partiel = await page.evaluate(() => {
        const ui = window._adocCourseUI;
        return ui ? { etats: ui.etats, erreurs: ui.erreurs } : null;
      });
      releve.resultat = { partiel: partiel };
      console.error('  etat au moment de l\'abandon : ' + JSON.stringify(partiel));
      return finir(ctx, 1);
    }
    const minutes = ((Date.now() - t0) / 60000).toFixed(1);
    await page.evaluate(() => clearInterval(window.__minuteur));

    // 3) Les mesures, lues sur l'etat REEL de l'application.
    const m = await page.evaluate(() => {
      const ui = window._adocCourseUI;
      return {
        jalons: window.__jalons,
        modules: ui.resultats.modules.map(x => ({ id: x.id, statut: x.statut, stopReason: x.stopReason,
          diapositives: x.diapositives, essais: x.essais, nom: x.nom, erreur: x.erreur || null,
          qcBloquant: x.qc ? x.qc.blocking.length : null, qcNonBloquant: x.qc ? x.qc.nonBlocking.length : null })),
        rapport: ui.resultats.rapport,
        assemble: ui.assemble ? { rapport: ui.assemble.rapport, qcBloquant: ui.assemble.qc.blocking.length,
          qcNonBloquant: ui.assemble.qc.nonBlocking.length } : null,
        // Aucune clarification ne doit etre apparue : ce chemin ne passe pas par la porte de clarte.
        cartesClarification: document.querySelectorAll('#adoc-messages .cc-clarity-card').length,
        clarificationEnAttente: !!(window._adocPendingFormatClarity && Object.keys(window._adocPendingFormatClarity).length)
          || !!(window._adocPendingCourseOffer && Object.keys(window._adocPendingCourseOffer).length),
        idsCartesPresentes: [...document.querySelectorAll('#adoc-messages .cc-clarity-card')].map(e => e.id || '(sans id)'),
        nomsSidebar: [...document.querySelectorAll('#adoc-outputs-list .adoc-output-name')].map(e => e.textContent),
      };
    });
    console.log('\n[3/5] mesures — ' + minutes + ' min au total');
    const echecs = [];
    m.modules.forEach((x, i) => {
      const cible = plan.modules[i] ? plan.modules[i].slideCount : null;
      const ecart = (x.diapositives != null && cible != null) ? Math.abs(x.diapositives - cible) : null;
      console.log('  ' + x.id + ' : ' + x.statut + ' · stop_reason=' + (x.stopReason || '—')
        + ' · ' + (x.diapositives != null ? x.diapositives : '—') + '/' + cible + ' diapositives'
        + ' · ' + x.essais + ' tentative(s)'
        + ' · QC ' + x.qcBloquant + ' bloquant / ' + x.qcNonBloquant + ' non bloquant'
        + (x.erreur ? ' · ' + x.erreur : ''));
      if (x.statut !== 'ok') echecs.push(x.id + ' : ' + (x.erreur || x.statut));
      else if (x.stopReason !== 'tool_use') echecs.push(x.id + ' : stop_reason « ' + x.stopReason + ' », pas tool_use');
      else if (ecart > 2) echecs.push(x.id + ' : ' + x.diapositives + ' diapositives pour ' + cible + ' visees (ecart ' + ecart + ')');
    });
    const dureesModules = m.jalons.map((j, i) => i === 0 ? j.secondes : j.secondes - m.jalons[i - 1].secondes);
    if (dureesModules.length) {
      console.log('  duree par module : ' + dureesModules.map(s => s.toFixed(0) + ' s').join(' · ')
        + ' — mediane ' + [...dureesModules].sort((a, b) => a - b)[Math.floor(dureesModules.length / 2)].toFixed(0) + ' s');
    }
    console.log('  clarification : ' + m.cartesClarification + ' carte(s) dans le fil ('
      + m.idsCartesPresentes.join(', ') + ') · en attente : ' + m.clarificationEnAttente);
    // Le recapitulatif EST une cc-clarity-card (meme patron visuel) : ce qui doit etre absent,
    // c'est une carte de CLARIFICATION, reconnaissable a son absence d'identifiant de cours.
    const cartesEtrangeres = m.idsCartesPresentes.filter(id => !/^cc-course-/.test(id));
    if (cartesEtrangeres.length) echecs.push('carte de clarification apparue : ' + cartesEtrangeres.join(', '));
    if (m.clarificationEnAttente) echecs.push('une clarification est restee en attente');
    const repli = releve.journal.filter(l => /repli automatique sur l'ancien moteur/i.test(l));
    if (repli.length) echecs.push(repli.length + ' repli(s) sur l\'ancien moteur');
    const trop = releve.journal.filter(l => /\b429\b/.test(l));
    console.log('  429 releves : ' + (trop.length ? trop.length + ' — ' + trop[0] : 'aucun'));
    console.log('  replis sur l\'ancien moteur : ' + (repli.length ? repli.length + ' — ' + repli[0] : 'aucun'));

    // 4) Le document assemble : schemas reels, approfondissements rejoues, nommage.
    console.log('\n[4/5] document assemble');
    if (!m.assemble) { console.error('  ECHEC : rien n\'a ete assemble.'); echecs.push('aucun assemblage'); }
    else {
      console.log('  ' + m.assemble.rapport.modulesAssembles.length + ' modules · '
        + m.assemble.rapport.diapositives + ' diapositives · ' + m.assemble.rapport.pages + ' page(s) d\'approfondissement · '
        + m.assemble.rapport.entreesSources + ' passages ('
        + m.assemble.rapport.entreesDedoublonnees + ' dedoublonnes) · ' + m.assemble.rapport.citations + ' citations');
      console.log('  QC du cours : ' + m.assemble.qcBloquant + ' bloquant / ' + m.assemble.qcNonBloquant + ' non bloquant'
        + ' · genereEnEntier = ' + m.rapport.genereEnEntier);
      if (m.assemble.qcBloquant) echecs.push('QC bloquant sur le cours assemble');
      if (m.assemble.rapport.modulesOmis.length) echecs.push('modules omis : ' + m.assemble.rapport.modulesOmis.join(', '));
    }
    const v = await page.evaluate(() => {
      const ui = window._adocCourseUI;
      const art = ui && ui.assemble && window._adocArtifacts ? window._adocArtifacts[ui.assemble.storeKey] : null;
      // Le document BRUT, celui que l'artefact conserve — JAMAIS validatedDoc. Mesure du 29/09/2026 :
      // adocValidateClinicalDocument annote chaque bloc d'un champ interne `_status` que le schema
      // interdit (additionalProperties:false), et valider cet objet-la faisait accuser a tort le
      // document assemble. Reproduit hors ligne sur un document forge : brut valide, validatedDoc
      // refuse, seul champ ajoute `_status`.
      const d = art && art._adocStructuredDoc ? { doc: art._adocStructuredDoc } : null;
      if (!d) return null;
      const vd = window.adocValidateSchema('clinicalDocument', d.doc);
      const annote = window._adocLastStructuredDoc
        ? window.adocValidateSchema('clinicalDocument', window._adocLastStructuredDoc.doc) : null;
      // Les approfondissements du cours assemble sont le rejeu d'adocConvertDeepDives : verifie
      // par le FAIT qu'aucun renvoi ne pointe dans le vide et qu'aucun cycle ne subsiste.
      const pages = d.doc.deepDives || [];
      const ids = new Set(pages.map(p => p.id));
      const renvois = [];
      const visiter = (n) => (n.deepDiveLinks || []).forEach(l => renvois.push(l.targetId));
      (d.doc.blocks || []).forEach(c => { visiter(c); ((c.content && c.content.blocks) || []).forEach(visiter); });
      pages.forEach(p => (p.paragraphs || []).forEach(x => { if (typeof x !== 'string') visiter(x); }));
      const chaine = {};
      pages.forEach(p => { chaine[p.id] = (p.paragraphs || []).flatMap(x => typeof x === 'string' ? []
        : (x.deepDiveLinks || []).map(l => l.targetId)); });
      let cycle = false;
      Object.keys(chaine).forEach(depart => {
        const vus = new Set(); let cur = depart;
        while (cur && chaine[cur] && chaine[cur].length) { if (vus.has(cur)) { cycle = true; return; } vus.add(cur); cur = chaine[cur][0]; }
      });
      return { valide: !!vd.valid, ignore: !!vd.skipped, erreurs: (vd.errors || []).slice(0, 5).map(String),
        annoteValide: annote ? !!annote.valid : null,
        pages: pages.length, renvois: renvois.length,
        renvoisOrphelins: renvois.filter(t => !ids.has(t)), cycle: cycle,
        modules: (d.doc.modules || []).map(x => x.id), titresModules: (d.doc.modules || []).map(x => x.title) };
    });
    if (!v) { echecs.push('aucun document assemble en memoire'); }
    else {
      console.log('  schema clinicalDocument (document BRUT) : ' + (v.ignore ? 'AJV INACTIF — rien n\'est prouve'
        : v.valide ? 'valide' : 'INVALIDE — ' + v.erreurs.join(' | ')));
      // Rapporte pour memoire, jamais compte comme un echec : validatedDoc porte `_status` par
      // construction, et c'est le document BRUT qui est conserve, exporte et re-valide.
      console.log('  (pour memoire, la copie annotee validatedDoc : '
        + (v.annoteValide === null ? 'absente' : v.annoteValide ? 'valide' : 'refusee — normal, elle porte _status') + ')');
      if (v.ignore) echecs.push('AJV inactif : la validation du schema ne prouve rien');
      if (!v.valide && !v.ignore) echecs.push('document assemble invalide au schema');
      console.log('  approfondissements : ' + v.pages + ' page(s), ' + v.renvois + ' renvoi(s), '
        + v.renvoisOrphelins.length + ' orphelin(s), cycle : ' + v.cycle);
      if (v.renvoisOrphelins.length) echecs.push('renvois dans le vide : ' + v.renvoisOrphelins.join(', '));
      if (v.cycle) echecs.push('un cycle subsiste entre pages d\'approfondissement');
      console.log('  sommaire groupe : modules ' + JSON.stringify(v.modules) + ' — ' + JSON.stringify(v.titresModules));
      if (v.modules.length !== 3) echecs.push('doc.modules porte ' + v.modules.length + ' entrees au lieu de 3');
    }
    console.log('  noms dans « Mes creations » (du plus recent au plus ancien) :');
    m.nomsSidebar.slice(0, 5).forEach(n => console.log('    ' + n));
    const attenduCours = 'Cours — ' + plan.titre + ' (assemblé)';
    if (m.nomsSidebar[0] !== attenduCours) echecs.push('nom du cours assemble : « ' + m.nomsSidebar[0] + ' » au lieu de « ' + attenduCours + ' »');
    plan.modules.forEach((mod, i) => {
      const attendu = 'Cours — ' + plan.titre + ' · Module ' + (i + 1) + ' sur 3 · ' + mod.titre;
      if (!m.nomsSidebar.includes(attendu)) echecs.push('nom de module absent : « ' + attendu + ' »');
    });

    // 5) L'EXPORT, reellement ecrit, ouvert et clique.
    console.log('\n[5/5] export autonome — ecrit, ouvert et clique');
    const html = await page.evaluate(() => {
      const d = window._adocLastStructuredDoc;
      return d ? window.adocBuildStandalonePresentationHTML(d.doc) : null;
    });
    if (!html) { console.error('  ECHEC : export impossible.'); echecs.push('export impossible'); }
    else {
      const fichier = SORTIE('cours-exporte.html');
      fs.writeFileSync(fichier, html, 'utf8');
      console.log('  fichier : tests/lot-b/cours-exporte.html (' + (html.length / 1024).toFixed(0) + ' Ko, jamais commite)');
      const vue = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const erreursExport = [];
      vue.on('pageerror', e => erreursExport.push(e.message));
      const t1 = Date.now();
      await vue.goto('file://' + fichier);
      await vue.waitForFunction(() => document.getElementById('cc-ws-present-overlay')?.classList.contains('open'),
        null, { timeout: 60000 });
      const ouverture = Date.now() - t1;
      const exp = await vue.evaluate(() => {
        const toc = document.getElementById('cc-ws-present-toc');
        return { ouverture: true, tocPresent: !!toc,
          // Le sommaire GROUPE : des intitules de module, et le numerotage global conserve.
          intitules: toc ? [...toc.querySelectorAll('.cc-ws-present-toc-titre')].map(e => e.textContent.trim()) : [],
          diapositives: toc ? toc.querySelectorAll('.cc-ws-present-toc-item:not(.cc-ws-present-toc-dive)').length : 0,
          approfondissements: toc ? toc.querySelectorAll('.cc-ws-present-toc-dive').length : 0,
          chips: document.querySelectorAll('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip').length };
      });
      console.log('  ouverture : ' + ouverture + ' ms · sommaire : ' + exp.diapositives + ' diapositives, '
        + exp.approfondissements + ' approfondissement(s)');
      console.log('  intitules dans le sommaire : ' + JSON.stringify(exp.intitules));
      // Le sommaire groupe porte un intitule par module, PLUS la section « Approfondissements »
      // quand le cours en contient (lot B3). Exiger exactement 3 etait une erreur de ce test.
      const intitulesModules = exp.intitules.filter(t => !/^approfondissement/i.test(t));
      if (intitulesModules.length !== 3) {
        echecs.push('sommaire groupe : ' + intitulesModules.length + ' intitule(s) de module au lieu de 3');
      }
      const sectionAppro = exp.intitules.some(t => /^approfondissement/i.test(t));
      if (exp.approfondissements > 0 && !sectionAppro) {
        echecs.push('des pages d\'approfondissement existent mais le sommaire n\'en annonce aucune section');
      }
      plan.modules.forEach((mod, i) => {
        if (!intitulesModules[i] || intitulesModules[i] !== mod.titre) {
          echecs.push('sommaire, intitule ' + (i + 1) + ' : « ' + (intitulesModules[i] || '(absent)')
            + ' » au lieu de « ' + mod.titre + ' »');
        }
      });
      // Un lien d'approfondissement REELLEMENT clique : c'est la seule facon de voir une fonction
      // interne oubliee d'engineFnRefs, qui ne se manifeste qu'en ReferenceError au clic.
      const gestes = await vue.evaluate(async () => {
        const chipSurDiapo = () => document.querySelector('#cc-ws-present-slide-inner .adoc-sc-deepdive-chip');
        const titre = () => document.querySelector('.cc-ws-present-door-title')?.textContent || null;
        const ouverte = () => !!document.getElementById('cc-ws-present-door')?.classList.contains('open');
        const btns = () => [...document.querySelectorAll('.cc-ws-present-door-btn')];
        // Avancer jusqu'a une diapositive qui porte un lien : toutes n'en ont pas.
        for (let i = 0; i < 40 && !chipSurDiapo(); i++) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await new Promise(r => setTimeout(r, 120));
        }
        if (!chipSurDiapo()) return { trouve: false };
        const avant = document.getElementById('cc-ws-present-slide-inner').innerHTML;
        chipSurDiapo().click();
        await new Promise(r => setTimeout(r, 200));
        const niveau1 = titre();
        const noms = btns().map(b => (b.getAttribute('aria-label') || b.textContent || '').trim());
        btns()[0]?.click(); await new Promise(r => setTimeout(r, 200));
        const apresReculer = { porteOuverte: ouverte(), titre: titre() };
        chipSurDiapo()?.click(); await new Promise(r => setTimeout(r, 200));
        btns()[1]?.click(); await new Promise(r => setTimeout(r, 200));
        const apresMaitre = { porteOuverte: ouverte(),
          pile: (window._adocPresentState.deepDiveStack || []).slice() };
        return { trouve: true, niveau1: niveau1, noms: noms, apresReculer: apresReculer,
          apresMaitre: apresMaitre,
          diapoIntacte: document.getElementById('cc-ws-present-slide-inner').innerHTML === avant };
      });
      if (!gestes.trouve) {
        console.log('  AUCUN lien d\'approfondissement sur les 40 premieres diapositives — rien a cliquer.');
        echecs.push('aucun lien d\'approfondissement dans le cours genere : les gestes ne sont pas eprouves');
      } else {
        console.log('  lien clique → « ' + gestes.niveau1 + ' » · boutons ' + JSON.stringify(gestes.noms));
        console.log('  Reculer → porte ' + (gestes.apresReculer.porteOuverte ? 'ouverte sur « ' + gestes.apresReculer.titre + ' »' : 'refermee'));
        console.log('  Page maitre → porte ' + (gestes.apresMaitre.porteOuverte ? 'OUVERTE (anormal)' : 'refermee')
          + ', pile ' + JSON.stringify(gestes.apresMaitre.pile));
        console.log('  diapositive intacte apres les gestes : ' + gestes.diapoIntacte);
        if (!gestes.niveau1) echecs.push('le lien d\'approfondissement n\'a rien ouvert dans l\'export');
        if (gestes.noms.length !== 2 || !gestes.noms.every(Boolean)) echecs.push('les deux gestes de retour ne portent pas de nom accessible : ' + JSON.stringify(gestes.noms));
        if (gestes.apresMaitre.porteOuverte || gestes.apresMaitre.pile.length) echecs.push('Page maitre n\'a pas tout referme');
        if (!gestes.diapoIntacte) echecs.push('la diapositive a ete modifiee par les gestes');
      }
      if (erreursExport.length) { console.error('  ERREURS DANS L\'EXPORT : ' + erreursExport.join(' | ')); echecs.push('erreurs de page dans l\'export : ' + erreursExport.join(' | ')); }
      else console.log('  aucune erreur de page dans le fichier exporte');
      releve.resultat = Object.assign({ minutes: Number(minutes), dureesModules: dureesModules,
        export: { ko: Math.round(html.length / 1024), ouvertureMs: ouverture, sommaire: exp, gestes: gestes,
                  erreursExport: erreursExport } }, m, { validation: v });
      await vue.close();
    }
    if (releve.resultat == null) releve.resultat = Object.assign({ minutes: Number(minutes) }, m, { validation: v });

    if (releve.erreursPage.length) { console.error('\nERREURS DE PAGE (application) : ' + releve.erreursPage.join(' | ')); echecs.push('erreurs de page dans l\'application'); }
    releve.echecs = echecs;
    console.log('\n' + (echecs.length ? '=== ' + echecs.length + ' POINT(S) EN ECHEC ===\n  - ' + echecs.join('\n  - ')
                                      : '=== PHASE B : TOUS LES POINTS VERIFIES ==='));
    return finir(ctx, echecs.length ? 1 : 0);
  } catch (e) {
    console.error('\nECHEC INATTENDU : ' + (e && e.message));
    releve.echec = (e && e.message) || String(e);
    if (ctx) return finir(ctx, 1);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
