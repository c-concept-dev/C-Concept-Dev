// LOT A0 — une génération RÉELLE de Présentation, de bout en bout, par le vrai pipeline.
//
// Jamais faite jusqu'ici : tout ce qui précède était éprouvé sur des documents forgés à la main.
// Celle-ci passe par window.adocSend(), l'entrée que l'application utilise elle-même : plan,
// recherche RAG dans la bibliothèque, prompt système, puis génération. Elle mesure ensuite ce
// qui en est sorti. Un repli sur le moteur legacy est compté comme un ÉCHEC, jamais comme un
// succès partiel.
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
// Plusieurs sujets en UNE seule execution : la cle n'est saisie qu'une fois, et une campagne de
// quatre sujets ne coute plus quatre saisies. Chaque sujet part d'une page NEUVE, sans quoi la
// conversation precedente influencerait la suivante.
const SUJETS = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!SUJETS.length) SUJETS.push("le cortisol et le systeme nerveux dans le stress chronique du couple");
// --publie : ouvrir la version REELLEMENT SERVIE par GitHub Pages plutot que le fichier local.
// C'est la seule facon de verifier ce que Christophe utilisera : un fichier local peut differer
// de ce qui est publie, et l'a deja fait.
// --local : sert les fichiers LOCAUX sous l'adresse publiee. Indispensable pour mesurer une
// version NON POUSSEE : le Worker n'accepte qu'une origine fixe
// (https://c-concept-dev.github.io), et un fichier ouvert en file:// presente une origine `null`
// que son CORS refuse — la campagne echouait entierement pour cette seule raison. On ne touche
// JAMAIS au CORS du Worker pour contourner cela : c'est la page qui prend la bonne origine.
const LOCAL_SOUS_ORIGINE = process.argv.includes('--local');
// Essais d'hypothese, SANS modifier le moindre fichier de production :
//   --max-tokens=N  reecrit max_tokens de l'appel structure EN VOL, sur la requete sortante ;
//   --carte=<id>    part d'une autre carte de l'ecran d'accueil (format-summary, etc.) ;
//   --type=<kind>   attend un autre documentKind que 'presentation'.
// Rien n'est touche sur le disque : l'hypothese se teste et disparait avec le processus.
const arg = (nom, def) => { const a = process.argv.find(x => x.startsWith('--' + nom + '=')); return a ? a.split('=').slice(1).join('=') : def; };
const MAX_TOKENS = parseInt(arg('max-tokens', '0'), 10) || 0;
const CARTE = arg('carte', 'format-presentation');
const TYPE_ATTENDU = arg('type', 'presentation');
// --reponse=<libelle> : choisir une reponse de clarification par son libelle, pour isoler une
// variable. Exemple : --reponse="Document de reference" force le 3e choix de la question sur
// l'usage, afin de voir si duree_minutes est ce qui fait deborder la generation.
// Ne s'applique JAMAIS a la question du TYPE de document : celle-la doit rester « presentation »,
// sans quoi on comparerait deux documents differents et la mesure ne voudrait plus rien dire.
const REPONSE = arg('reponse', '');
const PUBLIE = process.argv.includes('--publie') || LOCAL_SOUS_ORIGINE;
const PAGES = 'https://c-concept-dev.github.io/C-Concept-Dev/tools/Projet%20therapeutes/Conseiller%20Clinique/studio-clinique.html';
const ORIGINE_PAGES = 'https://c-concept-dev.github.io';

