// ── LOT 3, JALON I — LE STOCKAGE DE LA VOIX (IndexedDB) ─────────────────────────────────────
//
// Fichier séparé du module d'enregistrement pour une raison précise : il doit être éprouvable
// SEUL, sans micro ni worklet. Les mesures de 15 minutes versent des morceaux ici à pleine
// vitesse, sans passer par l'audio — c'est ce qui permet de mesurer stockage, mémoire et reprise
// sans ouvrir une attente de quinze minutes à chaque exécution.
//
// POURQUOI IndexedDB ET PAS LA MÉMOIRE : quinze minutes de voix en Float32 font 173 Mo (mesuré
// au lot 0, et c'est le pic de +975 Mo de Safari à l'export). En entiers 16 bits mono, la même
// voix fait 86,4 Mo — et surtout elle n'est JAMAIS tenue entière : on écrit morceau par morceau
// et on relit par curseur.
//
// CE QUI VIT ICI : les octets de la voix et les métadonnées d'une prise. Le document, lui, ne
// portera que des RÉFÉRENCES (identifiant de prise, nom, durée, échantillonnage) — et ce champ
// de document est du jalon III, pas d'ici.

(function () {
  'use strict';

  var NOM_BASE = 'studio-clinique-voix';
  var VERSION_BASE = 1;
  var MAGASIN_PRISES = 'prises';
  var MAGASIN_MORCEAUX = 'morceaux';

  // L'en-tête WAV canonique fait 44 octets : RIFF(12) + fmt (24) + data(8). On l'écrit à la main
  // plutôt que de laisser une bibliothèque décider, parce que le lot 0 a mesuré que l'en-tête
  // doit être EXACT et qu'un contrôle le compare octet par octet.
  var OCTETS_EN_TETE_WAV = 44;

  function ouvrir() {
    return new Promise(function (resolut, rejet) {
      if (!self.indexedDB) { rejet(new Error('IndexedDB absent de ce navigateur')); return; }
      var dem = self.indexedDB.open(NOM_BASE, VERSION_BASE);
      dem.onupgradeneeded = function () {
        var db = dem.result;
        if (!db.objectStoreNames.contains(MAGASIN_PRISES)) {
          db.createObjectStore(MAGASIN_PRISES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MAGASIN_MORCEAUX)) {
          // Clé composée [priseId, index] : les morceaux d'une prise se relisent dans l'ordre
          // par un curseur borné, sans charger la liste des clés.
          db.createObjectStore(MAGASIN_MORCEAUX, { keyPath: ['priseId', 'index'] });
        }
      };
      dem.onsuccess = function () { resolut(dem.result); };
      dem.onerror = function () { rejet(dem.error || new Error('ouverture refusée')); };
    });
  }

  // DEUX COMPTEURS, et ils ne sont pas décoratifs. Une transaction DEMANDÉE n'est pas une
  // transaction TERMINÉE : entre les deux, elle peut encore être abandonnée. La différence est
  // la seule façon d'observer, de l'extérieur, qu'une écriture a été ATTENDUE et pas seulement
  // lancée — et un contrôle s'en sert pour vérifier qu'à l'arrêt d'une prise il ne reste rien en
  // vol. Ils servent aussi au rapport de mesures : le nombre de transactions est ce qui change
  // réellement entre des morceaux de 5 s et de 2 s.
  var compteurs = { demandees: 0, terminees: 0, abandonnees: 0 };

  function transaction(db, magasins, mode) {
    var tx = db.transaction(magasins, mode);
    compteurs.demandees++;
    var fini = new Promise(function (resolut, rejet) {
      tx.oncomplete = function () { compteurs.terminees++; resolut(); };
      tx.onabort = function () {
        compteurs.abandonnees++;
        rejet(tx.error || new Error('transaction abandonnée'));
      };
      tx.onerror = function () { rejet(tx.error || new Error('transaction en erreur')); };
    });
    return { tx: tx, fini: fini };
  }

  function requete(r) {
    return new Promise(function (resolut, rejet) {
      r.onsuccess = function () { resolut(r.result); };
      r.onerror = function () { rejet(r.error || new Error('requête en erreur')); };
    });
  }

  // ── LE CYCLE D'UNE PRISE ────────────────────────────────────────────────────────────────────
  // `etat` : 'en-cours' tant qu'elle n'est pas close. Une prise restée 'en-cours' au prochain
  // chargement est exactement le cas E5 (fermeture accidentelle) : elle est PROPOSÉE à la
  // reprise, jamais présentée comme réussie.

  function creerPrise(db, prise) {
    var t = transaction(db, [MAGASIN_PRISES], 'readwrite');
    t.tx.objectStore(MAGASIN_PRISES).put(prise);
    return t.fini.then(function () { return prise; });
  }

  // Écrit UN morceau et n'est tenue pour faite qu'à `oncomplete` de la transaction. Attendre
  // `onsuccess` de la requête ne garantit rien : la transaction peut encore être abandonnée.
  // C'est la différence entre « écrit » et « cru écrit », et une mutation du falsifieur retire
  // précisément cette attente.
  function ecrireMorceau(db, priseId, index, debutEchantillon, pcm, partiel) {
    var t = transaction(db, [MAGASIN_MORCEAUX], 'readwrite');
    t.tx.objectStore(MAGASIN_MORCEAUX).put({
      priseId: priseId,
      index: index,
      debutEchantillon: debutEchantillon,
      nbEchantillons: pcm.byteLength / 2,
      partiel: !!partiel,
      pcm: pcm,
    });
    return t.fini;
  }

  function majPrise(db, id, champs) {
    var t = transaction(db, [MAGASIN_PRISES], 'readwrite');
    var m = t.tx.objectStore(MAGASIN_PRISES);
    requete(m.get(id)).then(function (p) {
      if (!p) return;
      Object.keys(champs).forEach(function (k) { p[k] = champs[k]; });
      m.put(p);
    });
    return t.fini;
  }

  function lirePrise(db, id) {
    var t = transaction(db, [MAGASIN_PRISES], 'readonly');
    var r = requete(t.tx.objectStore(MAGASIN_PRISES).get(id));
    return t.fini.then(function () { return r; });
  }

  function listerPrises(db) {
    var t = transaction(db, [MAGASIN_PRISES], 'readonly');
    var r = requete(t.tx.objectStore(MAGASIN_PRISES).getAll());
    return t.fini.then(function () { return r; }).then(function (liste) {
      return (liste || []).sort(function (a, b) {
        return String(b.creeLe || '').localeCompare(String(a.creeLe || ''));
      });
    });
  }

  // T9 : une prise n'est JAMAIS écrasée. La suppression est donc le seul chemin destructeur, et
  // elle est explicite — la confirmation est posée par l'interface, pas ici.
  function supprimerPrise(db, id) {
    var t = transaction(db, [MAGASIN_PRISES, MAGASIN_MORCEAUX], 'readwrite');
    t.tx.objectStore(MAGASIN_PRISES).delete(id);
    var borne = IDBKeyRange.bound([id, -Infinity], [id, Infinity]);
    t.tx.objectStore(MAGASIN_MORCEAUX).delete(borne);
    return t.fini;
  }

  // Parcourt les morceaux d'une prise DANS L'ORDRE, un par un, sans jamais en tenir plus d'un.
  // `surMorceau` peut rendre une promesse : le curseur n'avance qu'après.
  function parcourirMorceaux(db, priseId, surMorceau) {
    return new Promise(function (resolut, rejet) {
      var tx = db.transaction([MAGASIN_MORCEAUX], 'readonly');
      var borne = IDBKeyRange.bound([priseId, -Infinity], [priseId, Infinity]);
      var dem = tx.objectStore(MAGASIN_MORCEAUX).openCursor(borne);
      var n = 0;
      dem.onsuccess = function () {
        var c = dem.result;
        if (!c) { resolut(n); return; }
        n++;
        var suite;
        try { suite = surMorceau(c.value); } catch (e) { rejet(e); return; }
        Promise.resolve(suite).then(function () { c.continue(); }, rejet);
      };
      dem.onerror = function () { rejet(dem.error || new Error('curseur en erreur')); };
      tx.onabort = function () { rejet(tx.error || new Error('lecture abandonnée')); };
    });
  }

  // ── L'EN-TÊTE WAV, 44 OCTETS, EXACTS ────────────────────────────────────────────────────────
  // Fonction PURE, pour qu'un contrôle la compare octet par octet sans ouvrir un micro.
  function enTeteWav(nbEchantillons, echantillonnage) {
    var octetsDonnees = nbEchantillons * 2;          // 16 bits, un canal
    var tampon = new ArrayBuffer(OCTETS_EN_TETE_WAV);
    var v = new DataView(tampon);
    function ascii(pos, s) { for (var i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); }
    ascii(0, 'RIFF');
    v.setUint32(4, 36 + octetsDonnees, true);        // taille du reste du fichier
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    v.setUint32(16, 16, true);                       // taille du bloc fmt (PCM)
    v.setUint16(20, 1, true);                        // PCM entier
    v.setUint16(22, 1, true);                        // un canal : mono (E3)
    v.setUint32(24, echantillonnage, true);
    v.setUint32(28, echantillonnage * 2, true);      // octets par seconde
    v.setUint16(32, 2, true);                        // octets par trame
    v.setUint16(34, 16, true);                       // bits par échantillon (E7)
    ascii(36, 'data');
    v.setUint32(40, octetsDonnees, true);
    return new Uint8Array(tampon);
  }

  // E7 : export WAV 16 bits sans perte. Construit un Blob à partir de l'en-tête et des morceaux
  // relus un par un — on ne concatène JAMAIS les 86 Mo dans un seul tableau typé. Les parties
  // d'un Blob restent tenues par le navigateur, pas par nous.
  //
  // L'en-tête est écrit avec le nombre d'échantillons RÉELLEMENT relus, jamais avec celui
  // annoncé par la prise : un en-tête qui promet plus de données qu'il n'en suit est un fichier
  // qui s'ouvre et qui ment (régression #11(e) — un chiffre affiché doit être la mesure).
  function exporterWav(db, priseId) {
    return lirePrise(db, priseId).then(function (prise) {
      if (!prise) throw new Error('prise introuvable : ' + priseId);
      var parties = [];
      var echantillons = 0;
      var indexAttendu = 0;
      var trous = [];
      return parcourirMorceaux(db, priseId, function (m) {
        if (m.index !== indexAttendu) trous.push({ attendu: indexAttendu, trouve: m.index });
        indexAttendu = m.index + 1;
        parties.push(m.pcm);
        echantillons += m.pcm.byteLength / 2;
      }).then(function (nbMorceaux) {
        var ech = prise.echantillonnage || 48000;
        var blob = new Blob([enTeteWav(echantillons, ech)].concat(parties),
          { type: 'audio/wav' });
        return {
          blob: blob,
          nbEchantillons: echantillons,
          nbMorceaux: nbMorceaux,
          echantillonnage: ech,
          duree_s: echantillons / ech,
          octets: blob.size,
          // Ce que la prise CROYAIT contenir, à côté de ce qui a été relu. Deux lignes du même
          // relevé qui portent sur le même fait : un contrôle vérifie qu'elles s'accordent.
          echantillonsAnnonces: prise.nbEchantillons || 0,
          trousDIndex: trous,
        };
      });
    });
  }

  // ── LA PERSISTANCE DEMANDÉE AU NAVIGATEUR ───────────────────────────────────────────────────
  // Le CDC le dit : Safari peut vider le stockage après sept jours sans visite. On DEMANDE donc
  // la persistance, et on RAPPORTE la réponse telle quelle — y compris un refus. Une demande
  // dont on ne lit pas la réponse est une demande qui rassure à tort.
  function demanderPersistance() {
    var s = (self.navigator && self.navigator.storage) || null;
    if (!s) return Promise.resolve({ disponible: false, accordee: 'API storage absente' });
    var dejaLa = typeof s.persisted === 'function' ? s.persisted() : Promise.resolve('persisted() absent');
    return dejaLa.then(function (avant) {
      var dem = typeof s.persist === 'function' ? s.persist() : Promise.resolve('persist() absent');
      return dem.then(function (reponse) {
        var est = typeof s.estimate === 'function' ? s.estimate() : Promise.resolve(null);
        return est.then(function (e) {
          return {
            disponible: true,
            persistantAvant: avant,
            accordee: reponse,
            quotaOctets: e && typeof e.quota === 'number' ? e.quota : 'estimate() muet',
            utiliseOctets: e && typeof e.usage === 'number' ? e.usage : 'estimate() muet',
          };
        });
      }, function (err) {
        return { disponible: true, persistantAvant: avant, accordee: 'refusée : ' + (err && err.message) };
      });
    });
  }

  self.VoixStockage = {
    compteurs: compteurs,
    enVol: function () { return compteurs.demandees - compteurs.terminees - compteurs.abandonnees; },
    NOM_BASE: NOM_BASE,
    VERSION_BASE: VERSION_BASE,
    OCTETS_EN_TETE_WAV: OCTETS_EN_TETE_WAV,
    ouvrir: ouvrir,
    creerPrise: creerPrise,
    ecrireMorceau: ecrireMorceau,
    majPrise: majPrise,
    lirePrise: lirePrise,
    listerPrises: listerPrises,
    supprimerPrise: supprimerPrise,
    parcourirMorceaux: parcourirMorceaux,
    enTeteWav: enTeteWav,
    exporterWav: exporterWav,
    demanderPersistance: demanderPersistance,
  };
})();
