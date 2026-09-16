/* V2.2.1-E2 — DES TESTS ONT ÉTÉ RETIRÉS DE CE FICHIER, ET VOICI LEUR CLASSEMENT.
 *
 * Ils éprouvaient le DECISION PROVIDER HISTORIQUE : sa chaîne de fournisseurs, son comportement
 * fail-closed, son entrée minimale, son validateur de sortie lexical. Le réaudit indépendant a
 * relevé que ce décideur embarquait une stop-list, des règles lexicales et un seuil de similarité
 * — du hardcoding décisionnel au sens de la Directive Maître.
 *
 * L'audit de reachability de E2 a établi qu'il n'avait plus AUCUN appelant dans le produit : sa
 * seule voie d'accès était deux expositions `window`, consommées par un banc d'évaluation. Sa
 * dernière responsabilité — refuser une question qui répète une clarification déjà posée —
 * appartient depuis longtemps au plan canonique (`isRepeatedSolicitation`, ALREADY_ANSWERED).
 *
 * Ces tests sont donc classés HISTORICAL_IMPLEMENTATION_CONTRACT : ils protégeaient fidèlement un
 * chemin qui n'existe plus. Ils ont été retirés AVEC lui, et non affaiblis pour survivre. Ce qui
 * reste dans ce fichier éprouve des invariants toujours vivants.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html'),'utf8');
const reasons={
  clarification:'La demande n’est pas encore suffisamment exploitable ; une clarification à forte valeur d’information est nécessaire.',
  rapide:'La demande est exploitable et peut être exécutée directement sans arbitrage structurel préalable.',
  architecte:'La demande est exploitable mais nécessite une structuration ou des arbitrages préalables.'
};
const rapide={etat_demande:'exploitable',route:'rapide',confiance:'haute',raison_interne:reasons.rapide,question:null};
const architecte={etat_demande:'exploitable',route:'architecte',confiance:'haute',raison_interne:reasons.architecte,question:null};
const clarification={etat_demande:'clarification_necessaire',route:null,confiance:'haute',raison_interne:reasons.clarification,question:'Quand souhaitez-vous commencer ?'};

test('la fenêtre de clarification est modale, responsive et non technique',()=>{
  assert.match(html,/role="dialog" aria-modal="true"/);
  /* ATELIER-RAPIDE-CONVERSATIONAL-FIX-01 — LA CLARIFICATION N'AFFICHE PLUS QUE LA QUESTION.
     Ce test exigeait la PRÉSENCE d'un titre technique et d'une justification redondante. Le contrat
     produit les interdit : une clarification, c'est une question, pas un formulaire d'explication.
     Les deux éléments statiques sont retirés ; la modale se nomme désormais par la question
     elle-même, ce qui lui rend un nom accessible sans réintroduire de chrome. */
  assert.doesNotMatch(html,/Une précision est nécessaire/);
  assert.doesNotMatch(html,/Pour bien préparer votre demande, j’ai besoin d’un détail/);
  assert.match(html,/aria-labelledby="v11-question"/);
  assert.match(html,/id="v11-add-clarification-document">Ajouter un document/);
  assert.match(html,/id="v11-cancel-clarification">Annuler/);
  assert.match(html,/\.v11-clarification-modal\{position:fixed/);
  const modal=html.slice(html.indexOf('<div class="v11-stage v11-clarification-modal"'),html.indexOf('<div class="v11-stage v11-ready"'));
  assert.doesNotMatch(modal,/Workers AI|Groq|70B|GPT-OSS|confiance|raison_interne|route/);
});

test('la clarification conserve demande, réponses et documents sans plafond arbitraire',()=>{
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  // FC-01b : la clarification conserve toujours demande, réponses et documents, et reste sans plafond.
  // Les ancrages suivent le nouveau pilote : la réponse alimente clarification_history au lieu d'être
  // concaténée dans la demande, et c'est OPRIE qui décide de reposer une question.
  assert.match(html,/state\.answers\.push\(\{question:\$\('#v11-question'\)\.textContent,answer,/);
  assert.match(html,/oprieRunTurn\(adpState\.requestedMode\|\|'rapide'\)/);
  assert.doesNotMatch(section,/adpState\.clarifications\s*<\s*\d+/);
  assert.match(html,/adpState\.clarifications\+=1/);
  assert.match(html,/Le document demandé est joint/);
  // IA-02A : le traitement de clarification_required a quitté le branchement inline du pilote pour
  // la politique d'orchestration unique. L'ancrage suit ; l'invariant est le même.
  assert.match(html,/WAIT_FOR_USER:\(turn\)=>turn&&turn\.state==='confirmation_required'\?oprieShowConfirmation\(turn\):oprieShowClarification\(turn\)/);
  assert.match(html,/SOLICITING_OPRIE_STATES = Object\.freeze\(\["clarification_required", "confirmation_required"\]\)/);
  assert.match(section,/function adpRunRapide\([^)]*\)\{\s*adpState\.pendingQuestion=false;show\(null\)/);
});

test('après exploitabilité, seules les routes Rapide et Architecte sont automatiques',()=>{
  /* CLEAN-01 : l'aiguillage vivait en double — dans l'ancien décideur et dans l'entrée en
     exécution. L'ancien est retiré ; l'invariant est mesuré sur l'aiguillage qui subsiste. */
  const section=html.slice(html.indexOf('V11.5 LOT 10G — ADAPTIVE DECISION PIPELINE'),html.indexOf('window.__V11_ROUTER__'));
  assert.match(section,/route==='rapide'\?adpRunRapide\(demande,materiau,orientation\):adpEnterArchitecte\(demande,materiau,orientation\)/);
  assert.doesNotMatch(section,/route:'atelier'|sem\.route==='atelier'/);
});

