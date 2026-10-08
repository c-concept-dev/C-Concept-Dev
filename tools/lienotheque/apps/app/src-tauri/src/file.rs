//! La file de travaux de l'hôte (JOB-01 à JOB-09, PLT-02).
//!
//! L'hôte possède la file : il décide qui part, qui attend, et qui reprend. Le moteur ne décide
//! de rien — il reçoit un travail et rend un résultat.
//!
//! Les travaux sont persistés un par fichier, dans un dossier. Chaque écriture est atomique
//! (fichier temporaire puis renommage) : un arrêt forcé ne laisse jamais d'état tronqué, et la
//! liste exacte des travaux se relit au redémarrage (JOB-01).
//!
//! Les règles de décision — ce qui est reprenable, qui passe en premier, combien de travaux
//! lourds tournent à la fois — sont éprouvées contre `fixtures/travaux-cas.json`, la même table
//! que lisent les tests du noyau TypeScript. Deux moteurs d'exécution imposent deux
//! implémentations ; une seule vérité les contraint.

use crate::{limites::LIMITES, travail::{self, Travail}};
use std::{fs, io, path::{Path, PathBuf}};

/// États depuis lesquels un travail ne repartira plus de lui-même.
const ETATS_TERMINAUX: [&str; 3] = ["termine", "annule", "en_echec_definitif"];

/// Un travail sans bail, ou dont le bail a expiré, est reprenable (JOB-02).
///
/// Une pause n'est pas une expiration : elle attend une reprise explicite, et aucun délai ne la
/// lève (JOB-08).
pub fn reprenable(travail: &Travail, maintenant: u64) -> bool {
    if ETATS_TERMINAUX.contains(&travail.etat.as_str()) || travail.etat == "en_pause" {
        return false;
    }
    // Un échec récupérable attend son délai : le relancer dans la seconde consommerait les trois
    // tentatives avant que la cause — un volume démonté, un fichier encore en écriture — ait eu le
    // temps de disparaître (JOB-05).
    if travail.etat == "en_echec_recuperable" && !delai_ecoule(travail, maintenant) {
        return false;
    }
    travail.verrou.as_ref().is_none_or(|v| v.expire_le <= maintenant)
}

/// Le délai entre deux tentatives est-il passé depuis le dernier changement d'état ?
pub fn delai_ecoule(travail: &Travail, maintenant: u64) -> bool {
    maintenant.saturating_sub(travail.maj_le) >= LIMITES.delai_entre_tentatives_s
}

/// Une tentative de plus est-elle permise, ou l'échec devient-il définitif (JOB-05) ?
pub fn tentative_restante(tentative: u32) -> bool {
    tentative < LIMITES.tentatives_max
}

/// Un travail peut-il partir maintenant, sachant les places lourdes occupées (JOB-09) ?
///
/// Un travail léger ne prend aucune place : renommer un axe ou recalculer un compte n'a pas à
/// attendre qu'une lecture de trois cents pages finisse.
pub fn peut_partir(travail: &Travail, lourds_en_cours: usize) -> bool {
    travail.poids == "leger" || places_libres(lourds_en_cours) > 0
}

/// Combien de travaux lourds peuvent encore partir (PLT-02).
///
/// Jamais négatif : si plus de travaux tiennent un bail qu'il n'y a de places — ce qu'un
/// redémarrage mal tombé peut produire —, on n'en lance aucun de plus, on ne va pas en retirer.
pub fn places_libres(en_cours: usize) -> usize {
    LIMITES.travaux_lourds_simultanes.saturating_sub(en_cours)
}

/// Ordre de service : ce qui était entamé d'abord, puis les plus anciens.
///
/// Reprendre avant de commencer, parce qu'un travail à moitié fait qui attend coûte deux fois —
/// une fois ce qu'il a déjà lu, une fois l'attente de celui qui le suit.
pub fn prochain<'t>(travaux: &'t [Travail], maintenant: u64) -> Option<&'t Travail> {
    travaux
        .iter()
        .filter(|t| reprenable(t, maintenant))
        .max_by(|a, b| {
            a.reprise_a()
                .cmp(&b.reprise_a())
                .then_with(|| b.cree_le.cmp(&a.cree_le))
                .then_with(|| b.id.cmp(&a.id))
        })
}

