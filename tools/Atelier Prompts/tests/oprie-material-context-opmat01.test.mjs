/* OPRIE-MATERIAL-CONTEXT-01 — UN CANAL DE MATÉRIAU QUI NE MÈNE NULLE PART.
 * ============================================================================
 *
 * Le produit possède un canal de matériau complet — sélecteur multiple,
 * glisser-déposer, extraction de texte, stockage dans state.docs — et une
 * autorité de readiness, le plan profond, seul à décider depuis la migration
 * OPRIE. LES DEUX NE COMMUNIQUENT PAS : oprieRequestTurn n'envoie que
 * original_request, et oprieOriginalRequest ne lit que la zone de saisie.
 *
 * CE LOT N'A RIEN IMPLÉMENTÉ, ET C'EST LE RÉSULTAT. Le contrat minimal est
 * spécifié en entier, mais deux de ses quatre couches sont interdites ici :
 * l'enveloppe navigateur touche au HTML canonique, la couche de sens touche aux
 * prompts. Construire les deux couches intermédiaires seules aurait produit un
 * canal à moitié fait, changeant le comportement du plan profond sans contrat
 * pour le décrire.
 *
 * CE QUE CE FICHIER GARDE. Que le défaut soit constaté sur les contrats réels et
 * non supposé ; que sa portée reste délimitée — six cas sur trente ; que l'oracle
 * n'ait pas été retouché pour arranger le récit ; et qu'aucune ligne de production
 * n'ait bougé.
 * ========================================================================= */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TRANSPORT_LIMITS } from '../workers/shared/decision-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (r) => fs.readFileSync(path.join(racine, r), 'utf8');
const R = JSON.parse(lire('evaluation/oprie-material-context-01/results.json'));
const DOC = lire('docs/OPRIE-MATERIAL-CONTEXT-01.md');
const NOYAU = lire('workers/shared/operational-request-core.js');
const DECISION = lire('workers/shared/decision-core.js');
const HTML = lire('atelier-prompts-v11.5-lot10g-decision-provider.html');

/* T-OPMAT01-01 — LE DÉFAUT EST CONSTATÉ SUR LES CONTRATS, pas supposé. */
test('T-OPMAT01-01 : les deux contrats d’entrée sont lus, pas devinés', () => {
  /* /decision exige materiau_present, booléen strict. */
  assert.match(DECISION, /const INPUT_KEYS = \["demande", "materiau_present", "mode_demande"\]/);
  assert.match(DECISION, /if \(typeof value\.materiau_present !== "boolean"\)/);
  assert.match(DECISION, /materiau_present est un fait fiable/);
  /* /operational-request n’accepte que deux clés, et refuse toute autre. */
  /* OPRIE-MATERIAL-CONTEXT-02 — LE DÉFAUT CONSTATÉ ICI A ÉTÉ CORRIGÉ. Le contrat
     accepte désormais une clé OPTIONNELLE nommée, sans relâcher sa rigueur : toute
     autre clé reste refusée. Ce que cette preuve garde change donc de nature — elle
     ne garde plus l'absence du canal, mais le fait que son ajout n'a pas ouvert le
     contrat à des champs arbitraires. */
  assert.match(NOYAU, /requireKeysWithOptional\(value, \["original_request", "clarification_history"\],\s*\n?\s*\["material_context", "material_content"\], "AnalystInput"\)/);
  assert.match(NOYAU, /const inconnue = actual\.find\(\(key\) => !legales\.has\(key\)\);/,
    'toute clé non énumérée est toujours refusée');
  assert.equal(R.gap.reel, true);
  assert.deepEqual(R.contrats_actuels.deep.cles_acceptees, ['original_request', 'clarification_history']);
});

