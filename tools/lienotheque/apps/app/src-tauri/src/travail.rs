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

/// Qui tient le bail, et jusqu'à quand (JOB-02).
///
/// `appareil` est l'identifiant de la machine, et c'est un UUID : le contrat l'exige, parce que
/// deux installations qui s'appelleraient toutes deux « cet ordinateur » ne se distingueraient
/// plus le jour où elles partagent une bibliothèque.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Verrou {
    pub appareil: String,
    /// Dernier battement : c'est lui qui repousse l'expiration.
    pub battu_le: u64,
    pub expire_le: u64,
}

/// De quoi un travail s'occupe, tel que l'écran le nomme (JOB-03, UX-03).
///
/// Une file qui n'affiche que des identifiants ne se surveille pas : on y voit que quelque chose
/// tourne, jamais quoi. Le nom du fichier déposé et ce qu'il contient, rien de plus : ce que le
/// fichier *représente* vient du schéma de la bibliothèque, jamais d'ici (CLA-01).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Sujet {
    pub nom: String,
    pub contenu: String,
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
    /// Combien d'unités en tout. Zéro tant qu'on ne le sait pas : il faut avoir ouvert le fichier
    /// pour le savoir, et c'est la première progression qui le dit.
    pub total: u32,
    /// Absent pour un travail qui ne porte sur aucun fichier — un recalcul, une réindexation.
    #[serde(default)]
    pub sujet: Option<Sujet>,
    /// La version que ce travail écrira. Elle est fixée à l'entrée en file et ne change pas :
    /// une reprise écrit dans la même, sans quoi une reprise laisserait deux versions à demi
    /// faites (JOB-06).
    #[serde(default)]
    pub version_cible: String,
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
            sujet: None,
            version_cible: String::new(),
            cree_le: maintenant(),
            maj_le: maintenant(),
            verrou: None,
            point_reprise: None,
        }
    }

    /// Avancement entre 0 et 1, comme le champ `progression` du contrat Travail.
    ///
    /// Un total inconnu vaut zéro et non cent : tant qu'on n'a pas ouvert le fichier, on ne sait
    /// pas combien il compte, et un travail qui n'a rien fait ne s'affiche pas comme fait. Seul
    /// l'état terminé vaut un, et le contrat l'exige dans ce sens-là aussi.
    pub fn progression(&self) -> f32 {
        if self.etat == "termine" {
            return 1.0;
        }
        match (&self.point_reprise, self.total) {
            (None, _) | (_, 0) => 0.0,
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
        if self.total > 0 && valeur >= self.total {
            self.etat = "termine".to_owned();
            self.verrou = None;
        }
    }
}

/// Le travail tel que le contrat `Travail` le décrit, pour que la page le lise (PLT-02).
///
/// L'hôte tient sa file dans sa propre forme — des secondes, des chaînes courtes, ce qui se relit
/// vite au démarrage. La page, elle, lit un contrat. La traduction vit ici et nulle part ailleurs,
/// et `fixtures/travaux-vus.json`, écrit par le test de ce module et validé par le contrat côté
/// TypeScript, interdit aux deux formes de diverger en silence.
impl Travail {
    pub fn vu(&self) -> serde_json::Value {
        let horodatage = |secondes: u64| {
            // Un horodatage ISO en temps universel, que le contrat sait lire.
            let jours = secondes / 86_400;
            let reste = secondes % 86_400;
            let (annee, mois, jour) = civil(jours as i64);
            format!(
                "{annee:04}-{mois:02}-{jour:02}T{:02}:{:02}:{:02}Z",
                reste / 3600,
                (reste % 3600) / 60,
                reste % 60
            )
        };
        let mut vu = serde_json::json!({
            "id": self.id,
            "outil": { "nom": self.outil, "version": "1.0.0" },
            "versionCible": self.version_cible,
            "etat": self.etat,
            "lieu": "application",
            "poids": self.poids,
            "tentative": self.tentative,
            "progression": self.progression(),
            "creeLe": horodatage(self.cree_le),
            "majLe": horodatage(self.maj_le),
        });
        if let Some(sujet) = &self.sujet {
            let mut porte = serde_json::json!({ "nom": sujet.nom, "contenu": sujet.contenu });
            if self.total > 0 {
                porte["total"] = serde_json::json!(self.total);
            }
            vu["sujet"] = porte;
        }
        if let Some(point) = &self.point_reprise {
            vu["pointReprise"] = serde_json::json!({ "unite": point.unite, "valeur": point.valeur });
        }
        if let Some(verrou) = &self.verrou {
            vu["verrou"] = serde_json::json!({
                "appareilId": verrou.appareil,
                "battuLe": horodatage(verrou.battu_le),
                "expireLe": horodatage(verrou.expire_le),
            });
        }
        vu
    }
}

