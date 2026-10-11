# Banc de l'enregistreur — lot 3, jalon I · mode d'emploi

**Sans casque et sans micro externe.** Tout se fait sur le Mac, avec son micro et ses
haut-parleurs intégrés : c'est le seul micro, et c'est de lui seul que les mesures parlent. Le
jalon I ne joue aucun son, donc un casque ne changerait rien ici.

Capture et stockage seulement. Pas de bande rythmo, pas de repères, pas de compte à rebours, pas
de pause : ils arrivent plus tard. Rien n'est grisé — ce qui n'existe pas encore est absent de
l'écran.

**Aucun réseau.** Le banc ne parle à aucun serveur, ne lit ni ne pose aucune clé, et n'appelle
jamais le Worker. Votre voix ne quitte pas le Mac : elle va dans le stockage local de Safari.

> **Ce qui a changé depuis vos essais des 10 et 11 octobre** — huit défauts que vous avez relevés
> sont corrigés, et chacun se vérifie à l'écran :
>
> 1. **Le bruit de pièce ne se mesure plus en moyenne.** Il annonçait −63,9 dBFS « correct »
>    alors que les passages calmes de la même prise étaient à −74 à −76. La cause : quelques
>    clics de touche pèsent plus, dans une moyenne d'énergie, que deux secondes de silence. La
>    ligne affiche maintenant un **plancher** — le niveau sous lequel la pièce ne descend pas —
>    et dit combien de bruits brefs ont été écartés.
> 2. **Un micro muet n'est plus « calme ».** Il affichait « CALME — −∞ dB », ce qui est une
>    fausse assurance. Il affiche « AUCUN SIGNAL ».
> 3. **Le bandeau rouge avance.** Il disait « depuis 2,0 s » et n'en bougeait plus ; il compte
>    maintenant la durée réelle, et il reste **fixé en haut de la fenêtre** — où que vous en
>    soyez dans la page, il est visible.
> 4. **Les avis ne couvrent plus l'alerte.** « Prise récupérée » et « WAV exporté » ont leur
>    propre zone, sous l'alerte, et ne peuvent plus la repousser hors de vue.
> 5. **Rien ne survit à la prise suivante.** Les deux zones sont vidées au démarrage.
> 6. **« Enregistrement » devient « Dernière prise »** une fois la prise arrêtée.
> 7. **Trois cases au lieu d'une** dans la barre du bas : Piste, Contexte, Signal. La case
>    « Piste » affichait « contexte running » ou « son revenu », qui ne sont pas des états de
>    piste.
> 8. **Une prise inachevée affiche ce qu'elle a.** Elle disait « 0 morceau, 0,00 Mo » quand
>    l'encadré de reprise en retrouvait sept : elle relit désormais les morceaux et le dit.
>
> Et un état nouveau : une prise dont le signal disparaît **jusqu'à la fin** n'est plus annoncée
> « sonore avec un passage muet » mais **« signal perdu à l'échantillon N »**.

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
| 2 | « Autoriser le micro » | Safari demande l'autorisation. Ensuite la barre du bas affiche **« Micro : … »** avec le nom réel de votre micro, **« Fréquence : 44100 Hz »** (ou 48000), et **« Piste : vivante »**. Le vu-mètre bouge quand vous parlez. |
| 3 | Vous parlez normalement | Le chiffre descend vers **−30 dB environ**. Sous « Canal retenu » : « canal gauche — droit vide : canal actif pris tel quel, sans moyenne ». |
| 4 | **Laissez tourner deux secondes** avant de cliquer | Le canal se décide sur les **2 dernières secondes**. Si vous cliquez trop vite, un avis le dit et la décision se prend sur tout ce qui a été mesuré. |
| 5 | « Commencer la prise » | Badge « Prise en cours », **« Enregistrement »** suivi du chronomètre, et un morceau toutes les 5 secondes dans la barre du bas. Au bout de 3 s, la ligne **« Bruit de pièce : … »** se remplit, d'abord en mesure *provisoire*. |
| 6 | « Arrêter la prise » | Badge « Prise terminée », et l'intitulé devient **« Dernière prise »**. La ligne du bruit est **revue une dernière fois** : c'est cette valeur-là qui compte. La prise apparaît à droite avec sa durée, ses morceaux, son poids, sa fréquence et son canal. |
| 7 | « Exporter en WAV » | Un `.wav` arrive dans vos téléchargements. **Ouvrez-le dans QuickTime** : durée conforme, voix au niveau normal — ni deux fois trop faible, ni saturée. |
| 8 | « Rapport de mesures (JSON) » | Le fichier que je vous demande de me renvoyer. |

