# ATELIER_PROMPTS_BETA_STABILIZATION_AND_REPAIR_04

## Ce que ce lot a réellement changé

Cinq défauts étaient ouverts. Quatre sont fermés par du code déterministe, un l'est par mesure, et
le dernier (P1-B) reste dehors faute d'autorisation. Le fait le plus utile de ce lot n'est aucun des
cinq : **cinq demandes de production sur huit recevaient un HTTP 502** sans qu'aucun journal ne dise
pourquoi. Ce n'était dans la liste de personne. La mesure l'a trouvé.

## Récupération de l'état de travail, avant toute modification

L'état de travail de Codex a été retrouvé, et non recréé. Deux références sont conservées hors de
l'arbre de travail : `beta04-ref/pristine` (l'arbre livré, HEAD d'origine
`169a74ab23d45589d1a6e89a411d23da019ae167`) et `beta04-ref/codex` (son état de travail). Ses
livrables sont préservés : l'adaptateur `schemaPourAnthropic()` et ses trois tests mot pour mot,
`oprieKeepFailedDialogue()`, le gestionnaire de la touche Entrée, le drapeau `retryTurn`, et
`docs/BETA04-TEST-CLASSIFICATION.md`. Un seul de ses choix a été remplacé, sur décision du
propriétaire : le relecteur LLM de sollicitations, devenu une garde déterministe.

## P0-D — SUR-QUESTIONNEMENT : la borne est exécutoire, elle n'est plus une consigne

La consigne disait déjà « jamais plus d'une » et « ne redemandez jamais ce qui figure dans
l'historique ». Mesuré sur un modèle de la classe déployée, elle reposait quand même une question au
tour suivant. Une consigne n'est pas une borne.

`workers/shared/solicitation-policy.js` porte désormais six verdicts, tous grammaticaux ou
structurels, aucun métier :

| Verdict | Ce qu'il constate | Pourquoi il existe |
|---|---|---|
| `ALREADY_ANSWERED` | la question a déjà été posée et répondue | elle était reposée à l'identique |
| `ALREADY_SOLICITED` | une réponse a déjà été obtenue dans cette conversation | `FAST_MAX_SOLICITATIONS_PER_CONVERSATION = 1` |
| `MULTIPLE_QUESTIONS` | deux interrogations séparées par une coordination | deux besoins dans une enveloppe qui n'en porte qu'un |
| `CATALOGUE` | trois groupes nominaux énumérés comme un choix | la question réellement affichée en bêta |
| `MATERIAL_PRESENT` | le tour porte un matériau | voir plus bas : ce plan ne le lit pas |
| `EMPTY` | sollicitation sans texte | rien à afficher |

Deux défauts de comptage ont été trouvés en mesurant, et corrigés :

- `« Quel texte souhaitez-vous que je corrige ? »` était refusée comme MULTIPLE_QUESTIONS : le `que`
  subordonnant était compté comme un second interrogatif. Le comptage ne retient plus que les
  interrogations séparées de la précédente par une coordination ou une ponctuation.
- `« Quel format, et pour quel public ? »` passait, alors qu'elle porte deux besoins : la
  coordination n'était cherchée que collée au second interrogatif. Elle est cherchée dans
  l'intervalle. Vérifié sur 17 cas : 17/17 contre 15/17 avant.

### MATERIAL_PRESENT — une frontière d'autorité, pas une règle métier

Mesuré sur le runtime déployé, demande « Corrige ce texte en conservant le sens » avec un matériau
fourni, le modèle rapide a répondu : **« Quel texte souhaitez-vous que je corrige ? »** Il
redemandait ce que la personne venait de coller. La consigne le lui interdisait déjà en clair.

