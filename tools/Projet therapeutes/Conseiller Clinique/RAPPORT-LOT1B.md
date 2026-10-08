# RAPPORT — LOT 1b, « Rédiger la narration » (Phase A)

Branche `lot1b-narration-ia`. **Rien n'est fusionné dans `main`, rien n'est déployé.**
Empreinte du schéma d'outil : **`b1b0155cb8eba26c`, 6679 o** — identique avant et après.

---

## 0. Trois choses à dire avant le reste

### a) Ce lot ne touche PAS au Worker — mesuré, pas supposé

Le brief demandait une route nouvelle. **Elle n'est pas nécessaire, et l'ajouter aurait un coût
réel** : tout fichier de `Worker/**` arrivant sur `main` déclenche `Deploy Worker`.

Ce qui existe déjà, lu dans `Worker/index.js` : la génération structurée (« appel 2 ») poste au
**proxy racine** du Worker (`handleAnthropicProxy`), et cette route est protégée par la garde
générique :

| protection | valeur mesurée |
|---|---|
| origine autorisée | `https://c-concept-dev.github.io`, unique et figée, jamais `*` |
| clé d'accès | `X-API-Key` obligatoire, **fail-closed** (401 si la clé serveur manque) |
| débit | 60 requêtes / 60 s / IP, fenêtre glissante sur KV |
| route publique ? | **non** — la racine n'est pas dans `ADOC_PUBLIC_ROUTES` |
| journaux | identifiant de requête et statut seulement : ni clé, ni prompt, ni message |

Une route dédiée n'ajouterait rien de tout cela. Le principe **0E** de la gouvernance (« usage
réel avant nouvelle construction ») tranche. `verify-worker-garde-narration` 6/6 l'établit en
exécutant la garde hors ligne, et son dernier contrôle vérifie par `git diff` qu'**aucun fichier
de `Worker/` n'est modifié par ce lot**.

**Conséquence : la Phase B n'a pas de déploiement de Worker.** Si tu veux quand même une route
dédiée (pour un débit propre à la rédaction, ou pour garder le prompt côté serveur), c'est un
chantier distinct — décrit au §7.

### b) Deux décisions du CDC que je n'ai pas pu lire

Le brief renvoie aux décisions « Forme du commentaire à enregistrer » et « Origine du texte
d'écran ». **Aucune des deux n'existe dans les CDC que je peux atteindre** : le fichier
`CDC-v2-atelier-de-montage-3.md` n'est plus sur le disque, et ni `-2.md` (5 octobre, 20 h 31) ni
`Chantiers/CDC-v2-atelier-de-montage.md` ne portent ces intitulés.

J'ai appliqué les deux lignes les plus proches du tableau des décisions ouvertes de `-2.md` :
« **Un commentaire égale une étape** » (retenue : oui) et « **Texte à lire dans la bande rythmo :
texte de la narration IA ou texte importé** ». Si les décisions manquantes disent autre chose,
dis-le-moi ou renvoie-moi le `-3.md` : ce qui en dépend ici est la forme stockée
(`{stepId, text}`, texte brut avec marques de pause) et rien d'autre.

### c) Un défaut du lot 1a corrigé au passage

`adocNarrationCount` comptait `[pause]` comme un mot — alors que **R8** dit qu'une marque de pause
« n'est pas lue ». La durée annoncée sous le champ était donc fausse dès qu'une pause était
écrite. Corrigé à la source, et le module de rédaction **appelle** ce compteur au lieu d'en avoir
un second — vérifié par espionnage, pas par égalité des résultats : deux implémentations qui
coïncident aujourd'hui divergent demain (régression #8).

---

## 1. Le prompt système, tel qu'il part

Rendu depuis le navigateur, adresse « vous » — 56 lignes, 3 023 caractères. Avec l'option « tu »,
seule la ligne « Adressez-vous au spectateur… » change.

