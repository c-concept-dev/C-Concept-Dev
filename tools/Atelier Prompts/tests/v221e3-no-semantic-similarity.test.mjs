/* ATELIER PROMPTS V2.2.1-E3 — PLUS AUCUN ESTIMATEUR LOCAL DE SENS.
 * ============================================================================
 *
 * CE QUE E2 AVAIT TROUVÉ SANS LE TRAITER. Le scan global de V2.2.1-E2 avait relevé deux
 * appariements flous que le périmètre de ce lot-là ne couvrait pas, et les avait épinglés à deux
 * pour qu'ils ne se multiplient pas :
 *
 *   A. core/adn/execution-readiness.js — `words()` et sa liste de mots vides, `questionsSimilar()`
 *      au seuil de 0,7, `novelQuestions()`. Chaîne suspendue à `assessAnalysisReadiness`.
 *   B. workers/shared/decision-core.js — `questionKeywords()`, `questionsAreTooSimilar()` au même
 *      seuil, employées par `validateDecision`, validateur de sortie de la route /decision.
 *
 * L'INVARIANT ÉTAIT JUSTE, L'ESTIMATEUR NE L'ÉTAIT PAS. Les deux servaient la même idée — ne pas
 * reposer une clarification déjà posée. Mais un ratio de mots communs comparé à un seuil est un
 * jugement de SENS rendu localement, que la Directive Maître interdit ; et 0,7 n'y devient pas
 * conforme parce qu'il serait transversal.
 *
 * CETTE RESPONSABILITÉ A DÉJÀ UN PROPRIÉTAIRE, ET IL NE DEVINE RIEN. `isRepeatedSolicitation`
 * compare une IDENTITÉ normalisée — pas une ressemblance — et rend le verdict ALREADY_ANSWERED.
 * Aucun seuil n'y intervient : deux formulations différentes ne sont jamais « trop proches », elles
 * sont différentes.
 *
 * CE QUE CE FICHIER EMPÊCHE. Le retour d'un estimateur local de sens, sous quelque forme que ce
 * soit, dans les sources comme dans l'artefact livré. Il n'interdit pas les comparaisons
 * techniques : un seuil de capacité, une limite de transport ou un taux mesuré ne jugent aucun sens.
 * ========================================================================= */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessSolicitation } from '../workers/shared/solicitation-policy.js';
import * as readiness from '../core/adn/execution-readiness.js';
import { validateDecision, DECISION_REASONS } from '../workers/shared/decision-core.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');
/* Le code RÉELLEMENT exécuté : les commentaires expliquent, ils ne décident pas. */
const execute = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function sourcesDeProduction() {
  const fichiers = [];
  for (const base of ['workers', 'core']) {
    const pile = [path.join(racine, base)];
    while (pile.length) {
      for (const entree of fs.readdirSync(pile.pop(), { withFileTypes: true })) {
        const complet = path.join(entree.parentPath || entree.path, entree.name);
        if (entree.isDirectory()) pile.push(complet);
        else if (entree.name.endsWith('.js') && !entree.name.includes('generated')) fichiers.push(complet);
      }
    }
  }
  return fichiers;
}

const ARTEFACTS = [
  ['artefact livré', lire('atelier-prompts-v11.5-lot10g-decision-provider.html')],
  ['runtime compilé', lire('core/adn/browser-runtime.generated.js')],
  ...sourcesDeProduction().map((f) => [path.relative(racine, f), fs.readFileSync(f, 'utf8')])
];

/* ==========================================================================
 * E3-01 — LA SIGNATURE EXACTE DE L'ESTIMATEUR NE PEUT PLUS REVENIR
 * ======================================================================= */

