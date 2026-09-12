# ATELIER-RELEASE-GATE-01

> Poser une question coûte plus cher que produire un livrable.
> Tout le reste est prêt.

**Verdict : `PASS_WITH_OWNER_ACCEPTANCE_REQUIRED`** — 0 appel API, 0 USD, 0 ligne de code de
production modifiée.

## 1. Lignée — non canonique, contenu intact

L'historique a été réécrit hors session entre les deux derniers lots : `18f9019` n'est plus un
ancêtre de HEAD, et `ca6fa4d` vit désormais sous `25dee29`. Le Release Gate ne reconstruit pas
l'histoire du dépôt ; il vérifie que rien n'a été perdu.

| contrôle | résultat |
|---|---|
| artefacts DEEP-HAIKU-FIT-01 conservés | **oui** — mesures octet pour octet identiques |
| DEEP-OUTPUT-ROBUSTNESS-01 présent à HEAD | **oui** — docs, évaluation et code actif |
| code fonctionnel perdu | **aucun** — 588 fichiers avant, 599 après, 0 disparu |
| empreintes gelées | **conformes**, dont les deux nommées au §15 |

`LINEAGE_STATUS = NON_CANONICAL_BUT_CONTENT_PRESERVED`. La réécriture a été strictement additive.

## 2. Audit du lot précédent — aucun affaiblissement

31 fichiers, 875 insertions, 61 suppressions. Le code de production n'a bougé que de six lignes.

Les **15 fichiers réalignés** ne changent qu'un littéral d'empreinte SHA-256 — une ligne chacun,
aucune assertion retirée. C'est le rituel que B-01B, CPT-01 et UAF-02 ont chacun suivi.

Les **quatre tests historiques** demandent plus d'attention, puisqu'ils épinglaient délibérément la
classification changée :

| test | verdict | ce qu'il garde encore |
|---|---|---|
| `T-UAF02-09` | `EXPECTED_CONTRACT_UPDATE` | refus maintenu, + 4 contrôles d'absence de verdict fabriqué |
| `T-CPT01-06` | `EXPECTED_CONTRACT_UPDATE` | même refus, même message, état gouverné au lieu d'un trou |
| `CSR01-8` | `EXPECTED_CONTRACT_UPDATE` | la règle elle-même, désormais gardée à l'étage de la taxonomie |
| `ORCH01-19b` | `EXPECTED_CONTRACT_UPDATE` | aucun verdict fabriqué, aucun model shopping |

Aucun `TEST_WEAKENING`. Chaque test gagne des assertions plutôt qu'il n'en perd.

**Un point mérite d'être dit clairement.** Dans `ORCH01-19b`, l'assertion anti-model-shopping est
inchangée, mais ce qui la protège a changé de nature : auparavant la classe d'échec était inéligible
au repli ; désormais elle l'est, et c'est la chaîne à fournisseur unique
(`ROLE_PROVIDER_ORDER = ["anthropic"]`) qui empêche l'appel à un second modèle. Une garantie de
taxonomie a été remplacée par une garantie de configuration. Sans conséquence aujourd'hui — à
réexaminer le jour où un second fournisseur Deep apparaîtrait.

`MANIFEST_FIX = LEGITIMATE` : le test `T-HTMLFINAL02-10` n'a pas été touché. C'est la donnée qui a
été réalignée par son propre outil, et l'inventaire a **augmenté** de 72 à 75 — rien n'a été
supprimé pour faire passer un test.

## 3. Contrats — tous confirmés

OPRIE reste seule autorité sémantique ; le frontend n'a plus aucun chemin fabriquant un état depuis
que `FC-01a` a supprimé `adpFallbackLocal`. Fast est candidate-only : `askDecisionProvider`, dernier
reste du décideur historique, n'est plus appelé par aucun chemin de production — il ne subsiste que
comme façade pour le banc d'évaluation, et `v11ShowRapidGate` n'est plus qu'un afficheur d'état
consommé par OPRIE.

Routage : **Fast = Groq seul**, **Deep = Anthropic seul**, aucun repli fournisseur Deep. Le worker
s'appelle encore `atelier-decision-groq` — nom historique que le §9 prévoit explicitement, et qui ne
modifie pas le routage réel.

Contrat matériau tenu : `material_content` brut ne parvient qu'à l'Analyste, jamais au Critique ni à
l'Arbitre. La frontière de 16 384 octets est couverte paramétriquement — limite−1 acceptée, limite
acceptée (inclusive), limite+1 rejetée en 413 sans lecture intégrale, comptage en octets UTF-8
réels. Aucune troncature silencieuse.

