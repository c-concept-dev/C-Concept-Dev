# E5, étape 4 — la cérémonie : plan soumis avant tout code

Écrit le 18 octobre 2026, après la clôture des trois étapes de mécanique.

---

## 1. La réserve d'E1, pied par pied

Elle tenait sur quatre appuis. Un seul a bougé.

| appui | état aujourd'hui |
|---|---|
| « il n'existe pas encore de page web pour l'exécuter » | **tombé** — E5 la construit |
| « dix dépendances transitives, pour l'essentiel de la vérification d'attestation » | debout |
| « écrire moi-même l'analyse CBOR et COSE serait pire » | debout, et je le maintiens |
| « SEC-02 dit *idéalement* ; l'exigence dure est la session de 90 jours » | **à corriger** — voir ci-dessous |

## 2. Ce que la vérification a trouvé, et qui change la question

La note d'E1 écrit : « l'exigence dure est la session de 90 jours sans ressaisie, révocable à
distance, **et elle est tenue** ». Elle décrit une **conception**, pas un comportement.

| pièce | état réel |
|---|---|
| tables `utilisateur`, `cle_acces`, `session`, `droit` | créées par la migration 2, **lues et écrites par rien** |
| logique des droits (`packages/noyau/src/droits.ts`) | écrite et testée, **appelée nulle part dans le Worker** |
| porte du Worker | **un jeton de service unique**, comparé en temps constant |
| cérémonie | pas écrite |

**Il n'y a aujourd'hui aucune personne dans le système en marche.** Un jeton unique ouvre tout,
pour tout le monde. Les tables portent la forme ; aucun code ne la remplit, et aucune session
n'est ni créée, ni vérifiée, ni révoquée.

Ce n'est pas un reproche à E1 : la note dit clairement « les tables l'attendent ». Mais la phrase
« et elle est tenue » laisse croire qu'une session existe, et il faut la lire autrement — **la
session est spécifiée, pas vivante.**

**Conséquence pour E5 :** l'étape 4 n'est pas « ajouter une cérémonie à un système de sessions
existant ». C'est **bâtir le chemin de l'identité**, dont la cérémonie n'est qu'un des deux
moments.

## 3. Ce que la cérémonie exige réellement

Deux moments, et ils n'ont pas le même coût.

**L'enrôlement.** Le navigateur crée une paire de clés, garde la privée dans l'appareil, et rend
la publique. C'est ici que vit l'attestation — et c'est elle qui apporte CBOR, COSE et les dix
dépendances.

**L'authentification.** Le navigateur signe un défi avec la clé privée. Le serveur vérifie la
signature avec la clé publique enrôlée. **Aucune attestation, aucun CBOR** : une vérification de
signature, et le compteur anti-rejeu.

## 4. Les trois voies, et leur coût

### Voie A — la bibliothèque de référence

Dix dépendances transitives, pour l'essentiel de la vérification des certificats d'attestation,
dont deux utilisateurs connus n'ont pas l'usage. C'est ce qu'E1 a écarté, et la raison tient.

### Voie B — écrire CBOR et COSE ici

Écartée par E1, et je la maintiens écartée. De l'analyse binaire dans un chemin
d'authentification est exactement là où une erreur ne se voit pas.

### Voie C — laisser le navigateur rendre la clé publique

`AuthenticatorAttestationResponse.getPublicKey()` rend la clé publique **déjà en SPKI**, et
`getPublicKeyAlgorithm()` son algorithme. ~~Le serveur n'a alors plus rien à analyser~~ — il
importe la clé avec `crypto.subtle.importKey("spki", …)` et vérifie les signatures avec
`crypto.subtle.verify`. Les deux sont dans WebCrypto, présent nativement dans les Workers.

**Correction après mesure (18 octobre) :** « plus rien à analyser » était faux d'une chose. La
clé, oui. La **signature**, non : elle arrive en ASN.1 DER et `crypto.subtle.verify` veut r‖s
brut. Il reste donc à lire deux entiers. Voir la section 9.

**Zéro dépendance. Aucun CBOR, aucun COSE, aucune attestation.**

Ce qu'elle coûte, et qu'il faut accepter :

- **On ne vérifie pas l'attestation**, donc on ne prouve pas *quel modèle* d'appareil garde la
  clé. Pour deux personnes connues qui enrôlent leurs propres appareils, cela ne protège de
  rien — et c'est déjà le choix d'E1, qui écartait l'attestation pour la même raison.
- **`getPublicKey()` peut rendre `null`** si l'algorithme n'est pas reconnu du navigateur.
  L'enrôlement doit alors **échouer en le disant**, jamais se rabattre en silence.
