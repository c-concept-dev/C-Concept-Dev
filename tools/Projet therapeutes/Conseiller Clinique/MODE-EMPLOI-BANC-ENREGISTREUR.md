# Banc de l'enregistreur — lot 3, jalon I · mode d'emploi

**Sans casque.** Tout se fait sur le Mac, avec son micro et ses haut-parleurs intégrés (E10). Un
casque reste possible, il n'est pas nécessaire — et le jalon I ne joue aucun son, donc il ne
change rien ici.

Capture et stockage seulement. Pas de bande rythmo, pas de repères, pas de compte à rebours : ils
arrivent au jalon II. Rien n'est grisé — ce qui n'existe pas encore est absent de l'écran.

**Aucun réseau.** Le banc ne parle à aucun serveur, ne lit ni ne pose aucune clé, et n'appelle
jamais le Worker. Votre voix ne quitte pas le Mac : elle va dans le stockage local de Safari.

> **Ce qui a changé depuis la première version de ce mode d'emploi** : plus aucune mention de
> casque ni de bips ; la fréquence réelle de la prise se lit maintenant dans le rapport et dans la
> barre du bas ; le nom du micro et les latences y sont aussi ; le bruit de la pièce est mesuré et
> affiché en trois états ; le canal retenu est revérifié à la fin de la prise ; et deux nouvelles
> épreuves sont demandées (la prise de 10 s sans parler et celle de 40 s en lisant).

---

## La commande

Une seule, à coller dans le Terminal. Elle sert la page sur `127.0.0.1`, ce qui est indispensable :
sans cela Safari refuse le micro et refuse de charger le worklet audio.

```bash
cd ~/Documents/GitHub/C-Concept-Dev-lot3-wt/"tools/Projet therapeutes/Conseiller Clinique" && python3 -m http.server 8765 --bind 127.0.0.1
```

Puis, dans Safari :

```
http://127.0.0.1:8765/banc-enregistreur.html
```

Pour arrêter le serveur : `Ctrl+C` dans le Terminal.

---

## Ce que vous devez voir, dans cet ordre

| # | Geste | Ce qui doit apparaître |
|---|---|---|
| 1 | La page s'ouvre | « Prêt » en haut à droite. En bas à droite, « Persistance du stockage : demandée → … » avec le quota. Aucune prise : « Aucune prise sur cet ordinateur ». |
| 2 | « Autoriser le micro » | Safari demande l'autorisation. Ensuite la barre du bas affiche **« Micro : … »** avec le nom réel de votre micro, et **« Fréquence : 44100 Hz »** (ou 48000). Le vu-mètre bouge quand vous parlez. |
| 3 | Vous parlez normalement | Le chiffre descend vers **−30 dB environ**. Sous « Canal retenu » : « canal gauche — droit vide : canal actif pris tel quel, sans moyenne ». |
| 4 | **Laissez tourner deux secondes** avant de cliquer | Le canal se décide sur les **2 dernières secondes**. Si vous cliquez trop vite, un avis le dit et la décision se prend sur tout ce qui a été mesuré. |
| 5 | « Commencer la prise » | Badge « Prise en cours », chronomètre, et un morceau toutes les 5 secondes dans la barre du bas. Au bout de 3 s, la ligne **« Bruit de pièce : … »** se remplit. |
| 6 | « Arrêter la prise » | Badge « Prise terminée ». La prise apparaît à droite avec sa durée, ses morceaux, son poids, sa fréquence et son canal. |
| 7 | « Exporter en WAV » | Un `.wav` arrive dans vos téléchargements. **Ouvrez-le dans QuickTime** : durée conforme, voix au niveau normal — ni deux fois trop faible, ni saturée. |
| 8 | « Rapport de mesures (JSON) » | Le fichier que je vous demande de me renvoyer. |

---

## Les six épreuves

| Épreuve | Geste | Ce qui doit se passer |
|---|---|---|
| **1 · 10 s sans parler, micro intégré** | « Commencer », **ne dites rien** pendant 10 s, « Arrêter » | La ligne « Bruit de pièce » doit donner un état — **calme**, **correct** ou **bruyant** — avec son niveau en dBFS et sa **part de grave**. Si elle dit « bruit grave : un filtre le réduira au mixage », c'est le profil de votre salle à générateurs. **Rien n'est bloqué.** |
| **2 · 10 s sans parler, micro externe** *(facultatif)* | Branchez votre micro de studio, choisissez-le dans « Microphone », refaites l'épreuve 1 | Le nom doit changer dans « Micro : … », et le bruit doit normalement descendre. C'est la comparaison qui m'intéresse, pas la valeur absolue. |
| **3 · 40 s en lisant** | Lisez un texte quelconque pendant 40 secondes | 8 morceaux, environ 3,8 Mo à 44 100 Hz. Aucun écrêtage. Le canal retenu doit rester le même du début à la fin : si un avis rouge dit que la prise contredit le canal retenu, **envoyez-le-moi**. |
| **4 · Fermeture en pleine prise** | Lancez une prise, parlez 30 s, **fermez l'onglet** sans arrêter. Rouvrez l'adresse | Un encadré « Reprendre la prise interrompue » indique combien de morceaux ont survécu, « relu dans IndexedDB, pas déduit ». |
| **5 · Micro coupé** | Pendant une prise, coupez l'entrée. **Sur ce Mac, le geste qui fonctionne est « Mode micro » du Centre de contrôle** (icône en haut à droite de la barre de menus) → choisir un mode qui coupe l'entrée, ou couper le volume d'entrée dans Réglages → Son → Entrée | Un bandeau rouge **« Aucun son reçu du micro »** en moins de 2 secondes, avec le numéro d'échantillon. À l'arrêt, la prise est marquée **MUETTE** — jamais « terminée ». |
| **6 · Onglet au fond 60 s** | Pendant une prise, passez à une autre application **60 secondes**, revenez | Le chronomètre doit avoir avancé d'environ 60 s, sans morceau manquant. Si Safari a suspendu l'audio, la barre du bas affiche « Piste : contexte suspended » — c'est l'information que j'attends. |

