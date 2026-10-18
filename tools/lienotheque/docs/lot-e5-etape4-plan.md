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
| ~~4.3~~ **fait** | L'enrôlement : défi, création, clé publique rangée | **39 tests** : la clé enrôlée se relit, `getPublicKey()` nul refuse en le nommant, et le défi ne sert qu'une fois — y compris sous deux requêtes simultanées. Section 11 |
| ~~4.4~~ **fait** | L'authentification : défi, signature, vérification, session ouverte | **26 tests** : la cérémonie mesurée du 18 octobre ouvre une session de bout en bout ; une preuve rejouée est refusée deux fois, par le défi puis par le compteur. Section 12 |
| ~~4.5~~ **fait avec 4.6** | La session : témoin 90 jours, repoussé une fois par jour, révocable | Faire 4.5 seule aurait demandé une route sans garde, ou une garde sans route. Section 13 |
| ~~4.6~~ **fait** | Les droits enfin appliqués : `droits.ts` branché à la porte | **41 tests** : chaque route dit sa porte dès sa première ligne, et n'en a qu'une. Section 13 |

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

---

## 11. L'étape 4.3 : l'enrôlement, et sept refus qui se nomment

### Ce que l'enrôlement vérifie, et dans quel ordre

1. le défi existe, n'a pas servi, n'est pas périmé, a été émis **pour enrôler**, et désigne une
   personne ;
2. les données du client disent bien une **création**, pour ce défi, depuis notre origine, hors
   de tout cadre étranger ;
3. la clé publique est présente, de l'algorithme demandé, et **s'importe réellement** ;
4. alors seulement la clé est rangée, et le défi marqué comme ayant servi.

**L'ordre n'est pas indifférent.** Le défi est consommé en dernier : un refus qui vient de la clé
n'est pas la faute du défi, et obliger à en redemander un pour réessayer depuis un autre appareil
serait une rudesse gratuite. Un test le vérifie — après un refus de clé, le même défi enrôle.

L'import de la clé est **fait pour de vrai**, et non supposé d'après l'algorithme annoncé : une
clé d'une autre courbe peut annoncer `-7` et ne pas s'importer. Mieux vaut l'apprendre à
l'enrôlement, où l'on peut le dire, qu'à la première entrée, où l'on ne pourra que refuser.

### Le cas qui commandait l'étape

`getPublicKey()` nul **refuse, et le dit** : « getPublicKey() n'a pas rendu de clé : ce navigateur
ne reconnaît pas l'algorithme. » Aucun repli sur l'objet d'attestation — ce serait ramener le CBOR
par la petite porte, un jour où personne ne regarde.

Et quatre causes distinctes, parce qu'elles ne se corrigent pas de la même façon :

| cause | ce que ça veut dire |
|---|---|
| `cle_nulle` | le navigateur n'a pas su rendre la clé — une **réponse**, pas un défaut |
| `algorithme_nul` | il n'a pas su nommer l'algorithme |
| `algorithme_inattendu` | un autre algorithme que celui qu'on vérifie |
| `cle_illisible` | la clé ne s'importe pas — un **défaut** |

Le contrat y est pour quelque chose : `clePublique` et `algorithme` sont **explicitement
nullables**. La page doit envoyer `null`, et non omettre le champ — un champ absent se
confondrait avec un bogue de la page, et l'enrôlement échouerait sans qu'on sache lequel des deux
s'est produit.

### Le défi vit dans la base, et pas dans un jeton signé

Un jeton signé sait dire qu'il est authentique et qu'il n'est pas périmé. **Il ne saura jamais
dire qu'il a déjà servi.** Une chose à usage unique a besoin d'un endroit où marquer qu'elle a
servi : d'où la table, et la migration 4.

La ligne consommée reste, pour qu'on puisse répondre « ce défi a déjà servi » plutôt que « ce défi
n'existe pas ». Les deux refusent ; elles ne disent pas la même chose à qui lit un journal — une
sonde, ou un double clic.

### La course, trouvée en essayant de casser le code

Une mutation a retiré le contrôle « ce défi a déjà servi » qui précède l'écriture : **tous les
tests sont restés verts.** La mise à jour sous condition rattrapait. Ce n'était donc pas un trou
de test, mais cela révélait autre chose : rien ne prouvait que le « une seule fois » tienne quand
deux requêtes arrivent ensemble.

Le test manquant a été écrit : deux consommations lancées sans attendre la première, de sorte que
chacune lit la ligne vierge avant que l'autre n'écrive. C'est la course qu'un double clic produit,
et elle est reproductible. Deux mutations la confirment, et **ce test est le seul que l'une ou
l'autre fasse tomber** :

| mutation | verdict |
|---|---|
| le nombre de lignes touchées n'est plus regardé | **rouge** |
| la mise à jour n'est plus conditionnelle | **rouge** |

