// FALSIFICATION DES CONTRÔLES DU LOT 3, JALON I.
//
// Un test qui passe ne prouve rien tant qu'on n'a pas montré qu'il ÉCHOUE quand il le doit.
// Chaque mutation retire exactement UN contrôle du produit, rejoue la ou les sections qui le
// visent, et exige qu'elles échouent.
//
//   NODE_PATH=<playwright> node tests/falsifier-enregistreur.cjs
//   NODE_PATH=<playwright> node tests/falsifier-enregistreur.cjs --essai 3     (une seule)
//
// ── LE JOURNAL DE REPRISE (régression #11(i)) ────────────────────────────────────────────────
// Un gestionnaire de signal NE S'EXÉCUTE PAS pendant un `execFileSync`, et jamais sur SIGKILL :
// la garantie de restauration ne peut donc pas dépendre de la survie de ce processus. Avant la
// PREMIÈRE mutation, ce script écrit un journal de reprise sur le disque — les sources d'origine
// et leurs empreintes. Si on le tue en pleine mutation, `--reprendre` remet les sources en état
// à partir de ce journal. Et il vérifie, à la fin, que chaque ancre existe une fois et une seule.
//
// AUCUNE MODIFICATION DES SOURCES PENDANT QU'IL TOURNE. S'il faut l'arrêter : `--reprendre`.
//
// ── LES MUTATIONS ÉQUIVALENTES (régression #11(h)) ───────────────────────────────────────────
// Une mutation marquée `equivalente` porte sa RAISON. Elle est appliquée quand même, et on
// attend l'INVERSE : que les contrôles PASSENT. Le jour où elle les fait échouer, elle n'est
// plus équivalente — c'est l'inventaire qui est faux, et il le dit aussi fort qu'un trou.

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const FICHIERS = {
  module: path.join(RACINE, 'enregistreur-voix.js'),
  worklet: path.join(RACINE, 'enregistreur-worklet.js'),
  stockage: path.join(RACINE, 'voix-stockage.js'),
};
const JOURNAL = path.join(RACINE, 'banc-enregistreur', 'journal-de-reprise-falsifieur.json');

