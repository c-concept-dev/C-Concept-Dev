# OPRIE-MATERIAL-PROVENANCE-02 — La valeur qui manquait au vocabulaire

L'audit précédent avait conclu sur un blocage d'autorisation : aucune des huit provenances du
CDC §6 ne désignait un fait porté par `material_content`, et l'étendre exigeait de toucher un
vocabulaire protégé. Ce lot est l'autorisation. Il ajoute **une** valeur, écrit ce qu'elle
signifie, et remet à jour la règle d'ancrage du Critique qui comptait deux sources là où le
contrat en compte trois.

---

## A. Évolution de contrat autorisée

| | |
| --- | --- |
| Ce qui est autorisé | étendre le vocabulaire de provenance tracé au CDC |
| Ce qui le justifie | `OPRIE-MATERIAL-PROVENANCE-01` — aucune valeur existante ne couvre le cas |
| Portée | une seule valeur, générique, additive |
| Contrat gelé violé | **non** — aucun des artefacts touchés n'est dans les sept plages `frozen-guard` |

---

## B. Le nom

**`user_provided_material`**

Les huit valeurs historiques nomment **comment un fait est venu à la connaissance du système** :
une déclaration, une réponse, une préférence, une déduction, une délégation, un fait à rechercher,
une estimation, un scénario. La neuvième suit cette famille et n'encode ni format, ni domaine, ni
fournisseur, ni protocole, ni nom de champ — pas de `pdf_fact`, pas de `document_fact`, pas de
`material_content_fact`.

---

## C. Définition normative

Le CDC §6 nommait les valeurs sans les définir : c'est ce silence qui rendait la question
indécidable. Deux définitions sont désormais écrites, dans `PROVENANCE_DEFINITIONS`, sans ouvrir
la définition des six autres.

```
explicit_user_statement
  Fait explicitement déclaré par la personne dans original_request ou dans clarification_history.

user_provided_material
  Fait explicitement présent dans le contenu d'un matériau fourni par la personne et transmis à
  l'Analyste pendant le tour courant (material_content). Décrit l'origine du fait, jamais sa
  véracité, sa suffisance ni sa pertinence.
```

**Provenance n'est pas confiance.** Un fait correctement sourcé sur un matériau utilisateur n'est
ni vrai, ni suffisant, ni pertinent pour autant.

---

## D. Trace au CDC

Il n'existe **aucun fichier CDC dans le dépôt** : la spécification est référencée par numéros de
clause dans les commentaires (`CDC §6`) et pincée par un test qui la nomme. La trace mise à jour
est donc double, et consciemment :

| Artefact | Avant | Après |
| --- | --- | --- |
| Commentaire `core/adn/operational-request-state.js` | « Provenance obligatoire […] (CDC §6). » | le même, suivi du motif de l'extension et de l'audit qui la justifie |
| `tests/operational-request-state.test.mjs` | « PROVENANCE_VALUES couvre exactement le vocabulaire du CDC » | « …couvre le vocabulaire du CDC **et sa seule extension tracée** » |
| `tests/operational-request-analyst-provenance-value.test.mjs` | « P1 : […] restent inchangés » | « …restent inchangés **hors extension tracée** » |

**Les deux gardes sont conservées et resserrées, jamais supprimées ni relâchées** : elles vérifient
désormais que les huit du CDC sont intactes **et dans leur ordre**, que la neuvième est la seule
ajoutée, et que le total vaut exactement neuf.

---

## E. Schéma

`PROVENANCE_RECORD_JSON_SCHEMA` dérive son `enum` de `PROVENANCE_VALUES` : l'extension y arrive
sans code supplémentaire. Vérifié sur le corps réellement émis vers le fournisseur — les neuf
valeurs partent. `additionalProperties: false`, `required: [field, value, provenance]` et
`minLength: 1` sont inchangés : la validation reste stricte.

---

## F. L'écrivain — l'Analyste

Deux endroits, et pas un de plus :

**Règle 2** énumère les sources autorisées et définit désormais, en ligne, les deux qui se
confondaient.

**Point 10** remplace l'affirmation posée par `OPRIE-MATERIAL-INTERPRETATION-01` :

> *« Un fait lu dans material_content a sa propre provenance, et c'est user_provided_material. Ne
> lui donnez pas explicit_user_statement, qui désigne ce que la personne a écrit elle-même dans
> original_request ou clarification_history : lire un fait dans un document fourni et l'entendre
> énoncé par la personne sont deux origines distinctes. […] N'employez user_provided_material que
> si le fait figure réellement dans le material_content de CE tour : ni pour une déduction que
> vous en tirez, qui relève de safe_deduction, ni pour un fait dont vous supposeriez la présence
> alors qu'aucun contenu ne vous est parvenu. »*