---

## Les cinq épreuves

| Épreuve | Geste | Ce qui doit se passer |
|---|---|---|
| **1 · 10 s sans parler** | « Commencer », **ne dites rien** pendant 10 s, « Arrêter » | La ligne « Bruit de pièce » doit donner un état — **calme**, **correct** ou **bruyant** — avec son **plancher** en dBFS, le nombre de fenêtres, et la valeur de la fenêtre entière à côté. Si elle dit « bruit grave : un filtre le réduira au mixage », c'est le profil de votre salle à générateurs. **Rien n'est bloqué.** |
| **2 · 40 s en lisant** | Lisez un texte quelconque pendant 40 secondes | 8 morceaux, environ 3,8 Mo à 44 100 Hz. Aucun écrêtage. La ligne du bruit doit dire **« silence initial non tenu »** et avoir prélevé l'ambiance **dans une pause** : c'est voulu, et c'est ce que je veux voir. Le canal retenu doit rester le même du début à la fin : si un avis rouge dit que la prise contredit le canal retenu, **envoyez-le-moi**. |
| **3 · Fermeture en pleine prise** | Lancez une prise, parlez 30 s, **fermez l'onglet** sans arrêter. Rouvrez l'adresse | Un encadré « Reprendre la prise interrompue » indique combien de morceaux ont survécu, « relu dans IndexedDB, pas déduit » — et **la fiche de la prise, à droite, doit annoncer le même nombre**, jamais 0. |
| **4 · Micro coupé** | Pendant une prise, coupez l'entrée. **Sur ce Mac, le geste qui fonctionne est « Mode micro » du Centre de contrôle** (icône en haut à droite de la barre de menus) → choisir un mode qui coupe l'entrée, ou couper le volume d'entrée dans Réglages → Son → Entrée | Un bandeau rouge **« Aucun son reçu du micro »** en moins de 2 secondes, avec le numéro d'échantillon **et une durée qui AVANCE** — c'est le point à vérifier. À l'arrêt, le bandeau devient **gris** et raconte au passé ; la prise est marquée **MUETTE** si tout était à zéro, ou **SIGNAL PERDU** si elle avait commencé normalement. |
| **5 · Onglet au fond 60 s** | Pendant une prise, passez à une autre application **60 secondes**, revenez | Le chronomètre doit avoir avancé d'environ 60 s, sans morceau manquant. Si Safari a suspendu l'audio, la barre du bas affiche **« Contexte : suspended »** — dans sa propre case, et « Piste » garde la sienne. C'est l'information que j'attends. |

**Et une prise longue**, quand vous aurez le temps : **15 minutes d'un seul tenant** → 180 morceaux,
environ 86 Mo, rien qui ralentit, et un WAV qui s'ouvre.

---

## Comment lire la nouvelle ligne du bruit

Elle ressemble à ceci :

```
Bruit de pièce : CALME — plancher −75,0 dB (20e centile de 30 fenêtres de 100 ms,
silence initial) · part de grave 0,006 (passe-bas 120 Hz) · fenêtre entière −64,5 dB
efficace · 8 bruit(s) bref(s) écarté(s)
```

- **Le plancher** décide de l'état. C'est le 20e centile des niveaux de fenêtres de 100 ms : le
  niveau sous lequel la pièce ne descend pas. Les seuils sont ceux du cahier des charges et n'ont
  pas changé : **calme jusqu'à −65 dBFS, correct de −65 à −58, bruyant au-dessus de −58**.
- **La fenêtre entière** est l'ancien calcul, gardé exprès à côté. Sur un bruit continu les deux
  valeurs s'accordent à une fraction de décibel. Si elles s'écartent de plus de quelques dB, c'est
  qu'il y a eu des bruits brefs — et c'est le plancher qui décrit votre pièce.
