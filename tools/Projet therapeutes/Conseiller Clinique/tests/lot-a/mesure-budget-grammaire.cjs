// LOT A1 + A2 — de quelle marge dispose RÉELLEMENT le schéma d'outil de la Présentation ?
//
// Aucun fichier de production n'est modifié : le schéma est lu depuis la source, copié, puis la
// COPIE est soumise à de vrais appels. Une variable à la fois, jamais deux.
//
// A1 — combien de chaînes scalaires supplémentaires passent à chacun des trois niveaux :
//      (a) une entrée de deepDives, (b) une carte, (c) un bloc.
// A2 — la même mesure après avoir retiré UNE famille de champs, pour savoir ce qui coûte.
//
// max_tokens:1 : la grammaire est compilée avant le moindre jeton produit, donc un schéma trop
// gros échoue tout de suite. Un 400 ne coûte rien ; un 200 coûte l'entrée, quelques milliers de
// jetons. Plafond dur de 80 appels, compté et affiché.
//
//   STUDIO_WORKER_API_KEY=... node tests/lot-a/mesure-budget-grammaire.cjs
const fs = require('node:fs');
const path = require('node:path');

const WORKER = 'https://clone-proxy.11drumboy11.workers.dev';
const PLAFOND = 80;
const CLE = (process.env.STUDIO_WORKER_API_KEY || '').trim();
if (!CLE || /[^\x20-\x7E]/.test(CLE) || /^votre/i.test(CLE)) {
  console.error("Cle du Worker absente ou invalide. Aucun appel emis.");
  process.exit(2);
}

// ── Extraction du schéma réel depuis la source (jamais une copie tenue à la main) ──────────────
function extraire(source, nom) {
  const debut = source.indexOf('  const ' + nom + ' = {');
  if (debut === -1) throw new Error('schéma introuvable : ' + nom);
  const ouvrante = source.indexOf('{', debut);
  let prof = 0, i = ouvrante, chaine = null;
  for (; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (chaine) { if (c === '\\') i++; else if (c === chaine) chaine = null; continue; }
    if (c === '/' && n === '/') { i = source.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = source.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { chaine = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) break; }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + source.slice(ouvrante, i + 1) + ')');
}
const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'studio-clinique-core.js'), 'utf8');
const REFERENCE = extraire(SOURCE, 'ADOC_STRUCTURED_PRESENTATION_TOOL');
const copie = () => JSON.parse(JSON.stringify(REFERENCE));

// ── Les trois niveaux où l'on peut ajouter un champ ────────────────────────────────────────────
const NIVEAUX = {
  deepDive: t => t.input_schema.properties.deepDives.items,
  carte: t => t.input_schema.properties.cards.items,
  bloc: t => t.input_schema.properties.cards.items.properties.blocks.items,
};

function ajouterChaines(noeud, combien) {
  for (let i = 1; i <= combien; i++) {
    const nom = 'champMesure' + String(i).padStart(2, '0');
    noeud.properties[nom] = { type: 'string', description: 'Champ de mesure.' };
    if (Array.isArray(noeud.required)) noeud.required.push(nom);
  }
}

// ── Les familles de champs dont on veut connaître le coût ──────────────────────────────────────
const FAMILLES = {
  quiz: t => retirer(NIVEAUX.bloc(t), ['quizOptions', 'quizCorrectIndex', 'quizExplanation']),
  questionnaire: t => retirer(NIVEAUX.bloc(t), ['questionnaireQuestions', 'questionnaireProfiles', 'questionnaireTwoPartners']),
  'liens de bloc': t => retirer(NIVEAUX.bloc(t), ['deepDiveLinks']),
  citations: t => retirer(NIVEAUX.bloc(t), ['citationEntryIds']),
  couverture: t => retirer(NIVEAUX.carte(t), ['coverImageQuery', 'coverImageAlt']),
  image: t => retirer(NIVEAUX.bloc(t), ['imageQuery', 'imageAlt']),
};
function retirer(noeud, champs) {
  champs.forEach(c => { delete noeud.properties[c]; });
  if (Array.isArray(noeud.required)) noeud.required = noeud.required.filter(r => champs.indexOf(r) === -1);
}

