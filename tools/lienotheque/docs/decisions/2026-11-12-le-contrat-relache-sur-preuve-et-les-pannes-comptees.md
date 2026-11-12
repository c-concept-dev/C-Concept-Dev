# Le contrat relâché sur preuve, les pannes enfin comptées, et le port 2 renvoyé à l'étape 3

**Décision de Christophe le 12 novembre 2026**, en cinq points, dont trois le concernent
directement :

> « Contrat `ZoneLue` relâché sur preuve (40 cas) : « `numero: null` » avec confiance = case relue,
> rien de lisible ; jamais une valeur, compté à part des pannes. Test rouge d'abord. Redéploiement
> AUTORISÉ du seul Worker de la Liénothèque, configuration et secrets inchangés ; jamais
> `clone-proxy` ni `therapeute-library`. Puis remesure à blanc 48 → ?, coût rapporté. »
> « Corrige le relevé de Vérifier pour qu'il compte les pannes de l'étage distant (dans ce lot). »
> « Le port 2 (Vision sur les repères) passe à l'étape 3, avec la règle de corroboration. L'étape 1
> se termine avec le port 1, les pannes comptées, Vérifier, et la mesure. »

---

## 1. Le contrat refusait une réponse qu'il avait lui-même demandée

### La preuve, et elle est chiffrée

La mesure du 12 novembre, par la porte, sur un document réel : l'étage distant comptait **62
demandes, 19 rendus, 40 pannes**. Quarante pannes sur soixante-deux, et ce n'était pas le réseau.
La sonde `a2-sonder-la-route-de-relecture.ts` a reproduit la cause **3 fois sur 3** :

```
statut 502 : La réponse du modèle n'est pas conforme au contrat
  — zones.0.confiance : Rien de lu ne se dit pas avec une confiance
```

Le modèle répondait « je n'ai rien pu lire, et j'en suis sûr » — `numero: null`, `confiance: 0,95`.
`ZoneLue` exigeait une confiance **nulle** dès que `numero` était nul et qu'aucun verdict de repère
n'accompagnait la réponse.

### Pourquoi le contrat avait tort, et pas le modèle

Trois raisons, dans l'ordre où elles pèsent :

1. **La consigne du Worker demande cette réponse.** `CONSIGNES.numero` dit au modèle : « Si aucun
   nombre n'est lisible, rends `null` » **et** « Rends ta confiance de 0 à 1 : elle porte sur
   l'ensemble de ta réponse pour cette image ». Un modèle qui obéit aux deux phrases produit
   exactement la forme que le contrat refusait. La route se contredisait d'un bout à l'autre.
2. **L'information perdue n'était portée par rien d'autre.** « J'ai regardé, rien n'est lisible »
   et « personne n'a pu regarder » sont deux faits distincts, et seul le premier dit que la case
   est **relue**. En transformant l'un en l'autre, le contrat fabriquait des pannes — c'est-à-dire
   le trou qui ressemble au succès, à l'envers : une route intacte déclarée coupée.
3. **La même règle avait déjà été reconnue fausse une fois**, pour les réponses portant un verdict
   de repère : « le repère est là, ses chiffres sont illisibles, et j'en suis sûr ». Son propre
   commentaire disait alors : « c'est le contrat qui avait tort — relâché **sur preuve**, pas par
   commodité ». La relecture des cases montre qu'elle était fausse pour l'autre moitié des cas,
   celle où aucun verdict n'est demandé.

### Ce que le relâchement ne touche pas

Les bornes de la confiance (`1,2` et `-0,1` restent refusés), le fait qu'un numéro soit un numéro
de cellule (`0` reste refusé), et la contradiction « un repère absent ne porte aucun nombre ». Deux
contrôles neufs le tiennent, parce que relâcher une règle n'ouvre pas les autres.

### Le contrôle rouge, d'abord

`packages/contrats/test/contrats.test.ts`, avant le code :

```
AssertionError: expected false to be true
 ❯ test/contrats.test.ts:337  ZoneLue.safeParse(lue({ numero: null, confiance: 0.8 })).success
```

Puis 50 contrôles sur 50.

### Deux contrôles du Worker employaient cette faute comme exemple

Et ils sont devenus rouges, ce qui est le signe que le relâchement **mord** : `{ numero: null,
confiance: 0.8 }` servait d'exemple de réponse hors contrat, et `{ numero: null, confiance: 0.7 }`
d'exemple de champ fautif à nommer. Remplacés par des fautes qui restent des fautes — `numero: 0`,
un repère `absent` portant un nombre, une confiance de `1,7` qui nomme le même champ. Et un
contrôle de plus exige l'inverse : que la route **accepte** la réponse sûre et vide, aux trois
confiances 0,5, 0,95 et 1. 288 contrôles sur 288.

### Le Worker redéployé, et la preuve que la route a changé

`lienotheque-api`, version **827dd395-d8e7-4d6f-b138-718f728e0c92**. Configuration figée et
secrets inchangés : les quatre liaisons annoncées au déploiement sont celles de `wrangler.toml`
(`REGISTRE`, `BIB_1`, `MEDIAS`, `AI`), aucun secret posé ni modifié. `clone-proxy` et
`therapeute-library` n'ont pas été touchés, et ne pouvaient pas l'être : le déploiement est passé
par `--config wrangler.toml` depuis `apps/worker`, jamais depuis la racine.