```
Vous êtes auteur de scripts de doublage. Vous écrivez le commentaire que dira, à voix
haute, un acteur de doublage, pour une vidéo de psychoéducation sur le couple.

CE TEXTE SERA DIT, PAS LU.
- Des phrases courtes. Une idée par phrase.
- Des mots simples, ceux de la conversation.
- Du rythme : alternez les phrases brèves et les phrases un peu plus longues.
- Aucune parenthèse, aucun tiret d'incise, aucune énumération à puces, aucune tournure
  qui ne se dit pas (« cf. », « c.-à-d. », « etc. », « voir ci-dessous »).
- Aucun Markdown : ni astérisque, ni dièse, ni tiret de liste, ni guillemet de code.
- Écrivez les nombres en toutes lettres quand ils se disent ainsi (« un couple sur trois »).

CE QUE LE COMMENTAIRE FAIT.
Il AJOUTE à la diapositive, il l'ILLUSTRE et il la COMMENTE. Il ne la lit pas et ne la
répète pas. Le spectateur voit le texte à l'écran : le redire est une perte de temps.
Apportez donc : un exemple concret, une image, une nuance, une objection fréquente, ou
une question posée au spectateur. Reliez l'étape à la précédente quand cela aide.

CE QUI EST INTERDIT.
- Aucune statistique, aucun pourcentage, aucune étude, aucune source, aucun nom d'auteur
  qui ne figure pas déjà dans le document fourni. Si le document n'en donne pas, n'en
  inventez aucun : parlez sans chiffre.
- Toute affirmation factuelle doit venir du document fourni.
- Les exemples sont annoncés comme des exemples : « Imaginez un couple où… »,
  « Prenons le cas de… ». Jamais un cas présenté comme réel.
- Aucun diagnostic, aucun conseil adressé à une personne en particulier, aucune promesse
  de résultat thérapeutique.
- Aucun jargon. Si un terme technique est indispensable, expliquez-le en une phrase.

LE TON.
Chaleureux, posé, jamais culpabilisant. Vous ne jugez personne. Vous ne vous adressez pas
à « ceux qui ont un problème », mais à quelqu'un qui écoute et se reconnaîtra peut-être.
Adressez-vous au spectateur en disant « vous ». Jamais « tu ».

CE QUE CE DOCUMENT EST.
Une présentation clinique dont la relecture humaine est requise. Votre commentaire est un
BROUILLON que le thérapeute relira et corrigera. Ce n'est jamais une validation clinique,
et vous n'avez pas à faire comme si c'en était une.

LES PAUSES.
Vous pouvez marquer un silence avec [pause] pour une respiration courte, ou [pause 2 s]
pour une durée précise. Ces marques ne sont pas prononcées et ne comptent pas dans les
mots. Servez-vous-en pour laisser une question respirer, jamais plus d'une fois ou deux
par étape.

LA LONGUEUR.
Chaque étape porte une cible en mots. Respectez-la à 20 % près
(au minimum 5 mots d'écart tolérés). C'est une contrainte de montage :
le commentaire doit tenir dans le temps où l'image est à l'écran.

VOTRE RÉPONSE.
Uniquement un tableau JSON, rien avant, rien après, sans bloc de code :
[{"stepId": "...", "text": "..."}]
Exactement un élément par étape demandée, dans le même ordre, avec les identifiants
exacts. Aucun identifiant inventé, aucun oublié. Le champ "text" est du texte brut,
en français.
```

**Ce que le message utilisateur transporte**, et rien d'autre — titre, public, durée visée, puis
par étape : l'identifiant, la cible en mots, ce qui est déjà à l'écran, et le contenu de l'étape.
Exemple réel sur la présentation d'essai (46 lignes, 2 350 caractères) :

```
Titre de la présentation : Quand le silence s’installe
Public : clinicien
Durée visée pour l'ensemble : 8 minutes, soit environ 960 mots.

Les étapes, dans l'ordre. Écrivez un commentaire pour CHACUNE :

── Diapositive : Ce qui ne se dit pas
  stepId: heading-01
  cible: 120 mots
  contenu de cette étape : Le silence n’est pas toujours une absence

  stepId: paragraph-01
  cible: 120 mots
  déjà à l'écran : Le silence n’est pas toujours une absence
  contenu de cette étape : Dans beaucoup de couples, il existe un sujet dont on ne parle pas. Ce n’est pas qu’on l’a oublié : on le contourne, chacun de son côté, et ce contournement finit par organiser toute la relation.

  stepId: callout-01
  cible: 120 mots
  déjà à l'écran : Le silence n’est pas toujours une absence | Dans beaucoup de couples, il existe un sujet dont on ne parle pas. Ce n’est pas qu’on l’a oublié : on le contourne, chacun de son côté, et ce contournement finit par organiser toute la relation.
  contenu de cette étape : Le silence protège quelque chose. Tant qu’on ignore quoi, il est difficile de le lever.

── Diapositive : Trois formes de silence
  stepId: heading-02
  cible: 120 mots
  contenu de cette étape : Elles ne se ressemblent pas

  stepId: list-01
  cible: 120 mots
  déjà à l'écran : Elles ne se ressemblent pas
  contenu de cette étape : Le silence de protection : parler ferait mal, alors on se tait. — Le silence d’habitude : on a cessé d’essayer, sans décision consciente. — Le silence de représailles : se taire est devenu une manière de répondre.

  stepId: paragraph-02
  cible: 120 mots
  déjà à l'écran : Elles ne se ressemblent pas | Le silence de protection : parler ferait mal, alors on se tait. — Le silence d’habitude : on a cessé d’essayer, sans décision consciente. — Le silence de représailles : se taire est devenu une manière de répondre.
  contenu de cette étape : Les reconnaître change la conversation : on ne s’adresse pas de la même façon à quelqu’un qui se protège et à quelqu’un qui riposte.

── Diapositive : Par où commencer
  stepId: heading-03
  cible: 120 mots
  contenu de cette étape : Une seule phrase suffit

  stepId: quote-01
  cible: 120 mots
  déjà à l'écran : Une seule phrase suffit
  contenu de cette étape : Il y a quelque chose dont on ne parle jamais. Je ne sais pas par où commencer, mais j’aimerais essayer.
```