/// Combien de travaux tiennent un bail vivant : ce sont ceux qui occupent une place.
pub fn en_cours(travaux: &[Travail], maintenant: u64) -> usize {
    travaux
        .iter()
        .filter(|t| t.verrou.as_ref().is_some_and(|v| v.expire_le > maintenant))
        .count()
}

/// Les transitions que l'hôte applique à un travail (JOB-05, JOB-08).
///
/// L'hôte est seul à les appliquer, et il les applique ici : les commandes de l'interface
/// passent par cette fonction, et le banc de `fixtures/travaux-cas.json` l'éprouve. Deux
/// écritures de la même transition finissent toujours par en donner deux.
pub fn appliquer(travail: &Travail, action: &str, maintenant: u64) -> Option<Travail> {
    let mut t = travail.clone();
    t.maj_le = maintenant;
    match action {
        "pause" => {
            t.etat = "en_pause".to_owned();
            t.verrou = None;
        }
        "annuler" => {
            t.etat = "annule".to_owned();
            t.verrou = None;
        }
        "reprendre" => {
            // Une pause reprise ne consomme pas de tentative : on n'a pas échoué, on a attendu.
            if t.etat == "en_echec_recuperable" {
                t.tentative += 1;
            }
            t.etat = "en_file".to_owned();
            t.verrou = None;
        }
        "echouerRecuperable" => {
            // Récupérable n'a de sens que s'il reste une tentative : au-delà, l'échec est
            // définitif, et le dire franchement vaut mieux qu'une file qui cache la panne.
            t.etat = if tentative_restante(t.tentative) { "en_echec_recuperable" } else { "en_echec_definitif" }.to_owned();
            t.verrou = None;
        }
        "echouerDefinitif" => {
            t.etat = "en_echec_definitif".to_owned();
            t.verrou = None;
        }
        _ => return None,
    }
    Some(t)
}

fn chemin_du(dossier: &Path, id: &str) -> PathBuf {
    dossier.join(format!("{id}.json"))
}

/// Relit la file entière. Un fichier illisible ne fait pas perdre les autres : il est signalé et
/// la liste continue — perdre la file parce qu'un fichier est abîmé serait pire que le fichier.
pub fn charger_tout(dossier: &Path, avertir: &mut dyn FnMut(String)) -> io::Result<Vec<Travail>> {
    let entrees = match fs::read_dir(dossier) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };

    let mut travaux = Vec::new();
    for entree in entrees {
        let chemin = entree?.path();
        if chemin.extension().is_none_or(|e| e != "json") {
            continue;
        }
        match travail::charger(&chemin) {
            Ok(Some(t)) => travaux.push(t),
            Ok(None) => {}
            Err(e) => avertir(format!("Travail illisible, ignoré : {} ({e})", chemin.display())),
        }
    }
    // Un ordre stable quelle que soit celui du système de fichiers : sans lui, deux lectures de la
    // même file pourraient servir deux travaux différents.
    travaux.sort_by(|a, b| a.cree_le.cmp(&b.cree_le).then_with(|| a.id.cmp(&b.id)));
    Ok(travaux)
}