**La même sonde, la même route, avant et après** — c'est la preuve par mutation de la réparation :

| | statut | ce que la route rend |
|---|---|---|
| avant | **502 × 3/3** | « zones.0.confiance : Rien de lu ne se dit pas avec une confiance » |
| après | **OK × 3/3** | `{"numero":null,"confiance":0.95}`, jetons 1 057 / 54 |

---

## 2. Le relevé de Vérifier annonçait zéro panne quand quarante avaient eu lieu

### La cause, et elle n'était pas visible

`relecteurEnChaine` compte sa panne, passe la main au prochain étage, et **ne lève pas**. C'est ce
qu'il faut qu'il fasse : un document de cent pages ne doit pas s'arrêter sur une coupure. Mais
alors **rien ne s'échappe**, et `tablesRelues` ne comptait que ce qui s'échappe — donc zéro,
toujours, quoi qu'il arrive. Vérifier aurait affirmé que la route était intacte au moment même où
elle refusait deux réponses sur trois.

### La réparation : le port rend aussi de quoi dire ses pannes

Le port de relecture des cases avait pour forme `(imageDeLaPage) => RelecteurDeZone`. Il devient
`(imageDeLaPage) => { relire, pannes? }` — un type nommé, `RelectureComposee`. L'appelant qui
compose les étages est le seul à pouvoir les interroger, et c'est lui qui le fait : la Porte rend
`pannes: () => chaine.releve().reduce(…)`.

Le relevé additionne donc **deux moitiés** : les pannes avalées par un étage, et celles qui
remontent jusqu'à la voie. Une panne est l'une ou l'autre, jamais les deux, donc rien n'est compté
deux fois. Et un port qui ne sait pas dire ses pannes rend la moitié qu'il connaît, au lieu de
rendre zéro en silence.

### Deux contrôles rouges d'abord, dont un à deux étages d'écart

Le premier au typage : `error TS2305: Module './relire-les-zones.js' has no exported member
'PortDeRelectureDesCases'`. Le second sur sa valeur, par la **porte** — parce que le fil entre la
chaîne et l'écran ne se prouve qu'en le suivant d'un bout à l'autre. **Preuve par mutation** : en
retirant la seule ligne de `executant.ts` qui expose les pannes, le contrôle rend
`expected 0 to be greater than or equal to 1` — le défaut mesuré, reproduit à l'identique.

### Et une case relue dont rien n'était lisible se compte à part

`ReleveDeVision` gagne `illisibles`. Ce n'est ni un rendu, ni une panne, ni un refus : c'est une
case qu'on a payé pour regarder et qui n'avait rien à donner. Le journal le dit, et un contrôle
exige les quatre comptes séparés sur la même réponse.

---

## 3. Le port 2 passe à l'étape 3, avec la règle de corroboration

Je n'ai **pas** branché Vision au bout du port des repères, et je l'avais dit avant que Christophe
ne tranche. La raison est dans le code : le coordinateur des repères est tenu de **jeter** une
valeur non corroborée — `corroborer: () => false` — et la règle de corroboration est une décision
de produit qui relève du § 3.2, zéro faux lien. Brancher sans elle paierait un appel en ligne pour
une valeur que le code doit écarter : très exactement le défaut que l'étape 1 existe pour retirer.

S'y ajoute un fait de mesure : sur ce document, **aucun endroit n'est retenu**, donc le
coordinateur n'est jamais atteint, et le port 2 n'aurait rien pu contribuer au gain mesuré.

Le cahier est à jour : l'étape 1 se ferme sur le port 1, les pannes comptées, Vérifier et la
mesure ; l'étape 3 reçoit le port 2 **avec** sa règle, à côté du seuil de corroboration qu'elle
porte déjà.

---

## 4. Ce que la remesure a donné

Même document, même plafond de 0,30 €, même cache, contrat relâché et Worker redéployé.
**1 074,9 s.** Rien n'a été écrit dans la bibliothèque.