Vérifié : le message ne porte ni `sourceSnapshotId`, ni `citationLinks`, ni `renderManifestId`,
ni `contentChecksum`, ni `documentId`, ni `versionId`, ni `requestId`.

---

## 2. Les nombres, et d'où ils viennent

| réglage | valeur | d'où elle vient |
|---|---|---|
| mots par seconde | 2,5 | N3 du CDC, déjà dans le lot 1a — relue, jamais redéclarée |
| durée proposée | 8 min | proposition de départ, modifiable de 1 à 60 |
| **minimum par étape** | **15 mots** | ≈ 6 s. En dessous, l'image change avant que l'oreille ait suivi |
| **maximum par étape** | **120 mots** | ≈ 48 s. Au-delà, le spectateur regarde une image fixe trop longtemps |
| **tolérance** | **± 20 %, plancher ± 5 mots** | 20 % de 60 mots = 12 mots ≈ 5 s, inaudible. Le plancher évite de refuser une cible de 15 mots pour 3 mots d'écart |
| budget de délai | **90 s pour 8 000 jetons, proportionnel** | la règle maison. Plancher 45 s = le délai de transport de l'appel 2 existant ; plafond 300 s |
| jetons | `mots × 1,6 × 1,25 + 500`, plafond 16 000 | 1,6 jeton par mot en français, +25 % pour l'enveloppe JSON |
| modèle | `claude-sonnet-4-6` | celui de la génération existante, jamais un autre choisi ici |
| borne d'entrée | 60 000 caractères | refus AVANT l'appel, plutôt qu'un message obscur du fournisseur |
| marques de pause | `[pause]` et `[pause 2 s]` | R8. Crochets : rien d'un texte français courant n'y ressemble |

**Une honnêteté que le code porte** : la durée visée n'est pas toujours atteignable. Huit étapes
plafonnées à 120 mots ne peuvent pas porter dix minutes — 960 mots, soit 6,4 min. Le moteur le
**dit** (`atteignable: false`, `limite: 'plafond'`) et l'aperçu l'affiche, au lieu de livrer
6,4 min en silence.

---

## 3. Le contrat de réponse

`[{"stepId": "...", "text": "..."}]`, exactement un élément par étape demandée, identifiants
exacts, texte brut, français. Vérifié : identifiant inconnu, étape manquante, doublon, texte vide,
Markdown, trop long, trop court. **Un seul tour de correction**, qui renvoie au modèle sa propre
réponse fautive ET la liste nommée des violations ; puis une erreur qui dit ce qui n'allait pas.
**Jamais de résultat partiel.** Un bloc de code est toléré à la lecture (le modèle en met parfois
un malgré la consigne) — la consigne, elle, l'interdit.

---

## 4. Ce qui est vérifié

| | |
|---|---|
| `verify-narration-ia` | **17/17** — moteur et interface, transport simulé, aucun appel réel |
| `verify-worker-garde-narration` | **6/6** — garde du Worker exécutée hors ligne |
| `falsifier-narration-ia` | **18/18** mutations détectées |
| régression ciblée | **17 tests verts**, dont les 4 du lot 1a |
| empreinte du schéma d'outil | `b1b0155cb8eba26c`, 6679 o, **inchangée** |

