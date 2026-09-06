# OPRIE-ARBITER-MATERIAL-CONTEXT-DELIVERY-01 — Il voyait la revendication, pas le fait

Le lot précédent avait doté le candidat d'`available_inputs` : l'Analyste pouvait enfin déclarer
qu'un intrant requis est disponible, sans recopier sa valeur. Seize tours sur trente restaient
pourtant `blocked`, et l'Arbitre en donnait lui-même la raison, à l'identique :

> *« L'Analyste et le Critique **s'accordent** […] **Le champ available_inputs mentionne** "le
> numéro de dossier, présent dans le matériau transmis", **or aucun matériau n'a été effectivement
> fourni** »*

Il recevait l'affirmation. Il n'avait rien pour la vérifier.

---

## A. Point de départ

| | |
| --- | --- |
| `available_inputs` renseigné | 29 / 30 |
| `user_provided_material` | 30 / 30 |
| Vetos du Critique | **0** |
| `blocked` | 16 / 30 |
| `READY` | 13 / 30 |

Le Critique était déjà hors du chemin de blocage. Restait l'Arbitre.

---

## B. Le chemin réel

`runRoleWithHaChain` → `isCritic` faux → `GENERIC_ROLE_ADAPTERS[name](role, input, env)` →
`runRoleWithAnthropic("arbiter", …)` → `ROLE_DEFINITIONS.arbiter.buildUserMessage` =
**`makeArbiterUserMessage`**.

Un seul chemin, sans pipeline batché — contrairement au Critique, dont le piège de `CMCD-01` avait
été précisément d'avoir deux constructeurs.

---

## C. Le manque, prouvé — et il était à deux étages

Capture du corps réellement émis, **avant** correction :

```
clés du message Arbitre : original_request, clarification_history, analyst_output, critic_output
material_context          : ABSENT
available_inputs          : visible
user_provided_material    : visible
contenu brut              : absent
```

Plus profond que pour le Critique :

| Étage | État avant |
| --- | --- |
| `buildRoleInput(role === 'arbiter')` de l'orchestrateur | `{...base, analyst_output, critic_output}` — **pas de `material_context`** |
| `makeArbiterUserMessage` | ne l'acceptait ni ne l'émettait |

Le Critique n'avait qu'un constructeur à corriger ; l'Arbitre ne recevait pas le champ **avant même
la sérialisation**. Les deux étages devaient bouger.

---

## D. Le correctif minimal

1. `buildRoleInput` transmet `material_context` au rôle Arbitre.
2. `makeArbiterUserMessage` l'accepte et l'émet, normalisé comme partout ailleurs — absent valant
   `unknown`.

**Aucune règle sémantique n'a été ajoutée au prompt de l'Arbitre.** Le §14 l'exigeait : vérifier
d'abord si le contexte seul suffit. Il suffit.

---

## E, F, G. Propagation vérifiée sur le corps réel

| | |
| --- | --- |
| `deep_content_available: true` | propagé |
| `deep_content_available: false` | propagé |
| `deep_content_available: "unknown"` | propagé, sans conversion |
| `available_inputs` visible | oui |
| `user_provided_material` visible | oui |
| Contenu brut vers l'Arbitre | **aucun** |
| Contenu brut vers le Critique | **aucun** |

Vérifié sur le corps émis par les **trois** fournisseurs, et per-run en production : **30 tours sur
30** portent la trace `arbiter_material_context_observation` avec `deep_content_available = true`,
`available_inputs` présent et la provenance matérielle présente.

---

## H. Rejeu de trente tours

Même cas, même modèle, `temperature: 0`, Anthropic sur les trois rôles, 30/30, zéro bruit technique.

| | référence | `available_inputs` seul | **+ contexte Arbitre** |
| --- | --- | --- | --- |
| `blocked` | 10 / 30 | 16 / 30 | **0 / 30** |
| `operational_request_ready` | 11 / 30 | 13 / 30 | **30 / 30** |
| `clarification_required` | 1 / 30 | 1 / 30 | 0 / 30 |
| Dégradations techniques | 1 | 0 | **0** |
| Analyste structurellement conforme | — | 29 / 30 | **30 / 30** |

**`P(ACCEPT │ tour évaluable)` = 29 / 29 = 100 %.**

---

## I. Taxonomie des refus de l'Arbitre

