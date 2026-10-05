// COMPLÉMENT 7 — LE CONTENU COMMUN AUX CINQ VARIANTES.
//
// Un seul rendu, trois façons de l'écrire. C'est le point de tout le banc : si les variantes
// différaient par leur contenu, la comparaison entre navigateurs ne vaudrait rien.
//
//   40 s, 3 diapositives de couleur avec texte, fondus de 0,4 s (12 images à 30 i/s),
//   9 flashs de 150 ms avec bip, un toutes les 3 s (t = 3, 6, … 27 s).
//
// MODES D'ÉCRITURE :
//   'tenue'          — une image n'est écrite QUE quand l'image change (l'export actuel) ;
//   'cfr'            — une image toutes les 1/30 s, du début à la fin ;
//   'tenue-repetee'  — comme 'tenue', mais une image est réécrite au moins chaque seconde.
//
// La fonction renvoyée tourne DANS la page : elle est sérialisée par page.evaluate. Elle ne
// dépend donc d'aucun module, et tout ce dont elle a besoin passe par son argument.

const PLAN = {
  largeur: 1920, hauteur: 1080, ips: 30, duree: 40,
  fonduS: 0.4,
  flashS: 0.150,
  bipS: 0.050,
  bipHz: 1000,
  instantsFlash: [3, 6, 9, 12, 15, 18, 21, 24, 27],
  // Trois diapositives. Les bornes sont choisies pour que les fondus tombent dans les CREUX
  // entre deux flashs : un flash qui chevaucherait un fondu rendrait les deux mesures
  // inséparables. Mon premier jeu de bornes plaçait le second fondu à 0,300 s du flash de 27 s
  // — trop près, trouvé par le contrôle de plan ci-dessous et corrigé. Marges obtenues : 1,15 s
  // avant et 1,30 s après chaque fondu, soit près de huit fois la durée d'un flash.
  diapositives: [
    { fond: '#1f5053', titre: 'Diapositive 1', sous: 'fond sombre, texte clair' },
    { fond: '#f3efe6', titre: 'Diapositive 2', sous: 'fond clair, texte sombre', sombre: true },
    { fond: '#7a2f3a', titre: 'Diapositive 3', sous: 'fond soutenu, texte clair' },
  ],
  bornes: [[0, 13.3], [13.7, 25.3], [25.7, 40]],
};

module.exports = { PLAN };