- Elle repose sur une API de navigateur, à vérifier sur les navigateurs réellement employés
  avant d'aller plus loin. C'est la première chose que fera l'étape.

## 5. Ma recommandation : la voie C

Elle lève le seul appui qui empêchait d'écrire la cérémonie — les dix dépendances — sans
ramener celui qu'E1 avait eu raison d'écarter. Le compromis qu'elle demande, renoncer à
l'attestation, est **déjà le compromis d'E1**, assumé pour les mêmes utilisateurs.

## 6. Les étapes, dans l'ordre où elles se vérifient

| # | ce qui est fait | comment on sait que c'est fait |
|---|---|---|
| ~~4.1~~ **fait** | **Vérifier la voie C** : `getPublicKey()` rend bien une clé SPKI importable, sur les navigateurs employés | **Mesuré le 18 octobre** : cérémonie réelle sous Chromium, API présente sur le Safari livré, vérification faite dans workerd. Un écart trouvé : la signature demande un passage DER → brut. Section 9 |
| ~~4.2~~ **fait** | Le registre sait écrire et lire une personne, une clé, une session | **46 tests** : les trois tables lues et écrites, le décodage DER à longueur variable, et les trois issues d'une vérification. Section 10 |
| 4.3 | L'enrôlement : défi, création, clé publique rangée | Une clé enrôlée se relit ; `getPublicKey()` nul **refuse** et le dit |
| 4.4 | L'authentification : défi, signature, vérification, session ouverte | Une signature valide ouvre ; une signature rejouée est refusée (le compteur) |
| 4.5 | La session : cookie 90 jours, repoussé une fois par jour, révocable | Une session révoquée refuse à la requête suivante |
| 4.6 | Les droits enfin appliqués : `droits.ts` branché à la porte | Une action absente de la table est refusée à tout le monde |

L'étape 4.6 n'était pas au plan d'E5. Elle y entre parce que la vérification l'a rendue
nécessaire : une identité sans droits appliqués ne sert à rien.

## 7. Ce que je ne fais pas sans un accord séparé

- **Aucun déploiement**, aucun changement de secret ou de configuration (CLAUDE.md, règle 7).
- **Aucune nouvelle dépendance** sans vous la soumettre — c'est tout l'objet de ce document.
- **Rien sur le vrai corpus** : la mini-bibliothèque reste le terrain d'épreuve.
- **Jamais `clone-proxy` ni `therapeute-library`.**

## 8. Ce qui reste ouvert

**Le jeton de service ne disparaît pas.** Il protège la façade pour les appels de machine à
machine ; la session protège les personnes. Les deux coexisteront, et il faudra dire clairement
lequel ouvre quoi — sans quoi on aura deux portes et une seule serrure vérifiée.

**La révocation à distance** demande un écran pour la déclencher. Il n'existe pas, et il
n'appartient pas à l'étape 4.

---

## 9. Ce que la mesure de 4.1 a dit (18 octobre 2026)

Une cérémonie **réelle**, pas une simulation : un authentificateur virtuel du protocole CTAP2
répond à `navigator.credentials.create()` puis à `.get()`, et les octets qu'il produit sont
soumis tels quels au moteur du Worker.

### La cérémonie, de bout en bout

| ce qui est mesuré | résultat |
|---|---|
| `getPublicKey()` rend une clé | **oui**, 91 octets, non nulle |
| en quel format | **SPKI** — l'en-tête `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE…` est celui d'une clé ECDSA P-256 |
| `getPublicKeyAlgorithm()` | **−7** (ECDSA avec SHA-256), l'algorithme demandé |
| `importKey("spki", …)` dans **workerd** | **réussi**, sans analyse d'aucune sorte |
| une signature valide se vérifie | **oui** |
| un message altéré est refusé | **oui** |
| une signature tronquée est refusée | **oui**, sans faire tomber le code |
| le défi revient tel qu'envoyé | **oui** |
| l'origine annoncée par le navigateur | `http://localhost:8787`, celle de la page |
| le drapeau « utilisateur vérifié » | **posé** (`00000101`) |
| le compteur anti-rejeu | lu, à 2 après deux usages |
| taille de l'objet d'attestation qu'on **n'analyse pas** | 194 octets de CBOR |

Et la mesure a été faite **dans workerd**, pas seulement dans Node : les deux n'ont pas la même
mise en œuvre de WebCrypto, et c'est workerd qui portera le code. `wrangler dev --local` sur un
banc à part : aucun déploiement, aucun secret, la configuration figée intouchée.