async function mesurerUnSujet(browser, SUJET) {
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const avertissements = [], erreurs = [], journal = [], troncature = [], diagnostic = [];
    let echecStructure = null;
    page.on('pageerror', e => erreurs.push(e.message));
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'warning') avertissements.push(t);
      if (/appel 2|HTTP|approfondissement/i.test(t)) journal.push(m.type() + ': ' + t.slice(0, 200));
      // Troncature et continuation : les deux seuls signaux qui disent si max_tokens a ete
      // atteint. Ils ne se devinent pas depuis le document produit.
      if (/tronqu|max_tokens|continuation|emit_remaining/i.test(t)) troncature.push(t.replace(/\s+/g, ' ').slice(0, 160));
      // Les lignes qui DISENT pourquoi une generation echoue. Sans elles, un repli sur l'ancien
      // moteur ne se distingue pas d'une lenteur, et l'on attend douze minutes pour rien.
      if (/Génération structurée|QC bloquant|stop_reason|continuation|repli|duree_minutes|tool_use accumulé/i.test(t)) {
        diagnostic.push(m.type() + ': ' + t.replace(/\s+/g, ' ').slice(0, 300));
      }
      // Le repli est ANNONCE en clair par l'application : signal bien plus sur que l'inspection des
      // artefacts, qui ne voyait rien et laissait tourner le compteur douze minutes.
      if (!echecStructure && /en échec \(ou QC bloquant\)|repli automatique sur l'ancien moteur/i.test(t)) {
        echecStructure = t.replace(/\s+/g, ' ').slice(0, 400);
      }
    });
    // Rien ne doit sortir ailleurs que vers le Worker. Blocage RÉEL, et tout hôte refusé est
    // rapporté : si un appel partait vers un tiers, ce test le dirait au lieu de le laisser passer.
    const hotesBloques = new Set();
    const hotesContactes = new Set();
    const BASE_PAGES = ORIGINE_PAGES + '/C-Concept-Dev/tools/Projet%20therapeutes/Conseiller%20Clinique/';
    const RACINE_LOCALE = path.join(__dirname, '..', '..');
    const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    let serviesEnLocal = 0;
    let maxTokensReecrits = 0;
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      // En mode --publie, l'origine GitHub Pages doit evidemment etre jointe : c'est la page
      // elle-meme. Elle est relevee comme les autres, jamais laissee implicite.
      if (LOCAL_SOUS_ORIGINE && u.startsWith(BASE_PAGES)) {
        // La page garde l'origine publiee, mais son CONTENU vient du disque : c'est ainsi qu'on
        // mesure une version non poussee sans rien publier ni assouplir le CORS du Worker.
        const rel = decodeURIComponent(u.slice(BASE_PAGES.length).split('?')[0].split('#')[0]);
        const fichier = path.join(RACINE_LOCALE, rel);
        if (!fichier.startsWith(RACINE_LOCALE)) return route.abort();
        try {
          const corps = fs.readFileSync(fichier);
          serviesEnLocal++;
          return route.fulfill({ status: 200, body: corps,
            contentType: TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream' });
        } catch (_) { return route.continue(); }
      }
      if (PUBLIE && u.startsWith(ORIGINE_PAGES)) { hotesContactes.add(new URL(u).host); return route.continue(); }
      if (u.startsWith(WORKER)) {
        hotesContactes.add(new URL(u).host);
        // Releve du plafond de sortie : on reecrit la requete telle qu'elle part, jamais le code.
        if (MAX_TOKENS && route.request().method() === 'POST') {
          const brut = route.request().postData() || '';
          if (/"max_tokens"\s*:\s*8000/.test(brut) && /tool_choice/.test(brut)) {
            maxTokensReecrits++;
            return route.continue({ postData: brut.replace(/"max_tokens"\s*:\s*8000/, '"max_tokens":' + MAX_TOKENS) });
          }
        }
        return route.continue();
      }
      // Dependances DECLAREES de l'application (jszip, pdf.js, mammoth, polices) : de simples GET
      // de fichiers statiques, qui n'emportent aucune donnee. Les bloquer ne protegeait rien et
      // risquait de casser le pipeline meme qu'on cherche a mesurer.
      if (/^https:\/\/(cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//.test(u)) {
        hotesContactes.add(new URL(u).host); return route.continue();
      }
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
    await page.waitForFunction(() => typeof window.adocSend === 'function' && !!document.getElementById('adoc-input'));
    // L'adresse n'est PAS vérifiée en interrogeant l'application : adocGetWorkerUrl est une
    // fonction de MODULE, pas une propriété de window — l'appeler faisait échouer A0 avant tout
    // appel (« window.adocGetWorkerUrl is not a function »). Elle est vérifiée par le
    // COMPORTEMENT : on relève les adresses réellement contactées, et on exige qu'elles soient
    // toutes celle du Worker. Une preuve vaut mieux qu'une interrogation.
    console.log('Adresse imposee : ' + WORKER + ' (verifiee sur les requetes reellement emises)');

    console.log('Sujet : ' + SUJET);
    console.log('Appel REEL en cours par le VRAI pipeline (plan, RAG sur la bibliotheque, puis');
    console.log('generation structuree). Cela peut prendre plusieurs minutes...\n');

    // On passe par window.adocSend(), l'entree que l'application utilise elle-meme : elle
    // enchaine le plan, la recherche RAG dans la bibliotheque, la construction du prompt systeme
    // et la generation. Appeler adocGenerateStructuredDocument directement ne marchait PAS — la
    // generation structuree est sourcee exclusivement par les passages de la bibliotheque et
    // refuse de produire sans eux (« Aucun passage RAG disponible »). C'etait un defaut de ce
    // harnais, jamais du produit.
    const t0 = Date.now();
    // CHEMIN REEL DE L'UTILISATRICE : choisir la carte « Presentation » sur l'ecran d'accueil,
    // puis decrire le sujet, puis envoyer. Cliquer cette carte pose le type EXPLICITEMENT
    // (data-kind="presentation"), ce qui evite la question « quel type de document ? ».
    // Passer directement par la zone de chat, comme le faisait ce harnais, laissait le type
    // indetermine : l'application posait la question, et une reponse mal choisie produisait un
    // carrousel — ce qui est arrive.
    const depart = await page.evaluate(([sujet, idCarte]) => {
      const carte = document.getElementById(idCarte);
      const champ = document.getElementById('clinical-question');
      const form = document.getElementById('clinical-home-form');
      if (!carte || !champ || !form) return { via: 'chat', raison: 'ecran d accueil indisponible' };
      carte.click();
      champ.value = sujet;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit ? form.requestSubmit() : form.querySelector('button[type="submit"]').click();
      return { via: 'accueil', typeChoisi: carte.getAttribute('aria-pressed') };
    }, [SUJET, CARTE]);
    if (MAX_TOKENS) console.log('  essai  : max_tokens releve a ' + MAX_TOKENS + ' (reecriture en vol, aucun fichier modifie)');
    if (REPONSE) console.log('  essai  : reponse de clarification forcee sur « ' + REPONSE + ' » (hors question de type)');
    if (CARTE !== 'format-presentation' || TYPE_ATTENDU !== 'presentation') console.log('  essai  : carte ' + CARTE + ', type attendu ' + TYPE_ATTENDU);
    if (LOCAL_SOUS_ORIGINE) console.log('  mode   : fichiers LOCAUX servis sous l\'adresse publiee (' + serviesEnLocal + ' fichier(s) servi(s))');
    console.log('  depart : ' + (depart.via === 'accueil'
      ? 'carte ' + CARTE + ' cliquee (aria-pressed=' + depart.typeChoisi + '), formulaire soumis'
      : 'repli sur la zone de chat — ' + depart.raison));
    if (depart.via === 'chat') {
      await page.evaluate(sujet => {
        const champ = document.getElementById('adoc-input');
        champ.value = sujet;
        return window.adocSend();
      }, SUJET).catch(e => { console.log('  (adocSend a leve : ' + (e && e.message) + ')'); });
    }

    // L'application ne genere pas tout de suite : elle demande d'abord QUEL type de document, par
    // une carte de clarification. C'est son comportement normal, et un harnais qui se contente
    // d'attendre reste bloque sept minutes devant une question — c'est exactement ce qui s'est
    // produit. On y repond donc comme le ferait Christophe : en cliquant l'option « presentation ».
    // Un refus d'origine (CORS) ou un fetch impossible condamne la generation : l'attendre douze
    // minutes ne fait que retarder le meme constat. On l'attrape des qu'il apparait.
    let refusOrigine = null;
    page.on('console', m => {
      const t = m.text();
      if (!refusOrigine && /Access-Control-Allow-Origin|CORS policy|blocked by CORS|Failed to fetch|NetworkError/i.test(t)) {
        refusOrigine = t.replace(/\s+/g, ' ').slice(0, 220);
      }
    });
    page.on('requestfailed', r => {
      const e = r.failure() && r.failure().errorText;
      if (!refusOrigine && e && /CORS|ACCESS_CONTROL|FAILED/i.test(e) && r.url().startsWith(WORKER)) {
        refusOrigine = e + ' sur ' + r.url().slice(0, 90);
      }
    });
    const clarifications = [];
    let derniereQuestion = null;
    let sortie = { ok: false, erreur: 'etat inconnu' };
    // Apres un clic, on attend que la carte CHANGE ou disparaisse — jamais un delai fixe, qui
    // faisait recliquer la meme option avant que l'application ait traite la precedente.
    const attendreChangement = async (q) => {
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1500);
        const encore = await page.evaluate(() => {
          const c = document.querySelector('.cc-clarity-card');
          return c ? c.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
        });
        if (encore !== q) return;
      }
    };
    const limite = Date.now() + 720000; // 12 min : clarifications ET generation se partagent ce budget
    while (Date.now() < limite) {
      if (echecStructure) {
        sortie = { ok: false, repli: true, erreur: 'generation structuree en echec, repli sur l ancien moteur — ' + echecStructure
          + (refusOrigine ? '\n    CAUSE AMONT (refus d origine) : ' + refusOrigine : '') };
        break;
      }
      if (refusOrigine) {
        sortie = { ok: false, erreur: 'refus d\'origine ou appel impossible : ' + refusOrigine
          + (PUBLIE ? '' : ' — une page ouverte en file:// presente une origine `null` que le CORS du Worker refuse ; utiliser --publie ou --local') };
        break;
      }
      const etat = await page.evaluate(attendu => {
        const arts = window._adocArtifacts || {};
        for (const k of Object.keys(arts)) {
          const a = arts[k];
          if (a && a._adocStructuredDoc && a._adocStructuredDoc.documentKind === attendu) return { type: 'ok', doc: a._adocStructuredDoc };
          if (a && a._adocStructuredDoc) return { type: 'mauvaisType', kind: a._adocStructuredDoc.documentKind };
          if (a && a._adocGenerationEngine === 'legacy-html') return { type: 'repli' };
        }
        const carte = document.querySelector('.cc-clarity-card');
        if (carte) {
          const choix = [...carte.querySelectorAll('.cc-clarity-reply-btn')]
            .map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
          const question = carte.textContent.replace(/\s+/g, ' ').trim().slice(0, 300);
          if (choix.length) return { type: 'clarification', choix, question };
        }
        return { type: 'attente' };
      }, TYPE_ATTENDU);

      if (etat.type === 'ok') { sortie = { ok: true, doc: etat.doc }; break; }
      if (etat.type === 'mauvaisType') { sortie = { ok: false, erreur: 'document produit du MAUVAIS type : « ' + etat.kind +' » au lieu de « presentation »' }; break; }
      if (etat.type === 'repli') { sortie = { ok: false, repli: true, erreur: 'repli sur le moteur legacy-html : la generation structuree a echoue' }; break; }
      if (etat.type === 'clarification') {
        // Anti-boucle. Version precedente : elle comptait les RE-CLICS comme des tours et a
        // interrompu une generation qui venait de demarrer. On ne compte donc que les questions
        // DISTINCTES, et une question deja repondue n'est jamais recliquee — on attend qu'elle
        // change ou disparaisse.
        if (etat.question && etat.question === derniereQuestion) { await page.waitForTimeout(2500); continue; }
        if (clarifications.length >= 8) {
          sortie = { ok: false, erreur: 'la carte de clarification revient sans fin (' + clarifications.length + ' questions distinctes)' };
          break;
        }
        // Choix par PREFERENCE explicite, jamais « le premier venu » : un choix arbitraire
        // produirait une fiche ou un carrousel, et ce test mesure une PRESENTATION.
        const motif = /pr[ée]sentation|diaporama|expos[ée]|diapositive/i;
        // Un AUTRE type de document parmi les options suffit a dire que la question porte sur le
        // type — bien plus fiable que de deviner d'apres la formulation, qui m'a fait choisir
        // « Carrousel » au tour precedent. Dans ce cas, seule « presentation » convient.
        const autreType = /^(carrousel|tableau|fiche|script|liens)\b|^une? (fiche|carrousel|tableau|script)/i;
        const estTypeDeDocument = etat.choix.some(t => autreType.test(t))
          || /type de document|quel type|quel format/i.test(etat.question || '');
        let vise = etat.choix.find(t => motif.test(t));
        // Une preference explicite l'emporte, hors question de type.
        if (REPONSE && !estTypeDeDocument) {
          const force = etat.choix.find(t => t.toLowerCase().includes(REPONSE.toLowerCase()));
          if (force) vise = force;
        }
        // Hors question de type, n'importe quelle option convient (public, duree, angle) — mais
        // jamais une option qui nommerait un autre type.
        if (!vise && !estTypeDeDocument) vise = etat.choix.find(t => !autreType.test(t));
        if (!vise) {
          // Aucune option ne mene a une presentation : on repond en TEXTE LIBRE, exactement comme
          // le ferait Christophe devant les memes propositions. Un echec ici ne dirait rien du
          // produit, seulement de la liste proposee ce jour-la.
          clarifications.push({ question: etat.question, propose: etat.choix, choisi: '(texte libre) une presentation' });
          console.log('  clarification : aucune option « presentation » — reponse en texte libre');
          await page.evaluate(() => {
            const champ = document.getElementById('adoc-input');
            champ.value = 'Une presentation, en diapositives, pour des praticiens.';
            return window.adocSend();
          }).catch(() => {});
          derniereQuestion = etat.question;
          await attendreChangement(etat.question);
          continue;
        }
        derniereQuestion = etat.question;
        clarifications.push({ question: etat.question, propose: etat.choix, choisi: vise });
        console.log('  clarification : « ' + vise.slice(0, 110) + ' »');
        await page.evaluate(t => {
          const b = [...document.querySelectorAll('.cc-clarity-card .cc-clarity-reply-btn')]
            .find(x => x.textContent.replace(/\s+/g, ' ').trim() === t);
          if (b) b.click();
        }, vise);
        await attendreChangement(etat.question);
        continue;
      }
      await page.waitForTimeout(2500);
    }
    if (!sortie.ok && sortie.erreur === 'etat inconnu') sortie.erreur = 'aucun document structure apres ' + Math.round((Date.now() - t0) / 1000) + ' s';
    const secondes = Math.round((Date.now() - t0) / 1000);

    if (!sortie.ok) {
      console.error('ECHEC de la generation apres ' + secondes + ' s');
      console.error('  ' + sortie.erreur);
      if (sortie.repli) console.error('  (un repli legacy est un ECHEC de ce que ce test mesure, jamais un succes partiel)');
      // Un delai depasse ne dit rien par lui-meme. On rapporte OU le pipeline en etait : une
      // carte de clarification affichee (l'application attend une reponse, elle ne genere pas),
      // les artefacts deja poses, et le dernier message visible dans la conversation.
      const etat = await page.evaluate(() => ({
        artefacts: Object.keys(window._adocArtifacts || {}).map(k => ({
          cle: k, moteur: (window._adocArtifacts[k] || {})._adocGenerationEngine || null,
          structure: !!(window._adocArtifacts[k] || {})._adocStructuredDoc,
        })),
        clarification: !!document.querySelector('.cc-clarity-card'),
        enCours: !!document.querySelector('.adoc-typing, [id^="typing"]'),
        dernierMessage: (() => {
          const m = [...document.querySelectorAll('#adoc-messages > *')].pop();
          return m ? m.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
        })(),
      })).catch(() => null);
      // Tout ce que l'application a dit sur CETTE generation, dans l'ordre : c'est la piece qui
      // permet de trancher entre troncature, QC bloquant et abandon de flux.
      if (diagnostic.length) {
        console.error('');
        console.error('  JOURNAL DE LA GENERATION (' + diagnostic.length + ' ligne(s)) :');
        diagnostic.slice(-30).forEach(l => console.error('    ' + l));
      }
      const traces = await page.evaluate(() => {
        const m = window._adocLastStructAttemptMetrics;
        if (!m) return null;
        const r = t => ({ finalState: t.finalState, stopReason: t.stopReasonAtAbandon, payloadBytes: t.payloadBytes, httpErrorBody: t.httpErrorBody });
        return { sources: m.sourceCount, appel1: (m.metrics1 || []).map(r), appel2: (m.metrics2 || []).map(r) };
      }).catch(() => null);
      if (traces) { console.error(''); console.error('  TRACEUR DES TENTATIVES : ' + JSON.stringify(traces)); }
      if (clarifications.length) console.error('  clarifications traversees : ' + JSON.stringify(clarifications, null, 1));
      if (etat) {
        console.error('  carte de clarification affichee : ' + etat.clarification + (etat.clarification ? '  <- l application ATTEND une reponse, elle ne genere pas' : ''));
        console.error('  generation encore en cours       : ' + etat.enCours);
        console.error('  artefacts                        : ' + (JSON.stringify(etat.artefacts) || '[]'));
        console.error('  dernier message                  : ' + (etat.dernierMessage || '(aucun)'));
      }
      journal.forEach(l => console.error('  journal | ' + l));
      console.error('  adresses contactees : ' + ([...hotesContactes].join(', ') || 'aucune'));
      if (hotesBloques.size) console.error('  hotes bloques : ' + [...hotesBloques].join(', '));
      await page.close().catch(() => {});
      return { sujet: SUJET, ok: false, secondes, erreur: sortie.erreur };
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
    console.log('  clarifications traversees       : ' + (clarifications.length || 'aucune')
      + (clarifications.length ? ' (' + clarifications.map(c => '« ' + String(c.choisi).slice(0, 60) + ' »').join(', ') + ')' : ''));
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
      const octets = Buffer.byteLength(JSON.stringify(doc));
      console.log('  taille du JSON produit          : ' + Math.round(octets / 1024) + ' Ko');
      if (MAX_TOKENS) console.log('  requetes dont max_tokens releve  : ' + maxTokensReecrits);
      console.log('  troncature / continuation       : ' + (troncature.length ? troncature.slice(0, 2).join(' | ') : 'aucune'));
      await page.close().catch(() => {});
      return { sujet: SUJET, ok: true, secondes, titre: doc.title,
        diapositives: (doc.blocks || []).length, pages: dives.length,
        renvoisDeBloc: liensDeBloc.length, renvoisInternes: repartition.length,
        niveaux, retrouves, replis, octets,
        cycles: coupes.length, troncature: troncature.length, clarifications: clarifications.length };
    }
}

