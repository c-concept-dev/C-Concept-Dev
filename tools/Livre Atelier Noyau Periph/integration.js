/*
 * ═════════════════════════════════════════════════════════════════════
 *  TESTS D'INTÉGRATION — Livre de Vie Atelier V7.4.2
 *  tests/integration.js
 *  C Concept&Dev — Christophe BONNET
 * ═════════════════════════════════════════════════════════════════════
 *
 *  Ce fichier vérifie que le pipeline complet Auteur + Éditeur marche de
 *  bout en bout avec un LLM déterministe (mock) qui retourne toujours
 *  la même réponse pour le même prompt.
 *
 *  Ce que testent ces tests :
 *    - loadTranscript parse un transcript minimal
 *    - diagnose produit un diagnostic
 *    - producePartition produit une partition JSON parsable
 *    - planBook produit un plan avec chapitres
 *    - writeChapter produit un texte
 *    - reviewChapter (Éditeur déterministe) retourne un rapport
 *    - reviewChapterLLM (Éditeur LLM) retourne un rapport parsable
 *    - reviewChapterHybrid combine les deux
 *    - rewriteTargeted fonctionne avec un rapport externe
 *    - reviewBookOpus retourne un rapport global
 *    - saveSession + restoreSession sont bijectifs
 *    - getTokenUsage mesure
 *
 *  Ce que ces tests NE testent PAS (empirique humain) :
 *    - La qualité littéraire du texte produit par le LLM
 *    - La conformité canon du contenu (Boussole tenue, etc)
 *    - La non-régression V7.4 vs V7.3.7 sur un livre complet
 *
 *  Usage :
 *    node tests/integration.js
 *
 *  Sortie : tableau de résultats + code retour 0 si OK, 1 si échec.
 * ═════════════════════════════════════════════════════════════════════
 */

const AuteurNoyau = require('../atelier-auteur-core.js');
const EditeurNoyau = require('../atelier-editeur-core.js');

// ─── HARNESS ─────────────────────────────────────────────────

const results = { pass: [], fail: [] };

function t(name, condition, detail) {
  const entry = { name, detail: detail || '' };
  if (condition) results.pass.push(entry);
  else results.fail.push(entry);
}

async function tAsync(name, fn) {
  try {
    const ok = await fn();
    t(name, ok === true || (ok && ok.pass === true), ok && ok.detail);
  } catch (e) {
    t(name, false, 'Exception : ' + e.message);
  }
}

// ─── MOCK LLM DÉTERMINISTE ───────────────────────────────────

