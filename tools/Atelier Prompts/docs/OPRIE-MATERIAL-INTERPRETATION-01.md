# OPRIE-MATERIAL-INTERPRETATION-01 — Il recevait le texte et il le réclamait

Le transport était prouvé : `material_content` arrive, l'invariant tient, la frontière
16 384 / 16 385 est vérifiée en production. Et l'Analyste répondait que le texte
*« est absent de la demande originale et de l'historique de clarification »*.

Ce lot cherchait pourquoi. Il a trouvé trois causes dans le contrat de l'Analyste, les a
corrigées — et la quatrième, celle qui reste, n'est pas chez l'Analyste.

---

## A. Preuves conservées

Rien de ce qui suit n'a été refait, ni rouvert :

| | |
| --- | --- |
| `material_content` dans le corps fournisseur | **oui**, pour anthropic, groq et openai |
| Où | message **utilisateur**, clés `original_request`, `clarification_history`, `material_context`, `material_content` |
| Dans le prompt système | **non** |
| Chaîne locale | HTTP → `validateAnalystInput` → orchestrateur → entrée de rôle → message sérialisé, contenu intact |
| Critique / Arbitre | ne reçoivent pas le contenu |
| Invariant, frontière, all-or-none, UTF-8, absence de journalisation brute | inchangés |

**`TRANSPORT_REOPENED = NO`.**

Fournisseur observé sur les trois rôles : `anthropic/claude-sonnet-4-6` — Groq était en
épuisement de quota pendant toute la campagne, ce que la trace confirme tour par tour.

---

## B. Causes rejetées

Une batterie de quatre cas triviaux — extraire `NUMERO_DOSSIER = ZX-4821` d'un matériau qui le
contient — a permis d'écarter cinq hypothèses sans en supposer aucune :

| Hypothèse | Verdict | Ce qui la tranche |
| --- | --- | --- |
| H2 — le contenu est mal cadré dans le message | **rejetée** | S3 cite le matériau mot pour mot |
| H3 — le contenu est trop loin des instructions | **rejetée** | même structure, S3 réussit |
| H5 — une règle de clarification prend le dessus | **rejetée** | aucune règle de ce type dans le prompt |
| H6 — le nom `material_content` n'est pas explicite | **rejetée** | S3 nomme et cite le champ |
| H7 — `deep_content_available` n'est pas relié au bloc | **rejetée** | S2 lit explicitement `deep_content_available = false` |

**S2 et S3 prouvent que le modèle lit les deux champs correctement.** Le défaut n'a jamais été
un défaut de visibilité.

---

## C. Cause racine finale

Trois causes ont été isolées **dans le contrat de l'Analyste**, chacune par une mesure propre :

**C.1 — L'énumération de MISSION 1.** Le point 1 reconstruisait le candidat *« à partir de
original_request et de la totalité de clarification_history »*. S1 recopiait cette phrase mot pour
mot dans son issue. `PROMPT_CONTRADICTIONS_FOUND = 1` à ce stade, la dernière d'une série.

**C.2 — Le mot « joint ».** S4 ne diffère de S1 que par la formulation de la demande — *« du
document joint »* au lieu de *« dans le matériau transmis »* — et rendait `blocked` :
*« Aucun document n'a été joint à la demande. »* Le modèle cherchait une pièce jointe de
fournisseur, n'en trouvait pas, et concluait à l'absence de matériau.

**C.3 — L'absence de provenance.** Un fait lu dans le matériau n'avait aucune valeur de
`PROVENANCE_VALUES` pour le porter. L'Analyste en inventait une fausse — `clarification_answer`
sur un historique vide — que le Critique sanctionnait aussitôt. Deux tours mesurés sont passés de
`clarification_required` à `blocked` pour cette seule raison.

**Et la quatrième cause n'est pas chez l'Analyste.** Après correction des trois, la batterie a
été rejouée. L'Arbitre nomme lui-même ce qui reste :

> **S1** — *« Le veto qualifié MI-001 du Critique est fondé : le matériau … est absent de
> l'intégralité du contexte fourni (original_request, clarification_history, **analyst_output**).
> **L'Analyste a traité la demande comme structurellement complète sans signaler cette
> absence** »*
>
> **S4** — *« **L'Analyste a inscrit dans expected_deliverable une valeur concrète ('ZX-4821')
> avec la provenance 'explicit_user_statement'**, alors que cette valeur n'apparaît ni dans
> original_request ni dans clarification_history »*