// ── CAMPAGNE ───────────────────────────────────────────────────────────────────────────────────
// Un sujet par page NEUVE, en serie : une conversation precedente influencerait la suivante, et
// une campagne dont les mesures se contaminent ne vaut rien. La cle n'est saisie qu'UNE fois.
(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const resultats = [];
  try {
    for (let i = 0; i < SUJETS.length; i++) {
      console.log('\n' + '='.repeat(78));
      console.log('SUJET ' + (i + 1) + '/' + SUJETS.length + ' — ' + SUJETS[i]);
      console.log('='.repeat(78));
      try {
        resultats.push(await mesurerUnSujet(browser, SUJETS[i]));
      } catch (e) {
        console.error('  ECHEC inattendu : ' + (e && e.message));
        resultats.push({ sujet: SUJETS[i], ok: false, erreur: 'exception : ' + (e && e.message) });
      }
    }
  } finally { await browser.close(); }

  if (SUJETS.length > 1) {
    console.log('\n' + '='.repeat(78));
    console.log('TABLEAU DE CAMPAGNE');
    console.log('='.repeat(78));
    const col = (v, n) => String(v == null ? '-' : v).padStart(n);
    console.log('  diapos pages renvois internes prof retrouv repli   Ko tronc  sujet');
    resultats.forEach(r => {
      if (!r.ok) { console.log('  ECHEC' + ' '.repeat(50) + r.sujet.slice(0, 38) + '  (' + r.erreur + ')'); return; }
      console.log('  ' + col(r.diapositives, 6) + col(r.pages, 6) + col(r.renvoisDeBloc, 8)
        + col(r.renvoisInternes, 8) + col(r.niveaux, 5) + col(r.retrouves, 8) + col(r.replis, 6)
        + col(Math.round(r.octets / 1024), 5) + col(r.troncature, 6) + '  ' + r.sujet.slice(0, 38));
    });
    const reussis = resultats.filter(r => r.ok);
    console.log('\n  ' + reussis.length + '/' + resultats.length + ' sujets aboutis'
      + (reussis.length ? ' — renvois internes au total : ' + reussis.reduce((a, r) => a + r.renvoisInternes, 0) : ''));
  }
  fs.writeFileSync(path.join(__dirname, 'resultats-campagne.json'),
    JSON.stringify({ date: new Date().toISOString(), publie: PUBLIE, resultats }, null, 1));
  console.log('\nMesures ecrites dans tests/lot-a/resultats-campagne.json (jamais commitees).');
  if (resultats.some(r => !r.ok)) process.exitCode = 1;
})();
