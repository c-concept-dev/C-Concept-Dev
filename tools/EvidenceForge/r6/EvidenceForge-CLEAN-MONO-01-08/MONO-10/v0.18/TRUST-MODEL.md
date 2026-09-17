# MONO-10 v0.18 — modèle de confiance

## 1. Ce qui a été cru, version par version

| Version | Racine de confiance effective | Rompu par |
|---|---|---|
| v0.1–v0.2 | l'artefact lui-même | un artefact fabriqué suffisait |
| v0.3 | le manifeste de run | un manifeste cohérent entièrement synthétique → `AUTHORIZED` |
| v0.4 | un argument de fonction (`anchorSet`) | l'appelant forge sa paire de clés et injecte sa propre ancre |
| v0.5 | l'environnement d'exploitation | racine externe **à l'ouverture** ; les **consommateurs** croyaient encore des champs reçus |
| v0.6 | l'environnement d'exploitation **et** le recalcul au point d'effet | des **valeurs déclaratives** d'appelant décidaient encore : drapeau de politique, booléen d'authentification, racine en chaîne, hash de justification |
| v0.7 | ce qui précède **et** la dérivation depuis des preuves authentifiées | les **constructeurs d'autorité** étaient publics : un appelant écrivait son propre fichier de registre, appelait le vrai constructeur, et recevait une autorité authentiquement marquée |
| v0.8 | ce qui précède **et** l'origine des émetteurs de capacité | l'identité de frontière restait **déclarative** : `operatorTrustBoundaryId` seul, `configBindingHash` porté mais non comparé ; l'ancre anti-rejeu reposait sur une chaîne de chemin ; trois API publiques de validation étaient plus permissives que leur consumer |
| v0.9 | ce qui précède **et** l'identité composite, physique et vérifiée à chaque consommation | **B1** : la frappe de capacité acceptait n'importe quelle `derivationRef`, et les émetteurs réels étaient **atteignables** par des getters publics. **B2** : chaque émetteur comparait son identité à celle que l'appelant lui passait — le vérificateur se comparait à lui-même, donc un vérificateur de TEST réel authentifiait un run de PRODUCTION |
| v0.10 | ce qui précède **et** la **dérivation vérifiable auprès de l'émetteur**, l'émetteur n'étant plus remis à l'appelant | **B10-01** : la dérivation était vérifiable mais ne couvrait pas l'affirmation portée — une sonde légitime certifiait un fournisseur jamais sondé. **B10-02/B10-03** : deux API publiques de validation acceptaient encore quand on leur retirait le champ qui déclenche le contrôle |
| v0.11 | ce qui précède **et** la **liaison de la décision au sujet exact certifié**, aucun contrôle ne se désactivant par omission | deux audits indépendants n'ont trouvé aucun contournement critique, mais ont établi que la **prose** promettait plus que le code : asymétrie de préparation fausse à la couche d'assertion, champs d'artefact présentés comme recoupés, code de refus inatteignable présenté comme observé, mesures de sceaux fausses |
| **v0.12** | inchangé — v0.12 ne modifie **aucun** comportement | successeur **strictement documentaire** : il aligne les affirmations sur le code mesuré. Les réserves restent ouvertes (`OPEN-FINDINGS.md`) |

La récursion n'a pas été dissimulée à chaque étape : elle a été nommée.

## 2. Ce qui n'est jamais une racine de confiance

- un artefact, même signé par lui-même ;
- un manifeste de run ;
- une attestation de runtime **produite par l'appelant** ;
- un argument de fonction libre ;
- un callback fourni par l'appelant, même nommé `operatorVerifier` ;
- un `runContext` contrôlé par l'appelant ;
- le composant qui construit la preuve ;
- **une valeur calculée précédemment dans le même processus**, si elle peut
  être remplacée avant consommation (fermeture v0.6) ;
- **un drapeau de politique fourni par l'appelant** — il peut restreindre,
  jamais créer une admission (fermeture v0.7, B1) ;
- **un booléen qui se dit authentifié** : `operatorAuthenticated`, `trusted`,
  `verified`, `confirmed` sont des SORTIES dérivées, jamais des entrées
  autoritaires (fermeture v0.7, B2 et §6) ;
- **un hash fourni par l'appelant** : une empreinte de texte arbitraire n'est
  pas une justification (fermeture v0.7, M7) ;
- **une racine de source, d'autorité ou de famille écrite dans un artefact** :
  elle est une demande de résolution, pas une provenance (fermeture v0.7, §32) ;
- **un objet authentiquement marqué par un constructeur exporté** : la marque
  prouve « créé par ce module », jamais « émis par cette frontière
  provisionnée » (fermeture v0.8) ;
- **un chemin de fichier fourni par l'appelant** : il ne prouve aucune origine
  opérateur, et il ne peut plus en créer une (fermeture v0.8) ;