Les trois bancs vivent dans `apps/worker/bancs/`, hors de la vérification courante comme les
autres bancs de mesure, et les octets mesurés y sont rangés — ils serviront de fixtures aux
tests de l'étape 4.4. Aucun ne tourne sous le bac à sable : tout navigateur a besoin des
services Mach que celui-ci refuse.

### L'écart trouvé, et ce qu'il coûte

**La signature de WebAuthn est en ASN.1 DER ; `crypto.subtle.verify` veut r‖s brut.** Mesuré
dans les deux sens, et c'est net :

| la signature est passée… | verdict |
|---|---|
| telle quelle, en DER | **refusée** — et silencieusement : `verify` rend `false`, il ne lève rien |
| après passage DER → brut, 64 octets | **acceptée** |

**La mesure a été relancée, et elle a appris une seconde chose.** La première cérémonie rendait
une signature de **70** octets, la seconde de **71**. Ce n'est pas du bruit : la longueur d'un
entier DER dépend de son premier bit, et un octet de bourre s'ajoute quand il est à un. Une
signature DER d'ECDSA P-256 fait donc 70, 71 ou 72 octets selon les valeurs tirées.

Conséquence, et c'est elle qui compte : **une découpe à offsets fixes marcherait une fois sur
quatre environ, et se tairait le reste du temps.** Le passage doit lire les longueurs annoncées,
ce que fait `derVersBrut`. Les deux relevés le confirment, sur deux longueurs différentes.

C'est le piège exact dont la voie B devait nous préserver : une erreur binaire qui ne se voit
pas, puisqu'une signature valide refusée ressemble à un mot de passe erroné.

Le coût est néanmoins **sans commune mesure** avec l'analyse d'un objet d'attestation :

- lire deux entiers d'une séquence ASN.1 **aux longueurs qu'elle annonce**, retirer l'octet de
  bourre de signe, caler chacun sur trente-deux octets. Une vingtaine de lignes d'arithmétique,
  à écrire une fois.
- **toujours aucun CBOR, aucun COSE, aucune attestation, aucune dépendance.**

Et surtout : c'est **testable complètement**, sur les octets réels mesurés ici. La voie B ne
l'était pas — on n'avait aucune façon de prouver qu'un analyseur CBOR écrit à la main traite
correctement ce qu'il ne verra qu'en production.

**Conclusion : la voie C tient.** Le plan la gardait pour « rien à analyser » ; elle vaut en
réalité pour « vingt lignes vérifiables au lieu de dix dépendances ». C'est toujours le bon
choix, et la raison est maintenant exacte.

### Les navigateurs, un par un

| navigateur | `getPublicKey` | cérémonie |
|---|---|---|
| **Safari 26.3** (build 25D125, la plateforme de référence) | **présente**, avec `getPublicKeyAlgorithm` et `getAuthenticatorData` | non menée — voir ci-dessous |
| WebKit de Playwright 26.6 | présente | impossible sans authentificateur |
| Chromium 153 | présente | **menée de bout en bout** |
| Firefox 155 | présente | impossible sans authentificateur |

Le vrai Safari a été interrogé par `safaridriver`, et non par le WebKit de Playwright : ce
dernier est en avance sur le Safari livré, et c'est le livré qui compte. Sur `localhost`, il se
déclare en contexte sûr, expose les trois méthodes, dispose de la médiation conditionnelle, et
`isUserVerifyingPlatformAuthenticatorAvailable()` rend **vrai** — Touch ID est là.

### Ce que cette mesure ne dit pas, et qu'il ne faut pas lui faire dire

**Sur Safari, la présence de `getPublicKey` n'est pas la preuve qu'elle rend une clé non nulle.**
C'est précisément le risque que la section 4 nommait. Le vérifier demande une cérémonie réelle,
donc la feuille de Touch ID, donc un doigt sur le capteur : cela ne peut pas être mesuré sans
Christophe devant l'écran, et ce document ne le fera pas croire autrement.

Le risque résiduel est faible — la méthode est spécifiée pour rendre `null` seulement si
l'algorithme est inconnu du navigateur, et −7 est l'algorithme le plus répandu qui soit — mais
il n'est pas nul, et il se lèvera en une minute le jour de l'enrôlement. **L'étape 4.3 prévoit
déjà qu'une clé nulle fasse échouer l'enrôlement en le disant** : si Safari surprend, le refus
sera explicite au lieu d'être silencieux.

---

## 10. L'étape 4.2 : le registre, et la signature traitée comme il faut

Deux exigences commandaient cette étape, en plus de son objet.

### Les trois tables, enfin vivantes

