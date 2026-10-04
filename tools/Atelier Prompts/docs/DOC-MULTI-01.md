# DOC-MULTI-01 — Lecture documentaire multimodale : un format, trois chemins

**Verdict** : `LECTURE_DOCUMENTAIRE_MULTIMODALE = GELÉE` · `FROZEN = INTACT (aucune réouverture)` · `PDF-SAFARI-01 = NON RÉGRESSÉ`
**Mesures** : `evaluation/doc-multi-01/smokes-navigateur.json` — navigateur réel, page réelle, documents réels
**Tests** : `tests/document-multimodal-docmulti01.test.mjs` — 25 cas

---

## A. Le défaut de produit

La lecture locale fonctionnait, et c'était tout ce qu'il y avait. Sur la charte graphique de
référence, Atelier affichait « Texte extrait » après 7 085 caractères — et traitait cela comme un
document exploité. Or une charte graphique porte des logos, une palette, des typographies, une
hiérarchie, des tableaux d'usage : du texte extrait n'est pas un document compris.

## B. La mesure qui a imposé la prudence, et qui a réfuté la règle simple

Avant d'écrire une ligne, sept PDF réels mesurés dans le navigateur, avec le PDF.js du produit :

| document | pages | car/page | images | img/page |
| --- | --- | --- | --- | --- |
| **Charte IRC (visuelle)** | 7 | 954 | **2** | 0,3 |
| **Charte C-Concept (visuelle)** | 8 | 893 | **16** | 2 |
| Rapport psychologue | 11 | 1 894 | 0 | 0 |
| Restitution YSQ-L3 | 22 | 1 841 | **3** | 0,1 |
| BCC document de travail | 3 | 1 283 | 0 | 0 |
| Partition Shallow | 4 | 485 | **12** | 3 |
| CDC KP CANON | 11 | **665** | 0 | 0 |

**Aucun seuil ne sépare « visuel » de « textuel ».** La charte de référence ne porte que 2 images
sur 7 pages — autant qu'un rapport purement textuel — parce que sa substance visuelle est
**vectorielle**, pas raster. Et la densité ne sépare pas davantage : une spécification purement
textuelle mesure 665 caractères par page contre 954 pour la charte.

Un seuil sur l'une ou l'autre de ces grandeurs aurait donc classé à tort — exactement le faux
automatisme à éviter.

## C. La règle retenue : dire ce qui est établi, proposer le reste

`classifyReading()` ne rend que trois verdicts, et **distingue le fait de l'observation** :

