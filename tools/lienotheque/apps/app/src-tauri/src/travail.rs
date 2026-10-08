//! Travaux reprenables (JOB-01, JOB-02, JOB-03).
//!
//! Un travail est écrit sur disque **avant** de commencer, tient un bail qu'il renouvelle en
//! battant, et enregistre un point de reprise à chaque pas. L'écriture est atomique (fichier
//! temporaire puis renommage) : un arrêt forcé ne laisse jamais un état tronqué.
//!
//! Le bail remplace le verrou à durée fixe : un processus vivant bat toutes les
//! `battement_secondes`, le bail expire `expiration_secondes` après le dernier battement.
//! Un processus tué cesse de battre, donc son bail finit par expirer de lui-même.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Cadence du battement et durée du bail viennent de `packages/contrats/limites.json`, lu aussi
/// par le TypeScript : elles étaient écrites des deux côtés, et deux descriptions d'un même fait
/// finissent toujours par en donner deux.
pub fn battement_secondes() -> u64 {
    crate::limites::LIMITES.battement_verrou_s
}

pub fn expiration_secondes() -> u64 {
    crate::limites::LIMITES.expiration_verrou_s
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Verrou {
    pub appareil: String,
    /// Dernier battement : c'est lui qui repousse l'expiration.
    pub battu_le: u64,
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
    /// Ce que le travail coûte à la machine : « lourd » occupe une des places limitées, « leger »
    /// n'en occupe aucune. Lourd par défaut, et à l'absence : se tromper dans ce sens fait
    /// attendre, se tromper dans l'autre fait rendre la main à la machine.
    #[serde(default = "lourd")]
    pub poids: String,
    pub tentative: u32,
    pub total: u32,
    /// Quand le travail est entré en file (JOB-01). C'est lui qui départage deux travaux aussi
    /// avancés l'un que l'autre : le plus ancien passe d'abord.
    ///
    /// Par défaut à l'absence, pour qu'une file écrite avant ce champ se relise sans se perdre.
    #[serde(default)]
    pub cree_le: u64,
    /// Dernier changement d'état. C'est de lui que court le délai entre deux tentatives (JOB-05).
    #[serde(default)]
    pub maj_le: u64,
    pub verrou: Option<Verrou>,
    pub point_reprise: Option<PointReprise>,
}

impl Travail {
    pub fn neuf(id: &str, outil: &str, total: u32) -> Self {
        Self {
            id: id.to_owned(),
            outil: outil.to_owned(),
            etat: "en_file".to_owned(),
            poids: lourd(),
            tentative: 1,
            total,
            cree_le: maintenant(),
            maj_le: maintenant(),
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

    /// Un travail sans bail, ou dont le bail a expiré, est reprenable (JOB-02).
    pub fn reprenable(&self, maintenant: u64) -> bool {
        self.etat != "termine" && self.verrou.as_ref().is_none_or(|v| v.expire_le <= maintenant)
    }

    /// Prend le bail, ou le renouvelle sans condition.
    pub fn battre(&mut self, appareil: &str, maintenant: u64, expiration: u64) {
        self.verrou = Some(Verrou {
            appareil: appareil.to_owned(),
            battu_le: maintenant,
            expire_le: maintenant + expiration,
        });
        self.etat = "en_cours".to_owned();
    }

    /// Renouvelle le bail seulement si le battement est dû. Rend `true` s'il a battu : le travail
    /// n'écrit son état sur disque que dans ce cas, inutile de le faire à chaque pas.
    pub fn battre_si_du(&mut self, appareil: &str, maintenant: u64, battement: u64, expiration: u64) -> bool {
        let du = self
            .verrou
            .as_ref()
            .is_none_or(|v| maintenant.saturating_sub(v.battu_le) >= battement);
        if du {
            self.battre(appareil, maintenant, expiration);
        }
        du
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

fn lourd() -> String {
    "lourd".to_owned()
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
    fn un_bail_expire_quinze_secondes_apres_le_dernier_battement() {
        let mut t = Travail::neuf("t1", "transcripteur", 10);
        assert!(t.reprenable(1_000), "sans bail, rien ne retient le travail");

        t.battre("appareil-a", 1_000, expiration_secondes());
        assert!(!t.reprenable(1_000 + expiration_secondes() - 1));
        assert!(t.reprenable(1_000 + expiration_secondes()));
    }

    #[test]
    fn un_battement_repousse_l_expiration_d_autant() {
        let mut t = Travail::neuf("t1", "transcripteur", 10);
        t.battre("appareil-a", 1_000, expiration_secondes());

        // Battement dû au bout de cinq secondes, pas avant.
        assert!(!t.battre_si_du("appareil-a", 1_004, battement_secondes(), expiration_secondes()));
        assert!(t.battre_si_du("appareil-a", 1_005, battement_secondes(), expiration_secondes()));

        let verrou = t.verrou.as_ref().expect("bail en cours");
        assert_eq!(verrou.battu_le, 1_005);
        assert_eq!(verrou.expire_le, 1_005 + expiration_secondes());
        assert!(!t.reprenable(1_019), "le bail court jusqu'à quinze secondes après le battement");
        assert!(t.reprenable(1_020));
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