Les neuf fixtures de réponse — valide, en bloc de code, étape manquante, identifiant inconnu,
Markdown, trop long, trop court, JSON invalide, réponse vide — produisent chacune le comportement
prévu.

L'interface est vérifiée **sur ce que la page affiche** : le bouton est atteint par le pointeur
(`elementFromPoint`, pas seulement présent dans le DOM), les réglages par défaut sont lus à
l'écran, l'aperçu montre mots, cible et durée pendant que le document reste intact, l'application
écrit et le champ du lot 1a l'affiche, le refus de confirmation ne change rien, l'acceptation
annonce le nombre exact, l'annulation restaure l'état d'avant.

**Une mutation écartée comme équivalente**, consignée plutôt que tue : porter la borne de boucle
de 2 à 4 ne change rien, parce que `if (tour === 1) break;` arrête déjà la boucle. La limite d'un
tour est gardée deux fois. Le contrôle compte désormais les appels (`=== 2`), ce qui attraperait
une vraie levée de la limite.

---

## 5. Mesuré / à juger par Christophe

**Mesuré :** tout le tableau ci-dessus ; que le module ne cause aucune sortie réseau (l'application
en fait 7 au démarrage, qui ne sont pas de ce lot) ; que le Worker n'est pas touché.

**À juger par toi, et que je ne peux pas mesurer :**

1. **La qualité réelle des commentaires.** Elle exige un appel réel, donc ta clé. Je n'ai éprouvé
   que la mécanique : le contrat, les longueurs, le refus. Un texte parfaitement conforme peut
   être plat.
2. **Les bornes 15–120 mots** et la tolérance ± 20 %, à confronter à ta voix réelle.
3. **La durée par défaut de 8 minutes.**
4. **La syntaxe des pauses** `[pause]` / `[pause 2 s]`.
5. **Le ton du prompt** — c'est lui qui décide de tout le reste.

---

## 6. Phase B — l'ordre exact, quand tu écriras « déploie »

**Il n'y a rien à déployer.** Aucun fichier de `Worker/**` n'est touché ; `Deploy Worker` ne se
déclenchera pas. La mise en ligne est celle d'un lot d'application, comme le lot 1a :

1. Je vérifie que `origin/main` n'a pas bougé ; sinon je refais la fusion à l'essai.
2. Je fouille les fichiers de la fusion (chemins absolus, nom d'utilisateur, clés, identifiants
   d'infrastructure), comme pour le lot 1a.
3. Fusion `lot1b-narration-ia` → `main`, sans les commits du lot 2.
4. `🔄 Generate Index` puis `🚀 Pages` publient. **`🚀 Deploy Worker` reste au repos** — je le
   vérifie dans la liste des workflows et je te le montre.
5. Vérification après publication, par requête publique sans connexion : `narration-ia.js` est
   servi, et son empreinte est celle de la fusion.
6. Retour en arrière : `git revert -m 1 <SHA de la fusion>` puis `git push origin main`.

**Ce que tu testes ensuite sur ton site**, avec une **copie** de « L'argent dans le couple »
(« Enregistrer sous », jamais l'original) :

1. Ouvre la copie, clique un bloc, descends jusqu'à **Narration**.
2. **« Rédiger la narration »** → durée 8 min, « vous », « n'écrire que les étapes vides » coché.
3. **« Rédiger »**. Relis l'aperçu : rien n'est encore écrit.
4. **« Appliquer »**, puis **« Annuler ce geste »** pour vérifier que tout revient en arrière.
5. Recommence, applique, et **« Enregistrer »**.
6. Recharge la page, rouvre la copie : les narrations doivent être là.
7. **Exporter → présentation interactive**, puis
   `grep -c "un mot de ta narration" ~/Downloads/*-interactive.html` → doit répondre **0**.

Si le premier appel échoue, le message dira lequel des trois cas : clé refusée (401), débit
dépassé (429), ou pas de réponse dans le budget de délai.

---

## 7. Si tu veux quand même une route dédiée (hors de ce lot)

Elle n'apporterait que deux choses : un **débit propre à la rédaction** — la limite générique est
partagée avec tous les autres appels — et le **prompt gardé côté serveur**, alors qu'il est
aujourd'hui dans le JavaScript public, comme le schéma d'outil l'est déjà. Elle coûterait un
déploiement de Worker et une route de plus à maintenir. Je ne la recommande pas aujourd'hui ;
dis-moi si tu la veux et je la prépare comme un lot séparé, avec son diff et sa Phase B.
