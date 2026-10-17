// ── LOT 3, JALON I — LE WORKLET DE CAPTURE ──────────────────────────────────────────────────
//
// Fichier SÉPARÉ et OBLIGATOIREMENT servi : `audioWorklet.addModule()` charge ce fichier dans un
// AUTRE contexte global (AudioWorkletGlobalScope). Rien de `window` n'existe ici — pas de DOM,
// pas d'IndexedDB. C'est aussi pourquoi l'enregistrement n'existe pas depuis un fichier d'export
// ouvert du disque (E1 du CDC).
//
// CE QUE CE FICHIER FAIT, ET RIEN DE PLUS : il voit les échantillons. Donc il les COMPTE, il les
// ACCUMULE bruts, il les mixe en mono sur le canal QU'ON LUI DIT, il les verse en entiers 16 bits
// dans des morceaux, et il surveille le zéro numérique.
//
// CE QU'IL NE FAIT PAS, ET POURQUOI : il ne calcule ni décibel, ni corrélation, ni verdict de
// canal. Ces trois grandeurs sont aussi nécessaires au rapport de mesures, sur le fil principal.
// Les calculer ici AUSSI ferait deux formules pour une même grandeur — la régression #11(f) de la
// gouvernance, celle du « 4 étapes à scinder » contre « 0 à scinder », chacune vraie sous sa
// propre règle. Une grandeur, une fonction : le worklet poste les SOMMES BRUTES, et le module
// est le seul endroit où une somme devient un décibel, une corrélation ou un choix de canal.
// C'est pour ça que `demarrer-prise` arrive avec son canal déjà décidé : le worklet obéit.
//
// TOUT SE COMPTE EN ÉCHANTILLONS. L'écart avec l'horloge murale ne prouve aucune dérive (mesuré
// au lot 0) : le seul témoin honnête du temps est le nombre d'échantillons reçus, et c'est pour
// ça que ce processeur tient SON PROPRE compteur de blocs. Le fil principal le confrontera à
// l'horloge audio sans présumer que l'écart est nul.

// Un bloc de rendu fait 128 échantillons : 2,7 ms à 48 kHz (2,9 ms à 44,1 kHz). C'est la
// granularité d'un repère, et la raison pour laquelle un morceau doit faire un nombre ENTIER de
// blocs : sinon un repère tomberait à cheval sur deux morceaux.
const ECHANTILLONS_PAR_BLOC = 128;

// Cadence des relevés postés au fil principal. 19 blocs = 2 432 échantillons = 50,7 ms à
// 48 kHz, soit environ 20 relevés par seconde : assez pour qu'un vu-mètre vive, assez peu pour
// ne pas noyer le fil principal (375 messages par seconde si on postait chaque bloc).
const BLOCS_PAR_RELEVE = 19;

// E8 du CDC : « si le signal reste à zéro numérique pendant 2 secondes ». Deux secondes se
// comptent en ÉCHANTILLONS, jamais en millisecondes d'horloge d'interface — c'est la différence
// entre une détection et une impression. Le seuil est calculé à partir de `sampleRate`, pas
// écrit en dur : à 44,1 kHz, 2 secondes ne font pas le même nombre d'échantillons.
const SECONDES_DE_SILENCE_AVANT_ALERTE = 2;

// ── LE BRUIT DE PIÈCE, ET SA PART DE GRAVE (T13, étape 1d) ──────────────────────────────────
//
// Les prises réelles de Christophe l'ont montré : −55,7 à −57,9 dBFS dans une salle de soins à
// générateurs, avec l'énergie surtout sous 120 Hz et des raies à 50 et 100 Hz. Un plancher à
// −71 dBFS, mesuré au lot 0 dans une pièce calme, ne décrit pas sa salle.
//
// COMMENT ON MESURE LA PART DE GRAVE, et ce que cette mesure vaut exactement : un passe-bas de
// Butterworth du SECOND ordre à 120 Hz (Q = 1/√2), puis le rapport entre l'énergie qui en
// ressort et l'énergie qui y entre. Ce n'est PAS un mur de brique : à 120 Hz pile, le filtre
// laisse passer la moitié de l'énergie, donc un son à 120 Hz donne un rapport d'environ 0,5. En
// dessous il tend vers 1, au-dessus il chute en 1/f⁴. C'est une mesure de PENTE, pas de
// découpage net, et le relevé le dit avec sa règle — un rapport sans sa règle se lirait comme un
// pourcentage exact, ce qu'il n'est pas.
const BRUIT_COUPURE_HZ = 120;