---

## G. La règle d'ancrage du Critique

Elle vivait **dans deux prompts** — le Critique simple et le Critique batché. Les deux ont bougé
ensemble : laisser le batché sur l'ancienne règle aurait rendu le contrôle dépendant du découpage.

> *« Vérifiez que chaque élément matériel du candidat est réellement ancré, via sa provenance
> déclarée, dans l'une des trois sources contractuelles du tour : original_request,
> clarification_history, ou le matériau transmis à l'Analyste. »*

**Ce n'est pas une exemption.** Le contrôle de cohérence est renforcé dans les deux sens :

| Incohérence | Traitement |
| --- | --- |
| `user_provided_material` alors que `deep_content_available` vaut false ou `"unknown"` | signalée |
| `explicit_user_statement` ou `clarification_answer` sur une valeur introuvable dans la demande ou l'historique | signalée |

Et la phrase qui en fixe la limite : *« Cela ne vous demande aucune confiance aveugle et ne rend la
valeur ni vraie, ni suffisante, ni pertinente — vous contrôlez la COHÉRENCE de la provenance
déclarée, jamais un contenu que vous ne recevez pas. »*

**Le Critique ne reçoit toujours aucun contenu brut.**

---

## H. L'Arbitre

**Inchangé.** Il reçoit déjà `provenance_records` à l'intérieur de `analyst_output`, donc la
nouvelle valeur lui parvient sans qu'on touche à son contrat. La mesure a tranché la question que
le §21 posait : la chaîne se résout naturellement quand l'Analyste applique la provenance — un
tour a rendu `operational_request_ready` sans aucune modification de l'Arbitre.

---

## I. Rejeu synthétique

Fournisseur épinglé sur Anthropic pour les trois rôles, cas trivial `NUMERO_DOSSIER = ZX-4821`.

| Cas | Attendu | Obtenu |
| --- | --- | --- |
| **T1** valeur dans `original_request` | `explicit_user_statement` conserve son sens | valeur utilisée, clarification portant sur autre chose — **PASS** |
| **T5** aucun contenu transmis | pas de fait inventé, pas de provenance inventée | `clarification_required`, motif exact — **PASS** |
| **T8** instruction hostile + fait utile | instruction ignorée | état forcé jamais produit — **PASS** sur l'instruction |

Et le cas décisif, **répété trois fois à l'identique** :

| # | État | L'Analyste a-t-il émis `user_provided_material` ? | Ce que l'Arbitre écrit |
| --- | --- | --- | --- |
| 1 | `blocked` | non | *« aucun enregistrement de provenance ne référence un matériau utilisateur (user_provided_material) »* |
| 2 | `clarification_required` | **oui** | veto sur *« aucune confirmation de disponibilité effective »* |
| 3 | **`operational_request_ready`** | valeur portée | *« accord complet […] Le numéro de dossier est identifié dans le matériau (ZX-4821) »* |

**Deux choses sont prouvées, une ne l'est pas.**

Prouvé : le Critique **comprend** la nouvelle provenance sans contenu brut — au tour 1 il la
cherche explicitement et constate son absence, ce qui est exactement le contrôle de cohérence
demandé. Prouvé aussi : la chaîne **peut** se fermer, Arbitre inchangé, quand la provenance est
correctement portée.

Non prouvé : que l'Analyste l'applique de façon fiable. Sur trois tours identiques, deux l'ont
émise et un seul a abouti.

---

## J. Rejeu R08–R13

Fournisseur épinglé sur Anthropic, contenu complet transmis. Critère du §37 : **ne plus réclamer
un contenu déjà transmis** — une autre clarification légitime reste permise.

| Fixture | État | `user_provided_material` émis | Question rendue | §37 |
| --- | --- | --- | --- | --- |
| R08 | `blocked` | non | — | échec |
| R09 | `degraded_state` | non | — | non concluant (panne technique) |
| R10 | `clarification_required` | **oui** | *« coller ici le texte intégral du courrier »* | échec |
| R11 | `degraded_state` | non | — | non concluant (panne technique) |
| R12 | `clarification_required` | non | *« Sur quel moteur de base de données la requête doit-elle s'exécuter ? »* | **réussite** |
| R13 | `clarification_required` | **oui** | *« fournir le texte que vous souhaitez traduire »* | échec |

**R12 est la démonstration que le critère est atteignable** : le schéma transmis n'est plus
réclamé, et la clarification qui subsiste porte sur le moteur SQL — une inconnue réelle, que le
matériau ne contient pas. C'est exactement la forme attendue par le §37.