- **`provisionedFrom: "ENVIRONMENT"`** porté par un objet : cette propriété est
  dérivée du contexte réel de provisionnement, pas de la présence d'un chemin
  (fermeture v0.8, B05) ;
- **un `operatorTrustBoundaryId` seul** : cet identifiant est **déclaré dans la
  configuration**. Deux configurations distinctes peuvent porter le même. Une
  identité de frontière est désormais **composite** — identifiant + liaison de
  configuration + espace d'exécution — et `configBindingHash` est **comparé**,
  pas seulement porté (fermeture v0.9, R1) ;
- **une chaîne de chemin de fichier** : `path.resolve` normalise une chaîne mais
  ne suit pas les liens. L'ancre de la réserve anti-rejeu repose sur l'identité
  **physique** du fichier (fermeture v0.9, R2) ;
- **un objet portant `provenanceAuthority()`** : seul un vérificateur marqué par
  `operator-trust-verifier` peut résoudre une provenance. Un callback d'appelant
  a zéro effet (fermeture v0.9, R3) — et en v0.10 ce getter **n'existe plus** ;
- **un objet possédant `get()`** : un registre d'artefacts doit porter la marque
  d'origine du module de registre et correspondre au run, à la mission et à la
  frontière attendus (fermeture v0.9, R5) ;
- **une `derivationRef` fournie par l'appelant** : une chaîne qui *nomme* une
  dérivation n'en est pas une. Toute émission de capacité critique interroge le
  **registre de décisions de l'émetteur** et refuse si la décision n'y figure
  pas, ou si elle porte sur un autre artefact, un autre run ou une autre
  mission (fermeture v0.10, B1) ;
- **l'identité que le vérificateur déclare pour lui-même** : la comparaison se
  fait contre le **contexte attendu** — celui du registre authentifié ou du
  manifeste. Un contexte attendu incomplet est un refus, jamais un saut du
  contrôle (fermeture v0.10, B2) ;
- **un objet marqué qui n'est pas dans son contexte** : un vérificateur de TEST
  authentiquement marqué n'authentifie **rien** d'un run de PRODUCTION, quel que
  soit l'identifiant de frontière qu'il déclare (fermeture v0.10, B2) ;
- **la présence d'une condition de contrôle** : un contrôle qu'on ne peut pas
  mener est un refus, pas une dispense. Retirer `ctx.verifier` ne désactive plus
  les contrôles de production de `assertCapabilityUsable` (fermeture v0.10, §12) ;
- **une décision authentique qui ne couvre pas ce qu'on lui fait dire** : une
  décision réelle ne suffit pas si elle ne lie pas le **sujet exact** certifié.
  Une capacité LLM ne nomme que le fournisseur, le modèle et le worker
  réellement sondés, pour l'artefact exact qui porte la concession ; une sonde ne
  vaut que pour un artefact (fermeture v0.11, B10-01) ;
- **l'omission d'un composant de sécurité** : retirer `opts.verifier` d'une
  validation de préparation ne supprime plus le contrôle, il le fait échouer —
  `READINESS_VERIFIER_REQUIRED`. Aucune vérification critique ne suit le motif
  `if (opts.verifier) { contrôle }` quand l'absence permet l'acceptation
  (fermeture v0.11, B10-03).

## 3. Ce qui est une racine de confiance

Un fichier JSON désigné par `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`, lu par
`provisionProductionTrustBoundary()`. Le noyau ne reçoit **jamais** ce chemin en
argument : il le lit dans l'environnement du processus.

`provisionTestTrustBoundary(cfg)` accepte une configuration en mémoire mais
**refuse structurellement** `namespace: "PRODUCTION"` — la séparation n'est pas
une convention de nommage.

## 4. Aucun secret n'est stocké dans le lot

- aucune clé privée n'est lue par `core/` ;
- `credentialPresenceAttested` est un **booléen ou une preuve de présence**,
  jamais une clé ;
- l'attestation d'acte humain est un HMAC calculé par l'exploitant
  (`tools/operator-provisioning.js`) à partir d'un secret détenu par
  l'exploitant, jamais embarqué ;
- le scan d'hygiène du paquet vérifie l'absence de matière privée (PEM, jetons)
  avec un témoin positif pour prouver que le détecteur discrimine.

## 5. Révocation

Le vérificateur relit la configuration de l'exploitant à chaque vérification :
`revocationModel = "LIVE_CONFIG_LOOKUP"`. Une clé révoquée **après**
provisionnement du vérificateur cesse d'authentifier immédiatement. C'est
vérifié par un test qui accepte l'attestation, révoque la clé, puis constate le
refus motivé.

## 5bis. Les états de provenance

Une racine écrite par l'appelant n'est jamais `AUTHENTICATED`. Les racines
retenues sont celles du registre de l'exploitant ; la déclaration portée par
l'artefact est consignée pour trace (`declarationAgrees`) et n'a aucun effet.

