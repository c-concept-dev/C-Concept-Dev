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
    travail.verrou.as_ref().is_none_or(|v| v.expire_le <= maintenant)
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
        })
}

/// Combien de travaux tiennent un bail vivant : ce sont ceux qui occupent une place.
pub fn en_cours(travaux: &[Travail], maintenant: u64) -> usize {
    travaux
        .iter()
        .filter(|t| t.verrou.as_ref().is_some_and(|v| v.expire_le > maintenant))
        .count()
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
        maintenant: u64,
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
        en_cours: usize,
        attendu: usize,
    }

    #[derive(Deserialize)]
    struct Table {
        reprenable: Vec<CasReprenable>,
        ordre: Vec<CasOrdre>,
        places: Vec<CasPlaces>,
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
            let t = monter("t", &cas.etat, 0, 0, cas.bail_expire_le);
            assert_eq!(reprenable(&t, cas.maintenant), cas.attendu, "{}", cas.nom);
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
            assert_eq!(places_libres(cas.en_cours), cas.attendu, "{}", cas.nom);
        }
    }

    #[test]
    fn la_table_contraint_assez_de_cas_pour_servir_de_preuve() {
        let table = table();
        assert!(table.reprenable.len() >= 8, "une table trop courte ne prouve rien");
        assert!(table.ordre.len() >= 5);
        assert!(!table.places.is_empty());
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
        // Le bail expiré ne retient plus personne.
        assert_eq!(en_cours(&travaux, 1_015), 0);
    }
}
