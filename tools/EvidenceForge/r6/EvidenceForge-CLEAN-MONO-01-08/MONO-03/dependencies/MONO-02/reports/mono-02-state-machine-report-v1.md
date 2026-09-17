# MONO-02 - Rapport de state machine

## Etats (7)

NOT_STARTED, READY, RUNNING, SUCCESS, FAILED, BLOCKED, PAUSED - strictement
les 7 etats techniques minimum imposes par le CDC. Aucun etat supplementaire
n'a ete ajoute (aucun besoin identifie qui ne soit couvert par ces 7).

## Transitions (9, exhaustives)

NOT_STARTED->READY, READY->RUNNING, RUNNING->SUCCESS, RUNNING->FAILED,
RUNNING->BLOCKED, FAILED->READY, BLOCKED->READY, RUNNING->PAUSED,
PAUSED->READY.

Implementees dans lib/state-machine.js comme un ensemble fige
(ALLOWED_TRANSITIONS, un Set de 9 entrees) - toute paire absente de cet
ensemble est rejetee avec INVALID_STATE_TRANSITION, y compris les
transitions "evidentes mais non declarees" comme NOT_STARTED->RUNNING ou
SUCCESS->FAILED. Verifie exhaustivement par T02-03 (10 tests couvrant les
9 transitions autorisees ET plusieurs transitions interdites).

## Separation des responsabilites (correction de conception effectuee en cours de construction)

Le CDC section EXECUTION liste computeReadyNodes(), canRun(nodeId) et
runNode(nodeId) comme trois responsabilites distinctes. La premiere version
de canRun() exigeait state===READY avant meme de verifier les
preconditions, ce qui masquait systematiquement UPSTREAM_NOT_SUCCESS et
ORCHESTRATION_BLOCKED derriere NODE_NOT_READY - un noeud jamais promu READY
ne pouvait jamais reveler la raison precise de son blocage via canRun().
Corrige : canRun(nodeId) inspecte desormais les preconditions (upstream,
inputs, dependances) INDEPENDAMMENT de l'etat courant ; runNode(nodeId)
applique separement la garde d'etat (state !== READY -> NODE_NOT_READY)
avant d'appeler canRun(). Ce changement a ete detecte en ecrivant T02-04
(test 7) et corrige avant tout gel — T02-04/05/06 exercent desormais les
deux codes d'erreur distinctement.

## Aucune transition implicite

Aucun chemin du code (lib/orchestration-engine.js) ne mute runtimeState
autrement qu'en passant par state-machine.js::transition(). Verifie par
lecture du code : applyTransition() est le seul point d'ecriture de
runtimeState, et il delegue systematiquement a transition() avant toute
mutation - un rejet de transition() ne mute jamais l'etat (T02-03, test 9b
: "l'etat du noeud n'a pas change apres un rejet").

## Reprises explicites, jamais automatiques

FAILED->READY, BLOCKED->READY et PAUSED->READY ne sont jamais declenchees
par le moteur lui-meme - uniquement par un appel explicite de l'appelant a
engine.transition(nodeId, "READY"). Verifie par T02-13 (test 5 : la
retransition est un acte explicite) et T02-14 (test 9 : un noeud FAILED
reste FAILED apres plusieurs computeReadyNodes() supplementaires, sans
jamais repartir seul).