Gouvernance des échecs structurés : les trois rôles produisent désormais un état gouverné sur une
sortie invalide, `exactKeys` compris. **`BARE_502_WITHOUT_OPRIE_STATE = 0`.**

## 4. Performance

**Fast : `PASS`.** En régime nominal — 48 appels, fixtures identiques — le plan rapide rend p50
**467 ms** et p95 **1617 ms** pour un plafond contractuel de 3 s, sans un seul 429.

Une nuance à ne pas masquer : la série `perf-real-01` mesure le même plan en régime **saturé** et
rapporte systématiquement `interactive_p95_contract_met = false`. Ces mesures ont été prises sous 8
à 21 signaux 429 **et avec un repli Fast vers Anthropic qui n'existe plus** — côté Groq seul, leur
p95 tombe entre 780 et 1215 ms. La preuve de saturation est donc périmée par changement de
configuration ; celle du régime nominal est valide. Conséquence du fournisseur unique : un 429 n'a
plus de cible de repli, la chaîne échoue proprement au lieu de ralentir. C'est cohérent, mais non
remesuré depuis le figement.

**Deep : `OWNER_ACCEPTANCE_REQUIRED`.** C'est le cœur de ce Release Gate.

La question du §19 était : les chemins très lents sont-ils réservés à un travail Deep substantiel ?
**La réponse est non.**

| tour | ce qu'il rend | temps |
|---|---|---|
| « Résume ce texte en dix lignes » | « Quel est le texte ? » | **57 s** |
| « Prépare ça pour demain » | une demande de précision | **87 s** |
| trois scénarios de réduction budgétaire, bénéfices, risques, conditions | un READY | **68 s** |
| population ouverte, p50 | une clarification | **91,7 s** |

L'attente la plus longue tombe sur le tour qui produit le moins. Une seconde mesure indépendante,
sur 12 tours du corpus de régression, donne un p50 de 32,6 s et une queue à 218 s, avec jusqu'à 13
appels de Critique pour un seul tour.

Le §2 admet qu'un vrai travail de fond prenne du temps ; il interdit que chaque échange devienne une
attente longue. **La première moitié du contrat est respectée. La seconde ne l'est pas sur la
population ouverte.**

Ce lot ne propose aucune solution : le §3 et le §20 l'interdisent, et un Release Gate qui redessine
n'est plus un Release Gate.

## 5. Économie — `OWNER_ACCEPTANCE_REQUIRED`

0,057 USD au tour médian de référence : raisonnable pour un atelier de prompts. Mais la queue
mesurée monte à ~0,5 USD sur un tour, avec jusqu'à 15 appels fournisseur, et aucun plafond de coût
par tour n'existe. Ce n'est pas un bloqueur technique — c'est un arbitrage.

Rappel de méthode : la consommation globale du compte Anthropic n'est pas une métrique Atelier.
Claude Code a été lancé par le passé avec `ANTHROPIC_API_KEY` dans son environnement, ce qui
mélangeait les consommations. Seules les mesures attribuables au pipeline sont utilisées ici.

## 6. Dettes connues, aucune bloquante

- Plafond de batch du Critique à 1600 jetons, calibré sur Sonnet. Sonnet ne le heurte pas ; tout
  futur changement de modèle Deep doit le recalibrer **avant**.
- `confirmation_required` n'est déclenché par aucune fixture du corpus. L'état est implémenté et
  validé structurellement, jamais exercé.
- Preuve Fast sous saturation périmée par le figement de la chaîne à Groq seul.
- `ORCH01-19b` : protection anti-model-shopping désormais portée par la configuration.
- `tokens-cost.json` exclu par la règle `**/*token*` — faux positif sans conséquence, les chiffres
  vivent aussi dans `cout-jetons.json`, versionné.

## 7. Décision

`TECHNICAL_READINESS = READY`. `PRODUCT_READINESS = OWNER_ACCEPTANCE_REQUIRED`.

Deux compromis à accepter explicitement : la latence Deep sur la population ouverte, et l'absence de
plafond de coût par tour. Les accepter ouvre `ATELIER-FINAL-HTML-CONSOLIDATION-01`. Juger la latence
inacceptable fait basculer le verdict en `TECHNICALLY_READY_PRODUCT_NOT_READY` — et le lot dédié
devra alors venir **après** la consolidation, jamais pendant.
