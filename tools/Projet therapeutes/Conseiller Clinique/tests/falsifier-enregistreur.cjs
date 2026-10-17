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
  // (jalon II) La bande rythmo est un module à part, sans DOM ni audio : ses mutations
  // visent la logique de défilement, qui est là et nulle part ailleurs.
  bande: path.join(RACINE, 'bande-rythmo.js'),
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
    sections: '§5a,§27',
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
    sections: '§27',
    attendu: 'un morceau qui n\'est pas un nombre entier de blocs ferait tomber un repère à cheval',
  },
  {
    nom: 'la prise consigne la taille DEMANDÉE au lieu de la taille appliquée',
    fichier: 'module',
    de: '      echantillonsParMorceau: a.echantillonsParMorceauAppliquee,',
    vers: '      echantillonsParMorceau: Math.round(a.echantillonnage * 5),',
    sections: '§28',
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
    de: "    var id = prolonge\n      || ('prise-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));",
    vers: "    var id = 'prise-unique';",
    sections: '§15',
    attendu: 'T9 : chaque prise est nommée, datée, et JAMAIS écrasée',
  },
  {
    nom: 'la reprise annonce ce que la prise déclarait au lieu de relire les morceaux',
    fichier: 'module',
    de: '      return relireLesCompteurs(p.id).then(function (vrai) {\n        var nb = vrai.nbMorceaux, ech = vrai.nbEchantillons;',
    vers: '      return Promise.resolve().then(function () {\n        var nb = p.nbMorceaux || 0, ech = p.nbEchantillons || 0;',
    sections: '§7b',
    attendu: 'seul le relevé des morceaux dit ce qui est là : depuis T1 ter les compteurs de la prise sont écrits à chaque morceau, donc §7b fabrique l\'écart à coup sûr (E5)',
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
    de: "      reelle_hz: echantillonnage,",
    vers: "      reelle_hz: 48000,",
    sections: "§28",
    attendu: "chaque prise doit enregistrer sa fréquence RÉELLE",
  },
  {
    nom: "le rapport ne dit plus si le lot 4 devra rééchantillonner",
    fichier: "module",
    de: "      aReechantillonnerAuLot4: echantillonnage !== 48000,",
    vers: "      aReechantillonnerAuLot4: false,",
    sections: "§28",
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
    nom: "le verdict de la prise porte la raison de la FENÊTRE au lieu de celle de la prise",
    fichier: "module",
    de: "            raison: _etat.verificationCanal.raisonSurLaPrise,",
    vers: "            raison: _etat.verificationCanal.raisonAvantLaPrise,",
    sections: "§17c,§35",
    attendu: "E3 : le verdict de la prise est calculé SUR LA PRISE ; la raison de la fenêtre est celle du canal utilisé, et elle a son propre champ (D)",
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
    de: "      echantillonsParMorceau: a.echantillonsParMorceauAppliquee,\n",
    vers: "      echantillonsParMorceau: a.echantillonsParMorceauAppliquee,\n      tailleMorceauNominale_s: 5,\n",
    sections: "§28",
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
  // ── (d) LE BRUIT DE PIÈCE (T13), ESTIMATEUR ROBUSTE ────────────────────────────────────
  {
    nom: "les seuils de bruit changent",
    fichier: "module",
    de: "    calmeMax_dbfs: -65,      // ≤ −65 : calme",
    vers: "    calmeMax_dbfs: -50,",
    sections: "§18",
    attendu: "les paliers sont ceux du CDC : −71 à −73 en pièce calme, −55,7 à −57,9 en salle de soins",
  },
  {
    nom: "le plancher robuste redevient la valeur efficace de la fenêtre entière",
    fichier: "module",
    de: "    var plancher = centile(population.map(function (f) { return f.niveau; }), BRUIT.centile);",
    vers: "    var plancher = dbFenetreEntiere;",
    sections: "§18c,§18f",
    attendu: "C'EST LE DÉFAUT 1 LUI-MÊME : une moyenne d'énergie annonce « correct » là où le plancher est à −75 dBFS",
  },
  {
    nom: "le 20e centile devient le 95e : le plancher attrape les bruits brefs",
    fichier: "module",
    de: "    centile: 20,",
    vers: "    centile: 95,",
    sections: "§18c",
    attendu: "un centile haut décrit les événements, pas le plancher de la pièce",
  },
  {
    nom: "le centile devient un minimum (rang 0)",
    fichier: "module",
    de: "    var rang = Math.floor((pourCent / 100) * (tries.length - 1));",
    vers: "    var rang = 0;",
    sections: "§18g",
    attendu: "la convention du produit doit être celle du témoin du générateur, au millième de dB",
  },
  {
    nom: "la fenêtre de l'estimateur passe de 100 ms à 1 s",
    fichier: "worklet",
    de: "const BRUIT_FENETRE_S = 0.1;",
    vers: "const BRUIT_FENETRE_S = 1.0;",
    sections: "§18c,§18g",
    attendu: "à 1 s, chaque fenêtre contient plusieurs bruits brefs : le centile redevient une moyenne",
  },
  {
    nom: "le worklet ne livre plus aucune fenêtre",
    fichier: "worklet",
    de: "        if (f.n >= f.parFenetre) {",
    vers: "        if (false) {",
    sections: "§18b,§18c",
    attendu: "sans fenêtres, aucun plancher n'existe : la mesure doit se dire non concluante, pas inventer",
  },
  {
    nom: "l'état « aucun signal » est retiré : un micro muet redevient « calme »",
    fichier: "module",
    de: "    if (b.zeros === b.n) {",
    vers: "    if (false) {",
    sections: "§21,§18",
    attendu: "T13 : un micro muet n'est JAMAIS calme — c'était « CALME — −∞ dB » aux essais",
  },
  {
    nom: "la détection de voix dans le silence initial est retirée",
    fichier: "module",
    de: "    var silenceRespecte = voix.length === 0;",
    vers: "    var silenceRespecte = true;",
    sections: "§18f",
    attendu: "T13 : le silence n'est déclaré respecté que si la fenêtre ne contient pas de voix",
  },
  {
    nom: "le repli sur la pause la plus calme est retiré",
    fichier: "module",
    de: "    } else if (lesPauses.length) {",
    vers: "    } else if (false) {",
    sections: "§18f",
    attendu: "T13 : quand le silence initial n'est pas tenu, l'ambiance se prélève dans une pause",
  },
  {
    nom: "un bruit bref de 80 ms est désormais compté comme de la voix",
    fichier: "module",
    de: "    dureeVoixMin_s: 0.3,",
    vers: "    dureeVoixMin_s: 0.002,",
    sections: "§18c",
    attendu: "les claquements de touche durent 50 à 80 ms : ils ne sont pas de la voix",
  },
  {
    nom: "la marge d'occupation passe à 40 dB : plus rien n'est jamais occupé",
    fichier: "module",
    de: "    margeOccupee_db: 12,",
    vers: "    margeOccupee_db: 40,",
    sections: "§18c,§18f",
    attendu: "ni les bruits brefs ni la voix ne seraient plus vus : 12 dB est encadré par deux mesures",
  },
  {
    nom: "la part de grave est calculée sur TOUTES les fenêtres, bruits brefs compris",
    fichier: "module",
    de: "      return f.niveau !== null && f.niveau <= plancher + tolerance;",
    vers: "      return f.niveau !== null;",
    sections: "§18c",
    attendu: "T13 : « grave dominant » se recalcule sur le plancher robuste, un clic étant large bande",
  },
  {
    nom: "la part de grave n'est plus mesurée du tout",
    fichier: "module",
    de: "    var pg = partDeGraveDuPlancher(population, plancher, BRUIT.tolerancePlancher_db);",
    vers: "    var pg = { part: 0, fenetres: 0 };",
    sections: "§18,§18b",
    attendu: "la salle de Christophe a son énergie sous 120 Hz : un filtre la réduira au mixage",
  },
  {
    nom: "le passe-bas est calculé pour 48 kHz quelle que soit la fréquence réelle",
    fichier: "worklet",
    de: "        this.filtreGrave = new PasseBas(BRUIT_COUPURE_HZ, sampleRate);",
    vers: "        this.filtreGrave = new PasseBas(BRUIT_COUPURE_HZ, 48000);",
    sections: "§27",
    attendu: "à 44,1 kHz, un filtre calculé pour 48 kHz ne coupe plus à 120 Hz",
  },
  {
    nom: "le bruit bloque la prise quand la pièce est bruyante",
    fichier: "module",
    de: "      message('bruit', 'info', 'La pièce est bruyante (plancher ' + fmtDb(v.plancherDbfs)",
    vers: "      message('bruit', 'error', 'La pièce est bruyante (plancher ' + fmtDb(v.plancherDbfs)",
    sections: "§18b",
    attendu: "T13 n'est JAMAIS bloquant : la prise se fait quand même",
  },

  // ── (D4) LE CHIFFRE PÉRIMÉ ─────────────────────────────────────────────────────────────
  {
    nom: "hors prise, la position courante redevient celle du dernier relevé",
    fichier: "module",
    de: "    if (!_etat.enPrise) return 0;",
    vers: "    if (false) return 0;",
    sections: "§22b",
    attendu: "DÉFAUT 4 : « contexte running » daté à la longueur exacte de la prise précédente",
  },
  {
    nom: "le worklet garde son compteur d'échantillons après l'arrêt",
    fichier: "worklet",
    de: "        this.echantillonsEcrits = 0;\n      } else if (m.type === 'mettre-en-pause') {",
    vers: "      } else if (m.type === 'mettre-en-pause') {",
    sections: "§22b",
    attendu: "la seconde garde : entre deux prises, le relevé du worklet doit porter zéro",
  },
  {
    nom: "le journal ne dit plus quand une entrée est hors prise",
    fichier: "module",
    de: "    else e.horsPrise = true;",
    vers: "    else void 0;",
    sections: "§22",
    attendu: "sans attribution, rien ne permet de constater qu'une position appartient à sa prise",
  },

  // ── (D3) L'ÉTAT DE LA PISTE ────────────────────────────────────────────────────────────
  {
    nom: "l'état de la piste n'est plus relu à chaque relevé",
    fichier: "module",
    de: "  function peindreReleve(m) {\n    peindreEtats();",
    vers: "  function peindreReleve(m) {",
    equivalente: true,
    sections: "§23",
    attendu: "ÉQUIVALENTE DEPUIS T1 TER, et la raison se dit : ce repeint par relevé était, à "
      + "T1 bis, le SEUL chemin qui rendait une piste morte visible, `track.stop()` ne "
      + "déclenchant aucun événement. Depuis que la perte du micro met la prise en pause (E8), "
      + "c'est `surveillerLeMicro` qui constate la mort et qui repeint elle-même : tous les "
      + "états affichés sont désormais repeints par leur propre gestionnaire, et aucun contrôle "
      + "ne peut voir l'absence de ce repeint-là. Il reste en place comme filet — un état lu "
      + "vaut mieux qu'un état mémorisé — et la garde qui porte réellement la garantie est la "
      + "SURVEILLANCE à chaque relevé, que la mutation suivante éprouve.",
  },
  {
    nom: "la surveillance du micro ne tourne plus à chaque relevé",
    fichier: "module",
    de: "    // (E8) LA PERTE DU MICRO SE CONSTATE ICI, vingt fois par seconde : `track.stop()` ne\n    // déclenche aucun événement, et une piste morte continue de livrer des zéros.\n    surveillerLeMicro();",
    vers: "    void 0;",
    sections: "§31",
    attendu: "une piste morte ne déclenche AUCUN événement et le contexte reste running : le relevé est le seul chemin de détection (E8)",
  },
  {
    nom: "une piste terminée est annoncée vivante",
    fichier: "module",
    de: "    if (piste.readyState === 'ended') return 'terminée (périphérique retiré ou repris)';",
    vers: "    if (false) return 'terminée (périphérique retiré ou repris)';",
    sections: "§23",
    attendu: "DÉFAUT 3 : la barre affichait « contexte running » au lieu de « terminée »",
  },
  {
    nom: "les pistes du flux précédent ne sont plus arrêtées",
    fichier: "module",
    de: "        _etat.flux.getAudioTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });",
    vers: "        void 0;",
    sections: "§23b",
    attendu: "deux pistes vivantes écrivaient deux fois « piste terminée » pour un seul fait",
  },

  // ── (D5) SIGNAL PERDU CONTRE PASSAGE MUET ──────────────────────────────────────────────
  {
    nom: "un signal perdu jusqu'à la fin redevient « un passage muet »",
    fichier: "module",
    de: "    var signalPerdu = !muette && dernierMuet >= 0 && dernierRetour < dernierMuet;",
    vers: "    var signalPerdu = false;",
    sections: "§26",
    attendu: "DÉFAUT 5 : une prise à 68 % de zéros jusqu'à la fin n'a pas « un passage » muet",
  },

  // ── (D6) LA FICHE D'UNE PRISE INACHEVÉE ────────────────────────────────────────────────
  {
    nom: "une prise inachevée n'est plus relue : la fiche reprend ses compteurs",
    fichier: "module",
    de: "    if (p.etat !== 'en-cours') {",
    vers: "    if (true) {",
    sections: "§25",
    attendu: "DÉFAUT 6 : « 0 morceau, 0,00 Mo » alors que 7 morceaux étaient en base",
  },

  // ── (D2) LES ALERTES (E8) ──────────────────────────────────────────────────────────────
  {
    nom: "l'alerte retombe parmi les avis, qui peuvent la repousser",
    fichier: "module",
    de: "    var hote = q(CLES_ALERTE[cle] ? '[data-alerte]' : '[data-messages]');",
    vers: "    var hote = q('[data-messages]');",
    sections: "§24,§24b",
    attendu: "E8 : l'alerte est fixée en haut ; les avis passés ne doivent pas l'empiler dessous",
  },
  {
    nom: "le bandeau n'est plus rafraîchi : sa durée se figE",
    fichier: "module",
    de: "    if (_etat.muet && _etat.enPrise) {\n      message('muet', 'error', texteAlerteMuette(_etat.muetDepuis,",
    vers: "    if (false) {\n      message('muet', 'error', texteAlerteMuette(_etat.muetDepuis,",
    sections: "§24",
    attendu: "DÉFAUT 2 : « depuis 2,0 s » figé alors que le signal manquait depuis plus de 5 s",
  },
  {
    nom: "une vidange sans rien à pousser est consignée comme un morceau poussé",
    fichier: "module",
    de: "      journaliser(m.echantillonsPousses > 0 ? 'morceau partiel poussé'\n                                            : 'vidange demandée, rien à pousser',",
    vers: "      journaliser('morceau partiel poussé',",
    sections: "§29",
    attendu: "DÉFAUT 3 : « morceau partiel poussé » deux fois, dont une à 0 échantillon",
  },
  {
    nom: "les avis de la prise précédente survivent à la suivante",
    fichier: "module",
    de: "    viderTousLesAvis();",
    vers: "    void 0;",
    sections: "§24b",
    attendu: "E8 : l'alerte ne reste pas affichée à la prise suivante",
  },
  {
    nom: "le bandeau est collé au PANNEAU et non à la fenêtre",
    fichier: "module",
    de: "      '<div data-alerte style=\"position:fixed;top:0;left:0;right:0;z-index:60;' +",
    vers: "      '<div data-alerte style=\"position:sticky;top:0;left:0;right:0;z-index:60;' +",
    sections: "§24,§24c",
    attendu: "E8 dit « fixée en haut de la FENÊTRE » : `sticky` la laisse partir avec le panneau",
  },
  {
    nom: "l'intitulé reste « Enregistrement » après l'arrêt",
    fichier: "module",
    de: "          if (intitule) intitule.textContent = 'Dernière prise';",
    vers: "          void 0;",
    sections: "§24",
    attendu: "DÉFAUT 2 : « Enregistrement 01:16,221 » restait affiché après l'arrêt",
  },

  // ── LA COURSE DE CONSTRUCTION DU GRAPHE ────────────────────────────────────────────────  // ── (R6) LA BANDE SUIT L'HORLOGE AUDIO ─────────────────────────────────────────────────
  {
    nom: "la bande suit l'horloge de l'interface au lieu de l'horloge audio",
    fichier: "bande",
    de: "    var secondes = ech / hz;",
    vers: "    var secondes = (Date.now() % 1000000) / 1000;",
    sections: "§38,§43",
    attendu: "R6 : « Le défilement suit l'horloge audio, jamais celle de l'interface » — en pause la bande doit se figer",
  },

  // ── (E13) L'EMPREINTE DES MODULES ──────────────────────────────────────────────────────
  {
    nom: "l'empreinte devient une constante écrite à la main",
    fichier: "module",
    de: "        return crypto.subtle.digest('SHA-256', octets).then(function (h) {",
    vers: "        return Promise.resolve(new ArrayBuffer(32)).then(function (h) {",
    sections: "§39",
    attendu: "E13 : l'empreinte est le condensat du CONTENU servi ; une constante se périme en silence",
  },

  // ── (T13, avenant 6) L'AMBIANCE NON MESURABLE ──────────────────────────────────────────
  {
    nom: "sans pause, l'ambiance est estimée dans la voix au lieu d'être dite non mesurable",
    fichier: "module",
    de: "      return {\n        mesure: true,\n        echantillons: b.n,\n        secondes: b.echantillonnage ? b.n / b.echantillonnage : 0,\n        etat: 'non mesurable',",
    vers: "      population = pleines.filter(function (f) { return f.niveau !== null; });\n      source = 'toute la prise';\n    }\n    if (false) {\n      return {\n        mesure: true,\n        echantillons: b.n,\n        secondes: 0,\n        etat: 'non mesurable',",
    sections: "§40",
    attendu: "T13 : « une estimation prise dans la voix serait une fausse alerte » — « bruyant » à tort sur de la parole continue",
  },

  // ── (E4, E9, T14) LES REPÈRES ──────────────────────────────────────────────────────────
  {
    nom: "la répétition automatique d'une touche maintenue pose des repères",
    fichier: "module",
    de: "      if (ev.repeat) {",
    vers: "      if (false) {",
    sections: "§41",
    attendu: "E9 : « les répétitions automatiques d'une touche maintenue sont ignorées » — quatre repères en 0,3 s au lot 0",
  },
  {
    nom: "l'antirebond des repères est retiré",
    fichier: "module",
    de: "    var verdict = window.BandeRythmo.antirebond(_etat.dernierRepere, ech,",
    vers: "    var verdict = { accepte: true, raison: 'sans antirebond' } || window.BandeRythmo.antirebond(_etat.dernierRepere, ech,",
    sections: "§41",
    attendu: "E9 : « deux repères à moins de 250 ms sont signalés avant validation »",
  },
  {
    nom: "un repère est daté sur l'horloge de l'interface",
    fichier: "module",
    de: "    var ech = impose ? Math.max(0, Math.round(positionImposee)) : echantillonsCourants();",
    vers: "    var ech = impose ? Math.max(0, Math.round(positionImposee)) : Math.round(performance.now() * 48);",
    sections: "§41",
    attendu: "le repère est horodaté dans le fil audio (indice d'échantillon), jamais avec l'horloge de l'interface",
  },

  // ── (E2, E10) LE COMPTE À REBOURS ──────────────────────────────────────────────────────
  {
    nom: "la dernière seconde du rebours ne dure pas une seconde",
    fichier: "module",
    de: "        return attendreMs(1000).then(function () { return finirLeRebours(); });",
    vers: "        return finirLeRebours();",
    sections: "§42",
    attendu: "E2 : un compte à rebours de 3 secondes doit prendre trois secondes, la dernière comprise",
  },
  {
    nom: "la garde après le dernier bip est retirée",
    fichier: "module",
    de: "        return attendreMs(GARDE_APRES_REBOURS_S * 1000).then(function () {",
    vers: "        return attendreMs(0).then(function () {",
    sections: "§42",
    attendu: "E10 : la traîne du dernier bip entrerait dans les premiers échantillons de la voix",
  },

  // ── (3) LA LATENCE ET LA DATATION D'UNE SESSION REPRISE ────────────────────────────────
  {
    nom: "la latence du démarrage redevient négative sur une session reprise",
    fichier: "module",
    de: "          : (_etat.generationDuDebut !== _generation)",
    vers: "          : (false)",
    sections: "§31",
    attendu: "une latence ne peut pas être négative : −1 504 ms relevés le 17 octobre, deux horloges soustraites",
  },
  {
    nom: "« piste ouverte » d'une session reprise est datée à zéro",
    fichier: "module",
    de: "        _etat.ouverturePiste = journaliser('piste ouverte', echantillonsCourants(), {",
    vers: "        _etat.ouverturePiste = journaliser('piste ouverte', 0, {",
    sections: "§31",
    attendu: "la piste rouverte s'ouvre au MILIEU de la prise : la dater à zéro la place avant son début",
  },

  // ── (E3, avenant 5) LE MIXAGE NE MOYENNE JAMAIS UN CANAL VIDE ──────────────────────────
  {
    nom: "le diviseur de la moyenne redevient le nombre de canaux, mort ou vif",
    fichier: "worklet",
    de: "          const k = (gVivant ? 1 : 0) + (dVivant ? 1 : 0);",
    vers: "          const k = d ? 2 : 1;",
    sections: "§35,§3a",
    attendu: "E3 : la moyenne sur un canal vide retire 6,02 dB — mesuré sur 3 prises de Christophe sur 12",
  },
  {
    nom: "un canal est présumé vivant au début de la prise au lieu de le prouver",
    fichier: "worklet",
    de: "        this.depuisNonZeroG = this.maintienCanal;\n        this.depuisNonZeroD = this.maintienCanal;",
    vers: "        this.depuisNonZeroG = 0;\n        this.depuisNonZeroD = 0;",
    sections: "§3a",
    attendu: "un canal vide compté vivant pendant le maintien fait un quart de seconde à −6 dB au début de chaque prise",
  },
  {
    nom: "le mixage effectif n'est plus dit : « moyenne » sans savoir sur combien de canaux",
    fichier: "module",
    de: "        raison: _etat.canalRaison,",
    vers: "        raison: (_etat.verificationCanal && _etat.verificationCanal.raisonSurLaPrise) || _etat.canalRaison,",
    sections: "§35",
    attendu: "D : le canal utilisé porte la raison de CE canal-là, non le verdict de la prise (E3, avenant 5)",
  },
  {
    nom: "le graphe de capture n'est plus relevé",
    fichier: "module",
    de: "      grapheDeCapture: _etat.grapheDeCapture || 'graphe non construit',",
    vers: "      grapheDeCapture: 'non relevé',",
    sections: "§12",
    attendu: "A : ce que le graphe déclare doit être écrit, pas supposé — c'était la première question à poser",
  },

  // ── (T13, avenant 5) L'AMBIANCE NE VIENT QUE DE L'AUDIO ÉCRIT ──────────────────────────
  {
    nom: "les fenêtres ne disent plus si leurs échantillons sont écrits",
    fichier: "worklet",
    de: "            ecrit: f.ecrit,",
    vers: "            ecrit: true,",
    sections: "§36",
    attendu: "T13 : le temps de pause n'est jamais une source d'ambiance — plancher annoncé −91,6 au lieu de −81,7",
  },
  {
    nom: "le verdict ne filtre plus sur les fenêtres écrites",
    fichier: "module",
    de: "    var toutes = brutes.filter(function (f) { return f.ecrit; });",
    vers: "    var toutes = brutes;",
    sections: "§36",
    attendu: "T13 (avenant 5) : « l'ambiance n'est prélevée que dans un passage ÉCRIT de la prise »",
  },
  {
    nom: "la fenêtre en cours n'est plus jetée à la frontière de la pause",
    fichier: "worklet",
    de: "          fp.ecrit = false;",
    vers: "          fp.ecrit = true;",
    sections: "§36",
    attendu: "une fenêtre moitié écrite moitié non écrite n'est ni l'un ni l'autre",
  },

  // ── (C) LA CONTINUATION ────────────────────────────────────────────────────────────────
  {
    nom: "une continuation mesure l'ambiance sur sa seule nouvelle partie",
    fichier: "module",
    de: "      if (prolonge) {\n        // ── (T13, avenant 5 / C) SUR UNE CONTINUATION",
    vers: "      if (false) {\n        // ── (T13, avenant 5 / C) SUR UNE CONTINUATION",
    sections: "§37",
    attendu: "le rapport du 11 octobre 19:36 annonçait « 2 passages de voix dans le silence initial » — une continuation n'en a pas",
  },
  {
    nom: "l'écart vu / écrit compare la session au total cumulé de la prise",
    fichier: "module",
    de: "            ecart: fin.echantillonsVus - (fin.echantillonsEcritsCetteSession || 0),",
    vers: "            ecart: fin.echantillonsVus - _etat.echantillonsEcrits,",
    sections: "§37",
    attendu: "C : « ecartVuEcrit −1 440 000 » mêlait deux domaines et ne décrivait rien",
  },

  // ── (E12) LA PAUSE, LA REPRISE, LA CONTINUATION ────────────────────────────────────────
  {
    nom: "la pause continue d'écrire : elle ne change pas de mode",
    fichier: "worklet",
    de: "        this.mode = 'analyse';\n        // (T13, avenant 5) LA FENÊTRE EN COURS EST JETÉE",
    vers: "        // (T13, avenant 5) LA FENÊTRE EN COURS EST JETÉE",
    sections: "§30",
    attendu: "E12 : en pause, AUCUN échantillon n'est écrit et la pause n'occupe aucun temps dans la voix",
  },
  {
    nom: "les zéros de la fin ne sont plus retirés quand le micro est perdu",
    fichier: "worklet",
    de: "          this.dansLeMorceau -= retires;\n          this.echantillonsEcrits -= retires;",
    vers: "          retires = 0;",
    sections: "§31",
    attendu: "E8 : « aucun zéro n'est écrit » quand la piste se termine ou que le contexte est interrompu",
  },
  {
    nom: "une continuation repart de l'index 0 : elle écrase les morceaux de la prise",
    fichier: "worklet",
    de: "        this.indexMorceau = Math.max(0, Math.round(m.indexDepart || 0));",
    vers: "        this.indexMorceau = 0;",
    sections: "§32",
    attendu: "E12 : la continuation prolonge la MÊME prise, sans créer de bout à part",
  },
  {
    nom: "une continuation repart de l'échantillon 0 : les positions du journal mentent",
    fichier: "worklet",
    de: "        this.echantillonsEcrits = Math.max(0, Math.round(m.echantillonsDepart || 0));",
    vers: "        this.echantillonsEcrits = 0;",
    sections: "§32",
    attendu: "E12 : les repères restent comptés en échantillons depuis le DÉBUT de la prise",
  },
  {
    nom: "la touche et le bouton ne font plus que mettre en pause, jamais reprendre",
    fichier: "module",
    de: "    if (!_etat.enPrise || !_etat.noeud) return Promise.resolve(null);\n    if (_etat.enPause) {",
    vers: "    if (!_etat.enPrise || !_etat.noeud) return Promise.resolve(null);\n    if (false) {",
    sections: "§30",
    attendu: "E12 : « une seule touche bascule pause ET reprise »",
  },
  {
    nom: "une piste terminée n'est plus vue comme une perte de micro",
    fichier: "module",
    de: "    if (piste && piste.readyState === 'ended') cause = 'la piste audio s\\'est terminée';",
    vers: "    if (false) cause = 'la piste audio s\\'est terminée';",
    sections: "§31",
    attendu: "E8 : quand la piste se termine, la prise se met en pause d'elle-même",
  },
  {
    nom: "un contexte interrompu n'est plus vu comme une perte de micro",
    fichier: "module",
    de: "    else if (ctxEtat === 'suspended' || ctxEtat === 'interrupted') cause = 'le contexte audio est ' + ctxEtat;",
    vers: "    else if (false) cause = 'le contexte audio est ' + ctxEtat;",
    sections: "§31b",
    attendu: "E8 nomme les deux : piste terminée OU contexte interrompu",
  },
  {
    nom: "la surveillance ne tourne plus sur le changement d'état du contexte",
    fichier: "module",
    de: "        surveillerLeMicro();",
    vers: "        void 0;",
    sections: "§31b",
    attendu: "un contexte suspendu ne produit plus de relevé : c'est le seul chemin de détection",
  },
  {
    nom: "le worklet ajoute une SECONDE entrée de pause au lieu de compléter la première",
    fichier: "module",
    de: "      if (m.raison === 'micro perdu' && _etat.entreeDePause) {",
    vers: "      if (false) {",
    sections: "§31b",
    attendu: "un seul raccord de pause, quels que soient les chemins de détection (§29)",
  },
  {
    nom: "le journal n'est plus écrit qu'à l'arrêt : un crash perd tous les raccords",
    fichier: "module",
    de: "        return window.VoixStockage.majPrise(_etat.db, priseId, {\n          nbEchantillons: _etat.echantillonsEcrits,",
    vers: "        return Promise.resolve(0) || window.VoixStockage.majPrise(_etat.db, priseId, {\n          nbEchantillons: _etat.echantillonsEcrits,",
    sections: "§32",
    attendu: "E12 : chaque pause est journalisée ; une prise qu'on peut continuer se souvient",
  },
  {
    nom: "la reprise après perte n'attend plus l'accusé du NOUVEAU worklet",
    fichier: "module",
    de: "      _etat.priseDemarreeRecue = false;\n      _etat.noeud.port.postMessage({ type: 'demarrer-prise', canal: _etat.canalRetenu,",
    vers: "      _etat.noeud.port.postMessage({ type: 'demarrer-prise', canal: _etat.canalRetenu,",
    equivalente: true,
    sections: "§31",
    attendu: "ÉQUIVALENTE DANS CE NAVIGATEUR, et la raison se dit : sans cette remise à faux, "
      + "l'attente est satisfaite par l'accusé du worklet PRÉCÉDENT — celui d'un contexte qu'on "
      + "vient de fermer. Le défaut est donc une COURSE : le module croit le nouveau worklet "
      + "prêt avant qu'il ait rien reçu. Chromium reconstruit le graphe en quelques "
      + "millisecondes et le nouveau worklet accuse réception dans le même tour, si bien "
      + "qu'aucun contrôle ne peut séparer les deux cas. Ce qui la rendrait décidable : servir "
      + "le worklet avec le levier `?lent=NNN` du serveur de contrôle (celui dont se sert §19b) "
      + "pendant la reprise, pour que l'accusé du neuf arrive après la suite du code. La garde "
      + "reste en place : une course qu'on ne sait pas reproduire reste une course.",
  },
  {
    nom: "une continuation jette le journal de la prise au lieu de le reprendre",
    fichier: "module",
    de: "        _etat.journal = (d.prise.journal || []).slice();",
    vers: "        _etat.journal = [];",
    sections: "§32",
    attendu: "E12 : une prise continuée se souvient de ses raccords ; les jeter les perdrait pour de bon",
  },

  // ── (E12, point 5) L'IMPORT D'UNE VOIX ─────────────────────────────────────────────────
  {
    nom: "l'import accepte n'importe quelle profondeur de bits",
    fichier: "module",
    de: "    if (fmt.bits !== 16 && fmt.bits !== 24) {",
    vers: "    if (false) {",
    sections: "§33",
    attendu: "E12 nomme le PCM 16 ou 24 bits : accepter du 8 bits écrirait une voix sans échelle vérifiée",
  },
  {
    nom: "l'import accepte n'importe quel nombre de canaux",
    fichier: "module",
    de: "    if (fmt.canaux !== 1 && fmt.canaux !== 2) {",
    vers: "    if (false) {",
    sections: "§33",
    attendu: "E12 nomme le mono et la stéréo, et rien d'autre",
  },
  {
    nom: "un morceau importé n'est plus un nombre entier de blocs de 128",
    fichier: "module",
    de: "      var parMorceau = Math.max(128, Math.round(demandee / 128) * 128);",
    vers: "      var parMorceau = demandee;",
    sections: "§33",
    attendu: "E11 vaut aussi pour une prise importée : 220 500 n'est pas un entier de blocs",
  },

  // ── (E11 / E12) LE RÉÉCHANTILLONNAGE DE LA NOUVELLE PARTIE ─────────────────────────────
  {
    nom: "la nouvelle partie n'est plus rééchantillonnée",
    fichier: "module",
    de: "        if (!vers || vers === de) return pcm;",
    vers: "        return pcm;",
    sections: "§34",
    attendu: "E12 : si le périphérique a changé de fréquence, la nouvelle partie est rééchantillonnée",
  },
  {
    nom: "la position d'un morceau rééchantillonné reste celle du worklet",
    fichier: "module",
    de: "        var position = (vers && vers !== de) ? _etat.echantillonsEcrits : debut;",
    vers: "        var position = debut;",
    sections: "§34",
    attendu: "le worklet compte dans la fréquence du périphérique, la prise vit dans la sienne",
  },
  {
    nom: "le changement de fréquence n'est plus dit",
    fichier: "module",
    de: "          _etat.reechantillonnerVers = d.prise.echantillonnage;",
    vers: "          _etat.reechantillonnerVers = null;",
    sections: "§34",
    attendu: "E12 : « le Studio LE DIT et rééchantillonne la nouvelle partie »",
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
    de: "      echantillonnage: a.echantillonnage,",
    vers: "      echantillonnage: FREQUENCE_DEMANDEE || 48000,",
    sections: "§28",
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

  {
    nom: "le relevé de la prise précédente survit au démarrage de la suivante",
    fichier: "module",
    de: "    _etat.dernierReleve = null;",
    vers: "    void 0;",
    sections: "§22c",
    attendu: "défaut 4 : un événement serait daté à la position de la prise d'avant",
  },

  // ── T3 BIS : L'AMORCE, LES VITESSES, LES MARQUEURS THÉORIQUES, LE DIAGNOSTIC ─────────────
  {
    nom: "l'amorce joue jusqu'au bout du tampon : la durée n'est plus passée à start",
    fichier: "module",
    de: "    noeud.start(t0, debut / hzSource, duree_s);",
    vers: "    noeud.start(t0, debut / hzSource);",
    sections: "§44",
    attendu: "la suite de l'ancienne prise s'entendrait par-dessus la nouvelle (E10)",
  },
  {
    nom: "l'amorce commence au début de la prise source, pas au début de la zone",
    fichier: "module",
    de: "    noeud.start(t0, debut / hzSource, duree_s);",
    vers: "    noeud.start(t0, 0, duree_s);",
    sections: "§44",
    attendu: "ce serait le début de la prise, non les dernières secondes qui précèdent le passage",
  },
  {
    nom: "l'amorce remonte depuis la FIN de la prise source, non depuis le passage",
    fichier: "bande",
    de: "    var position = (typeof a.positionDansLaSource === 'number')\n      ? Math.max(0, Math.min(disponibles, Math.round(a.positionDansLaSource)))\n      : disponibles;",
    vers: "    var position = disponibles;",
    sections: "§48",
    attendu: "l'amorce du dernier passage serait jouée quel que soit le passage refait (R7)",
  },
  {
    nom: "la troncature de l'amorce n'est plus dite",
    fichier: "bande",
    de: "      tronquee: joues < demandes,",
    vers: "      tronquee: false,",
    sections: "§48b",
    attendu: "une amorce raccourcie en silence ferait croire à cinq secondes relues",
  },
  {
    nom: "un passage sans prise source ne le dit plus",
    fichier: "module",
    de: "        zone.sansAmorce = true;",
    vers: "        zone.sansAmorce = false;",
    sections: "§48b",
    attendu: "la prise passerait pour une reprise amorcée alors que rien n'a été relu",
  },
  {
    nom: "la reprise PROLONGE la prise source au lieu d'en créer une",
    fichier: "module",
    de: "          return demarrer({ reprise: reprise });",
    vers: "          return demarrer({ continuer: zone.priseSource, reprise: reprise });",
    sections: "§48c",
    attendu: "R7 et T10 : une reprise est une prise SÉPARÉE, l'ancienne reste (rien n'est écrasé)",
  },
  {
    nom: "le début de la zone d'amorce est annoncé à zéro au lieu d'être mesuré",
    fichier: "module",
    de: "          debutDansLaPriseNeuve = Math.max(0,\n            Math.round((t0 - _etat.debutPrise_ctxTemps) * hz));",
    vers: "          debutDansLaPriseNeuve = 0;",
    sections: "§48",
    attendu: "#11(e) : le chiffre affiché doit être la mesure, pas une valeur de confort",
  },
  {
    nom: "la zone d'amorce est marquée dans la prise même en « amorce puis silence »",
    fichier: "bande",
    de: "      finDansLaPriseNeuve: a.mode === 'amorce-puis-silence' ? 0 : joues,",
    vers: "      finDansLaPriseNeuve: joues,",
    sections: "§48c",
    attendu: "en « amorce puis silence » rien de l'amorce n'est écrit : une zone non vide serait un mensonge",
  },
  {
    nom: "le nœud audio retourne dans la prise écrite",
    fichier: "module",
    de: "          lecture: sansLeNoeud(lue2) || 'aucune amorce jouée',",
    vers: "          lecture: lue2 || 'aucune amorce jouée',",
    sections: "§48",
    attendu: "un nœud audio ne se sérialise pas : l'écriture de la prise échouerait en silence",
  },
  {
    nom: "la vitesse d'un passage divise par sa durée BRUTE, pause écrite comprise",
    fichier: "bande",
    de: "      var parole_s = Math.max(0, duree_s - pause_s);",
    vers: "      var parole_s = duree_s;",
    sections: "§45",
    attendu: "un passage portant « [pause 2 s] » paraîtrait lent de deux secondes : fausse alerte (R5)",
  },
  {
    nom: "l'alerte de vitesse ignore le seuil",
    fichier: "bande",
    de: "      ligne.alerte = Math.abs(ecart) > seuil;",
    vers: "      ligne.alerte = Math.abs(ecart) > 0;",
    sections: "§45",
    attendu: "R5 veut une alerte RÉGLABLE : alerter sur tout écart revient à n'alerter sur rien",
  },
  {
    nom: "la durée minimale significative ne découle plus du seuil",
    fichier: "bande",
    de: "    return (2 * ms / 1000) / (seuil / 100);",
    vers: "    return 0;",
    sections: "§45",
    attendu: "un passage d'une seconde alerterait sur l'incertitude des repères, non sur la lecture",
  },
  {
    nom: "les vitesses sont calculées même avec un nombre de repères incompatible",
    fichier: "bande",
    de: "      return Object.assign({ mesurable: false, reperesEcartes: ecartes,\n        raison: 'vitesses non mesurables : '",
    vers: "      bornes = [0].concat(positions.slice(0, passages.length - 1));\n      while (bornes.length <= passages.length) bornes.push(duree);\n      raisonDesBornes = 'bornes complétées';\n      if (false) return Object.assign({ mesurable: false, reperesEcartes: ecartes,\n        raison: 'vitesses non mesurables : '",
    sections: "§45",
    attendu: "des bornes inventées donneraient des vitesses qui ne mesurent rien",
  },
  {
    nom: "l'option des marqueurs théoriques est cochée par défaut",
    fichier: "module",
    de: "        '<input type=\"checkbox\" data-marqueurs-theoriques ' +",
    vers: "        '<input type=\"checkbox\" checked data-marqueurs-theoriques ' +",
    sections: "§46",
    attendu: "R6 : « une option, DÉSACTIVÉE PAR DÉFAUT »",
  },
  {
    nom: "les marqueurs théoriques sont posés aux frontières de TOUS les passages, fin comprise",
    fichier: "bande",
    de: "    for (var i = 0; i < liste.length - 1; i++) {",
    vers: "    for (var i = 0; i < liste.length; i++) {",
    sections: "§46",
    attendu: "un repère au-delà de la voix écrite est « hors voix » au sens de T6",
  },
  {
    nom: "les marqueurs théoriques sont posés hors du chemin des repères",
    fichier: "module",
    de: "            poserUnRepere('théorique', t.aEchantillon,\n              { theorique: true, passage: t.passage, secondesTheoriques: t.secondes });",
    vers: "            _etat.reperes.push({ aEchantillon: t.aEchantillon, passage: t.passage,\n              source: 'théorique', douteux: true, theorique: true });",
    sections: "§46",
    attendu: "R6 : les marqueurs posés restent des repères COMME LES AUTRES",
  },
  {
    nom: "le contexte de l'instant n'est plus consigné",
    fichier: "module",
    de: "    if (evenementADiagnostiquer(quoi)) e.contexteDeLInstant = contexteDeLInstant();",
    vers: "    void 0;",
    sections: "§47",
    attendu: "la perte de micro du 17 octobre est restée sans cause faute de ces champs",
  },
  {
    nom: "la visibilité du document est écrite en dur au lieu d'être lue",
    fichier: "module",
    de: "      visibilite: doc ? doc.visibilityState : 'document indisponible',",
    vers: "      visibilite: 'visible',",
    sections: "§47",
    attendu: "un onglet caché est justement l'hypothèse qu'on veut pouvoir écarter",
  },
  {
    nom: "le délai depuis le dernier geste est annoncé nul",
    fichier: "module",
    de: "      depuisDernierGeste_s: _dernierGeste_ms === null\n        ? null : +((m - _dernierGeste_ms) / 1000).toFixed(3),",
    vers: "      depuisDernierGeste_s: 0,",
    sections: "§47",
    attendu: "« Christophe venait-il de faire un geste ? » ne se répond plus",
  },
  {
    nom: "les changements de périphérique ne sont plus bornés aux cinq secondes",
    fichier: "module",
    de: "      return (maintenant - c.quand_ms) <= f * 1000 && (maintenant - c.quand_ms) >= 0;",
    vers: "      return true;",
    sections: "§47",
    attendu: "un changement vieux d'une minute n'explique pas une perte d'il y a une seconde",
  },
  {
    nom: "l'état du contexte audio est pris sur l'état mémorisé, non lu à l'instant",
    fichier: "module",
    de: "      etatDuContexteAudio: _etat.ctx ? _etat.ctx.state : 'aucun contexte audio',",
    vers: "      etatDuContexteAudio: _etat.enPrise ? 'running' : 'arrêté',",
    sections: "§47",
    attendu: "c'est le même défaut que le défaut 3 du relevé : un état déduit au lieu d'être lu",
  },
  {
    nom: "le dernier repère suit aussi les positions imposées, non les seuls gestes",
    fichier: "module",
    de: "    if (!impose) _etat.dernierRepere = ech;",
    vers: "    _etat.dernierRepere = ech;",
    sections: "§46",
    attendu: "le premier repère posé à la main après des marqueurs théoriques serait déclaré DOUTEUX",
  },
  {
    nom: "la lecture de l'amorce n'est plus coupée quand la prise s'arrête",
    fichier: "module",
    de: "      try { _etat.lectureDeLAmorce.stop(); } catch (e) { /* déjà terminée */ }",
    vers: "      void 0;",
    sections: "§48",
    attendu: "l'ancienne prise continuerait de jouer aux haut-parleurs après l'arrêt (E10)",
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
  // ── UNE TRANCHE, POUR TENIR DANS UNE ATTENTE BORNÉE ──────────────────────────────────────
  // `--de 1 --a 20` ne joue que les mutations 1 à 20. Le régime de travail borne chaque attente
  // à quinze minutes, et soixante-et-onze mutations demandent davantage : les jouer par tranches
  // au premier plan vaut mieux qu'une attente de fond qu'on ne surveille plus. Le journal de
  // reprise et la vérification des ancres restent entiers à chaque tranche, donc une tranche
  // interrompue se répare comme une exécution complète.
  const iDe = process.argv.indexOf('--de');
  const iA = process.argv.indexOf('--a');
  const de = iDe >= 0 ? Number(process.argv[iDe + 1]) : 1;
  const a = iA >= 0 ? Number(process.argv[iA + 1]) : ESSAIS.length;

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

  // ── AUCUNE MUTATION NE DÉPEND PLUS DE LA MACHINE (décision de Christophe, 11 octobre) ────
  // Sept mutations n'étaient décidables qu'à une fréquence autre que 48 000 Hz, et ce script
  // sondait donc le périphérique audio du Mac pour le dire. Christophe a refusé de changer la
  // configuration de sa machine pour un test — c'est un essai à moi qui l'avait fait basculer de
  // 44 100 à 48 000 Hz. Les sept sont désormais décidées autrement : §27 fait tourner le VRAI
  // worklet dans un `OfflineAudioContext` à 44 100 Hz, qui n'ouvre AUCUN périphérique, et §28
  // éprouve les règles du module comme fonctions pures de la fréquence. La sonde est supprimée :
  // elle ouvrait un contexte audio réel pour une information dont plus personne n'a besoin.
  console.log('Aucune mutation ne dépend de la configuration audio de cette machine.\n');

  const resultats = [];
  const indecidables = [];
  ESSAIS.forEach((e, k) => {
    if (seul !== null && seul !== k + 1) return;
    if (seul === null && (k + 1 < de || k + 1 > a)) return;
    const num = '#' + String(k + 1).padStart(2, ' ');
    const etiquette = e.equivalente ? ' [ÉQUIVALENTE]' : '';
    // Une mutation qui exigerait encore une fréquence particulière de la MACHINE est un défaut
    // d'inventaire, non un verdict reporté : la règle du 11 octobre interdit qu'un contrôle
    // dépende de la configuration du Mac de Christophe. On le dit et on compte un trou.
    if (e.exigeAutreQue48k) {
      console.log(num + ' [INVENTAIRE FAUTIF] ' + e.nom);
      console.log('     cette mutation réclame une fréquence de machine particulière. Rendez-la');
      console.log('     décidable autrement : contexte différé (§27) ou fonction pure (§28).\n');
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
  // LE COMPTE, SANS AMBIGUÏTÉ. « Conforme » veut dire « s'est comportée comme l'inventaire le
  // prédisait », dans un sens ou dans l'autre : une mutation ordinaire fait ÉCHOUER ses
  // contrôles, une mutation déclarée équivalente les laisse PASSER. Les équivalentes sont donc
  // un SOUS-ENSEMBLE des conformes, et non une catégorie à côté. Écrit ainsi parce que
  // « 64 conformes · 2 équivalentes » se lisait aussi bien « 64 dont 2 » que « 64 plus 2 ».
  const conformes = resultats.length - trous.length - fausseEquiv.length;
  console.log(resultats.length + ' mutations jouées · ' + conformes + ' conformes (dont '
    + equiv.length + ' équivalentes consignées, qui doivent laisser les contrôles PASSER, et '
    + (conformes - equiv.length) + ' ordinaires, qui doivent les faire ÉCHOUER) · '
    + trous.length + ' trou(s) · ' + fausseEquiv.length + ' fausse(s) équivalence(s)'
    + (indecidables.length ? ' · ' + indecidables.length + ' INVENTAIRE(S) FAUTIF(S)' : ''));
  if (indecidables.length) {
    console.log('Inventaire fautif — ces mutations réclament une configuration de machine :');
    indecidables.forEach((r) => console.log('  #' + r.num + ' ' + r.nom));
  }
  if (trous.length || fausseEquiv.length) {
    trous.forEach((r) => console.log('  TROU #' + r.num + ' ' + r.nom));
    fausseEquiv.forEach((r) => console.log('  FAUSSE ÉQUIVALENCE #' + r.num + ' ' + r.nom));
    process.exit(1);
  }
  console.log('\nPASS falsifier-enregistreur — chaque contrôle échoue quand il le doit.');
})();