function sha(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

const original = {}, empreinteAvant = {};
Object.keys(FICHIERS).forEach((k) => {
  original[k] = fs.readFileSync(FICHIERS[k], 'utf8');
  empreinteAvant[k] = sha(original[k]);
});

// ── REPRISE APRÈS UNE MORT BRUTALE ──────────────────────────────────────────────────────────
if (process.argv.includes('--reprendre')) {
  if (!fs.existsSync(JOURNAL)) {
    console.error('Aucun journal de reprise : rien à restaurer (ou déjà restauré).');
    process.exit(2);
  }
  const j = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
  Object.keys(j.sources).forEach((k) => {
    fs.writeFileSync(FICHIERS[k], j.sources[k]);
    const e = sha(j.sources[k]);
    console.log((e === j.empreintes[k] ? 'restauré  ' : 'DIVERGENT ') + path.basename(FICHIERS[k]) +
                '  ' + e.slice(0, 16));
  });
  fs.unlinkSync(JOURNAL);
  console.log('\nSources remises dans l\'état du ' + j.ecritLe + '. Journal retiré.');
  process.exit(0);
}

const ESSAIS = [
  // ── LE MIXAGE MONO (E3) ───────────────────────────────────────────────────────────────────
  {
    nom: 'la moyenne des canaux est prise même quand un canal est vide',
    fichier: 'module',
    de: "    if (gActif && !dActif) {\n      return { canal: 'gauche', raison: 'droit ' + d.etat + ' : canal actif pris tel quel, sans moyenne', auto: true };\n    }",
    vers: "    if (gActif && !dActif) {\n      return { canal: 'moyenne', raison: 'moyenne', auto: true };\n    }",
    sections: '§2c,§3a',
    attendu: 'le canal actif doit être pris tel quel : la moyenne sur un canal vide coûte 6 dB (E3)',
  },
  {
    nom: "l'écrêtage en entier 16 bits est retiré",
    fichier: 'worklet',
    de: 'const borne = v < 0 ? (v < -1 ? -1 : v) * 32768 : (v > 1 ? 1 : v) * 32767;',
    vers: 'const borne = v * 32767;',
    sections: '§4',
    attendu: 'au-delà de la pleine échelle, les bornes −32768 et +32767 doivent tenir',
  },
  {
    nom: "le facteur devient symétrique : −1,0 n'est plus atteignable",
    fichier: 'worklet',
    de: 'const borne = v < 0 ? (v < -1 ? -1 : v) * 32768 : (v > 1 ? 1 : v) * 32767;',
    vers: 'const borne = (v < -1 ? -1 : v > 1 ? 1 : v) * 32767;',
    sections: '§4',
    attendu: 'la borne basse du format est −32768, pas −32767',
  },

  // ── LA CAPTURE MUETTE (E8) ────────────────────────────────────────────────────────────────
  {
    nom: 'la détection de capture muette est retirée',
    fichier: 'worklet',
    de: 'if (!this.muetAnnonce && this.echantillonsAZeroDeSuite >= this.seuilSilence) {',
    vers: 'if (false) {',
    sections: '§5a',
    attendu: 'E8 : un signal à zéro pendant 2 s doit lever un bandeau aussitôt',
  },
  {
    nom: 'le seuil de silence passe de 2 s à 30 s',
    fichier: 'worklet',
    de: 'const SECONDES_DE_SILENCE_AVANT_ALERTE = 2;',
    vers: 'const SECONDES_DE_SILENCE_AVANT_ALERTE = 30;',
    sections: '§5a',
    attendu: 'E8 dit DEUX secondes, et le contrôle vérifie le seuil en échantillons',
  },
  {
    nom: 'le seuil est compté en millisecondes d\'horloge, pas en échantillons',
    fichier: 'worklet',
    de: 'this.seuilSilence = Math.round(SECONDES_DE_SILENCE_AVANT_ALERTE * sampleRate);',
    vers: 'this.seuilSilence = Math.round(SECONDES_DE_SILENCE_AVANT_ALERTE * 48000);',
    exigeAutreQue48k: true,
    sections: '§5a',
    attendu: 'à 44 100 Hz, 2 secondes ne font pas 96 000 échantillons : le seuil suit l\'échantillonnage',
  },
  {
    nom: 'une prise qui CONTIENT un passage muet est déclarée muette',
    fichier: 'module',
    de: "        var muette = _etat.echantillonsEcrits === 0 || (retenus > 0 && zeros === retenus);",
    vers: "        var muette = _etat.echantillonsEcrits === 0 || _etat.journal.some(function (e) { return e.quoi === 'piste muette'; });",
    sections: '§5c',
    attendu: 'E8 refuse une prise VIDE, pas une prise sonore qui contient un silence',
  },
  {
    nom: 'une prise vide est présentée comme terminée',
    fichier: 'module',
    de: "        var muette = _etat.echantillonsEcrits === 0 || (retenus > 0 && zeros === retenus);",
    vers: '        var muette = false;',
    sections: '§5a',
    attendu: 'une prise vide ne doit JAMAIS être présentée comme réussie (E8)',
  },

  // ── LA CORRÉLATION ET LE RAPPORT ──────────────────────────────────────────────────────────
  {
    nom: 'la corrélation rend null au lieu d\'une raison',
    fichier: 'module',
    de: "    if (videG) return 'canal vide : gauche';\n    if (videD) return 'canal vide : droit';",
    vers: '    if (videG) return null;\n    if (videD) return null;',
    sections: '§2a',
    attendu: 'un null dans un rapport de mesure est une case que le lecteur remplit de travers',
  },
  {
    nom: 'la corrélation prend le raccourci qui suppose une moyenne nulle',
    fichier: 'module',
    de: '    var cov = sommes.sommeProduit - (sommes.sommeG * sommes.sommeD) / n;\n    var r = cov / Math.sqrt(varG * varD);',
    vers: '    var cov = sommes.sommeProduit;\n    var r = cov / Math.sqrt(sommes.sommeCarreG * sommes.sommeCarreD);',
    sections: '§2a,§3c',
    attendu: 'Pearson retire les moyennes ; le raccourci biaise dès qu\'il y a une composante continue',
  },
  {
    nom: 'les infinis redeviennent des null à la sérialisation',
    fichier: 'module',
    de: "      return valeur === Infinity ? '+∞' : valeur === -Infinity ? '−∞' : 'NaN';",
    vers: '      return null;',
    sections: '§12',
    attendu: 'JSON.stringify écrit null pour −Infinity : c\'est précisément le null interdit',
  },

  // ── LA COMPTABILITÉ ET LE STOCKAGE ────────────────────────────────────────────────────────
  {
    nom: 'un morceau n\'est plus un nombre entier de blocs de 128',
    fichier: 'worklet',
    de: '    this.echantillonsParMorceau =\n      Math.round(demandee / ECHANTILLONS_PAR_BLOC) * ECHANTILLONS_PAR_BLOC;',
    vers: '    this.echantillonsParMorceau = demandee;',
    exigeAutreQue48k: true,
    sections: '§6',
    attendu: 'un morceau qui n\'est pas un nombre entier de blocs ferait tomber un repère à cheval',
  },
  {
    nom: 'la prise consigne la taille DEMANDÉE au lieu de la taille appliquée',
    fichier: 'module',
    de: '        echantillonsParMorceau: _etat.echantillonsParMorceauReels,\n        nbEchantillons: 0,',
    vers: '        echantillonsParMorceau: Math.round(_etat.tailleMorceau_s * _etat.echantillonnage),\n        nbEchantillons: 0,',
    exigeAutreQue48k: true,
    sections: '§6,§8',
    attendu: 'deux valeurs pour une même grandeur : la régression #11(f)',
  },
  {
    nom: 'les blocs attendus se comptent depuis l\'instant du FIL PRINCIPAL',
    fichier: 'module',
    de: '        var perdus = blocsPerdus(f.blocsVus || 0, f.blocsSansEntree || 0,\n          f.tramesEcoulees || 0, _etat.echantillonnage);',
    vers: '        var perdus = blocsPerdus(f.blocsVus || 0, f.blocsSansEntree || 0,\n          (_etat.ctx.currentTime - _etat.debutPrise_ctxTemps) * _etat.echantillonnage, _etat.echantillonnage);',
    sections: '§6',
    attendu: 'la latence du postMessage ferait passer pour perdus 10 à 12 blocs qui n\'ont jamais manqué',
  },
  {
    nom: 'l\'écriture d\'un morceau n\'attend plus la fin de la transaction',
    fichier: 'stockage',
    de: "    t.tx.objectStore(MAGASIN_MORCEAUX).put({\n      priseId: priseId,\n      index: index,\n      debutEchantillon: debutEchantillon,\n      nbEchantillons: pcm.byteLength / 2,\n      partiel: !!partiel,\n      pcm: pcm,\n    });\n    return t.fini;",
    vers: "    t.tx.objectStore(MAGASIN_MORCEAUX).put({\n      priseId: priseId,\n      index: index,\n      debutEchantillon: debutEchantillon,\n      nbEchantillons: pcm.byteLength / 2,\n      partiel: !!partiel,\n      pcm: pcm,\n    });\n    return Promise.resolve();",
    sections: '§6b',
    attendu: 'un morceau « cru écrit » n\'est pas un morceau écrit : à l\'arrêt, rien ne doit rester en vol',
  },
  {
    nom: 'une prise écrase la précédente (T9 rompu)',
    fichier: 'module',
    de: "    var id = 'prise-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);",
    vers: "    var id = 'prise-unique';",
    sections: '§15',
    attendu: 'T9 : chaque prise est nommée, datée, et JAMAIS écrasée',
  },
  {
    nom: 'la reprise annonce ce que la prise déclarait au lieu de relire les morceaux',
    fichier: 'module',
    de: '      return window.VoixStockage.parcourirMorceaux(_etat.db, p.id, function (m) {\n        nb++; ech += m.pcm.byteLength / 2;\n      }).then(function () {',
    vers: '      return Promise.resolve().then(function () {\n        nb = p.nbMorceaux || 0; ech = p.nbEchantillons || 0;\n      }).then(function () {',
    sections: '§7',
    attendu: 'une prise coupée déclare 0 : seul le relevé des morceaux dit ce qui a survécu (E5)',
  },
  {
    nom: 'le morceau partiel n\'est plus poussé quand la page se masque',
    fichier: 'module',
    de: "        _etat.noeud.port.postMessage({ type: 'vider-maintenant', raison: 'visibilitychange' });",
    vers: '        void 0;',
    sections: '§14',
    attendu: 'sans la poussée, tout un morceau de 5 s est perdu quand l\'onglet passe au fond',
  },

  // ── L'EXPORT WAV (E7) ─────────────────────────────────────────────────────────────────────
  {
    nom: 'l\'en-tête WAV porte le nombre d\'échantillons ANNONCÉ, pas celui relu',
    fichier: 'stockage',
    de: '        var blob = new Blob([enTeteWav(echantillons, ech)].concat(parties),',
    vers: '        var blob = new Blob([enTeteWav(prise.nbEchantillons || 0, ech)].concat(parties),',
    sections: '§9',
    attendu: 'un en-tête qui promet plus de données qu\'il n\'en suit est un fichier qui s\'ouvre et qui ment',
  },
  {
    nom: 'le WAV se déclare stéréo',
    fichier: 'stockage',
    de: "    v.setUint16(22, 1, true);                        // un canal : mono (E3)",
    vers: '    v.setUint16(22, 2, true);',
    sections: '§2b,§9',
    attendu: 'E3 : la voix est mono ; un en-tête stéréo ferait lire le fichier à double vitesse',
  },
  {
    nom: 'le WAV se déclare en 8 bits',
    fichier: 'stockage',
    de: "    v.setUint16(34, 16, true);                       // bits par échantillon (E7)",
    vers: '    v.setUint16(34, 8, true);',
    sections: '§2b,§9',
    attendu: 'E7 : WAV 16 bits sans perte',
  },
  {
    nom: 'l\'échantillonnage de l\'en-tête est figé à 48 000',
    fichier: 'stockage',
    de: '    v.setUint32(24, echantillonnage, true);\n    v.setUint32(28, echantillonnage * 2, true);      // octets par seconde',
    vers: '    v.setUint32(24, 48000, true);\n    v.setUint32(28, 48000 * 2, true);',
    sections: '§2b,§9',
    attendu: 'rien ne doit supposer 48 kHz : le micro factice de Chromium tourne à 44 100',
  },

  // ── L'INTERFACE ET LE PÉRIPHÉRIQUE ────────────────────────────────────────────────────────
  {
    nom: 'les traitements du navigateur ne sont plus désactivés (E3)',
    fichier: 'module',
    de: '      echoCancellation: false,\n      noiseSuppression: false,\n      autoGainControl: false,',
    vers: '      echoCancellation: true,\n      noiseSuppression: true,\n      autoGainControl: true,',
    sections: '§8',
    attendu: 'E3 : capture SANS traitement du navigateur, sinon la mesure ne vaut rien',
  },
  {
    nom: 'le worklet reçoit un nombre de canaux figé à 2',
    fichier: 'module',
    de: "        channelCount: 2, channelCountMode: 'max', channelInterpretation: 'discrete',",
    vers: "        channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete',",
    sections: '§3d',
    attendu: 'une entrée mono complétée de zéros fait écrire « canal vide » là où la vérité est « entrée mono »',
  },
  {
    nom: 'un composant de lot 4 entre dans l\'interface',
    fichier: 'module',
    de: "      '<div data-messages></div>' +",
    vers: "      '<div data-messages></div>' +\n      '<nav class=\"sc-bm-screen-steps\" data-lot=\"4\"><button class=\"sc-bm-segment\" disabled>Texte</button></nav>' +",
    sections: '§13',
    attendu: 'un composant d\'un lot ultérieur est ABSENT, jamais grisé',
  },
  {
    nom: 'le vu-mètre affiche une cible au lieu de la mesure',
    fichier: 'module',
    de: "      niv.textContent = fmtDb(n.efficaceDbfs);",
    vers: "      niv.textContent = fmtDb(-12);",
    sections: '§12',
    attendu: 'régression #11(e) : un chiffre affiché doit être la mesure, pas la cible',
  },
  {
    nom: 'la persistance n\'est plus demandée au navigateur',
    fichier: 'stockage',
    de: "    var dem = typeof s.persist === 'function' ? s.persist() : Promise.resolve('persist() absent');",
    vers: "    var dem = Promise.resolve('non demandée');",
    sections: '§11',
    attendu: 'Safari peut vider le stockage après sept jours : la demande se fait et sa réponse se lit',
  },
  {
    nom: 'le journal de la prise oublie l\'ouverture de la piste',
    fichier: 'module',
    de: '    _etat.journal = _etat.ouverturePiste ? [_etat.ouverturePiste] : [];',
    vers: '    _etat.journal = [];',
    sections: '§8',
    attendu: 'sans elle, plus aucune preuve que les traitements du navigateur sont désactivés',
  },

  // ── (a) LA FRÉQUENCE ───────────────────────────────────────────────────────────────────
  {
    nom: "la fréquence de 48 000 Hz est demandée au contexte",
    fichier: "module",
    de: "  var FREQUENCE_DEMANDEE = null;   // null = la fréquence native du périphérique",
    vers: "  var FREQUENCE_DEMANDEE = 48000;",
    sections: "§16",
    attendu: "demander 48 000 interpole en amont et efface la fréquence où la voix est née",
  },
  {
    nom: "le rapport annonce 48 000 Hz quelle que soit la fréquence réelle",
    fichier: "module",
    de: "        reelle_hz: _etat.echantillonnage,",
    vers: "        reelle_hz: 48000,",
    exigeAutreQue48k: true,
    sections: "§8",
    attendu: "chaque prise doit enregistrer sa fréquence RÉELLE",
  },
  {
    nom: "le rapport ne dit plus si le lot 4 devra rééchantillonner",
    fichier: "module",
    de: "        aReechantillonnerAuLot4: _etat.echantillonnage !== 48000,",
    vers: "        aReechantillonnerAuLot4: false,",
    exigeAutreQue48k: true,
    sections: "§8",
    attendu: "le lot 4 rééchantillonne toute prise qui n'est pas à 48 000, avec un avis visible",
  },
  // ── (b) LE CANAL : FENÊTRE ET VÉRIFICATION ─────────────────────────────────────────────
  {
    nom: "le canal se décide sur TOUT l'historique, non sur les deux dernières secondes",
    fichier: "module",
    de: "    var sommesDecision = f.suffisante ? f.sommes : _etat.sommesAnalyse;",
    vers: "    var sommesDecision = _etat.sommesAnalyse;",
    sections: "§17",
    attendu: "un canal momentanément actif au démarrage emporterait la décision",
  },
  {
    nom: "la fenêtre glissante ne se vide plus : elle garde tout",
    fichier: "module",
    de: "        if (cumul > limite) { _etat.fenetre = _etat.fenetre.slice(i + 1); break; }",
    vers: "        if (false) { break; }",
    sections: "§17",
    attendu: "une fenêtre qui garde tout n'est plus une fenêtre de deux secondes",
  },
  {
    nom: "le canal n'est plus revérifié sur la prise elle-même",
    fichier: "module",
    de: "        var surLaPrise = choisirCanal(_etat.sommesTotal || f.total, _etat.reglageCanal);",
    vers: "        var surLaPrise = { canal: _etat.canalRetenu, raison: _etat.canalRaison };",
    sections: "§17c",
    attendu: "la prise dure parfois cinq minutes : son canal se revérifie sur elle",
  },
  {
    nom: "le rapport porte la raison de la FENÊTRE au lieu de celle de la prise",
    fichier: "module",
    de: "      raisonDuCanal: (_etat.verificationCanal && _etat.verificationCanal.raisonSurLaPrise)\n        || _etat.canalRaison,",
    vers: "      raisonDuCanal: _etat.canalRaison,",
    sections: "§17c",
    attendu: "la raison écrite doit être calculée SUR LA PRISE, jamais sur la fenêtre d'avant",
  },
  {
    nom: "un désaccord entre le canal gelé et la prise est tu",
    fichier: "module",
    de: "        if (!_etat.verificationCanal.accord) {",
    vers: "        if (false) {",
    sections: "§17c",
    attendu: "un canal retenu qui contredit la mesure de la prise est ce qu'on ne doit pas taire",
  },
  // ── (c) UNE SEULE GRANDEUR DE TAILLE ───────────────────────────────────────────────────
  {
    nom: "la taille NOMINALE revient dans la prise, à côté de l'effective",
    fichier: "module",
    de: "        echantillonsParMorceau: _etat.echantillonsParMorceauReels,\n        nbEchantillons: 0,",
    vers: "        echantillonsParMorceau: _etat.echantillonsParMorceauReels,\n        tailleMorceau_s: _etat.tailleMorceau_s,\n        nbEchantillons: 0,",
    sections: "§6",
    attendu: "deux vérités pour une même grandeur : 220 500 contre 220 544 à 44 100 Hz",
  },
  {
    nom: "le rapport ajoute la durée nominale du morceau",
    fichier: "module",
    de: "        echantillonsParMorceau: _etat.echantillonsParMorceauReels,\n        blocsParMorceau: _etat.echantillonsParMorceauReels / 128,",
    vers: "        dureeMorceau_s: _etat.tailleMorceau_s,\n        echantillonsParMorceau: _etat.echantillonsParMorceauReels,\n        blocsParMorceau: _etat.echantillonsParMorceauReels / 128,",
    sections: "§6",
    attendu: "la taille nominale n'entre ni dans la prise ni dans le rapport",
  },
  // ── (d) LE BRUIT DE PIÈCE (T13) ────────────────────────────────────────────────────────
  {
    nom: "les seuils de bruit changent",
    fichier: "module",
    de: "    calmeMax_dbfs: -65,      // ≤ −65 : calme",
    vers: "    calmeMax_dbfs: -50,",
    sections: "§18",
    attendu: "les paliers viennent des faits : −71 à −73 en pièce calme, −55,7 à −57,9 en salle de soins",
  },
  {
    nom: "la part de grave n'est plus mesurée : le passe-bas est contourné",
    fichier: "module",
    de: "    var partGrave = b.sommeCarre > 0 ? (b.sommeCarreGrave / b.sommeCarre) : 0;",
    vers: "    var partGrave = 0;",
    sections: "§18,§18b",
    attendu: "la salle de Christophe a son énergie sous 120 Hz : un filtre la réduira au mixage",
  },
  {
    nom: "le passe-bas est calculé pour 48 kHz quelle que soit la fréquence réelle",
    fichier: "worklet",
    de: "          filtre: new PasseBas(BRUIT_COUPURE_HZ, sampleRate),",
    vers: "          filtre: new PasseBas(BRUIT_COUPURE_HZ, 48000),",
    exigeAutreQue48k: true,
    sections: "§18d",
    attendu: "à 44,1 kHz, un filtre calculé pour 48 kHz ne coupe plus à 120 Hz",
  },
  {
    nom: "le silence initial non respecté n'est plus détecté",
    fichier: "module",
    de: "    var douteux = monteeDb > BRUIT.monteeMax_db;",
    vers: "    var douteux = false;",
    sections: "§18c",
    attendu: "le fait du lot 0 : « un silence initial de 3 s n'a jamais été silencieux »",
  },
  {
    nom: "les deux moitiés de la fenêtre de bruit ne sont plus comptées",
    fichier: "worklet",
    de: "        if (b.n < b.demandes / 2) { b.n1++; b.sommeCarre1 += v * v; }\n        else { b.n2++; b.sommeCarre2 += v * v; }",
    vers: "        void 0;",
    sections: "§18b,§18c",
    attendu: "sans les deux moitiés, on ne peut plus voir qu'une voix a démarré",
  },
  {
    nom: "le bruit bloque la prise quand la pièce est bruyante",
    fichier: "module",
    de: "        message('bruit', 'info', 'La pièce est bruyante (' + fmtDb(v.efficaceDbfs)",
    vers: "        message('bruit', 'error', 'La pièce est bruyante (' + fmtDb(v.efficaceDbfs)",
    sections: "§18b",
    attendu: "T13 n'est JAMAIS bloquant : la prise se fait quand même",
  },
  // ── LA COURSE DE CONSTRUCTION DU GRAPHE ────────────────────────────────────────────────
  {
    nom: "le garde de génération est retiré du chemin de SUCCÈS",
    fichier: 'module',
    de: "      // Dépassée pendant l'attente de `addModule` : on ferme ce qu'on a créé et on ne touche à\n      // rien. Sans ce retour, ce nœud-ci s'installerait par-dessus le graphe le plus récent.\n      if (moi !== _generation) {\n        try { ctx.close(); } catch (e) {}\n        return false;\n      }",
    vers: "      void 0;",
    sections: "§19b,§19",
    equivalente: "MESURÉ, pas raisonné. Dans tout scénario reproductible, une construction dépassée voit son `addModule` REJETER — son contexte a été fermé par la construction suivante — et c'est le garde du chemin de REJET qui s'en occupe (mutation suivante, elle, bien attrapée). La branche de SUCCÈS est donc inatteignable pour une construction dépassée : il faudrait qu'elle soit dépassée dans l'intervalle de micro-tâches entre la résolution d'`addModule` et la construction du nœud, ce qu'aucun contrôle ne sait épingler. Ce garde RESTE à ce titre, et parce qu'il énonce l'invariant au lieu de s'en remettre à un comportement de navigateur que nous ne choisissons pas — mesuré ce soir : `new AudioWorkletNode` sur un contexte fermé lève InvalidStateError. Le jour où cette mutation fait échouer un contrôle, la branche est devenue atteignable et c'est cet inventaire qui est faux.",
    attendu: "les contrôles doivent PASSER : la mutation est équivalente sur le périmètre atteignable",
  },
  {
    nom: "le garde de génération est retiré du chemin de REJET",
    fichier: 'module',
    de: "      if (moi !== _generation) {\n        try { ctx.close(); } catch (e) {}\n        return false;\n      }\n      throw err;",
    vers: "      throw err;",
    sections: "§19b",
    attendu: "quand une seconde construction ferme le contexte de la première, l'addModule de celle-ci échoue : sans ce garde, Christophe voit « le graphe n'a pas pu être reconstruit » alors que la reconstruction a réussi",
  },
  {
    nom: "la fenêtre n'est plus vidée quand le graphe est reconstruit",
    fichier: "module",
    de: "    _etat.fenetre = [];\n    _etat.sommesAnalyse = null;",
    vers: "    void 0;",
    sections: "§19,§17",
    attendu: "des relevés d'un contexte fermé décideraient du canal du suivant",
  },

  {
    nom: "la prise enregistre la fréquence de la CONSTANTE, non celle du contexte",
    fichier: "module",
    de: "        echantillonnage: _etat.echantillonnage,\n        canaux: (_etat.sommesAnalyse && _etat.sommesAnalyse.canaux) || _etat.canaux || 0,",
    vers: "        echantillonnage: FREQUENCE_DEMANDEE || 48000,\n        canaux: (_etat.sommesAnalyse && _etat.sommesAnalyse.canaux) || _etat.canaux || 0,",
    exigeAutreQue48k: true,
    sections: "§16b,§8",
    attendu: "chaque prise doit enregistrer la fréquence RÉELLE de son contexte, pas une valeur de réglage",
  },
  {
    nom: "la taille de morceau est figée, au lieu de suivre la fréquence",
    fichier: "module",
    de: "          echantillonsParMorceau: Math.round(_etat.tailleMorceau_s * ctx.sampleRate),",
    vers: "          echantillonsParMorceau: 220544,",
    sections: "§16b,§6",
    attendu: "à 48 000 Hz, 5 s font 240 000 échantillons : une taille figée briserait l'entier de blocs ou la durée",
  },

  // ── UNE MUTATION ÉQUIVALENTE, AVEC SA RAISON (régression #11(h)) ──────────────────────────
  {
    nom: 'le garde isFinite de la corrélation est retiré',
    fichier: 'module',
    de: "    if (!isFinite(r)) return 'indéterminée';\n",
    vers: '',
    sections: '§2a,§3c',
    equivalente:
      'Les deux lignes qui précèdent ont déjà écarté varG <= 0 et varD <= 0, et les sommes qui ' +
      'arrivent du worklet sont finies : la division rend donc toujours un nombre fini, et ce ' +
      'garde ne peut pas se déclencher sur les cas éprouvés. Il RESTE dans le produit comme ' +
      'ceinture contre un débordement d\'accumulateur sur une prise très longue — Σx² croît ' +
      'pendant quinze minutes — cas qu\'aucun contrôle ne reproduit aujourd\'hui. Le jour où ' +
      'cette mutation fait échouer un contrôle, elle n\'est plus équivalente et c\'est cet ' +
      'inventaire qui est faux.',
    attendu: 'les contrôles doivent PASSER : la mutation est équivalente sur le périmètre éprouvé',
  },
];

function appliquer(cle, de, vers) {
  const chemin = FICHIERS[cle];
  const t = fs.readFileSync(chemin, 'utf8');
  const n = t.split(de).length - 1;
  if (n !== 1) throw new Error('ancre trouvée ' + n + ' fois dans ' + path.basename(chemin) +
    ' (il en faut exactement une) : ' + de.slice(0, 70));
  fs.writeFileSync(chemin, t.replace(de, vers));
}

function restaurer() {
  Object.keys(FICHIERS).forEach((k) => fs.writeFileSync(FICHIERS[k], original[k]));
}

// ── LA FRÉQUENCE DU PÉRIPHÉRIQUE DÉCIDE DE CE QUI EST DÉCIDABLE ─────────────────────────────
//
// Sept mutations ne sont DÉTECTABLES que si le périphérique audio n'est pas à 48 000 Hz. À
// 48 kHz elles deviennent des équivalences arithmétiques : 5 secondes font 240 000 échantillons,
// qui SONT un nombre entier de blocs de 128, donc arrondir ou non ne change rien ; la taille
// nominale égale l'effective ; « annoncer 48 000 » égale « annoncer la fréquence réelle » ; un
// passe-bas calculé pour 48 kHz EST le bon.
//
// Les déclarer « trous » serait une fausse alerte ; « équivalentes », une fausse assurance. On
// mesure donc la fréquence de la machine et on rend, pour ces sept, un verdict NON DÉCIDABLE —
// hors du compte des trous, et en disant comment obtenir le verdict.
function frequenceDeLaMachine() {
  const script = [
    "const http=require('node:http');",
    "const {chromium}=require('playwright');",
    "(async()=>{",
    "  const srv=http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end('<!doctype html><title>x</title>');});",
    "  await new Promise(r=>srv.listen(0,'127.0.0.1',r));",
    "  const b=await chromium.launch();",
    "  const p=await (await b.newContext()).newPage();",
    "  await p.goto('http://127.0.0.1:'+srv.address().port+'/');",
    "  const f=await p.evaluate(async()=>{const c=new AudioContext();const x=c.sampleRate;await c.close();return x;});",
    "  console.log(String(f)); await b.close(); srv.close();",
    "})();",
  ].join('\n');
  try {
    const sortie = execFileSync(process.execPath, ['-e', script],
      { encoding: 'utf8', timeout: 90000, env: process.env, cwd: RACINE });
    return Number(String(sortie).trim()) || 0;
  } catch (e) { return 0; }
}

function lancer(sections) {
  try {
    execFileSync(process.execPath,
      [path.join(__dirname, 'verify-enregistreur-capture.cjs'), '--seulement', sections],
      { cwd: RACINE, stdio: 'pipe', encoding: 'utf8', timeout: 240000 });
    return { passe: true, sortie: '' };
  } catch (e) {
    return { passe: false, sortie: String((e.stdout || '') + (e.stderr || '')) };
  }
}

(function main() {
  const i = process.argv.indexOf('--essai');
  const seul = i >= 0 ? Number(process.argv[i + 1]) : null;

  // ── D'ABORD LE JOURNAL, AVANT LA PREMIÈRE MUTATION ────────────────────────────────────────
  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  fs.writeFileSync(JOURNAL, JSON.stringify({
    ecritLe: new Date().toISOString(),
    pid: process.pid,
    aQuoiCaSert: 'Si ce processus est tué en pleine mutation, les sources restent mutées. ' +
      'Relancer : node tests/falsifier-enregistreur.cjs --reprendre',
    empreintes: empreinteAvant,
    sources: original,
  }, null, 1));
  console.log('Journal de reprise écrit AVANT la première mutation :');
  console.log('  ' + JOURNAL);
  console.log('  (tué en route ? node tests/falsifier-enregistreur.cjs --reprendre)\n');

  // Les ancres existent-elles toutes, une fois et une seule, AVANT de muter quoi que ce soit ?
  // Une ancre introuvable dit à la fois « ancre périmée » et « mutation restée en place ».
  const ancresCassees = [];
  ESSAIS.forEach((e, k) => {
    const t = original[e.fichier];
    const n = t.split(e.de).length - 1;
    if (n !== 1) ancresCassees.push('#' + (k + 1) + ' « ' + e.nom + ' » : ' + n + ' occurrence(s)');
  });
  if (ancresCassees.length) {
    console.error('ANCRES INVALIDES, aucune mutation appliquée :');
    ancresCassees.forEach((a) => console.error('  · ' + a));
    fs.unlinkSync(JOURNAL);
    process.exit(2);
  }
  console.log(ESSAIS.length + ' ancres vérifiées, chacune présente une fois et une seule.\n');

  const hz = frequenceDeLaMachine();
  console.log('Fréquence du périphérique audio de cette machine : '
    + (hz ? hz + ' Hz' : 'non mesurable'));
  if (hz === 48000) {
    console.log('  → sept mutations ne sont pas décidables à 48 000 Hz (voir le commentaire de');
    console.log('    `frequenceDeLaMachine`). Pour obtenir leur verdict : remettre la sortie à');
    console.log('    44 100 Hz dans Configuration audio et MIDI, puis relancer.');
  }
  console.log('');

  const resultats = [];
  const indecidables = [];
  ESSAIS.forEach((e, k) => {
    if (seul !== null && seul !== k + 1) return;
    const num = '#' + String(k + 1).padStart(2, ' ');
    const etiquette = e.equivalente ? ' [ÉQUIVALENTE]' : '';
    if (e.exigeAutreQue48k && hz === 48000) {
      console.log(num + ' [NON DÉCIDABLE à 48 000 Hz] ' + e.nom);
      console.log('     à cette fréquence la mutation est arithmétiquement équivalente : aucun');
      console.log('     contrôle ne peut la distinguer. Verdict reporté, pas escamoté.\n');
      indecidables.push({ num: k + 1, nom: e.nom });
      return;
    }
    console.log(num + etiquette + ' ' + e.nom);
    let r;
    try {
      appliquer(e.fichier, e.de, e.vers);
      r = lancer(e.sections);
    } finally {
      restaurer();
    }
    const attenduPasse = !!e.equivalente;
    const conforme = r.passe === attenduPasse;
    resultats.push({ num: k + 1, nom: e.nom, conforme, equivalente: !!e.equivalente,
                     passe: r.passe, sections: e.sections });
    if (conforme) {
      console.log('     ' + (e.equivalente
        ? 'les contrôles PASSENT, comme attendu d\'une mutation équivalente'
        : 'les contrôles ÉCHOUENT, comme ils le doivent (' + e.sections + ')'));
    } else if (e.equivalente) {
      console.log('     PROBLÈME : la mutation dite équivalente FAIT ÉCHOUER ' + e.sections + '.');
      console.log('     Elle n\'est donc pas équivalente : c\'est cet inventaire qui est faux.');
      console.log('     Raison consignée : ' + e.equivalente);
    } else {
      console.log('     TROU : les contrôles PASSENT malgré la mutation.');
      console.log('     Ce qui devait être attrapé : ' + e.attendu);
    }
    console.log('');
  });

  // ── RESTAURATION VÉRIFIÉE, PUIS LE JOURNAL EST RETIRÉ ─────────────────────────────────────
  const divergents = [];
  Object.keys(FICHIERS).forEach((k) => {
    const e = sha(fs.readFileSync(FICHIERS[k], 'utf8'));
    if (e !== empreinteAvant[k]) divergents.push(path.basename(FICHIERS[k]) + ' : ' + e.slice(0, 16) +
      ' au lieu de ' + empreinteAvant[k].slice(0, 16));
  });

  // Chaque ancre doit exister à nouveau, une fois et une seule : la preuve qu'aucune mutation
  // n'est restée en place.
  const ancresApres = [];
  ESSAIS.forEach((e, k) => {
    const t = fs.readFileSync(FICHIERS[e.fichier], 'utf8');
    const n = t.split(e.de).length - 1;
    if (n !== 1) ancresApres.push('#' + (k + 1) + ' : ' + n + ' occurrence(s)');
  });

  console.log('─'.repeat(78));
  Object.keys(FICHIERS).forEach((k) =>
    console.log('  ' + empreinteAvant[k].slice(0, 16) + '  ' + path.basename(FICHIERS[k]) +
                (divergents.some((d) => d.startsWith(path.basename(FICHIERS[k]))) ? '  DIVERGENT' : '  restauré')));

  if (divergents.length || ancresApres.length) {
    console.error('\nRESTAURATION INCOMPLÈTE — le journal de reprise est CONSERVÉ :');
    divergents.forEach((d) => console.error('  · ' + d));
    ancresApres.forEach((a) => console.error('  · ancre ' + a));
    console.error('  node tests/falsifier-enregistreur.cjs --reprendre');
    process.exit(1);
  }
  fs.unlinkSync(JOURNAL);
  console.log('  ' + ESSAIS.length + ' ancres de nouveau présentes une fois et une seule.');
  console.log('  Journal de reprise retiré : les sources sont dans leur état d\'origine.\n');

  const trous = resultats.filter((r) => !r.conforme && !r.equivalente);
  const fausseEquiv = resultats.filter((r) => !r.conforme && r.equivalente);
  const equiv = resultats.filter((r) => r.conforme && r.equivalente);
  console.log(resultats.length + ' mutations jouées · ' + (resultats.length - trous.length - fausseEquiv.length) +
    ' conformes · ' + equiv.length + ' équivalentes consignées · ' + trous.length + ' trou(s) · ' +
    fausseEquiv.length + ' fausse(s) équivalence(s)'
    + (indecidables.length ? ' · ' + indecidables.length + ' NON DÉCIDABLE(S) à ' + hz + ' Hz' : ''));
  if (indecidables.length) {
    console.log('Non décidables sur cette machine — verdict à rendre à une autre fréquence :');
    indecidables.forEach((r) => console.log('  #' + r.num + ' ' + r.nom));
  }
  if (trous.length || fausseEquiv.length) {
    trous.forEach((r) => console.log('  TROU #' + r.num + ' ' + r.nom));
    fausseEquiv.forEach((r) => console.log('  FAUSSE ÉQUIVALENCE #' + r.num + ' ' + r.nom));
    process.exit(1);
  }
  console.log('\nPASS falsifier-enregistreur — chaque contrôle échoue quand il le doit.');
})();