<!-- contract:provenanceStatuses -->

| État | Signification |
|---|---|
| `AUTHENTICATED` | racine reconnue par `EvidenceProvenanceAuthority` |
| `UNRESOLVED` | racine absente du registre de l'exploitant, ou aucune autorité provisionnée |
| `ABSENT` | aucune racine demandée |
| `AMBIGUOUS` | plusieurs entrées divergentes — jamais résolue en silence |

<!-- /contract -->

Seul `AUTHENTICATED` peut contribuer à une indépendance de sources. `UNKNOWN`,
`UNRESOLVED` et `AMBIGUOUS` ne corroborent rien.

## 6. Deux affirmations, jamais confondues

`INTERNAL_CHAIN_CONSISTENCY` ≠ `AUTHENTICATED_PRODUCTION_EXECUTION`. Un run
TEST peut être parfaitement cohérent : sa classe de preuve reste
`AUTHENTICATED_TEST_EXECUTION` et `authenticatedProductionExecution` vaut
`false`. Aucune politique ne convertit l'une en l'autre.

## 7. LIMITE DÉCLARÉE — l'hypothèse d'environnement d'exploitation

**Tout processus capable d'écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`, ou l'un
des fichiers qu'il désigne — configuration de confiance, registre d'acteurs,
registre de racines de provenance, registre d'entrées historiques — obtient une
frontière de PRODUCTION.**

La liste est exhaustive à dessein. Elle ne comporte plus de « racine de réserve
anti-rejeu » : en v0.8 la réserve est **ancrée au fichier de configuration
lui-même** et n'est plus une valeur configurable (voir `REPLAY-PROTECTION.md`).

Ce qui change en v0.8 : un appelant ne peut plus **contourner** l'exploitant en
appelant un constructeur exporté (`CAPABILITY-AUTHORITIES.md`).

Ce qui change en v0.9 : l'identité de cette frontière n'est plus une
**déclaration**. Deux configurations qui se présentent sous le même
`operatorTrustBoundaryId` restent deux frontières distinctes, et chaque
consommateur compare la liaison de configuration au lieu de se contenter de la
porter. Deux alias du même fichier de configuration sont en revanche **la même**
racine, parce que l'identité retenue est physique.

Ce qui change en v0.11 : une décision d'émetteur ne vaut que pour le **sujet
exact** qu'elle a décidé, et aucune validation publique ne s'affaiblit quand on
lui retire une entrée.

Ce qui change en v0.10 : l'appelant ne **reçoit** plus l'émetteur, et une
capacité n'est acceptée que si sa dérivation est **inscrite** au registre de
décisions de son émetteur. La comparaison d'identité se fait contre le contexte
attendu, jamais contre ce que le vérificateur déclare pour lui-même — un
vérificateur de TEST authentiquement marqué n'authentifie rien d'un run de
PRODUCTION. Et la liste ci-dessus s'étend d'un point explicite : **renommer**
l'un de ces fichiers ouvre une nouvelle génération de confiance, ce qui
réinitialise la réserve anti-rejeu (`REPLAY-PROTECTION.md`, décision §15). Cette
capacité appartient déjà au détenteur de la racine.

Il reste l'hypothèse ci-dessus, qui porte sur l'exploitant lui-même, et qui
n'est pas résolue par ce lot.

**Ce que v0.12 ajoute à cette section, et qui manquait.** Une racine de
confiance ne rend pas vrai tout ce qu'un artefact déclare. Une décision
d'émetteur atteste **un sujet** et **une empreinte d'artefact** — pas le contenu
informatif que l'appelant a écrit autour. Douze champs de l'artefact de
capacité LLM ne sont pas attestés, le schéma n'est pas fermé, et aucun
consommateur critique ne s'y appuie : voir `LLM-CAPABILITY-BOUNDARY.md` et
`OPEN-FINDINGS.md` (R3). Croire l'inverse serait exactement l'erreur que
ce programme corrige depuis v0.3 — croire une propriété portée plutôt que
dérivée.

Cette hypothèse n'est résolue par aucun lot de MONO-10. Elle est déplacée vers la couche qui
peut réellement la porter : le contrôle d'accès du système d'exploitation, la
séparation des comptes, l'intégrité du système de fichiers. Ce qui **est** acquis
est que la racine n'est plus reconstructible *depuis le code appelant* :
fabriquer un artefact, un manifeste, une attestation, un callback ou un
`runContext` ne suffit plus.

Un audit qui conclurait « l'auto-certification a simplement été déplacée vers la
variable d'environnement » décrirait exactement ce que ce paragraphe énonce. La
question ouverte est de savoir si ce déplacement est suffisant pour un usage
professionnel réel — et cette question n'appartient pas à ce lot.