// ── A3 — PROTOTYPES D'ENCODAGE EN CHAÎNES (mesure uniquement, aucun fichier de production) ─────
// Deux familles coûtent cher parce qu'elles sont décrites comme des OBJETS IMBRIQUÉS dans la
// grammaire. L'hypothèse à mesurer : les décrire comme un simple tableau de CHAÎNES, que le client
// analyse ensuite, coûte beaucoup moins. C'est exactement le détour déjà imposé aux renvois d'une
// page d'approfondissement (« expression → id ») après l'incident du 28/09.
//
// (a) QUESTIONNAIRE — trois champs imbriqués remplacés par UN tableau de lignes préfixées :
//       « Q | texte de la question | choix:points | choix:points | ... »
//       « P | libellé du profil | minScore-maxScore | interprétation »
//       « D | deux partenaires »        (ligne facultative, absente = un seul partenaire)
// (b) RENVOIS DE BLOC — tableau d'objets {text,targetId} remplacé par « expression → id ».
const VARIANTES_A3 = {
  'questionnaire en lignes': t => {
    const b = NIVEAUX.bloc(t);
    retirer(b, ['questionnaireQuestions', 'questionnaireProfiles', 'questionnaireTwoPartners']);
    b.properties.questionnaireLignes = { type: 'array', items: { type: 'string' },
      description: "questionnaire uniquement — une ligne par element, au format « Q | question | choix:points | choix:points », « P | libelle | min-max | interpretation », « D | deux partenaires » ; liste vide sinon." };
    if (Array.isArray(b.required)) b.required.push('questionnaireLignes');
  },
  'renvois de bloc en chaines': t => {
    const b = NIVEAUX.bloc(t);
    b.properties.deepDiveLinks = { type: 'array', items: { type: 'string' },
      description: "Renvois de CE bloc vers une page d'approfondissement, au format exact « expression → id » ; liste vide sinon." };
  },
};

// ── L'appel réel ───────────────────────────────────────────────────────────────────────────────
let appels = 0;
const dormir = ms => new Promise(r => setTimeout(r, ms));
async function compile(outil, essai) {
  essai = essai || 1;
  if (appels >= PLAFOND) throw new Error('plafond de ' + PLAFOND + ' appels atteint');
  appels++;
  const r = await fetch(WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': CLE },
    body: JSON.stringify({ payload: {
      provider: 'anthropic', model: 'claude-sonnet-4-6', max_tokens: 1,
      system: 'Mesure de compilation.', messages: [{ role: 'user', content: 'ok' }],
      tools: [outil], tool_choice: { type: 'tool', name: outil.name },
    } }),
  });
  await dormir(700); // respiration entre deux appels : mieux vaut ne pas declencher le plafond
  if (r.status === 200) return { ok: true };
  const brut = await r.text();
  let msg = brut;
  try { const j = JSON.parse(brut); msg = (j.error && (j.error.message || j.error)) || j.message || brut; } catch (_) {}
  msg = String(msg).replace(/\s+/g, ' ').slice(0, 140);
  // Seul un 400 est un verdict sur le schéma. Un 401/429/5xx dit que la question n'a pas été
  // posée : poursuivre la dichotomie sur une telle réponse produirait un chiffre inventé.
  // 429/5xx : la question n'a pas ete posee, mais ce n'est pas non plus une raison d'abandonner
  // toute la campagne. Ces appels partent en rafale et un plafond de debit est le cas NORMAL,
  // pas l'exception — c'est trois essais espaces, puis seulement un arret.
  if ((r.status === 429 || r.status >= 500) && essai < 3) {
    const attente = 5000 * essai;
    console.log('    (HTTP ' + r.status + ' — nouvelle tentative dans ' + (attente / 1000) + ' s)');
    await dormir(attente);
    return compile(outil, essai + 1);
  }
  if (r.status !== 400) throw new Error('reponse non concluante (HTTP ' + r.status + ') : ' + msg);
  return { ok: false, msg: msg };
}

// Dichotomie sur le nombre de chaînes ajoutées : cherche le plus grand N qui compile encore.
async function marge(construire, borne = 24) {
  if (!(await compile(construire(0))).ok) return { max: -1, note: 'le schéma ne compile pas même sans ajout' };
  let bas = 0, haut = borne + 1;               // haut = première valeur connue comme refusée
  const hautTest = await compile(construire(borne));
  if (hautTest.ok) return { max: borne, note: 'au moins ' + borne + ' (borne de la mesure)' };
  while (haut - bas > 1) {
    const milieu = Math.floor((bas + haut) / 2);
    if ((await compile(construire(milieu))).ok) bas = milieu; else haut = milieu;
  }
  return { max: bas, note: '' };
}