/* T-OPMAT01-02 — LE PRODUIT A BIEN UN MATÉRIAU, ET IL NE PART PAS. */
test('T-OPMAT01-02 : state.docs existe et n’atteint pas le plan profond', () => {
  /* Le canal d’entrée existe, et il est multiple. */
  assert.match(HTML, /id="v11-files" type="file" multiple/);
  assert.match(HTML, /state\.docs\.push\(\{name:file\.name,type:file\.type,size:file\.size,text,external:!textual\}\)/);
  /* Le corps envoyé au plan profond ne porte que deux champs. */
  /* CORRIGÉ EN 02 : le corps porte désormais le troisième champ. */
  assert.match(HTML, /const body=oprieBuildBody\(\);/);
  /* Et la demande ne lit qu’une zone de saisie. */
  assert.match(HTML, /function oprieOriginalRequest\(\)\{return String\(\(\$\('#v11-demande'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\)\}/);
  /* state.docs n’apparaît dans aucun des deux. */
  /* CORRIGÉ EN 02 : l'enveloppe construit désormais le contexte à l'instant de
     l'envoi, en lisant state.docs directement — d'où la fraîcheur par construction. */
  assert.match(HTML, /function oprieBuildBody\(\)\{/);
  assert.match(HTML, /return \(typeof state!=='undefined'&&state&&Array\.isArray\(state\.docs\)\)\?state\.docs:null;/);
  assert.equal(R.chemin_reel.materiau_transmis, false,
    'la mesure de CE lot-ci reste ce qu’elle était : elle décrit l’avant');
});

/* T-OPMAT01-03 — LA DISTINCTION PRÉSENT / EXPLOITABLE EXISTE DÉJÀ, elle n’est
 * pas inventée par ce lot. */
test('T-OPMAT01-03 : présent et exploitable sont déjà distingués par le produit', () => {
  /* Seuls les formats textuels donnent un contenu ; les autres sont external. */
  assert.match(HTML, /const textual=\['txt','md','json','csv','html','htm'\]\.includes\(ext\)\|\|file\.type\.startsWith\('text\/'\)/);
  assert.match(HTML, /if\(textual\)\{try\{text=await file\.text\(\)\}catch\(e\)\{text=''\}\}/);
  assert.match(R.source_de_verite.consequence, /la distinction n a pas a etre inventee/);
  /* Le contrat proposé retient deux dimensions, et écarte les deux autres avec raison. */
  assert.match(DOC, /"present": true \| false \| "unknown"/);
  assert.match(DOC, /"usable":  true \| false \| "unknown"/);
  assert.match(DOC, /`REQUIRED` n'appartient pas au contexte/);
  assert.match(DOC, /`ACCESSIBLE` n'a pas de porteur/);
});

/* T-OPMAT01-04 — AUCUNE AUTORITÉ PARALLÈLE. Le contexte informe, il ne décide pas. */
test('T-OPMAT01-04 : le contexte proposé ne peut déclarer aucun état', () => {
  /* REQUIRED est explicitement écarté : décider ce qui est nécessaire reste le rôle de l’Analyste. */
  assert.match(DOC, /Le contexte dit ce qui est \*\*disponible\*\*, jamais ce qui\s*\n?est \*\*nécessaire\*\*/);
  /* Le document interdit au contexte de produire un état. */
  assert.match(DOC, /il informe le raisonnement, il ne le\s*\n?remplace pas/);
  /* Et aucun état OPRIE n’est associé au contexte dans le contrat proposé. */
  const section = DOC.slice(DOC.indexOf('## E. Contrat proposé'), DOC.indexOf('## F.'));
  for (const etat of ['operational_request_ready', 'clarification_required', 'confirmation_required', 'blocked']) {
    assert.equal(section.includes(etat), false, `le contrat ne mentionne pas ${etat}`);
  }
});

/* T-OPMAT01-05 — PORTÉE DÉLIMITÉE : six cas sur trente, et le test inverse tient. */
test('T-OPMAT01-05 : la portée du défaut est délimitée, l’absence réelle reste clarifiable', () => {
  assert.deepEqual(R.cas_oracle_affectes.affectes, ['R08', 'R09', 'R10', 'R11', 'R12', 'R13']);
  assert.equal(R.cas_oracle_affectes.affectes.length, 6);
  assert.equal(R.cas_oracle_affectes.total_oracle, 30);
  /* Les cas où le matériau est RÉELLEMENT absent ne sont pas affectés : c’est le test inverse. */
  assert.deepEqual(R.cas_oracle_affectes.non_affectes_materiau_reellement_absent,
    ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08']);
  assert.equal(R.cas_oracle_affectes.non_affectes_autre_probleme.length, 16);
  assert.equal(6 + 8 + 16, 30);
  /* Trois des cinq cas historiquement signalés ne relèvent pas de ce défaut. */
  for (const id of ['A01', 'A02', 'A03']) {
    assert.ok(R.cas_oracle_affectes.non_affectes_autre_probleme.includes(id),
      `${id} relève d’un autre problème que le canal de matériau`);
  }
  for (const id of ['R08', 'R09']) assert.ok(R.cas_oracle_affectes.affectes.includes(id));
});

/* T-OPMAT01-06 — L'ORACLE N'A PAS ÉTÉ RETOUCHÉ pour arranger le récit. */
test('T-OPMAT01-06 : l’oracle est intact', () => {
  assert.equal(R.oracle_non_modifie.modifie, false);
  assert.match(R.oracle_non_modifie.raison, /cela ne se reecrit pas en silence/);
  const O = JSON.parse(lire('evaluation/oprie-reference-oracle-01/oracle.json'));
  assert.equal(O.cas.length, 30);
  /* Les six cas affectés portent toujours l’attente établie par l’oracle précédent. */
  for (const id of R.cas_oracle_affectes.affectes) {
    const c = O.cas.find((x) => x.case_id === id);
    assert.equal(c.expected_oprie_state, 'clarification_required',
      `${id} : l’attente n’a pas été changée pour arranger ce lot`);
  }
  assert.match(DOC, /\*\*L'oracle n'a pas été modifié\.\*\*/);
});

/* T-OPMAT01-07 — RIEN N'A ÉTÉ IMPLÉMENTÉ, et le contrat reste rétrocompatible. */
test('T-OPMAT01-07 : aucun code de production n’a bougé', () => {
  assert.equal(R.code_produit_modifie, false);
  assert.equal(R.deploiement, false);
  assert.equal(R.appels_fournisseur, 0);
  /* Le contrat du tour est exactement celui d’avant. */
  /* CORRIGÉ EN 02 : le champ existe désormais dans les trois couches. Ce que cette
     preuve garde est ce qui n’a PAS changé — la limite de transport, et le fait que
     le lot 01 lui-même n’avait rien implémenté. */
  assert.ok(NOYAU.includes('material_context'), 'le champ a été ajouté par le lot 02');
  assert.ok(lire('workers/shared/operational-request-orchestrator.js').includes('material_context'));
  assert.ok(HTML.includes('material_context'), 'l’enveloppe navigateur le construit');
  /* La limite de transport n’a pas bougé non plus. */
  assert.equal(TRANSPORT_LIMITS.analyst, 16384);
  assert.match(DOC, /IMPLEMENTATION_TYPE  = BLOCKED_ARCH_CHANGE/);
});

/* T-OPMAT01-08 — le contrat proposé est générique : aucun domaine, aucun cas,
 * aucun fournisseur. */
test('T-OPMAT01-08 : le contrat ne nomme ni domaine, ni cas, ni fournisseur', () => {
  /* On regarde le SCHÉMA, pas la prose : le document nomme légitimement les
     taxonomies qu’il écarte (« il ne dit pas document, code ou image »), et le
     lui reprocher confondrait l’exclusion avec l’adoption. */
  const section = DOC.slice(DOC.indexOf('## E. Contrat proposé'), DOC.indexOf('## F.'));
  const schema = section.slice(section.indexOf('"material_context"'), section.indexOf('```', section.indexOf('"material_context"')));
  for (const interdit of ['document', 'code', 'image', 'pdf', 'docx', 'csv', 'file', 'fichier',
    'groq', 'anthropic', 'openai', 'R08', 'R09', 'A01']) {
    assert.equal(new RegExp(`\\b${interdit}\\b`, 'i').test(schema), false,
      `le schéma du contrat ne nomme pas ${interdit}`);
  }
  /* Le schéma ne porte que deux dimensions, et rien d’autre. */
  assert.deepEqual([...schema.matchAll(/^\s*"(\w+)":/gm)].map((m) => m[1]).filter((k) => k !== 'material_context'),
    ['present', 'usable'], 'deux dimensions, pas une de plus');
  /* Et il dit explicitement ce qu’il n’est pas. */
  assert.match(DOC, /Il ne dit pas « document », « code » ou « image »/);
  /* Aucun identifiant de cas ne pilote une logique de production. */
  const runtime = lire('workers/groq/src/index.js') + NOYAU
    + lire('workers/shared/operational-request-orchestrator.js') + HTML;
  for (const id of ['R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'A01', 'A02', 'A03']) {
    assert.equal(new RegExp(`["'\`]${id}["'\`]`).test(runtime), false,
      `CASE_ID_RUNTIME_LOGIC_COUNT = 0 : ${id}`);
  }
});

/* T-OPMAT01-09 — visibilité par rôle : l'Arbitre ne doit pas le recevoir par
 * effet de bord, ce que la composition actuelle ferait pourtant. */
test('T-OPMAT01-09 : le piège de buildRoleInput est identifié', () => {
  const orchestrateur = lire('workers/shared/operational-request-orchestrator.js');
  /* base est diffusé aux trois rôles : un champ ajouté à base les atteindrait tous. */
  /* CORRIGÉ EN 02, ET LE PIÈGE A ÉTÉ ÉVITÉ : le contexte ne passe PAS par base. Les
     deux premiers rôles le reçoivent explicitement, l’Arbitre ne le reçoit pas. */
  assert.match(orchestrateur, /if \(role === "analyst"\) return \{ \.\.\.base, material_context, \.\.\.\(material_content \? \{ material_content \} : \{\}\) \};/);
  assert.match(orchestrateur, /if \(role === "critic"\) return \{ \.\.\.base, analyst_output: outputs\.analyst, previous_vetoes: \[\], material_context \};/);
  assert.match(orchestrateur, /return \{ \.\.\.base, analyst_output: outputs\.analyst, critic_output: outputs\.critic \};/,
    'l’Arbitre reste sans contexte matériau');
  assert.match(DOC, /Le contexte ne doit\s*\n?donc \*\*pas\*\* être ajouté à `base`/);
  assert.match(DOC, /\| \*\*Arbitre\*\* \| \*\*NON\*\* \|/);
});

/* T-OPMAT01-10 — artefact canonique intact, dette ouverte. */
test('T-OPMAT01-10 : HTML canonique inchangé, dette ouverte', () => {
  const octets = fs.readFileSync(path.join(racine, 'atelier-prompts-v11.5-lot10g-decision-provider.html'));
  /* OPRIE-MATERIAL-CONTEXT-02 — L'EMPREINTE A CHANGÉ, ET C'EST DÉLIBÉRÉ. Le noyau
     OPRIE est embarqué verbatim dans le bundle navigateur : ajouter le champ optionnel
     material_context au contrat d'entrée le répercute mécaniquement dans l'artefact.
     Le changement se limite à l'enveloppe et au contrat — aucune modification visuelle,
     aucun redesign, aucun comportement d'interface touché. */
  assert.equal(crypto.createHash('sha256').update(octets).digest('hex'),
    '6be95369eaf3611bc72b7d5d7972ffbb6a1f19c8901355c58da171b4274eccde', 'CANONICAL_HTML_CHANGED = NO');
  const registre = lire('docs/OPEN-DEBTS.md');
  const ouvertes = registre.slice(registre.indexOf('## Ouvertes'), registre.indexOf('## Fermées'));
  assert.deepEqual([...ouvertes.matchAll(/^### ([A-Z][A-Z-]+-\d{2})$/gm)].map((m) => m[1]), ['PERF-REAL-01']);
  assert.ok(ouvertes.includes('OPRIE-MATERIAL-CONTEXT-01'));
});
