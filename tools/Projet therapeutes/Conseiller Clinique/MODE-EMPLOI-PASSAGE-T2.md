# Passage humain T2 — pause, reprise, continuation, import

Quatre épreuves, une demi-heure. **Sans casque et sans micro externe** : le micro du MacBook est
le seul. Votre Mac reste à **48 000 Hz** — aucun contrôle ne dépend plus de sa configuration, et
vous n'avez rien à régler.

Ce qui est nouveau depuis vos essais du 10 octobre : la prise peut se **mettre en pause** et
**reprendre** sans se couper en deux, elle se met en pause **d'elle-même** si le micro est perdu
(au lieu d'écrire des zéros pendant une minute), et on peut **continuer** une prise terminée,
récupérée après un crash, ou importée d'un fichier WAV.

```bash
cd ~/Documents/GitHub/C-Concept-Dev-lot3-wt/"tools/Projet therapeutes/Conseiller Clinique" && python3 -m http.server 8765 --bind 127.0.0.1
```

```
http://127.0.0.1:8765/banc-enregistreur.html
```

---

## Épreuve 1 · Pause et reprise

| Geste | Ce qui doit se passer |
|---|---|
| « Autoriser le micro », laissez tourner deux secondes, « Commencer la prise » | Badge **« Prise en cours »**, intitulé **« Enregistrement »**. |
| Parlez 10 s, puis **pressez Espace** (ou cliquez « Pause ») | Badge **« Prise en pause »**, intitulé **« Prise en pause »**, et le bouton devient **« Reprendre »**. Le vu-mètre **continue de bouger** si vous parlez : le micro reste ouvert, mais rien n'est enregistré. La ligne du bruit de pièce, elle, **ignore ce temps-là** : l'ambiance ne se prélève que dans l'audio écrit. |
| **Attendez 20 secondes sans rien faire**, puis pressez Espace de nouveau | Le badge revient à « Prise en cours ». |
| Parlez encore 10 s, « Arrêter la prise » | Une **seule** prise à droite, d'environ **20 secondes** — pas 40. C'est le point à vérifier : les 20 s de pause ne sont pas dans la voix. |
| « Exporter en WAV », ouvrez-le dans QuickTime | La voix doit s'enchaîner **sans trou de 20 secondes** au milieu. |

**Ce que je vous demande** : la durée annoncée par la fiche, la durée que QuickTime affiche, et
si le raccord s'entend ou non. Essayez aussi de **changer la touche** (« Apprendre une touche »,
puis pressez par exemple la touche `p`) et dites si c'est clair.

---

## Épreuve 2 · Fermeture d'onglet, puis « Continuer »

| Geste | Ce qui doit se passer |
|---|---|
| Commencez une prise, parlez **30 secondes** | Les morceaux défilent en bas à droite. |
| **Fermez l'onglet** sans arrêter la prise | — |
| Rouvrez l'adresse | Un encadré **« Reprendre la prise interrompue »** avec **deux** boutons : **« Continuer cette prise »** et « Récupérer ce qui a survécu ». Le compte annoncé est **relu dans le stockage**, pas déduit. |
| « Autoriser le micro », laissez tourner deux secondes, puis **« Continuer cette prise »** | Le badge repasse à « Prise en cours ». |
| Parlez encore 20 s, « Arrêter » | **Une seule prise**, d'environ **50 secondes**, et non deux prises de 30 et 20. |
| Exportez le WAV | Les deux moitiés doivent être **dans le même fichier**, dans l'ordre. |

**Ce que je vous demande** : le nombre de prises dans la liste (il doit être **un**), la durée
totale, et si le raccord s'entend.

---

## Épreuve 3 · Import d'un WAV, puis continuation

Prenez n'importe quel fichier `.wav` que vous avez sous la main — un export de Logic Pro convient,
en **PCM 16 ou 24 bits**, mono ou stéréo, à n'importe quelle fréquence.

| Geste | Ce qui doit se passer |
|---|---|
| « Importer une voix », choisissez le fichier | Un avis vert : nombre d'échantillons, **fréquence du fichier**, profondeur en bits, nombre de canaux, et le canal retenu avec sa raison. La prise apparaît avec le badge **« Importée »**. |
| Si le fichier n'est pas accepté | Un avis **rouge** qui dit pourquoi (par exemple « 8 bits : seuls 16 et 24 bits sont acceptés ») et **rien n'est écrit**. C'est le comportement voulu : dites-moi quel fichier, et je saurai quoi ajouter. |
| « Autoriser le micro », puis **« Continuer cette prise »** sur la fiche importée | Si votre fichier n'est **pas** à 48 000 Hz, un avis **orange** doit apparaître : « cette prise est à N Hz et le périphérique est à 48 000 Hz : la partie qui vient est rééchantillonnée vers N Hz ». C'est le point à vérifier. |
| Parlez 15 s, « Arrêter », exportez le WAV | Le fichier doit être à la fréquence **du fichier d'origine**, et votre voix doit s'y enchaîner **au bon rythme** — ni accélérée, ni ralentie. |

**Ce que je vous demande** : la fréquence de votre fichier, le texte exact de l'avis orange, et
surtout **si la partie que vous venez d'enregistrer joue à la bonne vitesse**. C'est la seule
chose qu'aucun test automatique ne peut juger pour vous.

---

## Épreuve 4 · Arrière-plan 70 secondes

