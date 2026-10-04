# PROVIDER-OPENAI-01 — OpenAI dans le pipeline API automatique

**Verdict** : `PROVIDER_OPENAI_01 = LIVRÉ` · `FROZEN = IDENTIQUE` · `ANTHROPIC = INCHANGÉ`
**Artefact** : `atelier-prompts-v11.5-lot10g-decision-provider.html`
**Mesures réelles** : `evaluation/provider-openai-01/smokes-reels.json` (appels à l'API OpenAI, 4 octobre 2026)
**Tests du lot** : `tests/provider-openai-pipeline-provideropenai01.test.mjs` — 29 assertions de cas

---

## A. Ce que le lot fait, et ce qu'il ne touche pas

Le pipeline API automatique du produit — l'Architecte, le compilateur, le banc d'essai, le module
Qualité, l'envoi direct — n'avait **qu'un fournisseur**. Le registre `FOURNISSEURS_API` existait
depuis le lot 4 précisément pour qu'un second puisse entrer sans que rien d'autre bouge, et son
commentaire l'annonçait « en principe ». Ce lot le vérifie en pratique.

| Ce qui change | Ce qui ne change pas |
| --- | --- |
| Une entrée `openai` dans `FOURNISSEURS_API` (transport, catalogue, tarification, test de connexion) | L'Architecte, le compilateur, le banc d'essai, le module Qualité, l'envoi direct — **aucune ligne** |
| Le registre sort de la zone de garde d'Anthropic : il porte deux fournisseurs, il n'appartient plus à l'un | La façade `appelFournisseur()` — signature et comportement identiques |
| Deux textes d'interface qui nommaient un fournisseur en dur (gabarit de clé, lien de console) se lisent sur le registre | Les sept plages `FROZEN` — `npm run guard` rend `OK`, empreintes inchangées |
| Une nouvelle zone de garde `GARDE-ADAPTATEUR-OPENAI` confine `api.openai.com` | Le chemin Anthropic : même URL, mêmes trois en-têtes, même corps, même schéma d'outil |

Anthropic **reste le fournisseur par défaut** : `peuplerFournisseurs()` rend les options dans
l'ordre des clés du registre, et `anthropic` y est première. Pour qui utilisait le produit avant ce
lot et ne touche pas au sélecteur, rien ne change — y compris le gabarit de clé et le lien de
console, qui reprennent leur valeur d'origine dès qu'Anthropic est réactif.

---

## B. Les quatre décisions, et la mesure qui impose chacune

Aucun point de terminaison, aucun mécanisme et aucune valeur n'a été posé par analogie avec le
transport Anthropic. Chaque choix vient d'un **refus réel de l'API**, obtenu avant d'écrire le code.

### B.1 Pourquoi `/v1/responses`, et pas `/v1/chat/completions`

| Requête réelle | Réponse |
| --- | --- |
| Outil de fonction + schéma projeté, sur `/v1/chat/completions` | **400** `Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.` |

Le pipeline automatique demande `effort:'high'` (`archApiCoeur`, module Qualité). Sur Chat
Completions il faudrait donc **renoncer au raisonnement** pour obtenir une sortie structurée.
`/v1/responses` accepte les deux ensemble — mesuré 200. C'est aussi le point de terminaison que le
harnais de mesure du dépôt avait déjà retenu au lot 10G3B2.

### B.2 Pourquoi un outil de fonction NON strict, et pas `response_format: json_schema`

| Requête réelle | Réponse |
| --- | --- |
| `response_format: {json_schema, strict:true}` avec le schéma canonique | **400** `Invalid schema for response_format 'sortie_structuree': In context=(), 'allOf' is not permitted.` |

C'est **exactement l'anomalie 5 du lot 10G3B2** — celle qui avait contraint ce dépôt à faire passer
l'Architecte par le copier-coller faute de pouvoir l'appeler. Le mode strict d'OpenAI est hors
d'atteinte pour ce schéma, pour la même raison de fond qu'une grammaire compilée l'était côté
Anthropic (`SCHEMA-ANTHROPIC-02`).

L'architecture retenue est donc celle, déjà éprouvée ici, de `SCHEMA-ANTHROPIC-03` : un outil
personnalisé **non strict** dont les paramètres sont le schéma canonique, appel forcé par
`tool_choice`. Mesuré sur deux demandes distinctes, avec le prompt système et le schéma réels du
produit :

| Demande | HTTP | Statut | Latence | Entrée / sortie / raisonnement | Arguments | Violations du canonique |
| --- | --- | --- | --- | --- | --- | --- |
| Note de synthèse, 2 pages, comité de direction | 200 | `completed` | 35,9 s | 6 974 / 3 297 / 446 | 13 000 o | **0** |
| Questionnaire de 20 items, score par dimension | 200 | `completed` | 69,1 s | 6 973 / 6 292 / 2 352 | 17 818 o | **0** |

Zéro violation **au premier appel**, sans aucune requête de correction. La réponse du premier cas
est rejouée telle quelle par le test du lot : elle traverse le transport, passe
`violationsContreSchema` contre le canonique complet, et porte ses huit blocs obligatoires.

### B.3 Pourquoi la projection du schéma est minimale, et pourquoi elle existe quand même

| Requête réelle | Réponse |
| --- | --- |
| Outil de fonction, schéma canonique **brut** (racine avec `allOf`, `$schema`, `$id`) | **400** `Invalid schema for function 'sortie_structuree': schema must have type 'object' and not have 'oneOf'/'anyOf'/'allOf'/'enum'/'const'/'not' at the top level.` |

La liste des mots-clés refusés à la racine n'est pas devinée : **l'API l'énonce elle-même**.
`schemaPourOpenAI()` retire donc les métadonnées sans effet (`$schema`, `$id`, `$comment`) et ces
six mots-clés **à la racine seulement**, en faisant remonter la description métier des combinateurs
pour que le modèle la lise encore. 11 539 octets de canonique deviennent 11 023 octets transmis.

Elle ne fait rien d'autre, et notamment **pas** l'adaptation des enum à type union de `BETA-04` :
cette réécriture existe côté Anthropic parce qu'une grammaire compilée l'impose, un outil non
strict n'en compile aucune, et la mesure montre que le schéma passe sans elle. La transposer serait
une divergence gratuite entre le schéma transmis et le canonique.

**Le canonique reste la vérité** : la projection ne mute jamais son argument, et tout ce qu'elle
retire est revérifié après coup, sur la valeur réellement renvoyée, par `violationsContreSchema()`.

### B.4 Pourquoi exactement deux en-têtes, et jamais un troisième

Préflight CORS réel, sans clé, depuis l'origine de production :

| Hôte | HTTP | `allow-origin` | `allow-headers` |
| --- | --- | --- | --- |
| `api.openai.com` | 200 | `*` | `authorization,content-type` |
| `api.anthropic.com` (référence) | 200 | `*` | `x-api-key,content-type,anthropic-version,anthropic-dangerous-direct-browser-access` |

Anthropic **exige** un en-tête d'autorisation d'appel direct depuis le navigateur ; OpenAI n'en
demande aucun, et n'en autorise aucun autre. Ajouter l'équivalent par symétrie ferait **échouer le
préflight** : l'appel direct depuis le navigateur n'est possible qu'avec ces deux en-têtes exactement.

---

## C. Le mécanisme de correction, mesuré lui aussi

Une sortie non conforme donne **une** requête de correction, bornée, qui renvoie au modèle la liste
structurée des violations — chemin de donnée et attente du schéma, **jamais la valeur reçue** — par
le canal `function_call_output`, rattachée au `call_id` de l'appel qu'elle corrige. C'est le même
`messageCorrectionSchema()` que le chemin Anthropic : un seul mécanisme, deux transports.

| Tour | HTTP | Arguments rendus |
| --- | --- | --- |
| Premier appel | 200 | `{"titre":"Note sur l'organisation du télétravail","quantites":{"min":2,"max":3}}` |
| Après transmission de deux violations (`minLength 12`, `forme interdite par not`) | 200 | `{"titre":"Organisation hebdomadaire du télétravail","quantites":{"min":1,"max":3}}` |

L'objet revient **complet et corrigé**, pas seulement les champs en défaut. Une seconde
non-conformité est rejetée (`sortie_invalide`) : jamais rattrapée localement, jamais rejouée une
troisième fois.

---

## D. Le catalogue : un seul modèle, et c'est un choix

`gpt-5.6-sol`, relevé sur sa fiche officielle le 4 octobre 2026 : contexte **1 050 000**, sortie
maximale **128 000**, **4 $** par million de jetons d'entrée et **20 $** en sortie.

- **Un seul modèle.** C'est le seul identifiant OpenAI que ce dépôt ait sourcé (lot 10G3B2, puis
  l'adaptateur Decision du Worker) et le seul éprouvé en appel réel contre le schéma canonique. La
  page tarifaire officielle ne donne, pour les modèles voisins, qu'un prix d'**entrée** de
  comparaison, sans prix de sortie : les inscrire exigerait d'inventer la moitié de leur tarif.
- **Pas de tarif de lancement.** Le mécanisme `introJusquau` suppose un tarif normal connu vers
  lequel revenir ; OpenAI annonce seulement que sa promotion tient « au moins jusqu'au
  21 novembre 2026 ». Déduire l'après-promotion en inversant des pourcentages arrondis serait
  inventer un prix. La note du modèle le dit à la place.
- **Pas de champ `zdr` ni `retention`.** « Covered Models » et l'accord Zero Data Retention sont des
  notions du contrat Anthropic. Les transposer afficherait, dans un avertissement de
  confidentialité, une affirmation que rien ne fonde. En leur absence, l'encart ne s'affiche pas et
  la phrase du mode « données sensibles » se contente de nommer le fournisseur — ce qui est exact.

---

## E. Les deux capacités qu'OpenAI n'a pas, et qui sont dites plutôt que simulées

| Capacité | Statut | Pourquoi |
| --- | --- | --- |
| `listerModeles` | **absente** | `GET /v1/models` existe mais rend tout le catalogue du compte — plongements, transcription, images, modèles hors dialogue. Remplacer la table par cette liste demanderait un filtre que rien ne fonde, et peuplerait le sélecteur de modèles incapables de tenir le contrat. |
| `compterTokens` | **absente** | Il n'existe pas d'équivalent de `/v1/messages/count_tokens` chez ce fournisseur. |
| `prefill_assistant` | **false** | Pas de préremplissage du tour assistant sur `/v1/responses`. La façade retire le paramètre, et aucun tour assistant n'est fabriqué à la place. |

Dans les trois cas l'interface **nomme le fournisseur et dit ce qu'elle ne peut pas faire**, au lieu
de deviner ou d'estimer en silence. C'est le comportement que le registre prévoyait déjà pour une
capacité optionnelle absente.

---

## F. Non-régression

- `npm run guard` : `OK`, les sept empreintes `FROZEN` sont identiques — ni `ARCH_SCHEMA`, ni
  `ARCH_SYSTEM`, ni les trois moteurs, ni `FORMATS`, ni `VERROUS` n'ont bougé.
- Suite complète : **3 762 tests, 0 échec, 1 ignoré**.
- Les 15 sceaux d'empreinte de l'HTML canonique sont réancrés, chacun avec la justification du
  changement, selon la convention du dépôt.
- `T-HTMLFINAL02-15` : deux hôtes distants de plus — `api.openai.com` (appel) et
  `platform.openai.com` (obtention de clé) — de la même nature que `api.anthropic.com` et
  `console.anthropic.com`. **Aucune ressource statique distante n'est ajoutée** : les quatre
  assertions qui interdisent script, feuille de style, police et image distantes restent vides.
- `T-PROVOPENAI01-26` vérifie que chaque fournisseur reste dans sa zone de garde, que les deux
  zones ne se mélangent pas, et que le registre n'appartient plus à aucune des deux.
- `T-PROVOPENAI01-27` rejoue un appel Anthropic complet et vérifie l'URL, les trois en-têtes et le
  corps exact : le premier fournisseur part comme avant ce lot.

---

## G. Ce que ce lot ne dit pas

**La latence du pipeline profond sur OpenAI n'est pas une promesse.** Les deux appels réels mesurés
ici rendent 35,9 s et 69,1 s pour une analyse Architecte complète, à effort `high`. Ce sont deux
observations, pas une distribution : elles suffisent à établir que le chemin fonctionne et ce qu'il
coûte en jetons, pas à opposer une latence utilisateur. `PERF-REAL-01` reste ouverte, et ce lot ne
la referme pas.

**Le relais de mesure n'est pas le chemin de production.** Les appels réels de ce lot sont passés
par le proxy de mesure du dépôt, qui détient la clé OpenAI ; aucune clé n'a été lue, affichée ni
écrite. En production, le navigateur appelle `api.openai.com` directement avec la clé de la
personne — ce que le préflight CORS mesuré en B.4 établit comme possible, et ce que le corps de
requête vérifié par les tests reproduit à l'identique.