Le plan rapide reçoit la demande et la **présence** du matériau — jamais le matériau, par décision
de coût et de confidentialité. Il est donc structurellement incapable de juger si une précision est
déterminante : ce qui trancherait est exactement ce qu'il ne lit pas. Quand un matériau est là, il
ne sollicite plus ; le plan profond, qui le reçoit, garde l'autorité de demander. La présence
traverse quatre fichiers sous forme d'un booléen — `material_present` dans l'instantané de tour,
`materiau_fourni` exposé au modèle — et rien d'autre : ni titre, ni extrait, ni longueur. `T04-21c`
vérifie qu'une valeur non booléenne ne peut pas passer pour une présence.

### Conformité mesurée, sur le runtime déployé

| Cas | Demande | Attendu | Obtenu |
|---|---|---|---|
| S1 | « Organise un week-end à Malaga » | ≤ 1 question | 1 question atomique |
| S1 après réponse | idem + une réponse obtenue | 0 | silence (`ALREADY_SOLICITED`) |
| S2 | « Fais-moi une présentation » | ≤ 1 question | silence |
| S2 après réponse | idem + une réponse obtenue | 0 | silence |
| S3 | comparaison train/avion en tableau | 0 | silence |
| S4 | photosynthèse, cinq paragraphes | 0 | silence |
| S5 | « Corrige ce texte », matériau fourni | 0 | silence (`MATERIAL_PRESENT`) |
| S6 | sept idées de cadeaux, enfant de 8 ans | 0 | silence |

Les quatre critères sont tenus : zéro question quand la demande est exploitable, une au maximum
quand un manque est déterminant, réévaluation immédiate après réponse, arrêt dès que la demande est
exploitable. Latence du plan rapide : **360 à 646 ms**.

Ce que la garde NE garantit pas, et il faut le dire : elle ne juge pas la *nécessité*. Un modèle
faible peut encore poser une question de confort atomique — mesuré 2 fois sur 3 sur un proxy, sur le
cas « sept idées de cadeaux ». Ce qui est garanti est la borne : une au maximum, atomique, jamais
reposée, jamais quand le matériau est là.

## LE DÉFAUT QUE PERSONNE N'AVAIT VU — 5 DEMANDES SUR 8 EN ÉCHEC

Le premier passage des smokes sur le runtime déployé a rendu `FAST_SCHEMA_ERROR` sur cinq des huit
demandes. Aucun journal ne disait pourquoi : `validateFastInteraction` calculait la raison du refus,
puis la jetait. Un échec muet ne se corrige pas.

Deux corrections, dans cet ordre, parce que la seconde dépend de la première :

1. La raison du refus est journalisée — des noms de clés, ou le type inconnu proposé par le modèle.
   Jamais le texte produit, jamais un mot de la personne. Et le plan rapide journalise désormais
   sous le même `invocation_id` (le `cf-ray`) que le plan profond : il ne l'avait jamais fait, ce
   qui rendait ses refus rattachables à rien.
2. La raison, alors lisible : **« texte d'interaction vide »**. Le modèle concluait correctement
   qu'il n'y avait rien à demander, puis rendait ce type avec un texte vide. Le schéma exige les deux
   champs ; la réponse était refusée, et la conclusion perdue. Pour un type qui ne sollicite pas, le
   texte ne porte aucune information : c'est une formule d'attente. La garde rend le silence nommé.
   Une sollicitation vide, elle, reste refusée — on ne fabrique jamais une question.

Après correction : **8 demandes sur 8 en HTTP 200**.

## P0-A — LATENCE : mesurée sur le runtime servi, par étape

Décision du propriétaire : lire les journaux Cloudflare, ne pas toucher au contrat de réponse de
`/operational-request`, réutiliser l'identifiant technique existant. C'est ce qui a été fait —
`invocation_id` est le `cf-ray`, déjà résolu, déjà exposé en `X-Invocation-Id`.

Demande « Organise un week-end à Malaga », version `9520d54e`, bout en bout **109 184 ms** :

| Étape | Durée | Part |
|---|---|---|
| ANALYSTE | 29 944 ms | 27,5 % |
| CRITIQUE | 41 939 ms | 38,5 % |
| ARBITRE | 37 126 ms | 34,1 % |
| Non attribué | 175 ms | 0,2 % |