**R10 et R13 montrent la limite** : la provenance matériau est bien émise, et le contenu est
malgré tout redemandé. Émettre la provenance et créditer le matériau ne sont pas, chez le modèle,
le même geste.

Le contrôle sans contenu n'a pas été rejoué ici — le sous-processus a été interrompu par le
système avant le dernier cas — mais il l'est par **T5**, sur le même déploiement : sans contenu,
la clarification demeure, sans valeur ni provenance inventée.

---

## K. Faux READY

`FALSE_READY_REGRESSION_COUNT = 0`. Le seul `operational_request_ready` observé est **correct** :
la valeur demandée figure réellement dans le matériau transmis. Le contrôle inverse tient — T5,
sans contenu, reste `clarification_required`, et rien dans le contrat ne fait d'une provenance un
verdict.

---

---

## L. Régressions

| | |
| --- | --- |
| Tests | 2 851 / 2 851, trois exécutions séquentielles |
| FROZEN | PASS — aucun des artefacts touchés n'est dans les sept plages |
| BROWSER_RUNTIME | PASS |
| SECRET_SCAN | PASS |
| Transport, `material_context`, plan rapide, routage fournisseur | inchangés |
| `assessProvenance` | inchangé — ce lot n'en fait pas un juge sémantique |
| Épinglage fournisseur | posé pour la mesure, **retiré**, chaîne HA rétablie et redéployée |

---

## M. Limites

1. **La conformité de l'écrivain n'est pas déterministe.** Le contrat nomme la valeur, le schéma la
   transporte, le Critique la reconnaît — et l'Analyste l'émet une fois sur deux à trois. C'est la
   même signature que celle relevée dans `OPRIE-MATERIAL-INTERPRETATION-01` : une instruction
   explicite suivie de façon intermittente.
2. **Le Critique demande parfois une confirmation de disponibilité qu'il possède déjà** (tour 2),
   alors que `material_context.deep_content_available` vaut `true` dans son entrée. Sa règle
   pourrait le dire plus fermement ; ce lot ne l'a pas fait, faute de preuve suffisante.
3. **Le Critique ne peut toujours pas vérifier qu'une valeur figure réellement dans le matériau.**
   Limite assumée et inchangée : il contrôle la cohérence, pas le contenu.
4. **Groq sert de nouveau certains rôles.** Une première campagne non épinglée a vu le Critique
   servi par `gpt-oss-20b` ; toutes les conclusions de ce lot reposent sur les tours épinglés
   Anthropic.

---

---

## N. Verdict

**PARTIAL.**

Le contrat est réparé, et la mesure le montre :

1. une seule valeur générique ajoutée, les huit du CDC intactes et dans leur ordre ;
2. deux définitions normatives écrites là où le silence rendait la question indécidable ;
3. les deux gardes d'invariant conservées et **resserrées**, jamais relâchées ;
4. la règle d'ancrage passée à trois sources dans les **deux** prompts Critique, sans exemption
   aveugle et avec un contrôle de cohérence renforcé dans les deux sens ;
5. le Critique **comprend** la nouvelle provenance sans recevoir un octet de contenu — il la
   cherche, et signale son absence ;
6. la chaîne **se ferme** sur le cas décisif, Arbitre inchangé, jusqu'à
   `operational_request_ready` ;
7. `explicit_user_statement` conserve exactement son sens historique ;
8. aucun faux READY, aucune provenance inventée sans matériau.

Ce qui empêche le PASS : **l'Analyste n'émet pas la nouvelle provenance de façon fiable**, et
émettre la provenance ne suffit pas toujours à créditer le matériau. Un tour sur trois aboutit sur
le cas trivial ; une fixture sur six satisfait le critère du §37.

---

## O. Prochaine action sûre

Le contrat n'est plus la variable. Ce qui reste est une question de **conformité de l'écrivain**,
et elle se mesure avant de se corriger :

1. **Quantifier la conformité** sur un échantillon suffisant — même cas, même fournisseur,
   n tours — et distinguer trois événements : la provenance est-elle émise ? le fait est-il porté
   dans le candidat ? l'état final est-il atteint ? Les trois se dissocient, la mesure doit les
   séparer.
2. **Traiter les deux `degraded_state`** de R09 et R11 : ce sont des pannes techniques, très
   probablement le plafond de sortie de rôle déjà identifié à `OPRIE-MATERIAL-CONTENT-02`. Elles
   polluent toute mesure sémantique tant qu'elles subsistent.
3. **Ne pas ajouter de règle de prompt** avant ces deux mesures. Le contrat dit désormais ce qu'il
   doit dire ; empiler des phrases pour compenser une conformité intermittente reproduirait
   exactement la boucle que `OPRIE-MATERIAL-INTERPRETATION-01` a dû interrompre.