Le port a dû s'élargir pour cela : une écriture rend maintenant `meta.changes`, comme D1 le fait.
Une écriture qui ne sait pas dire si elle a touché une ligne ne peut pas exprimer un « une seule
fois ». Le double en mémoire a été normalisé à la forme de D1 — un double qui rend autre chose que
l'hébergeur laisserait passer en test ce qui échouerait en ligne.

### Il n'y a pas de route, et c'est voulu

Les fonctions existent et sont éprouvées ; **aucune n'est exposée sur le réseau.** Une route
d'enrôlement que rien ne garde serait exactement la porte ouverte qu'on vient de fermer à l'étape
4.0 : quiconque la trouverait s'enrôlerait, et il n'y a pas aujourd'hui d'identité pour la garder.

Elle viendra quand les droits la garderont — étape 4.6 — ou au plus tôt après l'authentification.

### Deux fois mon test, et non le code

Deux échecs de cette étape venaient de mes tests, pas du code, et les deux fois le mécanisme
faisait exactement son travail :

- j'avais recopié un défi de quarante-trois caractères à la main depuis un journal, en perdant
  quatre caractères. Le test lit maintenant le défi **dans la fixture** ; une chaîne de cette
  longueur ne se transcrit pas à l'œil ;
- j'avais confondu « longueur en octets » et « longueur en caractères de base64 » dans le test du
  laissez-passer : « A » tout seul ne se décode pas, et le refus « illisible » était juste.

### Le `try` du laissez-passer, par symétrie

Ajouté, avec ses quatre tests. La mesure a déplacé le risque là où il est vraiment :

| ce qui a été mesuré | résultat |
|---|---|
| `verify` HMAC sur une signature de 0, 1, 7, 64 octets | **rend faux**, ne lève jamais |
| import d'une clé HMAC depuis un secret **vide** | **lève** — « Zero-length key is not supported » |

Ce n'est donc pas `verify` qu'il fallait garder, mais l'import de la clé. La route refuse déjà un
secret vide avant d'y arriver, si bien que cette garde est une ceinture de plus et non un bogue
vivant — mais le module promet « jamais une exception », et il la tient maintenant pour tout
appelant qui n'aurait pas la même vigilance. Une mutation confirme que la garde porte.

---

## 12. L'étape 4.4 : l'entrée, et deux gardes qui ne dépendent pas l'une de l'autre

### Le test qui compte le plus

**La cérémonie réellement mesurée le 18 octobre ouvre une session, de bout en bout.** Clé
publique, données de l'authentificateur, données du client et signature telles qu'un
authentificateur CTAP2 les a produites — rien d'inventé pour la circonstance. Et le test retrouve
au passage l'empreinte du domaine du banc (`localhost`) dans les octets mesurés, sans que rien
n'ait été transcrit à la main.

C'est la boucle de la voie C fermée : ce qui avait été mesuré en 4.1 comme possible est maintenant
exécuté par le code du dépôt.

### Ce que l'entrée vérifie

| rang | ce qui est vérifié | ce qu'un refus veut dire |
|---|---|---|
| 1 | le défi existe, est d'usage `entree`, n'a pas servi, n'est pas périmé | **non journalisé** — voir plus bas |
| 2 | la clé présentée existe et n'est pas révoquée | inconnue ≠ révoquée, et le journal le dit |
| 3 | les données du client : `webauthn.get`, ce défi, notre origine, hors cadre tiers | |
| 4 | les données de l'authentificateur : **empreinte du domaine**, présence, utilisateur vérifié | |
| 5 | la signature | `refusee` ≠ `illisible`, jusqu'au bout de la chaîne |
| 6 | le défi est **dépensé** | |
| 7 | le compteur anti-rejeu a avancé | |
| 8 | la session s'ouvre | |

L'empreinte du domaine (rang 4) est la garde contre un site voisin : l'appareil n'inclut dans ce
qu'il signe que le domaine où la clé a été enrôlée. Une signature prise ailleurs ne vaut rien
ici — à condition de vérifier, et une mutation confirme que la vérification porte.

### Deux gardes contre le rejeu, et c'est délibéré

Elles ne dépendent pas l'une de l'autre, et chacune a son test :

- **le défi**, qui ne sert qu'une fois ;
- **le compteur** de l'authentificateur, qui doit avoir avancé.

Un test rouvre un défi à la même valeur — ce qui ne devrait jamais arriver — et vérifie que
l'entrée est refusée quand même, par le compteur. L'inverse est vrai aussi : une preuve rejouée
sur un défi déjà dépensé n'atteint jamais le compteur.

### Quand un défi est dépensé, et pourquoi la règle diffère de l'enrôlement