- **Les bruits brefs écartés** sont comptés et datés dans le rapport, en échantillons. Un bruit
  bref est une montée de plus de 12 dB au-dessus de la fenêtre la plus calme, qui dure moins de
  300 ms. Au-delà de 300 ms, c'est de la voix, et le silence initial est déclaré non tenu.
- **« silence initial non tenu »** n'est pas un reproche : cela veut dire que vous avez parlé dans
  les trois premières secondes, et que l'ambiance a donc été prélevée **dans la pause la plus
  calme de la prise**. Le rapport dit à quel échantillon.
- **La part de grave** est calculée sur les seules fenêtres du plancher, et le passe-bas de 120 Hz
  est une **pente**, pas un mur : à 120 Hz pile il laisse passer la moitié de l'énergie. Ce
  rapport n'est donc pas « le pourcentage d'énergie sous 120 Hz ».

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

> **La sortie de votre Mac est aujourd'hui à 48 000 Hz, et c'est moi qui l'y ai mise** : un essai
> que j'ai écrit le 10 octobre forçait la fréquence du contexte audio, ce qui a basculé celle du
> périphérique, durablement. Le levier est retiré. **Vous n'avez rien à faire** : vous avez décidé
> le 11 octobre que la machine resterait à 48 000 Hz, et aucun contrôle ne dépend plus de sa
> configuration — ni ne la lit. Si vous souhaitez un jour revenir à 44 100 Hz, c'est
> **Configuration audio et MIDI → Haut-parleurs → Format**, et rien d'autre ne s'en trouvera
> changé.

---

## Ce que je vous demande de me renvoyer

1. **Le fichier JSON** du bouton « Rapport de mesures », pour chaque épreuve. Il ne contient aucun
   son : des nombres, des états, un journal en échantillons, le nom du micro et les latences.
2. **Les trois latences de VOTRE Safari** (`latences.entree_s`, `base_s`, `sortie_s`) : elles sont
   dans le JSON, et ce sont elles qui compteront pour le lot 3B — les miennes viennent d'un
   Chromium de test et ne valent pas pour votre machine.
3. **Trois phrases** sur ce que vos oreilles disent du WAV : niveau juste ? souffle gênant ?
   claquements de touches ?
4. **Le texte de tout bandeau** que je n'ai pas annoncé.
5. Pour l'épreuve 1 : **est-ce que l'état du bruit correspond à ce que vos oreilles entendent ?**
   C'est le seul juge de l'estimateur, et aucun contrôle automatique ne peut le remplacer.
6. Pour l'épreuve 5 : **le chronomètre avant et après** les 60 secondes.

Ne m'envoyez **aucun fichier WAV** : votre voix n'a rien à faire dans le dépôt, et je n'en ai pas
besoin pour lire les mesures. Si le nom de votre micro contient votre nom, remplacez-le par
« micro intégré » avant de m'envoyer le JSON.

---

## Mesuré, et à juger par vous

**Mesuré** (automatique, Chromium, **55 contrôles · 73 mutations falsifiées sur 73, toutes
conformes, 0 trou**) : seuil de
capture muette à 2,0000 s exactement, en échantillons · mixage sur le canal actif, la moyenne sur
un canal vide coûtant les **−6,02 dB** que E3 interdit · écrêtage exact à −32768 et +32767 ·
morceaux à index continus et nombre entier de blocs de 128 · **écart de blocs nul** contre le
compteur de trames du fil audio · en-tête WAV identique, octet pour octet, à celui d'un second
générateur · reprise après fermeture exacte à l'échantillon · passe-bas du bruit mesuré à
**0,4999** à sa coupure de 120 Hz · 15 minutes = 180 morceaux, 86,4 Mo, 5 760 000 octets par
minute.

**Mesuré sur l'estimateur du bruit**, sur quatre pièces fabriquées par le calcul :

| pièce de référence | plancher | fenêtre entière | écart |
|---|---|---|---|
| pièce calme (−72 dBFS) | −72,05 | −72,01 | 0,04 dB |
| salle à générateurs (−56,8 dBFS) | −56,82 | −56,80 | 0,02 dB |
| plancher à −75 avec clics à −58 | **−75,03 → calme** | **−64,49 → « correct »** | **10,5 dB** |
| voix dès 0,3 s, pauses à −75 | −75,00 (prise dans la pause) | −38,46 | 36 dB |

