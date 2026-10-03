//! Travaux reprenables (JOB-01, JOB-02, JOB-03).
//!
//! Un travail est écrit sur disque **avant** de commencer, prend un verrou à expiration et
//! enregistre un point de reprise à chaque pas. L'écriture est atomique (fichier temporaire
//! puis renommage) : un arrêt forcé ne laisse jamais un état tronqué.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Durée d'un verrou par défaut. Passé ce délai sans renouvellement, le travail redevient
/// reprenable : c'est ce qui permet de repartir après un arrêt forcé (JOB-02).
pub const VERROU_SECONDES: u64 = 30;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Verrou {
    pub appareil: String,
    pub expire_le: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PointReprise {
    pub unite: String,
    pub valeur: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Travail {
    pub id: String,
    pub outil: String,
    pub etat: String,
    pub tentative: u32,
    pub total: u32,
    pub verrou: Option<Verrou>,
    pub point_reprise: Option<PointReprise>,
}

impl Travail {
    pub fn neuf(id: &str, outil: &str, total: u32) -> Self {
        Self {
            id: id.to_owned(),
            outil: outil.to_owned(),
            etat: "en_file".to_owned(),
            tentative: 1,
            total,
            verrou: None,
            point_reprise: None,
        }
    }

    /// Avancement entre 0 et 1, comme le champ `progression` du contrat Travail.
    pub fn progression(&self) -> f32 {
        match (&self.point_reprise, self.total) {
            (_, 0) => 1.0,
            (None, _) => 0.0,
            (Some(p), total) => f32::min(1.0, p.valeur as f32 / total as f32),
        }
    }

    /// Premier pas à traiter : juste après le dernier point de reprise (JOB-03).
    pub fn reprise_a(&self) -> u32 {
        self.point_reprise.as_ref().map_or(0, |p| p.valeur)
    }

    /// Un travail sans verrou, ou dont le verrou a expiré, est reprenable (JOB-02).
    pub fn reprenable(&self, maintenant: u64) -> bool {
        self.etat != "termine" && self.verrou.as_ref().is_none_or(|v| v.expire_le <= maintenant)
    }

    pub fn verrouiller(&mut self, appareil: &str, maintenant: u64, duree: u64) {
        self.verrou = Some(Verrou {
            appareil: appareil.to_owned(),
            expire_le: maintenant + duree,
        });
        self.etat = "en_cours".to_owned();
    }

    pub fn avancer(&mut self, valeur: u32, unite: &str) {
        self.point_reprise = Some(PointReprise {
            unite: unite.to_owned(),
            valeur,
        });
        if valeur >= self.total {
            self.etat = "termine".to_owned();
            self.verrou = None;
        }
    }
}

pub fn maintenant() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn charger(chemin: &Path) -> io::Result<Option<Travail>> {
    match fs::read_to_string(chemin) {
        Ok(texte) => serde_json::from_str(&texte)
            .map(Some)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Écriture atomique : le fichier définitif n'existe qu'une fois complet et synchronisé.
pub fn enregistrer(chemin: &Path, travail: &Travail) -> io::Result<()> {
    if let Some(parent) = chemin.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporaire: PathBuf = chemin.with_extension("tmp");
    {
        let mut fichier = fs::File::create(&temporaire)?;
        fichier.write_all(serde_json::to_string_pretty(travail)?.as_bytes())?;
        fichier.sync_all()?;
    }
    fs::rename(&temporaire, chemin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_verrou_expire_rend_le_travail_reprenable() {
        let mut t = Travail::neuf("t1", "transcripteur", 10);
        assert!(t.reprenable(1_000));
        t.verrouiller("appareil-a", 1_000, VERROU_SECONDES);
        assert!(!t.reprenable(1_000));
        assert!(t.reprenable(1_000 + VERROU_SECONDES));
    }

    #[test]
    fn un_travail_termine_n_est_plus_repris() {
        let mut t = Travail::neuf("t1", "transcripteur", 3);
        t.avancer(3, "lot");
        assert_eq!(t.etat, "termine");
        assert!(!t.reprenable(u64::MAX));
        assert_eq!(t.progression(), 1.0);
    }

    #[test]
    fn la_reprise_part_du_dernier_point_enregistre() {
        let mut t = Travail::neuf("t1", "transcripteur", 10);
        assert_eq!(t.reprise_a(), 0);
        t.avancer(4, "lot");
        assert_eq!(t.reprise_a(), 4);
        assert!((t.progression() - 0.4).abs() < f32::EPSILON);
    }
}
