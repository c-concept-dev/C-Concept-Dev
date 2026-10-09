//! Ce que l'hôte retient d'une session à l'autre (PLT-02, JOB-02).
//!
//! Deux choses, et pas une de plus : **qui est cet appareil**, parce qu'un bail doit dire qui le
//! tient, et **quelles bibliothèques ont été ouvertes**, parce qu'une application qu'il faut
//! refaire pointer vers son dossier à chaque lancement n'est pas une application de bureau.
//!
//! Rien d'autre n'a sa place ici : le contenu d'une bibliothèque vit dans son dossier portable,
//! qui se déplace et se sauvegarde seul. Ce fichier-ci ne porte que des chemins et un
//! identifiant — on peut le perdre sans rien perdre.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Combien de bibliothèques on retient. Au-delà, la plus anciennement ouverte sort de la liste :
/// une liste de récents qui ne finit jamais cesse d'être une liste de récents.
pub const RETENUES_MAX: usize = 12;

const FICHIER: &str = "reglages.json";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct Reglages {
    /// Identifiant de cette installation, en UUID : c'est lui que porte le bail d'un travail.
    /// Deux installations qui s'appelleraient toutes deux « cet ordinateur » ne se
    /// distingueraient plus le jour où elles partagent une bibliothèque.
    pub appareil: String,
    /// Les dossiers de bibliothèque ouverts, la plus récemment ouverte en tête.
    #[serde(default)]
    pub bibliotheques: Vec<String>,
}

impl Reglages {
    /// Lit les réglages, ou en fabrique de neufs. Un fichier illisible ne bloque pas le
    /// lancement : on repart de réglages vides plutôt que de refuser d'ouvrir l'application pour
    /// une liste de récents abîmée.
    pub fn lire(dossier: &Path) -> Self {
        let lus = fs::read_to_string(dossier.join(FICHIER))
            .ok()
            .and_then(|texte| serde_json::from_str::<Self>(&texte).ok());
        match lus {
            Some(reglages) if !reglages.appareil.is_empty() => reglages,
            Some(mut reglages) => {
                reglages.appareil = uuid::Uuid::new_v4().to_string();
                reglages
            }
            None => Self { appareil: uuid::Uuid::new_v4().to_string(), bibliotheques: Vec::new() },
        }
    }

    /// Écriture atomique : un arrêt forcé ne laisse jamais un fichier tronqué.
    pub fn ecrire(&self, dossier: &Path) -> io::Result<()> {
        fs::create_dir_all(dossier)?;
        let definitif = dossier.join(FICHIER);
        let temporaire: PathBuf = definitif.with_extension("tmp");
        {
            let mut fichier = fs::File::create(&temporaire)?;
            fichier.write_all(serde_json::to_string_pretty(self)?.as_bytes())?;
            fichier.sync_all()?;
        }
        fs::rename(&temporaire, &definitif)
    }

    /// Met cette bibliothèque en tête des récentes, sans doublon.
    ///
    /// Rouvrir une bibliothèque déjà connue la remonte au lieu de l'ajouter une seconde fois :
    /// une liste où le même dossier figure trois fois ne rend service à personne.
    pub fn retenir(&mut self, racine: &str) {
        self.bibliotheques.retain(|connue| connue != racine);
        self.bibliotheques.insert(0, racine.to_owned());
        self.bibliotheques.truncate(RETENUES_MAX);
    }

    /// Retire une bibliothèque de la liste. Le dossier, lui, n'est pas touché : oublier n'est pas
    /// supprimer, et rien de ce qui est à l'utilisateur ne disparaît d'un clic dans une liste.
    pub fn oublier(&mut self, racine: &str) {
        self.bibliotheques.retain(|connue| connue != racine);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier_neuf(nom: &str) -> PathBuf {
        let chemin = std::env::temp_dir().join(format!("lienotheque-reglages-{nom}-{}", std::process::id()));
        fs::remove_dir_all(&chemin).ok();
        fs::create_dir_all(&chemin).expect("dossier");
        chemin
    }

    #[test]
    fn donne_un_identifiant_d_appareil_au_premier_lancement() {
        let dossier = dossier_neuf("premier");
        let reglages = Reglages::lire(&dossier);
        assert_eq!(reglages.appareil.len(), 36, "un UUID, que le contrat du bail exige (JOB-02)");
        assert!(reglages.bibliotheques.is_empty());
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn garde_le_meme_identifiant_d_une_session_a_l_autre() {
        let dossier = dossier_neuf("stable");
        let premier = Reglages::lire(&dossier);
        premier.ecrire(&dossier).expect("écriture");
        assert_eq!(Reglages::lire(&dossier).appareil, premier.appareil);
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn retient_les_bibliotheques_ouvertes_la_derniere_en_tete() {
        let mut reglages = Reglages::default();
        reglages.retenir("/une");
        reglages.retenir("/autre");
        assert_eq!(reglages.bibliotheques, vec!["/autre", "/une"]);
    }

    #[test]
    fn rouvrir_une_connue_la_remonte_au_lieu_de_la_redire() {
        let mut reglages = Reglages::default();
        reglages.retenir("/une");
        reglages.retenir("/autre");
        reglages.retenir("/une");
        assert_eq!(reglages.bibliotheques, vec!["/une", "/autre"]);
    }

    #[test]
    fn ne_retient_pas_sans_fin() {
        let mut reglages = Reglages::default();
        for rang in 0..RETENUES_MAX + 5 {
            reglages.retenir(&format!("/dossier-{rang}"));
        }
        assert_eq!(reglages.bibliotheques.len(), RETENUES_MAX);
        assert_eq!(reglages.bibliotheques[0], format!("/dossier-{}", RETENUES_MAX + 4));
    }

    #[test]
    fn oublier_retire_de_la_liste_et_rien_de_plus() {
        let mut reglages = Reglages::default();
        reglages.retenir("/une");
        reglages.retenir("/autre");
        reglages.oublier("/une");
        assert_eq!(reglages.bibliotheques, vec!["/autre"]);
    }

    #[test]
    fn un_fichier_abime_ne_bloque_pas_le_lancement() {
        let dossier = dossier_neuf("abime");
        fs::write(dossier.join(FICHIER), b"{ ceci n'est pas du json").expect("écriture");
        let reglages = Reglages::lire(&dossier);
        assert_eq!(reglages.appareil.len(), 36, "on repart de réglages neufs, on n'échoue pas");
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn un_fichier_sans_identifiant_en_reçoit_un_sans_perdre_ses_bibliotheques() {
        let dossier = dossier_neuf("sans-id");
        fs::write(dossier.join(FICHIER), br#"{"appareil":"","bibliotheques":["/une"]}"#).expect("écriture");
        let reglages = Reglages::lire(&dossier);
        assert_eq!(reglages.appareil.len(), 36);
        assert_eq!(reglages.bibliotheques, vec!["/une"]);
        fs::remove_dir_all(&dossier).ok();
    }
}