Les deux premières lignes disent que le nouveau calcul **ne baisse rien** sur un bruit continu :
votre salle à générateurs reste bruyante, et grave. La troisième est votre défaut, mesuré.

Sept de ces mutations n'étaient, un temps, décidables qu'à une fréquence autre que 48 000 Hz — à
48 kHz, 5 secondes font 240 000 échantillons, déjà un nombre entier de blocs de 128, si bien que
« taille demandée » et « taille appliquée » coïncident. Elles le sont désormais **sans toucher à
votre machine** : le vrai worklet tourne dans un contexte audio *différé*, qui calcule à
44 100 Hz sans ouvrir aucun périphérique, et les règles du module sont éprouvées comme fonctions
de la fréquence. **Aucun contrôle ne dépend plus de la configuration audio de votre Mac**, et la
sonde qui la lisait a été supprimée.

**À juger par vous, et par personne d'autre** : la qualité sonore réelle de vos prises · le confort
du vu-mètre · si les trois états du bruit correspondent à ce que vos oreilles entendent dans votre
salle · et si 5 secondes par morceau est le bon compromis, sachant que c'est **ce que vous perdez
au maximum** si le Mac s'arrête net.

**Non vérifiable sans vous** : le micro intégré dans Safari, le geste exact qui coupe l'entrée sur
votre Mac, et ce que Safari fait de l'audio quand l'onglet passe au fond. Aucun test automatique ne
les atteint.

### Ce qui n'est PAS corrigé, et que vous verrez encore

Quand la piste audio se termine en pleine prise — une autre application prend le micro —, le
cahier des charges (E8) demande que **la prise se mette en pause**. La pause appartient à la tâche
suivante (T1 ter). En attendant, la barre du bas dira correctement « Piste : terminée » et le
journal portera l'instant exact, **mais la prise continuera d'écrire des zéros jusqu'à votre
arrêt**. C'est la seule dette connue de cette tâche, et elle est écrite ici pour que vous ne la
découvriez pas à l'usage.

### Les latences : lisez les vôtres, pas les miennes

Le rapport donne trois latences — entrée, base, sortie. **Les chiffres que j'ai cités jusqu'ici
viennent du Chromium de mes tests, pas de votre Safari.** Vos propres relevés du 10 octobre dans
Safari donnent : sortie 1,04 ms, base 2,67 ms, entrée indisponible. Chaque rapport porte le champ
`latences.mesureesSur`, qui dit sur quel navigateur et quelle machine il a été produit, et un
avertissement en toutes lettres.

Ce qui m'intéresse, ce sont **vos** valeurs : ce sont elles qui serviront au calibrage
micro–haut-parleur du lot 3B. La latence de sortie se lit à l'arrêt de la prise, graphe en marche :
lue à la création du contexte, elle vaut 0, ce qui ressemble à une mesure et n'en est pas.

---

## Si quelque chose ne va pas

| Symptôme | Cause la plus probable |
|---|---|
| « Le banc n'a pas pu démarrer » | La page a été ouverte en `file://`. Il faut `http://127.0.0.1:8765`. |
| Le vu-mètre reste à « — » | Le micro n'a pas été autorisé, ou une autre application le tient. |
| « Micro : — » dans la barre du bas | L'autorisation n'a pas été accordée : sans elle, Safari ne donne aucun nom de périphérique. |
| « Bruit de pièce : AUCUN SIGNAL » | Le micro n'a rien livré pendant la mesure. Ce n'est pas une pièce calme : vérifiez le Mode micro et le volume d'entrée. |
| « Bruit de pièce : NON CONCLUANT » | La prise a été arrêtée avant la première fenêtre de 100 ms. Laissez-la courir au moins trois secondes. |
| « Persistance du stockage : demandée → false » | Normal et attendu : Safari refuse souvent. Il **peut** donc vider le stockage après sept jours sans visite — exportez vos WAV. |
| Un avis sur la fenêtre de décision du canal | Vous avez cliqué « Commencer » moins d'une seconde après l'autorisation. Laissez le vu-mètre tourner deux secondes. |
| Le niveau plafonne | Trop près du micro. Le rapport dira si des échantillons ont été écrêtés. |