| | avant le relâchement | après |
|---|---|---|
| liens | 48 → **51** | 48 → **51** |
| orphelins | `[22]` | `[22]` |
| liens perdus | aucun | aucun |
| lecture | `0 / 113 / 3`, identique au publié | **identique** |
| regard distant, demandé/rendu/**panne** | 62 / 19 / **40** | 62 / 19 / **0** |
| appels partis | 22 | 40 (+ 22 depuis le cache) |
| cases relues sans rien de lisible | *non compté* | **40** |
| coût | 0,0283 € | **0,0507 €** cumulé |
| cases restées sans valeur | 43 | **43**, les mêmes |

### La réponse à ma propre réserve, et elle est négative

J'avais écrit, en rapportant la première mesure : « **51 est un plancher, pas un plafond** », parce
que 40 des 62 lectures distantes n'avaient jamais eu lieu. La réserve était juste à poser ; la
mesure y répond, et **contre mon hypothèse**. Les 40 lectures ont eu lieu, aucune n'a levé, et
**les 40 ont répondu « rien de lisible »**. Le contrat ne cachait donc aucun lien : il cachait
quarante abstentions sincères. Le gain reste **48 → 51**, et il est maintenant **mesuré** et non
plus borné.

Les comptes se recoupent exactement, ce qui est la façon de vérifier qu'on lit bien ce qu'on croit :
62 demandes au regard distant = 19 rendus + 3 refusées hors vivier + 40 illisibles ; et 40 appels
partis + 22 depuis le cache = 62. Les 22 du cache sont précisément celles qui avaient abouti la
première fois, donc payées une seule fois.

### Ce que cette mesure prouve en plus, sans l'avoir cherché

**La géométrie des recadrages est juste.** C'était le risque le plus coûteux de tout ce lot — un
recadrage mal placé fait lire du papier blanc au tarif d'un appel en ligne, et le symptôme serait
exactement celui-ci : beaucoup de « rien de lisible ». La preuve qu'il ne s'agit pas de cela : sur
les 62 mêmes cases, passées par le même code, **19 rendent un nombre juste et 3 un nombre hors
vivier** — donc 22 crops sur 62 portent bien des chiffres lisibles, à la bonne place. Un décalage
systématique n'en aurait laissé passer aucun.

**Le relevé dit « 0 panne », et cette fois c'est vrai.** Ce n'est pas cette mesure qui prouve la
correction du comptage — un vrai zéro ressemble à un faux zéro, c'est tout le problème. C'est la
preuve par mutation du § 2 qui la prouve.

### Et le 52ᵉ lien n'est pas un défaut de lecture

Sur la page 5 — la table qui publie — il reste **7 cases sans valeur**, aux rangées 2, 13, 40
et 51. L'élément 22, seul orphelin, n'y est pas : **les liens 21 et 23 sont publiés**, et sa rangée
n'est pas au nombre des cases non relues. Ce qui manque à ce document n'est donc pas une case
illisible : c'est une **corroboration**. Ce constat n'est pas poussé plus loin ici — il demande de
lire la table telle que le détecteur la voit, ce qui est le travail de l'étape 3, et c'est une
raison de plus pour que le port 2 y soit parti avec sa règle.

---

## 5. Le trou Rust, réparé — et il fallait deux parties

`lienotheque-tauri.yml` ne se déclenchait que sur `main` : deux semaines de poussées Rust sur
`wip/**` n'ont été vérifiées par personne. Mais `wip/**` seul n'aurait rien réparé pour les trois
fichiers qui ont révélé le trou, parce que ce workflow lance `cargo test` — qui ne compile **aucun**
exemple — puis **un seul** exemple nommé. Les vingt-deux autres n'étaient compilés nulle part.

Les deux parties sont donc appliquées : `branches: [main, 'wip/**']`, filtres de chemins inchangés,
et une étape `cargo build --release --examples`. Éprouvée avant la poussée : `cargo check
--examples` finit en 22 s ici, code de sortie 0 pour les 23 exemples.

**Windows** : il est déjà hors de la matrice depuis la décision du 5 novembre (`os:
[macos-latest]`) ; seules les étapes `if: runner.os == 'Windows'` subsistent, gardées volontairement
et jamais exécutées. Le tableau de `CLAUDE.md` annonce encore « macOS et Windows » pour ce
workflow : **il est périmé**, et je ne l'ai pas corrigé sans le mot de Christophe.

---

## 6. Une faute de méthode qui a coûté deux CI rouges dans la même journée

Il faut qu'elle soit écrite ici, parce qu'elle s'est produite **deux fois** le 12 novembre, de deux
façons différentes, et que les deux fois j'ai annoncé un contrôle accepté.

1. **Course 43215284978, les deux travaux rouges.** J'ai écrit la décision du jour **pendant** que
   le contrôle complet tournait, en me disant qu'un document ne change pas son verdict. Faux :
   `docs/decisions/` est **lu par un garde-fou**, et l'exception du § 4.4 exclut précisément les
   fichiers lus par les garde-fous. Le contrôle rapporté ne portait donc pas sur l'arbre commité.
2. **Course 43242544864, `Vérification (ubuntu-latest)` rouge.** Cinq contrôles sur six du nouveau
   fichier de la Porte, tous sur `spawnSync tesseract ENOENT`. `lienotheque-ci.yml` n'installe
   Tesseract **que sur macOS**, et délibérément — avec les octets exacts du paquet. Le contrôle
   local ne pouvait pas le voir : cette machine a Tesseract. Réparé par l'idiome déjà en place dans
   ce dépôt, `const siTesseract = tesseractDisponible() ? it : it.skip`, qui dit « pas éprouvé ici »
   au lieu de dire « cassé ».

**La leçon, et elle est générale** : un contrôle complet local ne couvre ni les documents écrits
après son lancement, ni les trois systèmes de la CI. Un contrôle neuf qui franchit
`executerTravail` doit se demander, avant d'être poussé, ce que la machine la plus pauvre de la CI
ne possède pas.