| Geste | Ce qui doit se passer |
|---|---|
| Commencez une prise, parlez 10 s | — |
| Passez à une autre application **70 secondes**, puis revenez | Deux issues, et **les deux sont des informations** — c'est Safari qui décide, pas le Studio. |
| **Issue A — le micro n'est PAS perdu** : la barre du bas affiche « Contexte : running » | Le Studio a enregistré **pendant tout l'arrière-plan**. La durée finale est donc celle de l'horloge : **environ 90 secondes** (10 + 70 + 10), et le WAV contient 70 secondes de votre pièce vide. C'est correct : rien n'a été perdu. |
| **Issue B — le micro EST perdu** : un **bandeau rouge en haut de la fenêtre**, « Le micro a été perdu à l'échantillon N… La prise est EN PAUSE », avec **« Reprendre »** | Cliquez « Reprendre » : le micro se rouvre, la prise **continue** là où elle s'était arrêtée, et un avis dit à quel échantillon. La durée finale est alors **d'environ 20 secondes** : les 70 secondes d'arrière-plan ne sont pas dans le fichier, **ni sous forme de silence**. |
| Parlez 10 s, « Arrêter », exportez | Comparez la durée à celle de l'issue que vous avez eue — 90 s pour A, 20 s pour B. Une durée de 20 s avec « Contexte : running » tout du long, ou de 90 s après un bandeau de perte, serait un défaut : dites-le-moi. |

**Ce que je vous demande** : **laquelle des deux issues** s'est produite (la case « Contexte » de
la barre du bas le dit), le texte exact du bandeau s'il y en a eu un, la durée finale, et s'il y a
du silence au milieu du WAV.

---

## Comment couper le micro à la main (utile aux épreuves 1 et 4)

**Réglages Système → Son → Entrée → curseur « Volume d'entrée » à fond à gauche.** C'est le seul
geste qui coupe réellement l'entrée, et vos essais du 17 octobre l'ont établi : le **« Mode
micro » du Centre de contrôle ne coupe pas l'entrée** — il change le traitement du son, pas le
signal, et la prise continue d'enregistrer normalement. La consigne que je vous avais donnée était
fausse.

Avec le volume d'entrée à zéro, le signal devient un zéro numérique : le bandeau rouge doit tomber
en moins de deux secondes. Attention : **ce n'est pas la même chose qu'une perte de micro.** La
piste reste vivante et le contexte tourne ; le Studio dit donc « Aucun son reçu du micro » et
continue d'enregistrer du silence, ce qui est correct — un silence volontaire doit être
enregistré. La prise ne se met en pause d'elle-même que si la **piste** se termine (une autre
application prend le micro) ou si le **contexte** est interrompu.

---

## Ce que je vous demande de me renvoyer

1. **Le rapport JSON** (« Rapport de mesures ») pour chaque épreuve. Aucun son : des nombres, des
   états, et un journal en échantillons où vous verrez les **raccords** — chaque pause avec sa
   position et sa durée, chaque continuation avec l'échantillon où elle reprend.
2. **Les durées** : celle de la fiche, celle de QuickTime, et celle que vous attendiez.
3. **Le texte exact** de tout bandeau que je n'ai pas annoncé.
4. Pour l'épreuve 3 : **la vitesse de lecture** de la partie ajoutée.
5. **Le nombre de prises** dans la liste après chaque épreuve — c'est la mesure la plus simple et
   la plus parlante : une continuation ne doit jamais en créer une seconde.

Ne m'envoyez **aucun fichier WAV** : votre voix n'a rien à faire dans le dépôt.

---

## Ce qui n'est PAS fait, et que vous verrez

- **Pas de bande rythmo, pas de repères, pas de compte à rebours** : jalon II. Une pause est
  journalisée comme un raccord (position et durée), mais **rien ne la dessine** — la forme d'onde
  n'existe pas encore.
- **La reprise d'un PASSAGE** (R7) — refaire un morceau de texte avec une amorce — est une autre
  chose, et c'est une prise **séparée**. Elle n'existe pas à ce jalon. Ce que vous essayez ici est
  la **continuation** : prolonger la même prise.
- Si le micro est perdu **plus longtemps qu'un morceau** (5 secondes par défaut, 2 si vous
  choisissez cette durée), quelques zéros peuvent rester dans le morceau déjà clos. Le rapport dit
  alors combien, en échantillons, au lieu de le taire. Mesuré sur une perte ordinaire : **tous les
  zéros ont été retirés, aucun n'est resté**.
- Seuls les WAV **PCM 16 et 24 bits**, mono ou stéréo, sont importables. Les autres formats
  arrivent au jalon III réduit.
- **Le mixage ne perd plus 6 dB** (corrigé le 17 octobre, sur vos trois prises sur douze) :
  quand la fenêtre d'avant la prise voit deux canaux et que l'un meurt pendant, le canal mort
  n'entre plus dans la moyenne. Le rapport dit le canal **réellement utilisé** avec sa raison, et
  sur combien de canaux la moyenne a porté, échantillon par échantillon.
- **Sur une prise continuée, l'ambiance n'est pas mesurée** et le rapport le dit : une
  continuation n'a pas de silence initial. Le verdict de la première partie est cité tel quel.

**Mesuré automatiquement avant de vous le donner** : 67 contrôles, 101 mutations falsifiées sur
101, 0 trou. La pause ne touche pas un échantillon (compteur immobile, pause et reprise au même
échantillon) · le micro perdu met la prise en pause en moins d'une demi-seconde et **tous** les
zéros de la fin sont retirés · une continuation garde la même prise, le même identifiant, des
positions de morceaux qui se suivent sans trou · un import à 44 100 Hz continué sur un
périphérique à 48 000 Hz ajoute 220 500 échantillons pour 5 secondes, et non 240 000.