**Un défi est dépensé dès qu'une signature a été jugée contre lui**, qu'elle ait tenu ou non.
Sans cela, on pourrait essayer mille signatures sur le même défi.

À l'enrôlement, le défi survit à un refus de clé. Ce n'est pas une incohérence mais une règle :
là-bas, le refus survient **avant** toute vérification — rien n'a été éprouvé, et obliger à
redemander un défi pour réessayer depuis un autre appareil serait une rudesse gratuite. Ici, la
signature a été jugée.

Les deux cas ont leur test, et une mutation qui déplace la dépense après la vérification de la
signature fait tomber le second.

### Ce que le journal retient, et ce qu'il refuse de retenir

**Un défi inconnu n'écrit rien.** Sans cette retenue, n'importe qui remplirait le journal en
envoyant des valeurs au hasard, et noierait les lignes qui comptent. Les refus journalisés sont
ceux qui ont présenté un défi **valide** : ils sont donc bornés par les défis qu'on a émis.

**Une entrée réussie n'est pas journalisée non plus** : elle laisse une ligne de session, datée et
nommée, qui dit déjà qui est entré et quand. Un refus, lui, ne laisse rien d'autre.

Une mutation qui journalise aussi les défis inconnus fait tomber le test correspondant.

### Deux sorties qui ne se mélangent pas

`entrer` ne rend pas un `Resultat` ordinaire : sa `raison` irait droit dans une réponse HTTP, et
c'est exactement ce qu'on ne veut pas. Un refus porte **deux** champs :

| champ | où il va |
|---|---|
| `mot` | au demandeur — toujours « Entrée refusée. » |
| `pourLeJournal` | jamais au demandeur |

Les noms font le travail : personne n'écrit `pourLeJournal` dans une réponse par distraction. Un
test vérifie que quatre refus très différents rendent le même mot, et que leurs quatre raisons
internes diffèrent toutes.

### Mes tests, encore une fois

Quatre échecs au premier passage, tous dans mon échafaudage : mes aides créaient deux fois la
même clé et posaient deux fois le même défi, et les contraintes d'unicité — qui faisaient
exactement leur travail — ressemblaient à des pannes. Les aides remettent maintenant le décor à
neuf à chaque tentative.

C'est la troisième fois de ce lot que l'échec vient du test et non du code. À chaque fois le
mécanisme sous test se comportait correctement ; à chaque fois c'est l'échafaudage qui mentait.

---

## 13. Les étapes 4.5 et 4.6 : la porte, les droits, et les routes

### Chaque route dit sa porte, et n'en a qu'une

| route | porte |
|---|---|
| `GET /sante` | **aucune** — elle ne dit que le nom et la version |
| les quatre de la façade | **jeton de service _ou_ session**, selon la bascule, jamais les deux |
| `POST /entree/defi`, `POST /entree` | **aucune** — c'est la porte qu'on vient ouvrir |
| `POST /enrolement/defi`, `POST /enrolement` | **session + droit `enroler_cle`** (administration) |
| `POST /amorce/defi`, `POST /amorce` | **jeton de service _et_ aucune clé enrôlée** |
| `DELETE /session` | **le témoin seul** |
| `POST /vision`, `/vision/jetons` | jeton de service (inchangé) |
| `GET /fichier/:laissez` | laissez-passer signé (inchangé) |

Se déconnecter demande une **identité**, pas une autorisation : quelqu'un sans aucun droit doit
pouvoir fermer sa session. Et la réponse est la même avec ou sans témoin — se déconnecter ne doit
pas apprendre si l'on était connecté.

### La porte est en deux temps, et c'est une règle qui l'a imposé

Les deux premières questions — qui présente ce témoin, sa session vaut-elle encore — ne demandent
**aucune configuration**. La troisième — a-t-il le droit de ce geste, sur cette bibliothèque — a
besoin de savoir laquelle.

Or la règle acquise le 10 octobre veut la porte **avant** la configuration : vérifier la
configuration d'abord apprenait à un appelant anonyme si la façade est configurée, et sur quelle
bibliothèque elle bute. D'où `identifierParSession` puis `autoriser`, que la façade appelle de
part et d'autre de sa configuration. Une seule mise en œuvre, deux ordres d'appel.

Un test le vérifie en **retirant** le réglage de la façade : sans session, la réponse reste
« Accès refusé. » et 401, et non un 503 qui aurait tout dit.

### Un seul mot, un seul statut

Aucun refus de la porte ne dit lequel des trois temps a échoué, et **tous rendent 401**. Un 403
là où un 401 suffit apprendrait qu'on a été reconnu ; un « droits insuffisants » apprendrait que
la bibliothèque existe. La règle de `droits.ts` — « jamais une phrase qui apprend ce qui
existe » — s'applique donc aussi au **statut**, et pas seulement à la phrase.