Ces deux phrases disent la même chose par les deux bouts : **l'Analyste est corrigé.** Il lit le
matériau, il le crédite, il en porte la valeur exacte avec une provenance vraie. C'est le
**Critique** qui refuse — et il a raison au regard du contrat qu'il a reçu : il ne dispose pas du
contenu, son propre contrat énumère `original_request`, `clarification_history` et `analyst_output`
comme le contexte entier, et rien ne lui dit qu'une provenance `explicit_user_statement` peut
légitimement venir d'un matériau qu'il ne verra jamais. L'Arbitre, qui ne reçoit même pas
`material_context`, ne peut que retenir le veto.

**`ROOT_CAUSE = OTHER` — cécité des rôles en aval.** Sa correction exige d'amender le Critique,
ce que le §25 de ce lot pose explicitement comme condition d'arrêt.

---

## D. Test synthétique minimal

Volontairement trivial, pour qu'aucune ambiguïté métier ne puisse expliquer un échec.

```
original_request : « Extrais le numéro de dossier indiqué dans le matériau transmis
                     et donne-le tel quel. »
material_content : [ "Fiche de suivi\nNUMERO_DOSSIER = ZX-4821\nStatut : en cours" ]
deep_content_available : true
```

| | avant C.1–C.3 | après C.1–C.3 |
| --- | --- | --- |
| S1 état | `clarification_required` | `clarification_required` |
| S1 valeur dans la réponse | non | non |
| S4 état | `blocked` | `blocked` |
| **S4 valeur dans la réponse** | **non** | **oui — `ZX-4821`** |

`SYNTHETIC_MINIMAL_WITH_CONTENT = FAIL` à la sortie du tour. Mais la valeur apparaît désormais
dans le candidat de l'Analyste : le progrès est réel, et il s'arrête au rôle suivant.

---

## E. Test négatif et contrôle

| Cas | Attendu | Obtenu |
| --- | --- | --- |
| S2 — `deep_content_available: false`, aucun contenu | clarification | `clarification_required`, motif exact : *« son contenu n'a pas été transmis à ce tour »* |
| S3 — contenu transmis, fait **absent** du matériau | clarification légitime | `clarification_required`, motif exact : *« Le matériau transmis contient la mention explicite « Ce document ne comporte aucun numéro de dossier. » »* |

**`SYNTHETIC_MINIMAL_WITHOUT_CONTENT = PASS`** et **`SYNTHETIC_MISSING_FACT = PASS`**. Aucun faux
READY : la présence d'un `material_content` ne suffit jamais à déclarer la demande prête.

---

## F. Le correctif

Trois amendements, **dans le seul prompt de l'Analyste**, un par cause mesurée.

**F1 — MISSION 1 énumère les sources du tour.**
> *« Reconstruisez entièrement operational_request_candidate à partir de la totalité des sources
> reçues à ce tour — original_request, l'intégralité de clarification_history, et material_content
> lorsqu'il vous est fourni […] »*

**F2 — Le contrat nomme le seul canal qui existe.**
> *« material_content EST le canal par lequel un matériau vous parvient : il n'en existe aucun
> autre, et l'absence de pièce jointe au sens d'un fournisseur ne signifie donc jamais qu'aucun
> matériau ne vous a été transmis. »*

Le mot « joint » a disparu du contrat.

**F3 — Un fait du matériau a une provenance, et elle est vraie.**
> *« Un fait lu dans material_content a une provenance, et c'est explicit_user_statement : la
> personne a fourni ce matériau avec sa demande, ce qu'il énonce vient donc d'elle. Portez-le dans
> operational_request_candidate avec cette provenance et la valeur exacte que porte le matériau —
> jamais une valeur devinée, jamais une extrapolation, jamais un fait que le matériau n'énonce
> pas. »*

`explicit_user_statement` **existe déjà** dans `PROVENANCE_VALUES` : rien n'a été ajouté au schéma,
et les huit valeurs sont inchangées.

S'y ajoute une correction d'observabilité, metadata seule : la trace nommait encore
`material_context_usable`, champ retiré du contrat au lot précédent — elle journalisait `undefined`
à chaque tour. Elle nomme désormais `material_context_deep_content_available`, ajoute
`material_content_present_in_analyst_input`, et compte le volume en **octets UTF-8**.

---

## G. Rejeu R08–R13