// ── LA FENÊTRE DE L'ESTIMATEUR ROBUSTE (T13, corrigé après les essais du 10 octobre) ────────
//
// POURQUOI LA VALEUR EFFICACE DE LA FENÊTRE ENTIÈRE ÉTAIT FAUSSE. Mesuré sur les prises de
// Christophe : le bruit annoncé était de −63,9 dBFS (« correct », « bruit grave ») alors que les
// passages calmes de LA MÊME PRISE étaient à −74 à −76 dBFS. L'écart venait de quelques bruits
// brefs — clics de touche, respiration — à −57,9 à −62,8 dBFS dans les trois premières secondes.
// Une valeur efficace est une moyenne d'ÉNERGIE : trois cents millisecondes de clic à −58 dBFS
// pèsent plus, dans cette moyenne, que deux secondes sept de silence à −75. Le chiffre était
// juste comme moyenne et faux comme description de la pièce.
//
// CE QUI REMPLACE. Le signal est découpé en fenêtres de 100 ms, chacune avec sa propre somme de
// carrés, et le bruit de pièce est le 20e CENTILE de leurs niveaux : le plancher sous lequel la
// pièce ne descend pas, plutôt que la moyenne de ce qui s'y passe. Un bruit bref ne déplace pas
// un centile bas ; il faudrait qu'il occupe plus d'un cinquième du temps, et alors il ne serait
// plus bref.
//
// POURQUOI 100 ms. Deux bornes mesurées. Il faut une fenêtre assez COURTE pour qu'un bruit bref
// n'en contamine qu'une ou deux : les claquements de touche du lot 0 durent 50 à 80 ms. Et assez
// LONGUE pour que sa valeur efficace soit stable : à 100 ms une fenêtre porte 4 800 échantillons
// à 48 kHz, et l'écart mesuré entre fenêtres d'un bruit stationnaire est de 0,24 dB sur la pièce
// calme de référence et de 0,10 dB sur la salle à générateurs. Trente fenêtres dans trois
// secondes, c'est aussi le minimum pour qu'un 20e centile ait un sens : il tombe sur la 6e.
//
// LE WORKLET NE CALCULE AUCUN CENTILE. Il livre les sommes brutes de chaque fenêtre ; le
// décibel, le centile, le verdict et la part de grave sont calculés dans le module, une seule
// fois, à un seul endroit (régression #11(f)).
const BRUIT_FENETRE_S = 0.1;

// Durée pendant laquelle un canal reste réputé VIVANT après son dernier échantillon non nul
// (E3). Voir le commentaire du constructeur : 0,25 s, soit bien plus qu'une période de la plus
// basse fréquence utile, pour qu'un passage par zéro ne fasse pas clignoter le diviseur.
const MAINTIEN_CANAL_S = 0.25;