`apps/worker/src/qui-entre.ts` lit et écrit une personne, une clé, une session. Comme pour le
registre des bibliothèques, **tout ce qui sort passe par son contrat** : une ligne de base n'est
pas une donnée de confiance, et ici moins qu'ailleurs — un compteur anti-rejeu relu de travers,
c'est une signature rejouée qui passe. Deux tests le vérifient en trafiquant la base à la main.

**Rien ne se supprime.** Une clé et une session révoquées gardent leur ligne, datée : c'est la
lecture qui voit la révocation, pas la base qui l'efface. Un journal dont les lignes disparaissent
ne répond plus à « depuis quand ».

La table `droit` reste intouchée : elle est l'objet de l'étape 4.6, et rien ne gagnerait à
l'écrire avant qu'une identité existe pour la porter.

### Une colonne manquait, et la migration 3 la pose

La migration 2 a été écrite avant la cérémonie. À l'entrée, le navigateur présente l'identifiant
que l'authentificateur a donné à la clé — des octets quelconques, pas un UUID — et c'est **le
seul chemin** pour retrouver la clé publique qui vérifiera la signature. Sans cette colonne, une
clé enrôlée est introuvable au moment précis où elle sert.

Elle ne remplace pas `id` : l'identifiant interne reste un UUID, comme partout ailleurs, et c'est
lui que le journal cite. L'index d'unicité est partiel, pour que la règle ne dépende pas du fait
que la table est vide aujourd'hui.

**Elle n'est pas appliquée à la base déployée.** Appliquer une migration au registre en
production est un geste explicite, qui se demande.

### Le décodage DER est dans le code, pas seulement au banc

`packages/noyau/src/signature.ts` lit les longueurs **annoncées**, jamais des positions
supposées. Le test tire trois cents signatures réelles et vérifie que chacune se relit octet
pour octet.

Et la mesure est allée plus loin que l'étape 4.1 ne l'avait vue. Sur vingt mille signatures :

| longueur | fréquence |
|---|---|
| 69 octets | **0,24 %** |
| 70 octets | 25,1 % |
| 71 octets | 49,2 % |
| 72 octets | 25,5 % |

Les soixante-neuf octets arrivent quand un des deux entiers commence par un octet nul. Une garde
défensive tout à fait plausible à écrire — « moins de soixante-dix octets, ce n'est pas une
signature » — refuserait **une entrée sur quatre cent seize**, au hasard, sans qu'aucun journal
ne fasse de motif. Un test déterministe construit ce cas plutôt que de l'attendre du hasard.

Au passage, cette mesure a corrigé mon propre test : il exigeait l'ensemble exact
{70, 71, 72} et aurait donc échoué **une fois sur deux**. Il avait passé deux fois, ce qui ne
prouvait rien. L'assertion dit maintenant que les trois longueurs courantes se présentent, sans
interdire les autres.

### Refusée, ou illisible : jamais le même mot

**Aucune fonction de ce module ne rend un booléen.** Trois issues :

| issue | ce que ça veut dire |
|---|---|
| `valide` | la signature correspond |
| `refusee` | tout était lisible, et elle ne correspond pas — une tentative qui échoue |
| `illisible` | un défaut : clé inimportable, DER mal formé, `verify` qui lève |

Confondre les deux dernières dans un « faux » muet, c'est faire passer un bogue pour un mot de
passe erroné et chercher pendant des jours. Le lecteur DER est strict pour la même raison : un
zéro de tête superflu, un entier négatif, des octets en trop à la fin sont **refusés en le
disant**, parce qu'un lecteur indulgent laisserait deux écritures différentes valoir la même
signature.

**Mais ce qui sort vers le demandeur ne distingue rien** : un seul mot, « Entrée refusée. », pour
les trois. Apprendre qu'une signature est illisible plutôt que refusée, c'est apprendre qu'on a
trouvé un défaut. La distinction est pour nous — `pourLeJournal` garde la raison technique, et
c'est elle qui fera la différence entre une heure et trois jours.

C'est le motif que `laissez-passer.ts` suit déjà, qui sépare « Signature illisible » de
« Signature refusée ». Le nouveau module le reprend plutôt que d'en inventer un autre.

### Deux mutations, pour voir si les tests mordent

Un test qui ne peut pas échouer ne prouve rien — la leçon des fixtures où `index` valait
`numero`. Deux gardes ont donc été cassées exprès :

| mutation | verdict |
|---|---|
| la longueur DER devient tolérante (`>` au lieu de `!==`) | **rouge** |
| le compteur anti-rejeu n'est plus vérifié | **rouge** |

Les deux ont été défaites juste après.