| Catégorie | Avant | Après |
| --- | --- | --- |
| `WRONG_MATERIAL_UNVERIFIABLE` | 16 | **0** |
| `PROVENANCE_INCONSISTENCY` | 0 | 0 |
| `INPUT_AVAILABILITY_INCONSISTENCY` | 0 | 0 |
| `OTHER_SEMANTIC` | 0 | 0 |
| `TECHNICAL` | 0 | 0 |

Le faux veto de cécité matériau est éteint, et aucune autre catégorie n'a pris sa place.

---

## J. Contrôle négatif — la preuve que ce n'est pas un tampon encreur

Trente tours sur trente en `READY` appelle la question inverse : la chaîne accepte-t-elle
désormais **tout** ? Six tours avec `deep_content_available: false` et aucun contenu :

| | |
| --- | --- |
| `clarification_required` | 5 / 6 |
| `blocked` | 1 / 6 |
| `operational_request_ready` | **0 / 6** |
| Valeur inventée | **0 / 6** |
| `user_provided_material` émis à tort | **0 / 6** |

Et l'Arbitre nomme le champ qu'il vient de recevoir :

> *« Le matériau est signalé comme présent mais son contenu est **inaccessible à ce tour
> (deep_content_available = false)**. Le numéro de dossier est l'unique livrable attendu et ne peut
> être ni estimé […] »*

**Il s'en sert pour refuser autant que pour accepter.** C'est ce qui distingue une livraison de
contexte d'un assouplissement : `true` → 30/30 prêt, `false` → 6/6 refusé, avec la raison exacte.

---

## K. Faux READY

| | |
| --- | --- |
| `READY` | 30 / 30 |
| dont disponibilité déclarée | **30 / 30** |
| **Faux READY** | **0** |

Contre 1/13 au lot précédent. Aucun tour ne déclare la demande prête sans avoir consigné que
l'intrant requis est disponible.

---

## L. Jugement du run 22

**`FALSE_READY`**, et il est désormais tranchable sans hésitation.

Le run 22 avait atteint `READY` sans recopier la valeur — la forme correcte — **mais sans rien
déclarer** : ni `available_inputs`, qui n'existait pas encore, ni la provenance matérielle. Le
contrat est maintenant complet, et la mesure montre à quoi ressemble un `READY` fondé : les trente
tours déclarent la disponibilité de l'intrant. Le run 22 n'en déclarait aucune.

Il était `INDETERMINATE` faute de contrat ; il ne l'est plus.

---

## M. Limites

1. **La lecture du matériau par l'Analyste reste hors périmètre** — 53,3 % mesuré à
   `PROVENANCE-CONFORMANCE-01`, et la question ouverte de sa dépendance au fournisseur.
2. **Un seul cas synthétique.** Les trente tours portent sur l'extraction `ZX-4821` ; le corpus
   métier R08–R13 n'a pas été rejoué ici.
3. **Le prompt de l'Arbitre n'a reçu aucune règle.** C'est un résultat, pas un manque : le contexte
   seul a suffi. Si un cas futur exigeait une règle, il faudrait la mesurer avant de l'écrire.

---

## N. Verdict

**PASS.**

Le chemin réel est prouvé, le manque était à deux étages et les deux sont comblés, `true` / `false`
/ `unknown` se propagent, `available_inputs` et la provenance sont visibles, aucun contenu brut
n'atteint l'Arbitre ni le Critique, et **aucune règle sémantique n'a été ajoutée**.

Le faux veto de cécité matériau passe de **16 à 0**. L'acceptation de l'Arbitre sur les tours
évaluables atteint **100 %**. Les faux READY passent de 1 à **0**. Et le contrôle négatif refuse
6/6 en citant le champ livré.

La chaîne complète — Analyste, Critique, Arbitre — traite désormais un fait matériau de bout en
bout : lu, déclaré disponible sans être recopié, tracé par sa provenance, vérifié par le Critique,
et arbitré par un Arbitre qui sait ce dont l'Analyste disposait.

---

## O. Prochaine action sûre

**`OPRIE-MATERIAL-READING-CONFORMANCE-01`.** Le plafond du système est désormais la lecture de
l'Analyste : 53,3 % mesuré sur Anthropic, contre 8/8 observé incidemment sur Groq. Deux étapes,
dans cet ordre :

1. **Quantifier la dépendance au fournisseur** sur un échantillon suffisant et à conditions
   égales — c'est une mesure, pas une correction.
2. **Puis rejouer le corpus métier R08–R13** avec la chaîne désormais complète, pour vérifier que
   ce qui vaut sur le cas synthétique vaut sur des demandes réelles.

Aucune règle de prompt avant ces deux mesures.