(async () => {
  console.log('Appels REELS, max_tokens:1, plafond ' + PLAFOND + '. Une variable a la fois.\n');
  const taille = o => Buffer.byteLength(JSON.stringify(o.input_schema));
  console.log('Schema de reference : ' + taille(REFERENCE) + ' octets\n');

  // --sauter-a1 : A2 seul. A1 coute 21 appels ; le refaire pour rien quand seule la suite de A2
  // manque est du gaspillage pur.
  const sauterA1 = process.argv.includes('--sauter-a1');
  const depuis = (process.argv.find(a => a.startsWith('--depuis=')) || '').split('=')[1] || null;
  console.log('A1 — marge par niveau d\'insertion' + (sauterA1 ? ' (SAUTE)' : ''));
  const resultatsA1 = { deepDive: 0, carte: 0, bloc: 0 };
  for (const [nom, cible] of (sauterA1 ? [] : Object.entries(NIVEAUX))) {
    const r = await marge(n => { const t = copie(); if (n) ajouterChaines(cible(t), n); return t; });
    resultatsA1[nom] = r.max;
    console.log('  ' + nom.padEnd(10) + ' : ' + String(r.max).padStart(3) + ' chaine(s) supplementaire(s) ' + (r.note ? '— ' + r.note : '') + '   [' + appels + ' appels]');
  }

  console.log('\nA2 — marge apres retrait d\'UNE famille (mesuree au niveau du bloc)');
  const base = resultatsA1.bloc;
  console.log('  (reference sans retrait : ' + base + ')');
  const resultatsA2 = [];
  let commence = !depuis;
  for (const [nom, retirerFamille] of Object.entries(FAMILLES)) {
    if (!commence) { if (nom === depuis) commence = true; else { console.log('  ' + nom.padEnd(16) + ' : saute (--depuis=' + depuis + ')'); continue; } }
    if (appels + 8 > PLAFOND) { console.log('  ' + nom.padEnd(16) + ' : non mesure (plafond d\'appels)'); continue; }
    const r = await marge(n => {
      const t = copie(); retirerFamille(t);
      if (n) ajouterChaines(NIVEAUX.bloc(t), n);
      return t;
    });
    const tSansRien = copie(); retirerFamille(tSansRien);
    resultatsA2.push({ nom, max: r.max, gain: r.max - base, octets: taille(REFERENCE) - taille(tSansRien) });
    console.log('  ' + nom.padEnd(16) + ' : ' + String(r.max).padStart(3) + ' (gain ' + (r.max - base >= 0 ? '+' : '') + (r.max - base) + ')   -' + (taille(REFERENCE) - taille(tSansRien)) + ' octets   [' + appels + ' appels]');
  }

  // ── A3 ─────────────────────────────────────────────────────────────────────────────────────
  const resultatsA3 = [];
  if (process.argv.includes('--a3')) {
    console.log('\nA3 — encodages en chaines (prototypes, aucun fichier de production)');
    // Référence : la marge au niveau du BLOC avec le schéma tel qu'il est aujourd'hui.
    const ref = sauterA1 ? (await marge(n => { const t = copie(); if (n) ajouterChaines(NIVEAUX.bloc(t), n); return t; })).max : resultatsA1.bloc;
    console.log('  reference (bloc, schema actuel) : ' + ref);
    for (const [nom, appliquer] of Object.entries(VARIANTES_A3)) {
      if (appels + 8 > PLAFOND) { console.log('  ' + nom.padEnd(28) + ' : non mesure (plafond)'); continue; }
      const r = await marge(n => { const t = copie(); appliquer(t); if (n) ajouterChaines(NIVEAUX.bloc(t), n); return t; });
      const tSeul = copie(); appliquer(tSeul);
      resultatsA3.push({ nom, max: r.max, gain: r.max - ref, octets: taille(REFERENCE) - taille(tSeul) });
      console.log('  ' + nom.padEnd(28) + ' : ' + String(r.max).padStart(3) + ' (gain ' + (r.max - ref >= 0 ? '+' : '') + (r.max - ref) + ')   ' + (taille(REFERENCE) - taille(tSeul) >= 0 ? '-' : '+') + Math.abs(taille(REFERENCE) - taille(tSeul)) + ' octets   [' + appels + ' appels]');
    }
    // Et la marge au niveau d'une ENTRÉE DE deepDives, demandee explicitement.
    if (appels + 8 <= PLAFOND) {
      const rd = await marge(n => { const t = copie(); if (n) ajouterChaines(NIVEAUX.deepDive(t), n); return t; });
      resultatsA1.deepDive = rd.max;
      console.log('  marge au niveau deepDives       : ' + rd.max + '   [' + appels + ' appels]');
    }
  }

  resultatsA2.sort((a, b) => b.gain - a.gain);
  console.log('\nLes plus gros consommateurs, par gain de marge :');
  resultatsA2.forEach((r, i) => console.log('  ' + (i + 1) + '. ' + r.nom.padEnd(16) + ' +' + r.gain + ' chaine(s)   (-' + r.octets + ' octets)'));
  console.log('\nTotal : ' + appels + ' appels reels.');
  fs.writeFileSync(path.join(__dirname, 'resultats-a1-a2.json'),
    JSON.stringify({ date: new Date().toISOString(), tailleReference: taille(REFERENCE), a1: resultatsA1, a2: resultatsA2, a3: resultatsA3, appels }, null, 1));
  console.log('Resultats ecrits dans tests/lot-a/resultats-a1-a2.json');
})().catch(e => { console.error('ECHEC : ' + e.message + '  (apres ' + appels + ' appels)'); process.exit(1); });