class PasseBas {
  constructor(fc, fs) {
    var w0 = 2 * Math.PI * fc / fs;
    var alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    var cosw = Math.cos(w0);
    var a0 = 1 + alpha;
    this.b0 = ((1 - cosw) / 2) / a0;
    this.b1 = (1 - cosw) / a0;
    this.b2 = ((1 - cosw) / 2) / a0;
    this.a1 = (-2 * cosw) / a0;
    this.a2 = (1 - alpha) / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  filtrer(x) {
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
          - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class EnregistreurProcesseur extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};

    // Taille d'un morceau, en échantillons, imposée par le module (qui la justifie et la mesure).
    // Ramenée à un multiple entier de 128 : un morceau qui ne serait pas un nombre entier de
    // blocs ferait tomber un repère à cheval sur deux morceaux.
    const demandee = Math.max(ECHANTILLONS_PAR_BLOC, Math.round(o.echantillonsParMorceau || 240000));
    this.echantillonsParMorceau =
      Math.round(demandee / ECHANTILLONS_PAR_BLOC) * ECHANTILLONS_PAR_BLOC;

    // 'analyse' : on mesure, on ne garde rien. 'prise' : on écrit des morceaux.
    // Le canal est décidé par le module PENDANT l'analyse (le vu-mètre d'avant-prise, E2) et
    // arrive gelé avec `demarrer-prise`. On ne peut pas remixer après coup des échantillons déjà
    // écrits : c'est la raison d'être de ces deux modes.
    this.mode = 'analyse';
    this.canal = 'gauche';

    this.morceau = new Int16Array(this.echantillonsParMorceau);
    this.dansLeMorceau = 0;
    this.indexMorceau = 0;

    // ── LES TÉMOINS, tenus ici et nulle part ailleurs ──────────────────────────────────────
    this.blocsVus = 0;            // appels à process() qui ont vu de l'entrée
    this.blocsSansEntree = 0;     // appels sans aucun canal : l'entrée a disparu
    this.echantillonsVus = 0;     // total reçu — le seul temps de référence
    this.echantillonsEcrits = 0;  // total versé dans des morceaux

    // SUR LE SIGNAL RETENU, après mixage mono : combien d'échantillons, et combien à zéro
    // numérique. C'est la seule grandeur qui répond à « cette prise est-elle VIDE ? » — les
    // sommes par canal ne le disent pas quand le canal retenu est la moyenne des deux. Comptée
    // ici, où les échantillons passent, et nulle part ailleurs.
    this.echantillonsRetenus = 0;
    this.zerosRetenus = 0;

    // Sommes brutes, par canal. `releve` est remis à zéro à chaque envoi (le vu-mètre montre
    // l'instant) ; `total` court sur toute la prise (le rapport de mesures).
    this.releve = sommesNeuves();
    this.total = sommesNeuves();

    // Suivi du zéro numérique, en échantillons.
    this.echantillonsAZeroDeSuite = 0;
    this.debutTrame = 0;

    // ── LES FENÊTRES DE 100 ms DE L'ESTIMATEUR ROBUSTE ───────────────────────────────────
    // Elles courent sur TOUTE la prise, pas seulement sur le silence initial : quand ce silence
    // n'a pas été tenu, T13 demande de prélever l'ambiance dans une pause, et une pause ne peut
    // être trouvée qu'en ayant mesuré la prise entière. Le filtre de grave est UNE SEULE
    // instance, continue d'une fenêtre à l'autre : le remettre à zéro à chaque frontière
    // fabriquerait un transitoire toutes les 100 ms et la part de grave mesurerait le filtre.
    // ── (E3) LE MIXAGE NE MOYENNE JAMAIS UN CANAL MORT ───────────────────────────────────
    //
    // LE DÉFAUT QUE CECI CORRIGE, mesuré par Christophe sur 3 prises sur 12 : la fenêtre
    // d'avant la prise voyait deux canaux actifs très corrélés (0,983 ; 0,986), le module
    // gelait « moyenne », et la prise avait le canal droit à zéro numérique du début à la fin.
    // La moyenne d'un canal actif et d'un canal vide retire exactement 6,02 dB, et E3 l'écrit
    // noir sur blanc : « le mixage prend le canal actif et ne fait pas de moyenne, QUI
    // RETIRERAIT 6 dB ». La décision d'avant la prise n'est qu'une PRÉDICTION ; l'invariant est
    // de ne pas perdre 6 dB. On ne corrige donc pas la prédiction — on rend la perte impossible.
    //
    // COMMENT : en mode « moyenne », le diviseur n'est pas le nombre de canaux mais le nombre de
    // canaux VIVANTS — ceux qui ont livré un échantillon non nul depuis moins de
    // `MAINTIEN_CANAL_S`. Et c'est sans danger de marche : la moyenne n'est choisie que pour
    // deux canaux dont la corrélation dépasse 0,8, c'est-à-dire qui portent la même chose, et la
    // moyenne de deux signaux identiques vaut chacun d'eux. Retirer un canal mort du diviseur ne
    // produit donc AUCUN saut de niveau — ce qu'un contrôle vérifie sur deux canaux identiques.
    //
    // Le maintien de 0,25 s évite qu'un passage par zéro du signal — il y en a deux par période —
    // fasse clignoter le diviseur. À 48 kHz, 12 000 échantillons.
    this.maintienCanal = Math.max(1, Math.round(MAINTIEN_CANAL_S * sampleRate));
    // ── UN CANAL DOIT PROUVER QU'IL VIT, IL N'EST PAS PRÉSUMÉ VIVANT ──────────────────────
    // Défaut trouvé par le contrôle §3a en l'écrivant : ces deux compteurs partaient de zéro,
    // c'est-à-dire « non nul à l'instant même », si bien qu'un canal vide était compté comme
    // vivant pendant les 0,25 s du maintien — 11 999 échantillons mixés à deux canaux au DÉBUT
    // de chaque prise, soit un quart de seconde à −6 dB. Ils partent donc du maintien : un canal
    // n'entre dans le diviseur qu'après avoir livré un échantillon non nul. Pour un canal
    // réellement actif, cela arrive au premier échantillon.
    this.depuisNonZeroG = this.maintienCanal;
    this.depuisNonZeroD = this.maintienCanal;
    this.mixeSurUnCanal = 0;
    this.mixeSurDeuxCanaux = 0;
    this.dernierNbVivants = -1;

    this.parFenetreBruit = Math.max(1, Math.round(BRUIT_FENETRE_S * sampleRate));
    this.fenetres = null;         // accumulateur courant, ou null quand aucune mesure ne court
    this.filtreGrave = null;      // construit avec la fréquence réelle, à l'ouverture

    // La mesure de bruit tourne sur demande, pendant un nombre d'échantillons fixé par le
    // module. Elle accumule l'énergie totale et l'énergie qui ressort du passe-bas, plus la
    // crête — trois grandeurs brutes, dont le module tirera les décibels et le verdict.
    this.bruit = null;
    this.seuilSilence = Math.round(SECONDES_DE_SILENCE_AVANT_ALERTE * sampleRate);
    this.muetAnnonce = false;
    this.blocsDepuisReleve = 0;

    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'demarrer-prise') {
        // Le canal vient du module, déjà décidé. S'il manque, on prend le canal 0 et on le DIT
        // dans l'accusé : un canal retenu par défaut sans trace est un canal que personne ne
        // peut contredire.
        this.canal = m.canal || 'gauche';
        this.total = sommesNeuves();
        this.dansLeMorceau = 0;
        // ── (E12) UNE PRISE SE PROLONGE : ON REPREND SES COMPTEURS LÀ OÙ ILS ÉTAIENT ───────
        // Une continuation n'est pas une nouvelle prise. Le module fournit l'index du prochain
        // morceau et le nombre d'échantillons déjà écrits, RELUS dans le stockage et non
        // déduits : le worklet les adopte, si bien que les positions du journal et les
        // `debutEchantillon` des morceaux restent comptés depuis le début de la prise, comme
        // E12 l'exige pour les repères.
        this.indexMorceau = Math.max(0, Math.round(m.indexDepart || 0));
        this.echantillonsEcrits = Math.max(0, Math.round(m.echantillonsDepart || 0));
        // (C) LE POINT DE DÉPART DE CETTE SESSION, gardé pour que l'écart « vu / écrit » compare
        // deux grandeurs de la MÊME session. Défaut corrigé : le rapport de la prise continuée du
        // 11 octobre 19:36 annonçait « ecartVuEcrit −1 440 000 » — le compteur d'échantillons VUS
        // depuis le début de cette session comparé au total CUMULÉ de la prise. Deux domaines,
        // une soustraction, un nombre qui ne veut rien dire.
        this.departEcrits = this.echantillonsEcrits;
        this.echantillonsVus = 0;
        this.blocsVus = 0;
        this.blocsSansEntree = 0;
        this.echantillonsAZeroDeSuite = 0;
        this.echantillonsRetenus = 0;
        this.zerosRetenus = 0;
        this.mixeSurUnCanal = 0;
        this.mixeSurDeuxCanaux = 0;
        this.dernierNbVivants = -1;
        this.depuisNonZeroG = this.maintienCanal;
        this.depuisNonZeroD = this.maintienCanal;
        this.muetAnnonce = false;
        this.mode = 'prise';
        // L'INSTANT DU DÉMARRAGE, PRIS SUR LE FIL AUDIO. `currentFrame` est le compteur de
        // trames du contexte, lu ici, dans le même temps que les échantillons. Le fil principal
        // ne peut pas fournir cet instant : entre son `postMessage` et l'exécution de cette
        // ligne, dix à douze blocs passent (environ 30 ms, mesuré). Compter les blocs attendus
        // depuis l'instant du fil PRINCIPAL faisait apparaître ces blocs comme « perdus », et
        // c'était faux : c'était la latence du message. Un écart qui ne veut rien dire est pire
        // qu'un écart absent, parce qu'on le lit quand même.
        this.debutTrame = currentFrame;
        this.port.postMessage({
          type: 'prise-demarree',
          canal: this.canal,
          canalFourni: !!m.canal,
          echantillonsParMorceau: this.echantillonsParMorceau,
          echantillonnage: sampleRate,
          seuilSilenceEchantillons: this.seuilSilence,
          debutTrame: currentFrame,
          debutTemps: currentTime,
        });
      } else if (m.type === 'arreter-prise') {
        this._viderLeMorceau(true);
        this.mode = 'analyse';
        this.port.postMessage({
          type: 'prise-terminee',
          echantillonsVus: this.echantillonsVus,
          echantillonsEcrits: this.echantillonsEcrits,
          // (C) CE QUE CETTE SESSION A ÉCRIT, à comparer à ce qu'elle a VU.
          echantillonsEcritsCetteSession: this.echantillonsEcrits - (this.departEcrits || 0),
          departEcrits: this.departEcrits || 0,
          blocsVus: this.blocsVus,
          blocsSansEntree: this.blocsSansEntree,
          morceaux: this.indexMorceau,
          total: this.total,
          canal: this.canal,
          echantillonsRetenus: this.echantillonsRetenus,
          zerosRetenus: this.zerosRetenus,
          // (E3) CE QUE LE MIXAGE A RÉELLEMENT FAIT, en échantillons. Sans ces deux nombres, le
          // rapport dirait « moyenne » sans qu'on sache sur combien de canaux elle a porté.
          mixeSurUnCanal: this.mixeSurUnCanal,
          mixeSurDeuxCanaux: this.mixeSurDeuxCanaux,
          maintienCanal: this.maintienCanal,
          debutTrame: this.debutTrame,
          finTrame: currentFrame,
          finTemps: currentTime,
          // Les trames écoulées sur le fil AUDIO entre le démarrage et l'arrêt : le témoin du
          // temps contre lequel le compte de blocs du worklet se confronte.
          tramesEcoulees: currentFrame - (this.debutTrame || 0),
        });
        // LA DERNIÈRE FENÊTRE EST LIVRÉE, MARQUÉE PARTIELLE. Elle porte moins de 100 ms, donc
        // son niveau est plus bruyant statistiquement : le module la compte et DIT qu'elle est
        // partielle plutôt que de la jeter en silence ou de la traiter comme les autres.
        if (this.fenetres && this.fenetres.n > 0) {
          const fp = this.fenetres;
          this.port.postMessage({
            type: 'fenetre-bruit', index: fp.index, debutEchantillon: fp.position,
            n: fp.n, sommeCarre: fp.sommeCarre, sommeCarreGrave: fp.sommeCarreGrave,
            zeros: fp.zeros, crete: fp.crete,
            dansLeSilenceInitial: fp.position < fp.finDuSilenceInitial,
            partielle: true,
          });
        }
        this.fenetres = null;
        this.bruit = null;
        // ── LE COMPTEUR DE LA PRISE MEURT AVEC LA PRISE (défaut 4 du relevé d'essais) ───────
        // Constaté par Christophe : l'événement « contexte running » était daté à l'échantillon
        // 1 071 616, puis 2 962 176, puis 3 963 008 — à chaque fois la longueur EXACTE de la
        // prise PRÉCÉDENTE. La cause est ici : hors prise, le worklet continuait d'envoyer ses
        // relevés avec `echantillonsEcrits` figé à la valeur de la prise qui venait de finir, et
        // le module datait ses événements là-dessus. Le compteur est donc remis à zéro DÈS QUE
        // le message d'arrêt est parti, c'est-à-dire après que sa vraie valeur a été dite. Entre
        // deux prises, la position courante est zéro, et zéro est la vérité : aucune prise ne
        // court. Le module s'en garde une seconde fois de son côté (deux gardes indépendantes
        // pour un chiffre qui a déjà menti).
        this.echantillonsEcrits = 0;
      } else if (m.type === 'mettre-en-pause') {
        // ── (E12) LA PAUSE N'ÉCRIT RIEN, ET N'OCCUPE AUCUN TEMPS DANS LA VOIX ─────────────
        // On repasse en mode 'analyse' : le worklet continue de MESURER (le vu-mètre vit, le
        // flux du micro reste ouvert, comme le prompt l'exige) mais n'écrit plus un échantillon.
        // Le morceau partiel est vidé D'ABORD, pour que la frontière de la pause tombe à
        // l'échantillon exact : sans cela, la reprise collerait sa première salve à la fin du
        // morceau en cours et le raccord ne serait plus datable. Les morceaux n'ont donc plus
        // tous la même taille, ce que le modèle de T1 ter prévoit explicitement.
        //
        // `retirerZerosDeFin` sert à la PERTE DU MICRO (E8) : quand le module s'aperçoit que la
        // piste est morte, les derniers échantillons écrits sont des zéros qu'aucune voix n'a
        // produits. On les retire du morceau partiel avant de le vider. Ce qui a déjà été vidé
        // ne peut plus l'être : le worklet DIT combien il n'a pas pu retirer, au lieu de laisser
        // croire que « aucun zéro n'est écrit » sans réserve.
        let retires = 0, nonRetires = 0;
        if (m.retirerZerosDeFin) {
          const zeros = this.echantillonsAZeroDeSuite;
          retires = Math.min(zeros, this.dansLeMorceau);
          nonRetires = zeros - retires;
          this.dansLeMorceau -= retires;
          this.echantillonsEcrits -= retires;
        }
        this._viderLeMorceau(true);
        this.mode = 'analyse';
        // (T13, avenant 5) LA FENÊTRE EN COURS EST JETÉE : elle enjamberait la frontière de la
        // pause, et une fenêtre moitié écrite moitié non écrite n'est ni l'un ni l'autre. On
        // repart proprement de la frontière.
        if (this.fenetres) {
          const fp = this.fenetres;
          fp.n = 0; fp.sommeCarre = 0; fp.sommeCarreGrave = 0; fp.zeros = 0; fp.crete = 0;
          fp.debutEcrits = fp.positionEcrite;
          fp.ecrit = false;
        }
        this.port.postMessage({
          type: 'en-pause',
          aEchantillon: this.echantillonsEcrits,
          morceaux: this.indexMorceau,
          raison: m.raison || 'demandée',
          // LA COMPTABILITÉ DES ZÉROS, ENTIÈRE. Sans `zerosVus`, aucun contrôle ne peut
          // vérifier que tout ce que le worklet a vu a été soit retiré, soit déclaré
          // non retirable : un trou du falsifieur l'a exigé. L'invariant est
          // `zerosVus === zerosRetires + zerosNonRetires`, et c'est lui qui garantit
          // « aucun zéro n'est écrit » (E8) autrement que par une promesse.
          zerosVus: m.retirerZerosDeFin ? this.echantillonsAZeroDeSuite : 0,
          zerosRetires: retires,
          zerosNonRetires: nonRetires,
        });
      } else if (m.type === 'reprendre') {
        // La reprise ne touche à aucun compteur : elle rouvre l'écriture, c'est tout. C'est ce
        // qui fait que la pause n'occupe aucun temps dans la voix.
        this.canal = m.canal || this.canal;
        this.mode = 'prise';
        this.echantillonsAZeroDeSuite = 0;
        this.muetAnnonce = false;
        // (T13) Même raison qu'à la pause, dans l'autre sens : la fenêtre en cours a commencé
        // pendant la pause. On la jette et on repart de la reprise.
        if (this.fenetres) {
          const fr = this.fenetres;
          fr.n = 0; fr.sommeCarre = 0; fr.sommeCarreGrave = 0; fr.zeros = 0; fr.crete = 0;
          fr.debutEcrits = fr.positionEcrite;
          fr.ecrit = true;
        }
        this.port.postMessage({
          type: 'reprise-faite',
          aEchantillon: this.echantillonsEcrits,
          morceaux: this.indexMorceau,
          canal: this.canal,
        });
      } else if (m.type === 'mesurer-bruit') {
        // Le filtre est construit ICI, avec la fréquence RÉELLE du contexte : ses coefficients
        // en dépendent, et un filtre calculé pour 48 kHz appliqué à 44,1 kHz couperait ailleurs
        // qu'à 120 Hz.
        this.bruit = {
          restants: Math.max(1, Math.round(m.echantillons || sampleRate * 3)),
          demandes: Math.max(1, Math.round(m.echantillons || sampleRate * 3)),
          n: 0, sommeCarre: 0, sommeCarreGrave: 0, crete: 0, zeros: 0,
          // DEUX MOITIÉS, pour savoir si le silence initial en était un. T13 porte la trace du
          // contraire : au lot 0, « un silence initial de 3 s n'a jamais été silencieux ». Si la
          // seconde moitié est nettement plus forte que la première, quelqu'un a commencé à
          // parler et la mesure de bruit ne mesure plus le bruit. Le module le dira plutôt que
          // de rendre un verdict faux.
          n1: 0, sommeCarre1: 0, n2: 0, sommeCarre2: 0,
          canal: m.canal || 'gauche',
        };
        // LE FIL DES FENÊTRES S'OUVRE ICI ET NE SE REFERME QU'À L'ARRÊT. Le silence initial
        // n'est que la PREMIÈRE partie de ce fil ; la suite sert à trouver une pause quand ce
        // silence n'a pas été tenu (T13).
        this.filtreGrave = new PasseBas(BRUIT_COUPURE_HZ, sampleRate);
        this.fenetres = {
          canal: this.bruit.canal,
          parFenetre: this.parFenetreBruit,
          index: 0,
          position: 0,          // échantillons du signal retenu depuis le début de la mesure
          // ── (T13, avenant 5) LA POSITION DANS LA PRISE, ET RIEN D'AUTRE ───────────────
          // DÉFAUT CORRIGÉ : sur la prise du 11 octobre 19:12, le plancher annoncé
          // (−91,6 dBFS, « pause la plus calme de la prise », fenêtres 528 000 à 1 209 600)
          // tombait ENTIÈREMENT dans le temps de pause — un audio qui n'est pas dans le
          // fichier. Le 5e centile des fenêtres du fichier lui-même était à −81,7. T13
          // (avenant 5) le tranche : « l'ambiance n'est prélevée que dans un passage ÉCRIT de
          // la prise : le temps de pause (E12) n'est jamais une source d'ambiance ».
          // Chaque fenêtre porte donc sa position DANS LA PRISE et dit si ses échantillons
          // ont été écrits.
          // ── LA POSITION EXACTE, AU SEIN DU BLOC ─────────────────────────────────────
          // `echantillonsEcrits` n'est pas assez fin ici : la boucle des fenêtres tourne AVANT
          // la boucle d'écriture du même bloc, si bien qu'au milieu d'un bloc elle lirait un
          // compteur qui retarde de l'offset dans le bloc — jusqu'à 127 échantillons. Un
          // contrôle de pavage l'a trouvé : les fenêtres ne s'enchaînaient pas exactement.
          // On tient donc un compteur PROPRE, incrémenté dans la boucle des fenêtres elle-même,
          // et qui ne compte que les échantillons retenus en mode prise — c'est-à-dire ceux qui
          // sont écrits. Il part de la position de la prise, pour qu'une continuation reste dans
          // le temps de SA prise.
          positionEcrite: this.echantillonsEcrits,
          debutEcrits: this.echantillonsEcrits,
          ecrit: this.mode === 'prise',
          n: 0, sommeCarre: 0, sommeCarreGrave: 0, zeros: 0, crete: 0,
          finDuSilenceInitial: this.bruit.demandes,
        };
        this.port.postMessage({ type: 'bruit-demarre', echantillons: this.bruit.demandes,
                                coupureHz: BRUIT_COUPURE_HZ, echantillonnage: sampleRate,
                                parFenetre: this.parFenetreBruit,
                                fenetreSecondes: BRUIT_FENETRE_S });
      } else if (m.type === 'vider-maintenant') {
        // Appelé quand la page se masque ou se décharge : on pousse le morceau PARTIEL plutôt
        // que de le perdre. Ce qui est RÉELLEMENT garanti est écrit dans le module, pas ici :
        // ce message peut n'être jamais traité si le processus meurt avant.
        const avant = this.dansLeMorceau;
        this._viderLeMorceau(true);
        this.port.postMessage({
          type: 'vide-force',
          morceaux: this.indexMorceau,
          echantillonsPousses: avant,
          raison: m.raison || 'inconnue',
        });
      }
    };
  }

  _viderLeMorceau(partiel) {
    if (this.dansLeMorceau === 0) return;
    const taille = this.dansLeMorceau;
    const copie = this.morceau.slice(0, taille);
    this.port.postMessage({
      type: 'morceau',
      index: this.indexMorceau,
      debutEchantillon: this.echantillonsEcrits - taille,
      nbEchantillons: taille,
      partiel: !!partiel,
      pcm: copie.buffer,
    }, [copie.buffer]);
    this.indexMorceau++;
    this.dansLeMorceau = 0;
  }

  process(entrees) {
    const entree = entrees[0];

    if (!entree || entree.length === 0 || !entree[0] || entree[0].length === 0) {
      // Aucun canal : l'entrée a disparu (piste terminée, contexte suspendu, périphérique
      // retiré). On le COMPTE au lieu de rendre `true` en silence — c'est exactement la prise de
      // 71 secondes entièrement à zéro du lot 0, qui n'avait levé aucune alerte.
      this.blocsSansEntree++;
      return true;
    }

    const g = entree[0];
    const d = entree.length > 1 ? entree[1] : null;

    this.blocsVus++;
    this.echantillonsVus += g.length;
    accumuler(this.releve, g, d, entree.length);
    accumuler(this.total, g, d, entree.length);

    // ── LA MESURE DU BRUIT DE PIÈCE, quand elle est en cours ────────────────────────────────
    // Elle tourne en mode analyse comme en mode prise : le silence initial de 3 s appartient à
    // la prise (T13), et c'est là qu'on veut la mesurer.
    if (this.fenetres) {
      const f = this.fenetres;
      const b = this.bruit;        // null dès que le silence initial est passé
      for (let i = 0; i < g.length; i++) {
        if (this.mode === 'prise') f.positionEcrite++;
        const v = f.canal === 'droit' ? (d ? d[i] : 0)
                : f.canal === 'moyenne' ? (d ? (g[i] + d[i]) / 2 : g[i])
                : g[i];
        const grave = this.filtreGrave.filtrer(v);
        const carre = v * v;
        const abs = v < 0 ? -v : v;

        // LA FENÊTRE DE 100 ms : des sommes, rien d'autre. Aucun décibel ici.
        f.n++;
        f.sommeCarre += carre;
        f.sommeCarreGrave += grave * grave;
        if (abs > f.crete) f.crete = abs;
        if (v === 0) f.zeros++;

        // LA FENÊTRE ENTIÈRE DU SILENCE INITIAL, gardée en parallèle et pour une seule raison :
        // c'est le TÉMOIN de l'ancien calcul. Le rapport porte les deux, et leur écart est ce
        // qui rend le défaut 1 visible plutôt que raconté.
        if (b && b.restants > 0) {
          b.sommeCarre += carre;
          b.sommeCarreGrave += grave * grave;
          if (b.n < b.demandes / 2) { b.n1++; b.sommeCarre1 += carre; }
          else { b.n2++; b.sommeCarre2 += carre; }
          if (abs > b.crete) b.crete = abs;
          if (v === 0) b.zeros++;
          b.n++;
          b.restants--;
          if (b.restants <= 0) {
            this.port.postMessage({
              type: 'bruit', n: b.n, demandes: b.demandes,
              sommeCarre: b.sommeCarre, sommeCarreGrave: b.sommeCarreGrave,
              crete: b.crete, zeros: b.zeros, canal: b.canal,
              n1: b.n1, sommeCarre1: b.sommeCarre1, n2: b.n2, sommeCarre2: b.sommeCarre2,
              coupureHz: BRUIT_COUPURE_HZ, echantillonnage: sampleRate,
            });
            this.bruit = null;
          }
        }

        if (f.n >= f.parFenetre) {
          this.port.postMessage({
            type: 'fenetre-bruit',
            index: f.index,
            debutEchantillon: f.position,
            // (T13) LA POSITION DANS LA PRISE et le fait que les échantillons soient écrits :
            // c'est sur ces deux-là que le module filtre.
            debutDansLaPrise: f.debutEcrits,
            ecrit: f.ecrit,
            n: f.n, sommeCarre: f.sommeCarre, sommeCarreGrave: f.sommeCarreGrave,
            zeros: f.zeros, crete: f.crete,
            dansLeSilenceInitial: f.position < f.finDuSilenceInitial,
          });
          f.index++;
          f.position += f.n;
          f.debutEcrits = f.positionEcrite;
          f.ecrit = this.mode === 'prise';
          f.n = 0; f.sommeCarre = 0; f.sommeCarreGrave = 0; f.zeros = 0; f.crete = 0;
        }
      }
    }

    if (this.mode === 'prise') {
      const canal = this.canal;
      for (let i = 0; i < g.length; i++) {
        // ── (E3) LA VIVACITÉ DE CHAQUE CANAL, suivie échantillon par échantillon ───────────
        if (g[i] !== 0) this.depuisNonZeroG = 0; else this.depuisNonZeroG++;
        if (d) { if (d[i] !== 0) this.depuisNonZeroD = 0; else this.depuisNonZeroD++; }
        else this.depuisNonZeroD = this.maintienCanal;
        const gVivant = this.depuisNonZeroG < this.maintienCanal;
        const dVivant = !!d && this.depuisNonZeroD < this.maintienCanal;

        // LE MIXAGE MONO (E3). En « moyenne », le diviseur est le nombre de canaux VIVANTS :
        // c'est ce qui rend la perte de 6 dB impossible quand un canal meurt pendant la prise.
        let v;
        if (canal === 'droit') {
          v = d ? d[i] : 0;
        } else if (canal === 'moyenne') {
          const k = (gVivant ? 1 : 0) + (dVivant ? 1 : 0);
          if (k === 0) {
            // Les deux canaux sont morts : le silence est le silence, on n'invente rien.
            v = 0;
          } else {
            v = ((gVivant ? g[i] : 0) + (dVivant ? d[i] : 0)) / k;
          }
          if (k === 1) this.mixeSurUnCanal++; else if (k === 2) this.mixeSurDeuxCanaux++;
          // TOUT CHANGEMENT DU JEU DE CANAUX VIVANTS EST DIT, à l'échantillon près : c'est un
          // fait de la prise, et le taire laisserait croire que le mixage n'a pas bougé.
          if (k !== this.dernierNbVivants) {
            this.dernierNbVivants = k;
            this.port.postMessage({
              type: 'canaux-vivants',
              aEchantillon: this.echantillonsEcrits,
              vivants: k, gauche: gVivant, droit: dVivant,
            });
          }
        } else {
          v = g[i];
        }

        // Suivi du zéro numérique sur le signal RETENU : c'est celui-là qui sera la voix.
        this.echantillonsRetenus++;
        if (v === 0) {
          this.zerosRetenus++;
          this.echantillonsAZeroDeSuite++;
          if (!this.muetAnnonce && this.echantillonsAZeroDeSuite >= this.seuilSilence) {
            this.muetAnnonce = true;
            this.port.postMessage({
              type: 'muet',
              depuisEchantillon: this.echantillonsEcrits - this.echantillonsAZeroDeSuite + 1,
              echantillonsAZero: this.echantillonsAZeroDeSuite,
            });
          }
        } else {
          if (this.muetAnnonce) {
            this.port.postMessage({ type: 'son-revenu', aEchantillon: this.echantillonsEcrits });
          }
          this.echantillonsAZeroDeSuite = 0;
          this.muetAnnonce = false;
        }

        // Float32 → entier 16 bits signé. Les deux bornes sont ASYMÉTRIQUES parce que le format
        // l'est : −32768 à +32767. Un écrêtage symétrique à ±32767 perdrait le dernier pas
        // négatif, et un facteur unique de 32767 rendrait −1.0 inatteignable.
        const borne = v < 0 ? (v < -1 ? -1 : v) * 32768 : (v > 1 ? 1 : v) * 32767;
        this.morceau[this.dansLeMorceau++] = Math.round(borne);
        this.echantillonsEcrits++;
        if (this.dansLeMorceau === this.echantillonsParMorceau) this._viderLeMorceau(false);
      }
    }

    this.blocsDepuisReleve++;
    if (this.blocsDepuisReleve >= BLOCS_PAR_RELEVE) {
      this.port.postMessage({
        type: 'releve',
        mode: this.mode,
        canal: this.mode === 'prise' ? this.canal : null,
        releve: this.releve,
        total: this.total,
        echantillonnage: sampleRate,
        echantillonsVus: this.echantillonsVus,
        echantillonsEcrits: this.echantillonsEcrits,
        blocsVus: this.blocsVus,
        blocsSansEntree: this.blocsSansEntree,
        echantillonsAZeroDeSuite: this.echantillonsAZeroDeSuite,
        echantillonsRetenus: this.echantillonsRetenus,
        zerosRetenus: this.zerosRetenus,
        morceaux: this.indexMorceau,
      });
      this.releve = sommesNeuves();
      this.blocsDepuisReleve = 0;
    }

    return true;
  }
}