/// Écrit un travail dans la file. Avant qu'il ne commence, jamais après (JOB-01).
pub fn enregistrer(dossier: &Path, travail: &Travail) -> io::Result<()> {
    travail::enregistrer(&chemin_du(dossier, &travail.id), travail)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::travail::Verrou;
    use serde::Deserialize;

    const TABLE: &str = include_str!("../../../../fixtures/travaux-cas.json");

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CasReprenable {
        nom: String,
        etat: String,
        bail_expire_le: Option<u64>,
        #[serde(default)]
        maj_le: u64,
        #[serde(default)]
        maintenant: u64,
        #[serde(default)]
        maintenant_relatif: Option<String>,
        attendu: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TravailDuCas {
        id: String,
        etat: String,
        cree_le: u64,
        reprise: u32,
        bail_expire_le: Option<u64>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CasOrdre {
        nom: String,
        maintenant: u64,
        travaux: Vec<TravailDuCas>,
        attendu: Option<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CasPlaces {
        nom: String,
        en_cours: String,
        attendu: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CasDepart {
        nom: String,
        poids: String,
        en_cours: String,
        attendu: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CasTentative {
        nom: String,
        #[serde(default)]
        tentative: Option<u32>,
        #[serde(default)]
        tentative_relative: Option<String>,
        attendu: bool,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CasTransition {
        nom: String,
        depuis: String,
        avec_bail: bool,
        #[serde(default)]
        tentative_avant_relative: Option<String>,
        action: String,
        vers: String,
        bail_apres: bool,
        #[serde(default)]
        tentative_apres: Option<u32>,
        #[serde(default)]
        tentative_apres_relative: Option<String>,
    }

    /// Résout un compte que la table nomme au lieu de le recopier.
    fn compte(nomme: &str) -> usize {
        match nomme {
            "aucun" => 0,
            "un" => 1,
            "limite" => LIMITES.travaux_lourds_simultanes,
            "limitePlusTrois" => LIMITES.travaux_lourds_simultanes + 3,
            autre => panic!("compte inconnu dans la table : {autre}"),
        }
    }

    fn places_attendues(nomme: &str) -> usize {
        match nomme {
            "limite" => LIMITES.travaux_lourds_simultanes,
            "limiteMoinsUn" => LIMITES.travaux_lourds_simultanes - 1,
            "aucune" => 0,
            autre => panic!("attendu inconnu dans la table : {autre}"),
        }
    }

    fn tentative_nommee(nomme: &str) -> u32 {
        match nomme {
            "tentativesMax" => LIMITES.tentatives_max,
            "tentativesMaxPlusUn" => LIMITES.tentatives_max + 1,
            autre => panic!("tentative inconnue dans la table : {autre}"),
        }
    }

    #[derive(Deserialize)]
    struct Table {
        reprenable: Vec<CasReprenable>,
        ordre: Vec<CasOrdre>,
        places: Vec<CasPlaces>,
        depart: Vec<CasDepart>,
        tentatives: Vec<CasTentative>,
        transitions: Vec<CasTransition>,
    }

    fn table() -> Table {
        serde_json::from_str(TABLE).expect("la table des cas est une donnée du dépôt")
    }

    fn monter(id: &str, etat: &str, cree_le: u64, reprise: u32, bail: Option<u64>) -> Travail {
        let mut t = Travail::neuf(id, "traitement-de-lot", 100);
        t.etat = etat.to_owned();
        t.cree_le = cree_le;
        if reprise > 0 {
            t.point_reprise = Some(travail::PointReprise { unite: "page".to_owned(), valeur: reprise });
        }
        t.verrou = bail.map(|expire_le| Verrou {
            appareil: "appareil-a".to_owned(),
            battu_le: expire_le.saturating_sub(LIMITES.expiration_verrou_s),
            expire_le,
        });
        t
    }

    #[test]
    fn ce_qui_est_reprenable_suit_la_table_partagee() {
        for cas in table().reprenable {
            let mut t = monter("t", &cas.etat, 0, 0, cas.bail_expire_le);
            t.maj_le = cas.maj_le;
            let maintenant = match cas.maintenant_relatif.as_deref() {
                Some("justeAvantLeDelai") => cas.maj_le + LIMITES.delai_entre_tentatives_s - 1,
                Some("auDelai") => cas.maj_le + LIMITES.delai_entre_tentatives_s,
                Some(autre) => panic!("instant inconnu dans la table : {autre}"),
                None => cas.maintenant,
            };
            assert_eq!(reprenable(&t, maintenant), cas.attendu, "{}", cas.nom);
        }
    }

    #[test]
    fn l_ordre_de_service_suit_la_table_partagee() {
        for cas in table().ordre {
            let travaux: Vec<Travail> = cas
                .travaux
                .iter()
                .map(|t| monter(&t.id, &t.etat, t.cree_le, t.reprise, t.bail_expire_le))
                .collect();
            let retenu = prochain(&travaux, cas.maintenant).map(|t| t.id.clone());
            assert_eq!(retenu, cas.attendu, "{}", cas.nom);
        }
    }

    #[test]
    fn les_places_suivent_la_table_partagee() {
        for cas in table().places {
            assert_eq!(places_libres(compte(&cas.en_cours)), places_attendues(&cas.attendu), "{}", cas.nom);
        }
    }

    #[test]
    fn qui_peut_partir_suit_la_table_partagee() {
        for cas in table().depart {
            let mut t = monter("t", "en_file", 0, 0, None);
            t.poids = cas.poids.clone();
            assert_eq!(peut_partir(&t, compte(&cas.en_cours)), cas.attendu, "{}", cas.nom);
        }
    }

    #[test]
    fn les_tentatives_suivent_la_table_partagee() {
        for cas in table().tentatives {
            let tentative = cas
                .tentative
                .unwrap_or_else(|| tentative_nommee(cas.tentative_relative.as_deref().expect("tentative nommée")));
            assert_eq!(tentative_restante(tentative), cas.attendu, "{}", cas.nom);
        }
    }

    #[test]
    fn les_transitions_suivent_la_table_partagee() {
        for cas in table().transitions {
            let mut avant = monter("t", &cas.depuis, 0, 0, if cas.avec_bail { Some(999_999) } else { None });
            avant.tentative = cas
                .tentative_avant_relative
                .as_deref()
                .map_or(1, tentative_nommee);
            let version_avant = avant.total;

            let apres = appliquer(&avant, &cas.action, 100_000)
                .unwrap_or_else(|| panic!("action inconnue dans la table : {}", cas.action));

            assert_eq!(apres.etat, cas.vers, "{}", cas.nom);
            assert_eq!(apres.verrou.is_some(), cas.bail_apres, "{} — le bail", cas.nom);
            let attendue = cas
                .tentative_apres
                .unwrap_or_else(|| tentative_nommee(cas.tentative_apres_relative.as_deref().expect("tentative nommée")));
            assert_eq!(apres.tentative, attendue, "{} — la tentative", cas.nom);
            assert_eq!(apres.total, version_avant, "{} — rien d'autre n'a bougé", cas.nom);
        }
    }

    #[test]
    fn la_table_contraint_assez_de_cas_pour_servir_de_preuve() {
        let table = table();
        assert!(table.reprenable.len() >= 10, "une table trop courte ne prouve rien");
        assert!(table.ordre.len() >= 7);
        assert!(!table.places.is_empty());
        assert!(!table.depart.is_empty());
        assert!(!table.tentatives.is_empty());
        assert!(table.transitions.len() >= 6);
    }

    #[test]
    fn la_file_se_relit_entiere_apres_un_redemarrage() {
        let dossier = std::env::temp_dir().join(format!("lienotheque-file-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dossier);
        fs::create_dir_all(&dossier).expect("dossier de file");

        enregistrer(&dossier, &monter("b", "en_file", 200, 0, None)).expect("écriture");
        enregistrer(&dossier, &monter("a", "en_file", 100, 0, None)).expect("écriture");

        let mut plaintes = Vec::new();
        let relus = charger_tout(&dossier, &mut |m| plaintes.push(m)).expect("relecture");
        assert_eq!(relus.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert!(plaintes.is_empty());

        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn un_fichier_abime_ne_fait_pas_perdre_la_file() {
        let dossier = std::env::temp_dir().join(format!("lienotheque-abime-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dossier);
        fs::create_dir_all(&dossier).expect("dossier de file");

        enregistrer(&dossier, &monter("bon", "en_file", 100, 0, None)).expect("écriture");
        fs::write(dossier.join("casse.json"), "{ceci n'est pas du JSON").expect("écriture");

        let mut plaintes = Vec::new();
        let relus = charger_tout(&dossier, &mut |m| plaintes.push(m)).expect("relecture");
        assert_eq!(relus.len(), 1, "le travail sain survit à son voisin abîmé");
        assert_eq!(plaintes.len(), 1, "et l'abîmé est signalé, jamais tu");

        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn un_travail_sous_bail_vivant_occupe_une_place() {
        let travaux = vec![
            monter("tenu", "en_cours", 100, 0, Some(1_015)),
            monter("libre", "en_file", 200, 0, None),
        ];
        assert_eq!(en_cours(&travaux, 1_000), 1);
        assert_eq!(places_libres(en_cours(&travaux, 1_000)), LIMITES.travaux_lourds_simultanes - 1);
        // Et l'ordre où la file est présentée ne décide de rien : le départage est le même dans
        // les deux sens (REC-02).
        let a_l_endroit = prochain(&travaux, 1_000).map(|t| t.id.clone());
        let a_l_envers: Vec<Travail> = travaux.iter().rev().cloned().collect();
        assert_eq!(prochain(&a_l_envers, 1_000).map(|t| t.id.clone()), a_l_endroit);
        // Le bail expiré ne retient plus personne.
        assert_eq!(en_cours(&travaux, 1_015), 0);
    }
}