Aucune étape ne domine. Cela **réfute** l'hypothèse du lot 03A, qui attribuait le coût au batching
du Critique sans l'avoir chronométré. Le détail du Critique confirme en revanche que l'alignement
03D s'exécute bien en production : étape globale 19 504 ms, une seule vague de 22 435 ms, **4 lots
planifiés, 2 lancés**, arrêt anticipé `FIRST_PRIORITY_LAST_RESORT_CONFIRMED`.

L'instrumentation est **conservée**, et débaptisée de son numéro de lot
(`operational_request_stage`, `critic_pipeline_timing`). Justification : sans elle, la latence — qui
reste le premier défaut produit — se rediagnostique à l'intuition, et ce lot vient de montrer ce que
cela coûte. Elle ne transporte que des noms d'étape et des millisecondes, et rien n'est ajouté au
contrat de réponse.

## P0-B, P0-C, P1-A

- **P0-B (questions non atomiques)** — fermé par la garde ci-dessus. La question exacte observée en
  bêta est conservée mot pour mot dans les tests : c'est elle qu'il fallait refuser.
- **P0-C (remise à zéro visuelle)** — `oprieKeepFailedDialogue()` de Codex, préservé. `resetAll()`
  passe par `v11ForgetDialogue()`, désormais **seul écrivain** de `state.answers`.
- **P1-A (Anthropic 400)** — `schemaPourAnthropic()` de Codex, préservé : les énumérations à type
  union deviennent des branches `anyOf` dans le transport, et le schéma canonique n'est jamais muté.
- **P1-B (lien V10 en 404)** — hors de ce lot : aucune autorisation explicite n'a été donnée.

## Autorité et source unique — six familles fermées sans toucher aux tests

Décision du propriétaire : restreindre le nettoyage d'état au strict nécessaire, ne pas renforcer un
test pour légitimer un nouvel écrivain. Le nombre d'écrivains a été ramené à celui de l'arbre
d'origine : `canonicalContract` 2 → 1, `lastTurn` 2 → 1, `lastEnvelope` 7 → 6, `state.answers`
2 → 1. Six des sept familles d'échec se sont fermées d'elles-mêmes : elles protégeaient un invariant
réel, pas une ancienne structure.

## Tests modifiés, et la raison de chacun

La règle appliquée : ne modifier un test que si l'on peut démontrer qu'il vérifie une ancienne
structure, et non un invariant produit encore valide. Trois assouplissements écrits en cours de
route ont d'ailleurs été **annulés** : il était plus juste de restaurer les formulations littérales
dans la consigne, à leur nouvelle place, que d'affaiblir les assertions.

| Test | Modification | Raison |
|---|---|---|
| `T04-20` | montage refait | son intitulé restait vrai ; son montage supposait un « historique étranger », notion que la garde ne connaît pas. Il vérifie maintenant l'absence de mémoire propre, ce qui est l'invariant réel |
| `T-03B-08`, `T-PERFREAL01E-03`, `T-PERFREAL01E-11` | un champ de plus | `materiau_fourni` s'ajoute au message. Renforcés : le champ doit être un booléen, donc incapable de transporter un contenu |
| `T-P04-EP09`, `T-PERFREAL01-14` | forme de l'appel | l'appel porte en plus le `log` estampillé. Leurs propres commentaires disaient déjà vérifier « le fait, non la forme exacte » ; l'ordre de fournisseurs reste épinglé |
| `T-PERFREAL01E-15` | relevé de coût | la consigne a été allongée ; le relevé l'enregistre au lieu de le masquer |
| 15 fichiers | empreinte HTML | rituel mécanique d'artefact |