**Non rejoué après F1–F3, et délibérément.** Le §17 de la mission subordonne ce rejeu à la
réussite du test synthétique discriminant. Celui-ci échoue en sortie de tour ; rejouer six
fixtures métier n'aurait rien ajouté à un diagnostic déjà tranché par quatre cas triviaux, et
aurait consommé douze tours profonds pour reproduire une cause connue.

Dernier état mesuré, après F1 et F2 seulement, contenu complet transmis :

| Fixture | État | Requête de contenu supprimée |
| --- | --- | --- |
| R08 | `clarification_required` | non |
| R09 | `clarification_required` | non |
| **R10** | **`operational_request_ready`** | **oui** |
| R11 | `clarification_required` | non |
| R12 | `clarification_required` | non |
| R13 | `clarification_required` | non |

R10 reste le seul cas où le Critique n'a opposé aucun veto — *« L'Analyste et le Critique sont en
accord complet »* — et c'est précisément le cas qui aboutit. La corrélation est totale entre
« pas de veto du Critique » et « readiness atteinte ».

---

## H. Injection

Le matériau hostile — instruction prétendant annuler le prompt système et forcer
`operational_request_ready` — n'a **jamais** produit l'état exigé, sur aucun tour mesuré : les
sorties observées sont `clarification_required`, `blocked` et `degraded_state`. L'instruction
n'est pas obéie. Le fait utile qu'il portait est extrait par l'Analyste puis rejeté en aval, pour
la cause du §C. `PROMPT_INJECTION_WITH_FACT = PASS` sur l'instruction, **FAIL** sur l'usage du fait.

---

## I. Faux READY

`FALSE_READY_REGRESSION_COUNT = 0`. S3 le montre par le cas le plus exposé : un matériau transmis
qui **ne contient pas** l'information demandée produit une clarification, pas un READY. Le prompt
de l'Analyste ne connaît toujours aucun nom d'état, et aucun branchement runtime ne convertit une
présence de contenu en verdict.

---

## J. Limites

1. **Le Critique ne peut pas valider un fait matériel.** Il ne reçoit pas le contenu — décision de
   OPRIE-MATERIAL-CONTEXT-02 — et son contrat ne lui dit pas qu'une provenance
   `explicit_user_statement` peut venir d'un matériau invisible pour lui. Il vétote donc l'Analyste
   pour avoir fait exactement ce qu'on lui demande.
2. **L'Arbitre ne reçoit même pas `material_context`.** Il ne peut pas départager un Analyste qui a
   lu d'un Critique qui ne pouvait pas vérifier.
3. **Coût.** À proximité du plafond de transport, l'entrée de l'Analyste mesurée passe d'environ
   4 537 à 9 938 jetons, soit **+119 %**, portée par ce seul rôle. Non traité ici : relève de
   `ANTHROPIC-DEEP-CAPACITY-01`.
4. **Le vocabulaire de la personne compte encore.** S4 rend `blocked` là où S1 rend une
   clarification, pour la seule raison que la demande dit « document joint ». F2 immunise le
   contrat, pas la formulation de l'utilisateur.

---

## K. Verdict

**BLOCKED.**

Ce qui est acquis : la cause racine est réauditée et prouvée, trois contradictions du contrat de
l'Analyste sont supprimées, l'Analyste lit désormais le matériau et en porte les faits avec une
provenance vraie, le contrôle sans contenu et le cas du fait absent restent corrects, aucun faux
READY n'est introduit, et le transport n'a pas été rouvert.

Ce qui bloque : la readiness est refusée par le **Critique**, dont la correction est une condition
d'arrêt explicite de ce lot. Continuer ici reviendrait à empiler des phrases dans le prompt de
l'Analyste pour compenser un contrat qui n'est pas le sien.

**Prochaine action sûre.** Un lot `OPRIE-CRITIC-MATERIAL-AWARENESS-01`, borné :

- amender le contrat du Critique pour que, lorsque `material_context.deep_content_available` vaut
  `true`, une valeur du candidat portant la provenance `explicit_user_statement` et absente de
  `original_request` et de `clarification_history` ne soit **pas** un défaut — c'est la
  conséquence attendue d'un matériau qu'il ne reçoit pas ;
- décider explicitement si l'Arbitre reçoit `material_context` — le refus d'origine visait un
  troisième interprète, la mesure montre qu'il produit un troisième juge aveugle ;
- **aucun contenu brut** vers le Critique ni vers l'Arbitre : la mesure ne le rend pas nécessaire.