**Une exception, assumée : l'enrôlement dit pourquoi il refuse.** L'appelant y est une personne
identifiée, qui a le droit d'enrôler, et qui a besoin d'apprendre que son navigateur n'a pas
rendu de clé plutôt que de réessayer sans fin. Ce n'est pas la situation d'une entrée refusée.

### Rien par défaut

| ce qui manque | ce qui s'ensuit |
|---|---|
| une personne absente de la table des droits | **aucun** droit |
| une action absente de la table des exigences | permise à **personne** |
| un niveau que le code ne connaît pas (base trafiquée) | ne vaut **rien** — la porte reste fermée, elle ne tombe pas |

Les trois ont leur test, dont celui qui écrit `tout_permis` dans la base à la main.

### La bascule : une porte ou l'autre, jamais les deux

`SESSIONS_EXIGEES` reste **faux**. Elle décide, à elle seule, laquelle des deux portes ouvre la
façade :

| `SESSIONS_EXIGEES` | ce qui ouvre la façade |
|---|---|
| faux (aujourd'hui) | le jeton de service, et la garde de 4.0 limite à une bibliothèque d'essai |
| vrai | la session seule — **le jeton cesse d'ouvrir ces routes** |

Les deux positions sont éprouvées, parce qu'une bascule dont on ne connaît qu'une position est
une bascule dont on suppose l'autre. Une mutation qui fait accepter le jeton **aussi** quand les
sessions sont exigées fait tomber deux tests.

Ce n'est pas un réglage d'hébergement mais une ligne de code : la bascule est une décision, qu'on
change et qu'on déploie, pas une variable qu'on pousse un soir.

### L'amorçage : le problème de l'œuf et de la poule, et sa réponse

Enrôler exige une session ; obtenir une session exige une clé enrôlée. Le premier accès ne peut
donc se donner par aucune des deux.

Il se donne par **le seul secret qu'on détienne déjà** — le jeton de service — et seulement tant
qu'**aucune clé n'est enrôlée**. Dès qu'il y en a une, la porte d'amorçage se referme pour
toujours, et le test le vérifie dans les deux sens.

Deux routes distinctes (`/amorce/defi`, `/amorce`) plutôt qu'une route d'enrôlement qui
accepterait deux portes : chacune n'en a qu'une, et la doctrine reste lisible.

On compte les **clés** et non les personnes, parce que l'amorçage crée la personne avant
d'enrôler sa clé : compter les personnes refermerait la porte au milieu du geste. Le premier
accès reçoit l'administration, sans quoi personne ne pourrait enrôler le second.

### Deux réglages à poser à la main, que je n'ai pas posés

| réglage | ce qu'il vaut |
|---|---|
| `ORIGINE_CEREMONIE` | l'origine exacte de la page qui mène les cérémonies — schéma, hôte, port |
| `DOMAINE_CEREMONIE` | le domaine seul, celui pour lequel les clés sont enrôlées |

**Jamais lus dans la requête.** Lire l'en-tête `Origin` rendrait la vérification vide de sens :
c'est précisément ce qu'un attaquant contrôle. Et ce ne sont pas ceux du Worker — la page vit
ailleurs.

Sans eux, les routes de cérémonie refusent d'ouvrir (503), comme pour les laissez-passer :
l'oubli d'un réglage ne doit pas se solder par une cérémonie permissive. Un test le vérifie.

Ils se posent comme les autres, hors du dépôt :

```
npx wrangler secret put ORIGINE_CEREMONIE --config wrangler.toml
npx wrangler secret put DOMAINE_CEREMONIE --config wrangler.toml
```

### L'ordre dans lequel tout cela se met en marche

1. poser les deux réglages ci-dessus ;
2. appliquer la migration 4 (la table des défis) au registre déployé ;
3. déployer le Worker ;
4. amorcer le premier accès par `/amorce/defi` puis `/amorce`, depuis la page, avec le jeton de
   service — c'est le seul moment où il sert à cela, et il ne resservira plus ;
5. vérifier qu'une entrée ordinaire fonctionne ;
6. **alors seulement** basculer `SESSIONS_EXIGEES` à vrai et redéployer.

Rien de tout cela n'est fait : les quatre premiers points demandent un accord, et le sixième est
la décision que le drapeau attendait depuis l'étape 4.0.

### Un garde-fou que j'avais oublié

Un test balaie les sources du Worker et refuse toute adresse distante autre que celle du modèle.
J'avais écrit une adresse en **exemple** dans un commentaire, et il l'a refusée. Il a raison : un
exemple ne se distingue pas d'une vraie adresse par une expression régulière. Le commentaire a été
reformulé, le garde-fou n'a pas été touché — comme pour les mots de domaine de CLA-01.