**Et une prise longue**, quand vous aurez le temps : **15 minutes d'un seul tenant** → 180 morceaux,
environ 86 Mo, rien qui ralentit, et un WAV qui s'ouvre.

---

## Où lire la fréquence

À trois endroits, qui doivent dire la même chose :

1. **La barre du bas**, pendant la prise : « Fréquence : 44100 Hz ».
2. **La fiche de la prise**, à droite, après l'arrêt.
3. **Le rapport JSON**, dans `frequence.reelle_hz`, avec `aReechantillonnerAuLot4` qui vaut `true`
   si vous n'êtes pas à 48 000 Hz.

Si vous êtes à **44 100 Hz**, c'est normal et attendu : j'ai mesuré que demander 48 000 ferait
interpoler votre voix en amont par le navigateur, sans rien y ajouter. Le lot 4 rééchantillonnera
une fois, avec un avis visible.

---

## Ce que je vous demande de me renvoyer

1. **Le fichier JSON** du bouton « Rapport de mesures », pour chaque épreuve. Il ne contient aucun
   son : des nombres, des états, un journal en échantillons, le nom du micro et les latences.
2. **Trois phrases** sur ce que vos oreilles disent du WAV : niveau juste ? souffle gênant ?
   claquements de touches ?
3. **Le texte de tout bandeau** que je n'ai pas annoncé.
4. Pour l'épreuve 6 : **le chronomètre avant et après** les 60 secondes.

Ne m'envoyez **aucun fichier WAV** : votre voix n'a rien à faire dans le dépôt, et je n'en ai pas
besoin pour lire les mesures. Si le nom de votre micro contient votre nom, remplacez-le par
« micro intégré » avant de m'envoyer le JSON.

---

## Mesuré, et à juger par vous

**Mesuré** (automatique, Chromium à 44 100 Hz, 37 contrôles, 48 mutations falsifiées, 0 trou) :
seuil de capture muette à 2,0000 s exactement, en échantillons · mixage sur le canal actif, la
moyenne sur un canal vide coûtant les **−6,02 dB** que E3 interdit · écrêtage exact à −32768 et
+32767 · morceaux à index continus et nombre entier de blocs de 128 · **écart de blocs nul** contre
le compteur de trames du fil audio · en-tête WAV identique, octet pour octet, à celui d'un second
générateur · reprise après fermeture exacte à l'échantillon · passe-bas du bruit mesuré à
**0,4999** à sa coupure de 120 Hz · 15 minutes = 180 morceaux, 86,4 Mo, 5 760 000 octets par minute.

**À juger par vous, et par personne d'autre** : la qualité sonore réelle de vos prises · le confort
du vu-mètre · si les trois états du bruit correspondent à ce que vos oreilles entendent dans votre
salle · et si 5 secondes par morceau est le bon compromis, sachant que c'est **ce que vous perdez
au maximum** si le Mac s'arrête net.

**Non vérifiable sans vous** : le micro intégré dans Safari, le geste exact qui coupe l'entrée sur
votre Mac, et ce que Safari fait de l'audio quand l'onglet passe au fond. Aucun test automatique ne
les atteint.

---

## Si quelque chose ne va pas

| Symptôme | Cause la plus probable |
|---|---|
| « Le banc n'a pas pu démarrer » | La page a été ouverte en `file://`. Il faut `http://127.0.0.1:8765`. |
| Le vu-mètre reste à « — » | Le micro n'a pas été autorisé, ou une autre application le tient. |
| « Micro : — » dans la barre du bas | L'autorisation n'a pas été accordée : sans elle, Safari ne donne aucun nom de périphérique. |
| « Persistance du stockage : demandée → false » | Normal et attendu : Safari refuse souvent. Il **peut** donc vider le stockage après sept jours sans visite — exportez vos WAV. |
| Un avis sur la fenêtre de décision du canal | Vous avez cliqué « Commencer » moins d'une seconde après l'autorisation. Laissez le vu-mètre tourner deux secondes. |
| Le niveau plafonne | Trop près du micro. Le rapport dira si des échantillons ont été écrêtés. |