test('V221E3-01 : aucun ratio de recouvrement comparé à un seuil, nulle part', () => {
  /* C'est la forme précise qu'avaient les deux mécanismes : un compte de termes communs divisé par
     la taille du plus petit ensemble, confronté à un seuil. */
  for (const [nom, source] of ARTEFACTS) {
    const code = execute(source);
    assert.equal(/common\s*\/\s*Math\.min\(/.test(code), false, `un ratio de recouvrement est revenu dans ${nom}`);
    assert.equal(/\bintersection\b[\s\S]{0,80}>=\s*0?\.\d/.test(code), false, `un seuil de recouvrement dans ${nom}`);
  }
});

test('V221E3-02 : les fonctions retirées ne sont revenues sous aucun nom connu', () => {
  const disparues = ['questionsSimilar', 'questionsAreTooSimilar', 'novelQuestions',
                     'questionKeywords', 'QUESTION_STOP_WORDS'];
  for (const [nom, source] of ARTEFACTS) {
    const code = execute(source);
    for (const fn of disparues) {
      assert.equal(code.includes(fn), false, `${fn} est revenu dans ${nom}`);
    }
  }
});

test('V221E3-03 : aucun vocabulaire d’estimation de ressemblance dans le code exécuté', () => {
  for (const [nom, source] of ARTEFACTS) {
    const code = execute(source);
    for (const motif of ['levenshtein', 'jaccard', 'cosine', 'embedding', 'fuzzy', 'stemming', 'synonym']) {
      assert.equal(new RegExp(motif, 'i').test(code), false, `« ${motif} » dans ${nom}`);
    }
  }
});

/* ==========================================================================
 * E3-04 — CE QUI RESTE PERMIS, ET POURQUOI CE TEST NE L'INTERDIT PAS
 * ======================================================================= */

test('V221E3-04 : les comparaisons techniques restent permises — elles ne jugent aucun sens', () => {
  /* Ce lot n'interdit pas les seuils : il interdit qu'un seuil décide du SENS d'une question ou
     d'une décision. Une limite de transport, une capacité, un taux mesuré restent légitimes, et ce
     test le dit explicitement pour qu'on ne le lise pas comme une interdiction générale. */
  const transport = execute(lire('workers/shared/decision-core.js'));
  assert.match(transport, /TRANSPORT_LIMITS/, 'les limites de transport subsistent, et c’est voulu');
  /* Ce qui a disparu de ce module, c'est le jugement de ressemblance — pas la validation de forme. */
  for (const forme of ['Champs de décision invalides', 'une seule demande', 'vocabulaire interne']) {
    assert.ok(transport.includes(forme), `le contrôle de forme « ${forme} » est conservé`);
  }
});

/* ==========================================================================
 * E3-05 / 06 — L'INVARIANT EST TENU, CHEZ SON PROPRIÉTAIRE
 * ======================================================================= */

test('V221E3-05 : ne pas reposer une clarification déjà répondue — par identité, sans seuil', () => {
  const q = 'Depuis quelle ville partez-vous ?';
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: q }, [{ question: q, answer: 'Lyon' }]),
    'ALREADY_ANSWERED');
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: q }, []), 'ALLOW');
  /* Et une formulation différente n'est pas « trop proche » : elle est différente. C'est
     exactement ce que l'estimateur retiré ne savait pas faire. */
  assert.equal(assessSolicitation({ type: 'ASK_CLARIFICATION', text: 'De quelle ville partez-vous ?' },
    [{ question: q, answer: 'Lyon' }]), 'ALLOW');
});

test('V221E3-06 : les deux mécanismes retirés ne jugent plus rien, et leurs hôtes fonctionnent', () => {
  /* A — la porte de readiness Architecte reste une autorité déclarée, et elle répond toujours ;
     elle ne dédoublonne simplement plus par ressemblance. */
  assert.equal(typeof readiness.assessAnalysisReadiness, 'function');
  assert.equal(readiness.assessAnalysisReadiness.length, 1, 'elle ne reçoit plus les questions précédentes');
  /* B — le validateur de la route historique valide toujours la FORME, et refuse toujours ce qui
     doit l'être : une question portant deux demandes. */
  const decision = (question) => ({
    etat_demande: 'clarification_necessaire', route: null, confiance: 'haute',
    raison_interne: DECISION_REASONS.clarification, question
  });
  /* Il ramène une question à une seule demande — ici par troncature, pas par jugement de sens. */
  assert.equal(validateDecision(decision('Combien de temps avez-vous, avec quel budget travaillez-vous ?')).question,
    'Combien de temps avez-vous ?');
  /* Il refuse toujours le vocabulaire interne du pipeline. */
  assert.throws(() => validateDecision(decision('Quel résultat concret souhaitez-vous obtenir ?')), /vocabulaire interne/);
  /* Et une question ordinaire passe, y compris si une question proche a déjà été posée : ce
     jugement-là ne lui appartient plus. */
  const dejaPosee = 'Demande\n\nPrécisions apportées pendant le dialogue :\n- Quand souhaitez-vous commencer ? — Réponse : Demain';
  assert.equal(validateDecision(decision('Quand voulez-vous commencer ?'), dejaPosee).question,
    'Quand voulez-vous commencer ?');
});