function mockLlmCall(system, userMsg, maxTokens, model) {
  // Retourne une réponse fixe selon le type de prompt détecté.
  // ORDRE CRITIQUE : les tâches terminales (Architecte, Opératoire, Réécriture,
  // Éditeur LLM) viennent AVANT la partition, parce que leurs prompts contiennent
  // la partition injectée en contexte — on matcherait par erreur sinon.
  const u = (userMsg || '').toLowerCase();
  const s = (system || '').toLowerCase();

  // 0a. V7.4.2 — Résumé narratif structuré (après écriture de chaque chapitre)
  //     Le prompt système contient "RÉSUMÉ STRUCTURÉ du chapitre".
  if (s.includes('résumé structuré du chapitre') || s.includes('produire un résumé structuré')) {
    return Promise.resolve(JSON.stringify({
      resume_narratif: "Un matin dans la cuisine. Le sujet entre. La mère est là, dos tourné, tasse à la main. Elle ne se retourne pas. Silence dense. Le sujet regarde ses mains, puis la table nue. Il part sans un mot.",
      personnages_actifs: [
        { nom: "La mère", descripteurs_utilises: ["silencieuse", "dos tourné", "tasse à la main"], action_principale: "elle ne se retourne pas" },
        { nom: "Le sujet", descripteurs_utilises: ["hésitant", "mains ouvertes"], action_principale: "il entre puis il repart sans parole" }
      ],
      lieux_decrits: [
        { nom: "la cuisine", details_concrets: ["linoléum usé", "table en formica", "fenêtre sur cour"], moment: "matin d'hiver" }
      ],
      scenes_fortes: [
        { titre_interne: "Le café du matin", resume_precis: "Le sujet entre, la mère ne se retourne pas, il repart.", elements_sensibles: ["tasse fumante", "dos tourné", "silence"] }
      ],
      dettes_ouvertes: [
        { nature: "Pourquoi la mère ne se retourne-t-elle jamais ?", echeance_souhaitee: "avant Ch.10" }
      ],
      dettes_refermees: [],
      echos_poses: [
        { element: "la tasse posée", intensite: "forte" },
        { element: "le silence du matin", intensite: "forte" }
      ],
      echos_repris: []
    }));
  }

  // 0b. V7.4.2 — Éditeur transversal (rapport structurel sur livre entier)
  if (s.includes('éditeur senior qui lit un livre en le prenant comme totalité') ||
      s.includes('dilutions transversales')) {
    return Promise.resolve(JSON.stringify({
      verdict_global: 'tient',
      justification_verdict: 'Le livre tient globalement. Les motifs se chargent, la progression du péril est stable, pas de dilution majeure.',
      progression_peril: { etat: 'stable', chapitres_critiques: [], commentaire: 'Présent du début à la fin.' },
      regime_narratif: { etat: 'stable', chapitres_suspects: [], commentaire: '' },
      cartographie_motifs: [
        { motif: 'silence', chapitres_actifs: [1, 2], chapitres_silencieux: [], etat: 'charge croissante', commentaire: 'Bien tenu' }
      ],
      dettes_non_refermees: [],
      echos_non_repris: [],
      coupures_narratives: [],
      dilutions_cumulees: { present: false, description: '' },
      chapitres_prioritaires_a_retravailler: []
    }));
  }

  // 1. Réécriture ciblée — user commence par "Tu as écrit ce chapitre"
  if (u.includes('tu as écrit ce chapitre') || u.includes('corriger uniquement ces défauts')) {
    return Promise.resolve(`Un matin. La pièce est silencieuse. Je regarde mes mains.

La table est nue. Hier il y avait la tasse, le journal.

Je me tiens dans l'encadrement. La lumière tombe sur le mur d'en face.

Je m'approche de la fenêtre. Les voitures passent sans bruit.

La tasse de thé est sur le rebord. Elle n'a pas été lavée.

Un geste petit. Le matin continue sans moi. Je reste là.`);
  }

  // 2. Conception par Architecte — user commence par "Tu conçois le chapitre"
  if (u.includes('tu conçois le chapitre') || u.includes('concevoir le chapitre')) {
    return Promise.resolve(JSON.stringify({
      q1_valeur_initiale: 'une certitude',
      q2_valeur_finale: 'une absence',
      q3_enjeu: 'rester debout',
      q4_obstacle: 'le corps qui ne répond pas',
      q5_issue: 'incertaine',
      q6_deux_forces: ['le sujet', 'la pièce vide'],
      q7_moment_choisi: 'un matin',
      q8_fin: 'un geste petit',
      q9_residu: 'une tasse posée',
      q10_consequence: 'ouvre le chapitre suivant',
      q11_scene_fondatrice: true,
      q12b_fait_nouveau: 'le sujet voit pour la première fois que la table est nue',
      moment: 'un matin',
      scene_fondatrice: true,
      deux_forces: ['le sujet', 'la pièce vide'],
      obstacle: 'le corps qui ne répond pas',
      issue: 'incertaine',
      consequence: 'ouvre le chapitre suivant',
      residu: 'une tasse posée',
      valeur_initiale: 'une certitude',
      valeur_finale: 'une absence',
      enjeu: 'rester debout',
      fin: 'un geste petit',
      fait_nouveau: 'le sujet voit pour la première fois que la table est nue',
    }, null, 2));
  }

  // 3. Écriture opératoire — user commence par "Tu écris le chapitre"
  if (u.includes('tu écris le chapitre') || u.includes('ecris le chapitre')) {
    return Promise.resolve(`Un matin. La pièce est silencieuse. Je regarde mes mains.

La table est nue. Elle ne l'était pas hier. Hier il y avait la tasse, le journal, le sucrier.

Je me tiens dans l'encadrement. Je ne sais pas ce que je cherche. La lumière tombe sur le mur d'en face.

Un bruit. Ce n'est rien. Le radiateur. Le silence revient et je reste debout, les mains ouvertes le long du corps.

Je m'approche de la fenêtre. Les voitures passent. Elles passent sans bruit parce que j'ai fermé la vitre hier soir.

La tasse de thé est encore là, sur le rebord. Elle n'a pas été lavée. Elle m'attend.

Un geste petit. Le matin continue sans moi. Je reste là, et je regarde.`);
  }

  // 4. Éditeur mode LLM — system contient "ÉDITEUR canon"
  if (s.includes('éditeur canon') || s.includes('editeur canon') ||
      (s.includes('boussole souveraine') && s.includes('3 contrôles'))) {
    return Promise.resolve(JSON.stringify({
      boussole_globale: { verdict: 'tient', justification: 'Le chapitre respecte la Boussole.' },
      controles: {
        scene: { verdict: 'OK', details: 'Les 9 éléments présents.' },
        boussole_puzzle: { verdict: 'OK', details: 'Rien de cosmétique.' },
        narrateur: { verdict: 'OK', details: 'Aucun geste interdit détecté.' },
      },
      signaux: [],
    }));
  }

  // 5. Plan du livre
  if (u.includes('plan du livre') || u.includes('plan de ce livre') ||
      (u.includes('tu planifies') && u.includes('livre'))) {
    return Promise.resolve(JSON.stringify({
      title: 'Ce qui reste',
      subtitle: null,
      epigraph: null,
      chapters: [
        { title: 'Le premier matin', description: 'Ouverture — la matière absente' },
        { title: 'La cuisine', description: 'Scène de retour' },
      ],
    }, null, 2));
  }

  // 6. Supervision partition par Opus
  if (u.includes('supervise') || (s.includes('opus') && u.includes('partition'))) {
    return Promise.resolve('VERDICT : partition validée. Quelques ajustements mineurs possibles mais la structure tient.');
  }

  // 7. 4e de couverture
  if (u.includes('4e de couverture') || u.includes('quatrième') || s.includes('4e de couverture')) {
    return Promise.resolve('Un livre sobre sur ce qui reste quand une présence s\'en va. Court, présent, sans pathos. Une voix basse qui tient.');
  }

  // 8. Relecture Opus globale
  if (s.includes('tenue globale') || s.includes('relit un livre terminé')) {
    return Promise.resolve(`## 1. TENUE DES CHAPITRES
Chapitre 1 : tient. Chapitre 2 : tient.

## 2. MOTIFS DE LA PARTITION
Le motif "silence" se charge bien au chapitre 1.

## 3. DILUTIONS GLOBALES
Aucune dilution majeure détectée.

## 4. VERDICT FINAL
Le livre tient comme totalité. Prêt à livrer.`);
  }

  // 9. Partition singulière — arrive APRÈS architecte/opératoire
  // (car leurs prompts contiennent aussi "partition" en contexte)
  if (s.includes("partition singulière") || s.includes("produire la partition")) {
    return Promise.resolve(JSON.stringify({
      respiration: {
        longueur_phrase_cible: '8-15 mots',
        pct_phrases_courtes: 30,
        citation_matiere: 'Un matin tout seul. La pièce est silencieuse.',
      },
      lexique: {
        registre: 'concret',
        tabous: ['adverbes de manière lourds'],
        citation_matiere: 'Je regarde mes mains.',
      },
      syntaxe_du_sujet: {
        preferences: 'paratactique, courtes propositions',
        citation_matiere: 'La table est nue. Elle ne l\'était pas hier.',
      },
      temporalite_interieure: {
        tendance: 'présent de scène, imparfait de fond',
        citation_matiere: 'Hier il y avait la tasse, le journal, le sucrier.',
      },
      corps_et_geste: {
        presence: 'mains, respiration, regards',
        citation_matiere: 'Je regarde mes mains.',
      },
      lieux_et_objets: {
        couleur: 'intérieurs mats, lumières obliques',
        citation_matiere: 'La pièce est silencieuse.',
      },
      rapport_au_lecteur: {
        posture: 'confidence basse, sans didactique',
        citation_matiere: 'Je ne sais pas ce que je cherche.',
      },
      dynamique_narrative: {
        tension_centrale: 'ce qui reste quand ça part',
        revelation_progressive: true,
        citation_matiere: 'Quelque chose est parti sans qu\'on sache quand.',
      },
      procedes_de_transe: {
        mots_pivots_isomorphes: [{ mot: 'silence', count_cible: 5 }, { mot: 'mains' }],
        motif_saupoudrage_principal: 'lumière',
        citation_matiere: 'Le silence revient.',
      },
      regime_narratif: { pov: 'JE-sujet', transitions: 'marquées par blancs' },
    }, null, 2));
  }

  // 10. Diagnostic littéraire
  if (s.includes("d'une extrême finesse") || u.includes('diagnostic littéraire') || u.includes('diagnostic')) {
    return Promise.resolve(`Genre : biographie intérieure.
Tonalité : sobre, attentive, sans pathos.
Voix narrative : JE, présent, basse intensité.
Tension motrice : qu'est-ce qui tient quand on perd ce qui tenait ?
Péril : la dissipation silencieuse.
Personnages : le sujet et une figure tutélaire.
Lieu : un intérieur domestique et un paysage urbain.
Temporalité : trois jours du présent, avec des retours au passé.
Références : Annie Ernaux (La Place), Modiano (Dora Bruder).
Pièges : la glose psychologique, le narrateur qui explique ce qu'il faudrait montrer.
Singularité : la matière propre du sujet — son lexique, ses silences.`);
  }

  // Par défaut
  return Promise.resolve('Réponse par défaut du mock LLM.');
}