| verdict | certitude | sur quel fait | effet |
| --- | --- | --- | --- |
| `visual_required` | **établi** | le fichier est une image ; ou la lecture locale n'a rien produit ; ou moins de 80 caractères par page ; ou l'OCR a dû intervenir | la lecture visuelle est nécessaire, et c'est dit |
| `visual_possible` | **observé** | du texte est sorti **et** des images sont présentes à côté (ou leur présence n'a pas pu être établie) | **proposé** à la personne, jamais joué seul |
| `local_sufficient` | établi | du texte est sorti et aucun visuel n'a été détecté | on s'arrête là, aucun appel |

Le comptage d'images est un fait, relevé dans la boucle de pages **déjà ouverte** par le lecteur, sur
la liste d'opérateurs que PDF.js produit de toute façon : 110 à 203 ms par document, aucune seconde
passe. Un chargeur qui n'expose pas `getOperatorList` laisse `images` à `null` — et « non établi »
n'est pas « zéro ».

## D. Un seul format, un seul validateur, trois transports

`core/documents/reading.js` possède le format canonique, le schéma JSON, le prompt, le validateur et
le rendu en matériau. Les trois chemins le remplissent et ne divergent jamais :

| chemin | `method` | `provider` |
| --- | --- | --- |
| lecture locale | `local` | `null` |
| fournisseur actif | `provider_multimodal` | `anthropic` \| `openai` |
| IA de la personne, par copier-coller | `external_llm_manual` | `null` |

Le validateur refuse : un champ non prévu, une lecture qui nomme un autre document, une méthode qui
usurpe un fournisseur, un type faux, un dépassement de limite. Il tolère la prose autour du JSON —
un LLM externe en met souvent — parce que refuser pour un détail de mise en forme renverrait la
personne faire un aller-retour inutile. **Aucun motif de refus ne recopie le contenu reçu.**

## E. Le texte local est la couche primaire

Pour un document partiellement extractible, le texte local **reste** et la lecture visuelle s'y
**ajoute**. Le prompt du fournisseur transmet le texte déjà extrait et lui interdit explicitement de
le paraphraser : « reprenez-le en le corrigeant seulement là où le document montre qu'il est faux, et
consacrez l'essentiel de votre lecture à ce que ce texte ne porte pas ». Le texte exact local est
plus fidèle qu'une reformulation.

## F. Les transports, mesurés

| fournisseur | forme de la pièce |
| --- | --- |
| Anthropic | blocs `document` / `image`, `source: {type:'base64', media_type, data}`, **avant** le bloc de texte |
| OpenAI | parties `input_file` (data URL) / `input_image` sur `/v1/responses`, **avant** `input_text` |

La **décision** — quels types sont transmissibles, et par quel canal — est commune et vit hors des
deux transports. Un format que ni l'un ni l'autre ne lit (un DOCX, un ZIP) est refusé **avant** tout
appel, avec une phrase qui dit quoi faire : l'envoyer produirait une erreur plus tardive et moins
claire, et un DOCX dont la lecture locale a échoué ne se répare pas en l'envoyant à une API.

## G. Smokes réels, sur la page réelle

Navigateur réel, page servie, documents de la personne. Les requêtes que la page construit pour
`api.openai.com` sont relayées **telles quelles** vers le proxy de mesure qui détient sa clé : le
corps de requête, la lecture, la validation et l'intégration sont donc réels ; seule l'injection de
la clé passe par le relais, faute de clé OpenAI de plateforme disponible localement.

### G.1 Dépôt local des deux documents

| document | local | verdict |
| --- | --- | --- |
| `Charte_graphique_…_v6.pdf` | 7 085 car., 7 pages, 2 images | `visual_possible` / **observé** |
| `IRC_BCC_Synthese_….docx` | 14 991 car. | `local_sufficient` / établi — **aucun appel** |

### G.2 Lecture multimodale par le fournisseur actif (OpenAI)

`provider_multimodal` / `openai`, 36,5 s · **40 éléments visuels dont 27 portent une valeur écrite
dans le document** · 25 entrées de structure · 3 tableaux · état affiché « Document prêt — enrichi
par OpenAI. » · **texte local conservé** · le matériau nomme la dérivation et dit que le document
reste la source · le DOCX est intact · matériau total 40 268 caractères.

Échantillon : `palette = #086582, #68A8B0, #8FAFB1, #848484, #EEEEEE, #F5F2EB, #FFFFFF` ·
`heading_style = Pompiere ; Montserrat`. Les valeurs ne sont remplies **que** là où le code est écrit
dans le document ; une mise en page observée porte `value: null`.

### G.3 Plan B manuel, sans aucune clé — **0 appel API sur tout le parcours**

| étape | résultat |
| --- | --- |
| 1. dépôt sans clé | gestes proposés : « Utiliser mon IA manuellement », « Retirer » — et rien d'autre |
| 2. clic sur le geste | panneau ouvert : 5 étapes, prompt de 2 875 car. qui nomme le document et exige « uniquement le JSON », zone de collage |
| 3. prompt employé **hors d'Atelier** avec le PDF joint | 200, 43,6 s, 22 235 octets rendus |
| 4. collage, validation, intégration | `external_llm_manual` / `provider: null` · **40 éléments visuels dont 31 avec valeur écrite** · 3 tableaux · texte local conservé · document délivré |
| 5. JSON cassé recollé | **refusé**, 3 motifs nommés, et la lecture acquise est préservée |

## G.4 Deux défauts trouvés par les smokes, et non par le raisonnement

Les deux n'existaient que sur le chemin réel, et aucun test synthétique ne les avait vus.

**1. Les gestes ne suivaient pas la clé.** Les rangées n'étaient rendues qu'au changement de
documents. Quelqu'un qui dépose ses pièces **puis** colle sa clé — l'ordre naturel — ne voyait
jamais apparaître « Lecture visuelle » : le geste existait, l'affichage datait d'avant la clé. Un
rendu de plus, déclenché seulement quand la disponibilité a réellement changé et qu'un document
attend quelque chose.

**2. Le tour de correction était refusé par l'API.** Sur une non-conformité, le transport rejouait
l'appel d'outil du modèle — et seulement lui. L'API l'a nommé elle-même :

```
Item 'fc_…' of type 'function_call' was provided without its required 'reasoning' item: 'rs_…'
```

Sur un modèle de raisonnement, le bloc de raisonnement et l'appel d'outil forment un tout. La sortie
du modèle est donc rejouée **en entier**. Vérifié contre l'API réelle en abîmant volontairement un
seul champ (`document.source`) de la **vraie** réponse, ses identifiants authentiques conservés :

| appel | entrée envoyée | statut |
| --- | --- | --- |
| 1 | `[user]` | 200, réponse abîmée → refusée par le validateur |
| 2 | `[user, reasoning, function_call, function_call_output]` | **200** → « Document prêt — enrichi par OpenAI. », 139 codes couleur écrits |

Ce second appel était exactement celui qui échouait avant le correctif. Il corrige aussi le chemin
`/decision` de PROVIDER-OPENAI-01, où la correction n'avait jamais été jouée en réel.

## H. Ce que ce lot ne fait pas

- **Pas de smoke réel Anthropic.** Aucune clé API Anthropic n'est disponible dans cet
  environnement ; la seule présente est la session OAuth de Claude Code, qui n'est pas la clé
  Atelier de la personne et n'a pas à être employée pour le produit. Le chemin Anthropic est couvert
  par les tests (forme exacte de la pièce, isolement du fournisseur, sortie structurée) mais
  **n'a pas été joué contre l'API réelle**.
- **Pas de Files API, pas de stockage.** La pièce part en base64 dans la requête, et l'original
  n'existe qu'en mémoire de session — il n'entre ni dans la photographie de session, ni dans un
  export, ni dans un journal.
- **Aucune clé partagée.** Chaque personne emploie la sienne, celle du fournisseur actif, et jamais
  celle de l'autre : un test prend la preuve **sur le réseau**, requête par requête.

## I. Périmètre

| touché | intact |
| --- | --- |
| `core/documents/reading.js` (nouveau) | les sept plages `FROZEN` — aucune réouverture |
| `core/documents/reader.js` (+ comptage d'images, additif) | le correctif PDF-SAFARI-01, à la ligne près |
| l'HTML : transports, façade, bloc document | Fast, Deep, OPRIE, rôles, Workers, CONTINUITE-05 |
| | le multi-provider, les modes Rapide / Architecte, la compilation |

**GLOBAL** : 3 802 tests, 0 échec. **FROZEN** : vert, sept plages inchangées.