// Les sommes dont le module tirera niveau, crête et corrélation. Σx est gardé EN PLUS de Σx²
// parce qu'une corrélation de Pearson honnête retire les moyennes : le raccourci
// Σgd/√(Σg²·Σd²) suppose une moyenne nulle, et un signal audio porte une composante continue
// faible mais non nulle.
function sommesNeuves() {
  return {
    // `canaux` est le DERNIER nombre de canaux vu ; `canauxMin` et `canauxMax` disent s'il a
    // VARIÉ. Christophe a relevé trois prises où la fenêtre d'avant voyait deux canaux actifs et
    // la prise un canal droit à zéro : sans ces deux bornes, on ne peut pas distinguer « le
    // périphérique a cessé de livrer deux canaux » de « le second canal est devenu muet ». Ce
    // sont deux causes différentes et deux corrections différentes.
    n: 0, canaux: 0, canauxMin: 0, canauxMax: 0,
    sommeG: 0, sommeD: 0,
    sommeCarreG: 0, sommeCarreD: 0,
    sommeProduit: 0,
    creteG: 0, creteD: 0,
    zerosG: 0, zerosD: 0,
  };
}

function accumuler(acc, g, d, nbCanaux) {
  acc.canaux = nbCanaux;
  if (acc.canauxMax === 0 || nbCanaux > acc.canauxMax) acc.canauxMax = nbCanaux;
  if (acc.canauxMin === 0 || nbCanaux < acc.canauxMin) acc.canauxMin = nbCanaux;
  for (let i = 0; i < g.length; i++) {
    const vg = g[i];
    acc.sommeG += vg;
    acc.sommeCarreG += vg * vg;
    const ag = vg < 0 ? -vg : vg;
    if (ag > acc.creteG) acc.creteG = ag;
    if (vg === 0) acc.zerosG++;
    if (d) {
      const vd = d[i];
      acc.sommeD += vd;
      acc.sommeCarreD += vd * vd;
      const ad = vd < 0 ? -vd : vd;
      if (ad > acc.creteD) acc.creteD = ad;
      if (vd === 0) acc.zerosD++;
      acc.sommeProduit += vg * vd;
    }
    acc.n++;
  }
}

registerProcessor('enregistreur-voix', EnregistreurProcesseur);
