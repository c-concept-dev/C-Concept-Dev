# Banc de l'enregistreur — lot 3, jalon I · mode d'emploi

Capture et stockage seulement. Pas de bande rythmo, pas de repères, pas de compte à rebours :
ils arrivent au jalon II. Rien n'est grisé — ce qui n'existe pas encore est absent de l'écran.

**Aucun réseau.** Le banc ne parle à aucun serveur, ne lit ni ne pose aucune clé, et n'appelle
jamais le Worker. Votre voix ne quitte pas le Mac : elle va dans le stockage local de Safari.

---

## La commande

Une seule, à coller dans le Terminal. Elle sert la page sur `127.0.0.1`, ce qui est
indispensable : sans cela Safari refuse le micro et refuse de charger le worklet audio.

```bash
cd ~/Documents/GitHub/C-Concept-Dev-lot3-wt/"tools/Projet therapeutes/Conseiller Clinique" && python3 -m http.server 8765 --bind 127.0.0.1
```

Puis, dans Safari :

```
http://127.0.0.1:8765/banc-enregistreur.html
```

Pour arrêter le serveur : `Ctrl+C` dans le Terminal.

> `?atelier-local=1` ne concerne PAS cette page : cette porte est celle de l'application, et elle
> vit sur la branche du lot 2. Le banc est une page à part, qui n'a pas d'écran de connexion.

---

## Ce que vous devez voir, dans cet ordre

| # | Geste | Ce qui doit apparaître |
|---|---|---|
| 1 | La page s'ouvre | « Prêt » en haut à droite du panneau. En bas à droite, une ligne « Persistance du stockage : demandée → … » avec le quota. Aucune prise listée : « Aucune prise sur cet ordinateur ». |
| 2 | « Autoriser le micro » | Safari demande l'autorisation. Après acceptation, la liste « Microphone » se remplit et le vu-mètre **bouge quand vous parlez**. |
| 3 | Vous parlez normalement | Le chiffre à droite de « Niveau du microphone » descend vers **−30 dB environ**, et la ligne en dessous donne l'amplitude et la crête. Sous « Canal retenu » : « Canal qui serait retenu : canal gauche — droit vide : canal actif pris tel quel, sans moyenne ». |
| 4 | « Commencer la prise » | Le badge passe à « Prise en cours », le chronomètre avance, et la barre du bas compte les morceaux (un toutes les 5 secondes). |
| 5 | Parlez 5 minutes, puis « Arrêter la prise » | Badge « Prise terminée ». La prise apparaît à droite avec sa durée, son nombre de morceaux, son poids, son échantillonnage et son canal. |
| 6 | « Exporter en WAV » | Un fichier `.wav` arrive dans vos téléchargements. **Ouvrez-le dans QuickTime** : il doit durer exactement ce qu'annonçait le banc, et votre voix doit être au niveau normal — ni deux fois trop faible, ni saturée. |
| 7 | « Rapport de mesures (JSON) » | Un fichier JSON. C'est lui que je vous demande de me renvoyer (voir plus bas). |

### Les quatre épreuves qui comptent

| Épreuve | Geste | Ce qui doit se passer |
|---|---|---|
| **Micro coupé (E8)** | Pendant une prise, coupez le micro par **« Mode micro » du Centre de contrôle** de macOS | Un bandeau rouge **« Aucun son reçu du micro »** en moins de 2 secondes, avec le numéro d'échantillon. À l'arrêt, la prise est marquée **MUETTE** — jamais « terminée ». |
| **Fermeture accidentelle (E5)** | Lancez une prise, parlez 30 s, **fermez l'onglet** sans arrêter. Rouvrez l'adresse | Un encadré « Reprendre la prise interrompue » indique combien de morceaux ont survécu, « relu dans IndexedDB, pas déduit ». « Récupérer ce qui a survécu » la remet dans la liste. |
| **Onglet au fond** | Pendant une prise, passez à une autre application **60 secondes**, puis revenez | Le chronomètre doit avoir avancé d'environ 60 s et aucun morceau ne doit manquer. Si Safari a suspendu l'audio, la barre du bas affiche « Piste : contexte suspended » — c'est l'information que j'attends. |
| **Prise longue** | Une prise de **15 minutes** d'un seul tenant | 180 morceaux, environ 86 Mo. Rien ne doit ralentir, et le WAV doit s'ouvrir. |

---

## Ce que je vous demande de me renvoyer

1. **Le fichier JSON** du bouton « Rapport de mesures », pour chaque prise notable. Il ne contient
   aucun son : seulement des nombres, des états et un journal en échantillons.
2. **Trois phrases** sur ce que vos oreilles disent du WAV : niveau juste ? souffle gênant ?
   claquements de touches ?
3. **Le texte du bandeau** si vous en voyez un que je n'ai pas annoncé.
4. Pour l'onglet au fond : **le chronomètre avant et après** les 60 secondes.

Ne m'envoyez **aucun fichier WAV** : votre voix n'a rien à faire dans le dépôt, et je n'en ai pas
besoin pour lire les mesures.

---

## Mesuré, et à juger par vous

**Mesuré** (automatique, Chromium à 44 100 Hz, 25 contrôles, 29 mutations falsifiées) : seuil de
capture muette à 2,0000 s exactement, en échantillons ; mixage sur le canal actif, la moyenne sur
un canal vide coûtant les −6,02 dB que E3 interdit ; écrêtage exact à −32768 et +32767 ; morceaux
à index continus, nombre entier de blocs de 128 ; **écart de blocs nul**, mesuré contre le
compteur de trames du fil audio ; en-tête WAV identique, octet pour octet, à celui d'un second
générateur indépendant ; reprise après fermeture exacte à l'échantillon ; 15 minutes = 180
morceaux, 86,4 Mo, 5 760 000 octets par minute.

**À juger par vous, et par personne d'autre** : la qualité sonore réelle de vos prises ; le confort
du vu-mètre ; et si 5 secondes par morceau est le bon compromis, sachant que c'est **ce que vous
perdez au maximum** si le Mac s'arrête net.

**Non vérifiable sans vous** : le micro intégré dans Safari, la réponse de « Mode micro », et ce
que Safari fait de l'audio quand l'onglet passe au fond. Aucun test automatique ne les atteint.

---

## Si quelque chose ne va pas

| Symptôme | Cause la plus probable |
|---|---|
| « Le banc n'a pas pu démarrer » | La page a été ouverte en `file://`. Il faut passer par `http://127.0.0.1:8765`. |
| Le vu-mètre reste à « — » | Le micro n'a pas été autorisé, ou une autre application le tient. |
| « Persistance du stockage : demandée → false » | Normal et attendu : Safari refuse souvent. Cela veut dire qu'il **peut** vider le stockage après sept jours sans visite — exportez vos WAV. |
| Le niveau plafonne | Trop près du micro. Le rapport dira si des échantillons ont été écrêtés. |