/// Jour julien vers année, mois, jour (algorithme de Howard Hinnant, domaine public).
fn civil(jours: i64) -> (i64, u32, u32) {
    let z = jours + 719_468;
    let ere = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - ere * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + ere * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
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
    /// Écrit `fixtures/travaux-vus.json` depuis la forme de l'hôte, pour que le contrat
    /// TypeScript le valide de son côté (`packages/contrats/test/travaux-vus.test.ts`).
    ///
    /// L'hôte tient sa file dans sa propre forme et la page lit un contrat : sans ce fichier,
    /// les deux dérivent en silence, et l'écran de traitement n'affiche plus rien sans qu'aucun
    /// test ne s'en plaigne. Le fichier est versionné ; le test échoue quand il a changé, et
    /// c'est alors au contrôle TypeScript de dire si la nouvelle forme tient.
    #[test]
    fn ecrit_les_travaux_vus_pour_le_contrat() {
        use super::*;

        let cas: Vec<Travail> = vec![
            {
                // En file, rien encore ouvert : ni total, ni point de reprise.
                let mut t = Travail::neuf("0190f0a0-0000-7000-8000-000000000001", "traitement-de-lot", 0);
                t.version_cible = "0190f0a0-0000-7000-8000-0000000000a1".to_owned();
                t.cree_le = 1_760_000_000;
                t.maj_le = 1_760_000_000;
                t.sujet = Some(Sujet { nom: "un-document.pdf".to_owned(), contenu: "documents".to_owned() });
                t
            },
            {
                // En cours, le total connu et le bail tenu.
                let mut t = Travail::neuf("0190f0a0-0000-7000-8000-000000000002", "traitement-de-lot", 286);
                t.version_cible = "0190f0a0-0000-7000-8000-0000000000a2".to_owned();
                t.cree_le = 1_760_000_100;
                t.sujet = Some(Sujet { nom: "un-document.pdf".to_owned(), contenu: "documents".to_owned() });
                t.avancer(194, "page");
                t.battre("0190f0a0-0000-7000-8000-00000000ff01", 1_760_000_500, expiration_secondes());
                t.maj_le = 1_760_000_500;
                t
            },
            {
                // Des pistes, et un travail terminé : la progression vaut exactement 1.
                let mut t = Travail::neuf("0190f0a0-0000-7000-8000-000000000003", "traitement-de-lot", 24);
                t.version_cible = "0190f0a0-0000-7000-8000-0000000000a3".to_owned();
                t.cree_le = 1_760_000_200;
                t.maj_le = 1_760_000_900;
                t.sujet = Some(Sujet { nom: "un-disque.zip".to_owned(), contenu: "audio".to_owned() });
                t.avancer(24, "piste");
                t
            },
            {
                // Sans sujet : un recalcul ne porte sur aucun fichier.
                let mut t = Travail::neuf("0190f0a0-0000-7000-8000-000000000004", "recompte", 0);
                t.version_cible = "0190f0a0-0000-7000-8000-0000000000a4".to_owned();
                t.poids = "leger".to_owned();
                t.cree_le = 1_760_000_300;
                t.maj_le = 1_760_000_300;
                t
            },
        ];

        let vus: Vec<serde_json::Value> = cas.iter().map(Travail::vu).collect();
        let texte = serde_json::to_string_pretty(&serde_json::json!({
            "_lisez_moi": "Écrit par le test « ecrit_les_travaux_vus_pour_le_contrat » de apps/app/src-tauri/src/travail.rs, et validé par le contrat Travail côté TypeScript. Ne pas modifier à la main : c'est la preuve que la file de l'hôte et le contrat que lit la page décrivent le même travail.",
            "travaux": vus,
        }))
        .expect("sérialisation");

        let chemin = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../fixtures/travaux-vus.json");
        let ancien = std::fs::read_to_string(&chemin).unwrap_or_default();
        if ancien.trim() != texte.trim() {
            std::fs::write(&chemin, format!("{texte}\n")).expect("écriture");
            panic!("fixtures/travaux-vus.json a changé : relancez le contrôle TypeScript, qui dira si la nouvelle forme tient le contrat.");
        }
    }

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