// ─── TRANSCRIPT DE TEST ──────────────────────────────────────

const TEST_TRANSCRIPT = `# SUJET, 45 ans

## TOUR 1
— Parle-moi d'un matin.
— Un matin tout seul. La pièce est silencieuse. Je regarde mes mains.
  La table est nue. Hier il y avait la tasse, le journal, le sucrier.

## TOUR 2
— Qu'est-ce que tu sens quand tu regardes la table vide ?
— Rien de précis. Un creux. Comme quand on entre dans une pièce
  et qu'on a oublié pourquoi.

# PARTIE 2

## 1. PHRASE-CLE
Quelque chose est parti sans qu'on sache quand.

## 2. SCENES FORTES
1. Le matin devant la table nue
2. La fenêtre fermée

## 3. PERSONNAGES
**Le sujet** : tient le livre, voix intérieure basse
**L'absent** : présent par ce qui reste

## 4. FILS NARRATIFS
**Le retrait silencieux** : motif central
**Les objets posés** : ce qui tient encore

## 5. CE QUI NE COLLE PAS
Le sujet n'arrive pas à nommer ce qu'il a perdu.
`;

// ─── TESTS ───────────────────────────────────────────────────

(async function () {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' TESTS D\'INTÉGRATION V7.4.2');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ─── PARTIE A — Pipeline Auteur complet ───
  console.log('A. Pipeline Auteur\n');

  let session = null;
  await tAsync('A.1 — createSession', async () => {
    session = AuteurNoyau.createSession({
      llmCall: mockLlmCall,
      onLog: () => {},
    });
    return session !== null && typeof session.llmCall === 'function';
  });

  await tAsync('A.2 — loadTranscript parse prenom/age', async () => {
    const parsed = AuteurNoyau.loadTranscript(session, TEST_TRANSCRIPT);
    return parsed.prenom === 'SUJET' && parsed.age === 45;
  });

  await tAsync('A.3 — loadTranscript extrait sections', async () => {
    const p = session.parsed;
    return !!p.sections['PHRASE-CLE'] && !!p.sections['SCENES FORTES'] &&
           !!p.sections['FILS NARRATIFS'];
  });

  await tAsync('A.4 — diagnose retourne du texte', async () => {
    const diag = await AuteurNoyau.diagnose(session);
    return typeof diag === 'string' && diag.length > 100;
  });

  await tAsync('A.5 — producePartition retourne objet parsable', async () => {
    await AuteurNoyau.producePartition(session);
    const part = AuteurNoyau.getPartition(session);
    return part && typeof part === 'object' &&
           part.procedes_de_transe &&
           Array.isArray(part.procedes_de_transe.mots_pivots_isomorphes);
  });

  await tAsync('A.6 — planBook retourne plan avec chapters', async () => {
    const plan = await AuteurNoyau.planBook(session);
    return plan && plan.title && Array.isArray(plan.chapters) && plan.chapters.length >= 2;
  });

  await tAsync('A.7 — writeChapter produit un texte non-trivial', async () => {
    const text = await AuteurNoyau.writeChapter(session, 0, { onLog: () => {} });
    return typeof text === 'string' && text.length > 200 && !!session.chapters[0];
  });

  await tAsync('A.8 — ChapterMemory initialisée après 1er chapitre', async () => {
    const mem = AuteurNoyau.getChapterMemory(session);
    return mem !== null && typeof mem === 'object';
  });

  // ─── PARTIE B — Noyau Éditeur (3 modes) ───
  console.log('\nB. Noyau Éditeur (3 modes)\n');

  const chapterText = session.chapters[0].text;
  const partition = AuteurNoyau.getPartition(session);

  await tAsync('B.1 — reviewChapter (déterministe) retourne rapport', async () => {
    const r = EditeurNoyau.reviewChapter(chapterText, partition, { chIdx: 0 });
    return r && Array.isArray(r.flags) && r.summary && typeof r.summary.total_flags === 'number';
  });

  await tAsync('B.2 — reviewChapterLLM parse correctement le JSON du mock', async () => {
    const r = await EditeurNoyau.reviewChapterLLM(
      chapterText, partition,
      { chapter_num: 1, chapter_title: 'Ch1', book_title: 'Test' },
      mockLlmCall
    );
    return r && Array.isArray(r.flags) && r.boussole && r.boussole.verdict === 'tient';
  });

  await tAsync('B.3 — reviewChapterHybrid combine déterministe + LLM', async () => {
    const r = await EditeurNoyau.reviewChapterHybrid(
      chapterText, partition,
      { chapter_num: 1, chapter_title: 'Ch1', book_title: 'Test' },
      mockLlmCall
    );
    return r && r._mode === 'hybrid' &&
           typeof r.summary.deterministic_flags === 'number' &&
           typeof r.summary.llm_flags === 'number';
  });

  await tAsync('B.4 — PROMPT_SYSTEME_EDITEUR_LLM contient canon', async () => {
    const p = EditeurNoyau.PROMPT_SYSTEME_EDITEUR_LLM;
    return p.includes('BOUSSOLE SOUVERAINE') &&
           p.includes('3 CONTRÔLES') &&
           p.includes('16 SIGNAUX') &&
           p.includes('Signal 16');
  });

  // ─── PARTIE C — Boucle Auteur ↔ Éditeur ───
  console.log('\nC. Boucle Auteur ↔ Éditeur\n');

  await tAsync('C.1 — rewriteTargeted avec rapport simulé améliorant', async () => {
    // On force un rapport avec flag critique pour déclencher la réécriture
    const fakeReport = {
      flags: [{
        code: 'TEST-FLAG', severity: 'haute', count: 1,
        hits: [{ match: 'hier', suggestion: 'à revoir' }],
      }],
    };
    const verify = async (newText) => ({ flags: [] });  // réécriture sans flag
    const r = await AuteurNoyau.rewriteTargeted(session, 0, fakeReport, { verify });
    return r.accepted === true && r.metrics && r.metrics.flags_after === 0;
  });

  await tAsync('C.2 — rewriteTargeted rejette si pas d\'amélioration', async () => {
    const fakeReport = {
      flags: [{
        code: 'TEST-FLAG', severity: 'haute', count: 1,
        hits: [{ match: 'hier', suggestion: 'à revoir' }],
      }],
    };
    const verify = async () => ({ flags: [
      { severity: 'haute' }, { severity: 'haute' }  // réécriture dégrade
    ]});
    const r = await AuteurNoyau.rewriteTargeted(session, 0, fakeReport, { verify });
    return r.accepted === false;
  });

  // ─── PARTIE D — Phase 3bis Opus ───
  console.log('\nD. Relecture Opus globale\n');

  // Écrire le 2e chapitre pour pouvoir relire tout le livre
  await AuteurNoyau.writeChapter(session, 1, { onLog: () => {} });

  await tAsync('D.1 — reviewBookOpus retourne rapport structuré', async () => {
    const r = await AuteurNoyau.reviewBookOpus(session, { model: 'claude-sonnet-4-6' });
    return typeof r === 'string' && r.length > 100;
  });

  await tAsync('D.2 — bookOpusReport est stocké dans la session', async () => {
    const r = AuteurNoyau.getBookOpusReport(session);
    return r && r.length > 0;
  });

  // ─── PARTIE E — 4e couverture + persistance ───
  console.log('\nE. 4e couverture + persistance\n');

  await tAsync('E.1 — buildBackCover retourne texte', async () => {
    const back = await AuteurNoyau.buildBackCover(session);
    return typeof back === 'string' && back.length > 50;
  });

  await tAsync('E.2 — saveSession retourne objet JSON-safe', async () => {
    const saved = AuteurNoyau.saveSession(session);
    if (!saved || saved._format !== 'ldv-session') return false;
    try {
      const json = JSON.stringify(saved);
      const parsed = JSON.parse(json);
      return parsed._format === 'ldv-session' && parsed.plan && parsed.chapters.length === 2;
    } catch (e) { return false; }
  });

  await tAsync('E.3 — restoreSession reconstruit une session équivalente', async () => {
    const saved = AuteurNoyau.saveSession(session);
    const restored = AuteurNoyau.restoreSession(saved, { llmCall: mockLlmCall });
    return restored.parsed.prenom === 'SUJET' &&
           restored.chapters.length === 2 &&
           restored.plan.title === 'Ce qui reste' &&
           restored.bookOpusReport !== null;
  });

  // ─── PARTIE F — Gouvernance coûts ───
  console.log('\nF. Gouvernance coûts\n');

  await tAsync('F.1 — getTokenUsage retourne structure', async () => {
    const u = AuteurNoyau.getTokenUsage(session);
    return u && typeof u.in === 'number' && typeof u.out === 'number' &&
           typeof u.calls === 'number' && typeof u.cost_usd === 'number';
  });

  // ─── PARTIE H — V7.4.2 Mémoire narrative structurée + Éditeur transversal ───
  console.log('\nH. V7.4.2 Mémoire structurée + Éditeur transversal\n');

  await tAsync('H.1 — VERSION Auteur bumped à 7.4.2', async () => {
    return AuteurNoyau.VERSION === '7.4.2-alpha';
  });

  await tAsync('H.2 — VERSION Éditeur bumped à 7.4.2', async () => {
    return EditeurNoyau.VERSION === '7.4.2-alpha';
  });

  await tAsync('H.3 — PROMPT_RESUME_STRUCTURE exposé', async () => {
    return typeof AuteurNoyau.PROMPT_RESUME_STRUCTURE === 'string' &&
           AuteurNoyau.PROMPT_RESUME_STRUCTURE.length > 1000;
  });

  await tAsync('H.4 — PROMPT_RESUME_STRUCTURE contient 5 registres', async () => {
    const p = AuteurNoyau.PROMPT_RESUME_STRUCTURE;
    return p.includes('personnages_actifs') && p.includes('lieux_decrits') &&
           p.includes('scenes_fortes') && p.includes('dettes_ouvertes') && p.includes('echos_poses');
  });

  await tAsync('H.5 — generateChapterResume produit les 5 registres', async () => {
    const r = await AuteurNoyau.generateChapterResume(session, 0, { mode: 'full' });
    return r && r.personnages_actifs && r.lieux_decrits &&
           r.scenes_fortes && r.dettes_ouvertes && r.echos_poses &&
           r.personnages_actifs.length === 2 &&
           r.lieux_decrits.length === 1;
  });

  await tAsync('H.6 — getChapterResumes retourne les résumés stockés', async () => {
    const rs = AuteurNoyau.getChapterResumes(session);
    return Array.isArray(rs) && rs.length >= 1 &&
           !!rs[0].resume && Array.isArray(rs[0].resume.personnages_actifs);
  });

  await tAsync('H.7 — buildChapterMemoryInjection utilise les résumés structurés', async () => {
    const injection = session.buildChapterMemoryInjection();
    return injection.includes('MÉMOIRE NARRATIVE STRUCTURÉE (V7.4.2)') &&
           injection.includes('La mère') &&
           injection.includes('la cuisine') &&
           injection.includes('Pourquoi la mère');
  });

  await tAsync('H.8 — mode off skip silencieusement', async () => {
    const r = await AuteurNoyau.generateChapterResume(session, 0, { mode: 'off' });
    return r === null;
  });

  await tAsync('H.9 — PROMPT_SYSTEME_EDITEUR_TRANSVERSAL exposé', async () => {
    return typeof EditeurNoyau.PROMPT_SYSTEME_EDITEUR_TRANSVERSAL === 'string' &&
           EditeurNoyau.PROMPT_SYSTEME_EDITEUR_TRANSVERSAL.includes('Boussole Souveraine');
  });

  await tAsync('H.10 — reviewBookTransversal retourne rapport structuré', async () => {
    const rapport = await EditeurNoyau.reviewBookTransversal(session, session.llmCall, {});
    return rapport && rapport.verdict_global === 'tient' &&
           Array.isArray(rapport.cartographie_motifs) &&
           rapport.meta && rapport.meta.mode === 'transversal' &&
           rapport.meta.used_structured_memory === true;
  });

  await tAsync('H.11 — reviewBookTransversal avec at_chapter limite la portée', async () => {
    const rapport = await EditeurNoyau.reviewBookTransversal(session, session.llmCall, { at_chapter: 1 });
    return rapport && rapport.meta && rapport.meta.chapters_analyzed === 1;
  });

  await tAsync('H.12 — override llmCall passe le 4e argument model', async () => {
    let receivedModel = null;
    const testSession = AuteurNoyau.createSession({
      llmCall: async (sys, user, maxTk, model) => {
        receivedModel = model;
        return 'OK';
      },
      onLog: () => {},
    });
    await testSession.llmCall('sys', 'user', 100, 'claude-haiku-4-5');
    return receivedModel === 'claude-haiku-4-5';
  });

  await tAsync('H.13 — saveSession/restoreSession préservent les résumés structurés', async () => {
    const saved = AuteurNoyau.saveSession(session);
    const restored = AuteurNoyau.restoreSession(saved, { llmCall: mockLlmCall });
    const rs = AuteurNoyau.getChapterResumes(restored);
    return rs.length >= 1 && rs[0].resume && rs[0].resume.personnages_actifs.length === 2;
  });

  // ─── PARTIE G — Canon universel ───
  console.log('\nG. Canon universel (hardcoding)\n');

  await tAsync('G.1 — Aucun sujet connu dans Auteur', async () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../atelier-auteur-core.js'), 'utf-8');
    // Pour l'auteur on autorise mention dans l'entête V7.3.7 legacy — on cherche juste
    // des hardcoding de valeurs/constantes (pas des mentions en code/prompt).
    // Le test strict : pas de "const ... = 'Kevin'" etc.
    const bad = src.match(/['"]\s*(Kevin|Nadia|Raymond)\s*['"]\s*\)?\s*[,;}]/g);
    return !bad || bad.length === 0;
  });

  await tAsync('G.2 — Aucun sujet connu dans Éditeur', async () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../atelier-editeur-core.js'), 'utf-8');
    const bad = src.match(/['"]\s*(Kevin|Nadia|Raymond)\s*['"]\s*\)?\s*[,;}]/g);
    return !bad || bad.length === 0;
  });

  // ─── RAPPORT FINAL ───
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' RAPPORT FINAL');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const r of results.pass) console.log('  ✓ ' + r.name);
  for (const r of results.fail) {
    console.log('  ✗ ' + r.name);
    if (r.detail) console.log('     → ' + r.detail);
  }

  const total = results.pass.length + results.fail.length;
  const pct = total > 0 ? Math.round((results.pass.length / total) * 100) : 0;
  console.log(`\n${results.pass.length}/${total} tests passent — ${pct}%`);

  if (results.fail.length > 0) process.exit(1);
  console.log('\n✓ Suite d\'intégration complète — pipeline V7.4.2 fonctionne de bout en bout');
  process.exit(0);
})();