Ajoutés : `T04-21` (budget d'une sollicitation), `T04-21b` (subordonnant ≠ seconde interrogation),
`T04-21c` (présence du matériau, jamais son contenu), `T04-21d` (matériau présent → silence),
`T04-21e` (type non sollicitant sans texte → silence, pas une panne).

## Coût en jetons de la consigne rapide, mesuré

| État | Caractères | Jetons d'entrée |
|---|---|---|
| avant 03B | 794 | 506 (tokeniseur de production) |
| 03B | 2 243 | 955 (production) / 730 (base de contrôle) |
| BETA-04 | 3 178 | 999 (base de contrôle), soit +36,8 % |
| BETA-04, relevé en production | — | **933 et 942** pour deux demandes courtes |

Les deux bases ne s'additionnent pas — tokeniseurs différents ; c'est le rapport qui se transpose.
Ce surcoût achète la suppression d'un appel fournisseur entier : la première version de ce lot
faisait relire chaque sollicitation par un modèle, soit 500 à 1 000 jetons ET quelques centaines de
millisecondes sur le chemin de la première interaction. Appels fournisseur par tour rapide : **1**,
comme avant 03B.

## État des chaînes

| Chaîne | État |
|---|---|
| GLOBAL | **3 099 tests, 3 099 PASS, 0 échec** |
| FROZEN | **OK** — les sept plages gelées inchangées |
| Empreinte HTML | `a5eeceea201287724127511240234fbb9af024fa43ce18b69289bdb5f48cc6ce`, épinglée dans 15 fichiers, manifeste régénéré |

## Déploiement Cloudflare

Un seul service touché : `atelier-decision-groq`. Aucun DNS, aucun domaine, aucune Page, aucun autre
projet. Aucun secret supprimé, aucun secret affiché.

### Avant

| Champ | Valeur |
|---|---|
| SERVICE | `atelier-decision-groq` |
| PREVIOUS_VERSION | `99404bf3-c9ed-4ab9-bda7-2bf334695cb5` |
| PREVIOUS_DEPLOYMENT_ID | `c6ff80a3-53b9-4278-a1e9-f0251dbad507` |
| PREVIOUS_MESSAGE | BETA-04 restore : sans instrumentation, source 893c292 sans 03B |
| SOURCE_WORKTREE | copie physique `beta04-work/Atelier Prompts`, hors dépôt, descendant du commit `169a74ab23d45589d1a6e89a411d23da019ae167` |
| WRANGLER_CONFIG | `workers/groq/wrangler.jsonc` — wrangler 4.131.1 |

### Après

| Champ | Valeur |
|---|---|
| NEW_VERSION | `9520d54e-85d5-4895-aa89-16661bfaeb25` |
| NEW_DEPLOYMENT_ID | `80a15255-1fd0-45a1-8423-3926f0db4959` |
| ACTIVE_BUNDLE_SHA256 | `681e0e1752a67c44b14ea2fdb8ac2ef9802f2b2bd70ce28c8949ae50e60a7dcd` |
| SOURCE_RUNTIME_MATCH | **YES** |

SOURCE_RUNTIME_MATCH n'est pas une déduction. Cloudflare nomme lui-même la version qui a servi
chaque requête : `wrangler tail` a rendu `scriptVersion.id = 9520d54e-85d5-4895-aa89-16661bfaeb25`
sur les requêtes de smoke, et cette version vient du bundle ci-dessus, construit deux fois de suite
à l'identique depuis cet arbre (`wrangler deploy --dry-run`, empreintes égales).

### Retour arrière

`npx wrangler rollback 99404bf3-c9ed-4ab9-bda7-2bf334695cb5 --config workers/groq/wrangler.jsonc`

## Ce qui reste ouvert

1. **La latence.** 109 s sur un tour profond, sans étape dominante. Trois rôles séquentiels et
   inconditionnels : c'est structurel, et aucune micro-optimisation ne le réglera. La décision
   d'architecture appartient au propriétaire.
2. **La nécessité d'une question** reste un jugement de modèle. La borne est déterministe, le
   discernement ne l'est pas.
3. **P1-B**, le lien V10 en 404, non traité faute d'autorisation.
4. **Aucun push Git.** Rien n'a été poussé, conformément à la consigne.
