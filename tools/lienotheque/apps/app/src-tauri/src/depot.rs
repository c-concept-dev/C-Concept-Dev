//! Le dossier d'une bibliothèque, et qui a le droit d'y écrire (JOB-06, ANC-05).
//!
//! Une bibliothèque est un dossier, portable d'une machine à l'autre : on le copie sur un disque
//! externe et il s'ouvre ailleurs. Il porte trois choses — les sources, les dérivés, la base —
//! et c'est l'hôte seul qui écrit la base.
//!
//! ```text
//! <bibliothèque>/
//!   sources/                    les originaux, copiés une fois
//!   derives/<version>/          ce qu'un traitement a produit
//!   base/
//!     versions/<version>.json   le résultat d'une version
//!     active.json               laquelle est active
//! ```
//!
//! **L'hôte est seul écrivain de `base/`.** Le moteur ne touche jamais à ce dossier : il reçoit
//! un travail, rend un résultat, et c'est l'hôte qui le valide puis l'active. Le moteur écrit
//! bien dans `derives/<version>/`, mais une version qui n'est pas active ne regarde personne :
//! tant qu'elle n'est pas activée, ce qu'elle produit n'existe pour aucun lecteur.
//!
//! **L'activation est une seule opération** (JOB-06) : le pointeur est écrit dans un fichier
//! temporaire puis renommé. Un arrêt brutal laisse donc l'ancienne version active, jamais un
//! pointeur à moitié écrit. Pendant tout le traitement, la version active ne bouge pas.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Agencement du dossier, le même que celui du noyau TypeScript.
pub const SOURCES: &str = "sources";
pub const DERIVES: &str = "derives";
pub const BASE: &str = "base";

const VERSIONS: &str = "versions";
const ACTIVE: &str = "active.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Pointeur {
    /// La version que les lecteurs voient.
    pub version: String,
    /// Quand elle a été activée. Pour le journal, et pour savoir laquelle est la plus récente si
    /// jamais deux pointeurs se disputaient.
    pub activee_le: u64,
}

pub struct Depot {
    racine: PathBuf,
}

impl Depot {
    /// Ouvre — ou crée — le dossier d'une bibliothèque.
    ///
    /// Créer les trois dossiers d'emblée plutôt qu'à la première écriture : un dossier vide se
    /// copie et s'inspecte, et son absence ne se découvre pas au pire moment.
    pub fn ouvrir(racine: impl Into<PathBuf>) -> io::Result<Self> {
        let racine = racine.into();
        for dossier in [SOURCES, DERIVES, BASE] {
            fs::create_dir_all(racine.join(dossier))?;
        }
        fs::create_dir_all(racine.join(BASE).join(VERSIONS))?;
        Ok(Self { racine })
    }

    pub fn racine(&self) -> &Path {
        &self.racine
    }

    /// Où le moteur écrira les dérivés d'une version. Le dossier est créé ici : c'est l'hôte qui
    /// décide de l'emplacement, le moteur n'écrit que là où on le lui dit.
    pub fn derives_de(&self, version: &str) -> io::Result<PathBuf> {
        let chemin = self.racine.join(DERIVES).join(version);
        fs::create_dir_all(&chemin)?;
        Ok(chemin)
    }

    /// Copie un original dans la bibliothèque. C'est ce qui la rend portable : le document
    /// voyage avec elle, et rien ne dépend plus de l'endroit d'où il venait.
    pub fn deposer_source(&self, origine: &Path) -> io::Result<PathBuf> {
        let nom = origine
            .file_name()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "chemin sans nom de fichier"))?;
        let destination = self.racine.join(SOURCES).join(nom);
        fs::copy(origine, &destination)?;
        Ok(destination)
    }

    /// Écrit le résultat d'une version, sans toucher à celle qui est active (JOB-06).
    ///
    /// L'écriture est atomique : un arrêt brutal laisse le fichier absent ou complet, jamais
    /// tronqué — et une version tronquée qu'on activerait serait pire qu'une version manquante.
    pub fn ecrire_version(&self, version: &str, charge: &str) -> io::Result<PathBuf> {
        let chemin = self.racine.join(BASE).join(VERSIONS).join(format!("{version}.json"));
        ecrire_atomique(&chemin, charge.as_bytes())?;
        Ok(chemin)
    }

    pub fn lire_version(&self, version: &str) -> io::Result<Option<String>> {
        match fs::read_to_string(self.racine.join(BASE).join(VERSIONS).join(format!("{version}.json"))) {
            Ok(texte) => Ok(Some(texte)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Active une version, en une seule opération (JOB-06).
    ///
    /// On refuse d'activer une version qu'on n'a pas écrite : activer un pointeur vers rien
    /// rendrait la bibliothèque illisible, et c'est exactement le genre de panne qu'une
    /// vérification d'une ligne évite.
    pub fn activer(&self, version: &str, maintenant: u64) -> io::Result<()> {
        if self.lire_version(version)?.is_none() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Version « {version} » jamais écrite : rien à activer."),
            ));
        }
        let pointeur = Pointeur { version: version.to_owned(), activee_le: maintenant };
        ecrire_atomique(&self.racine.join(BASE).join(ACTIVE), serde_json::to_string_pretty(&pointeur)?.as_bytes())
    }

    /// La version que les lecteurs voient, s'il y en a une.
    pub fn version_active(&self) -> io::Result<Option<Pointeur>> {
        match fs::read_to_string(self.racine.join(BASE).join(ACTIVE)) {
            Ok(texte) => serde_json::from_str(&texte)
                .map(Some)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Ce que les lecteurs lisent aujourd'hui.
    pub fn charge_active(&self) -> io::Result<Option<String>> {
        match self.version_active()? {
            None => Ok(None),
            Some(pointeur) => self.lire_version(&pointeur.version),
        }
    }
}

/// Écrit un fichier en une fois : temporaire, synchronisé, puis renommé.
///
/// Le renommage est l'opération que le système garantit indivisible. Sans lui, un arrêt au mauvais
/// moment laisse un fichier à moitié écrit — et un pointeur à moitié écrit ne désigne rien.
fn ecrire_atomique(chemin: &Path, contenu: &[u8]) -> io::Result<()> {
    if let Some(parent) = chemin.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporaire = chemin.with_extension("tmp");
    {
        let mut fichier = fs::File::create(&temporaire)?;
        fichier.write_all(contenu)?;
        fichier.sync_all()?;
    }
    fs::rename(&temporaire, chemin)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-depot-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        (Depot::ouvrir(&racine).expect("dépôt ouvert"), racine)
    }

    #[test]
    fn un_dossier_de_bibliotheque_porte_ses_trois_parties() {
        let (depot, racine) = depot_neuf("agencement");
        for dossier in [SOURCES, DERIVES, BASE] {
            assert!(racine.join(dossier).is_dir(), "{dossier} manque");
        }
        assert!(racine.join(BASE).join(VERSIONS).is_dir());
        assert_eq!(depot.racine(), racine);
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_original_depose_voyage_avec_la_bibliotheque() {
        let (depot, racine) = depot_neuf("source");
        let origine = std::env::temp_dir().join(format!("original-{}.txt", std::process::id()));
        fs::write(&origine, b"des octets").expect("original écrit");

        let copie = depot.deposer_source(&origine).expect("source déposée");
        assert!(copie.starts_with(racine.join(SOURCES)));
        assert_eq!(fs::read(&copie).expect("copie lisible"), b"des octets");

        // L'original peut disparaître : la bibliothèque n'en dépend plus.
        fs::remove_file(&origine).ok();
        assert_eq!(fs::read(&copie).expect("la copie survit"), b"des octets");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn ecrire_une_version_ne_touche_pas_celle_qui_est_active() {
        let (depot, racine) = depot_neuf("job06");

        depot.ecrire_version("v1", r#"{"quoi":"premier"}"#).expect("v1 écrite");
        depot.activer("v1", 1_000).expect("v1 activée");
        assert_eq!(depot.charge_active().expect("lecture"), Some(r#"{"quoi":"premier"}"#.to_owned()));

        // Tout un traitement écrit dans la version cible : les lecteurs continuent de voir v1.
        depot.ecrire_version("v2", r#"{"quoi":"second"}"#).expect("v2 écrite");
        assert_eq!(
            depot.version_active().expect("lecture").map(|p| p.version),
            Some("v1".to_owned()),
            "la version active n'a pas bougé pendant le traitement"
        );
        assert_eq!(depot.charge_active().expect("lecture"), Some(r#"{"quoi":"premier"}"#.to_owned()));

        // Puis une seule opération fait passer les lecteurs à v2.
        depot.activer("v2", 2_000).expect("v2 activée");
        assert_eq!(depot.charge_active().expect("lecture"), Some(r#"{"quoi":"second"}"#.to_owned()));

        // Et l'ancienne reste lisible : une activation ne détruit rien.
        assert_eq!(depot.lire_version("v1").expect("lecture"), Some(r#"{"quoi":"premier"}"#.to_owned()));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn on_refuse_d_activer_une_version_jamais_ecrite() {
        let (depot, racine) = depot_neuf("fantome");
        let erreur = depot.activer("jamais-vue", 1_000).expect_err("activer du vide se refuse");
        assert_eq!(erreur.kind(), io::ErrorKind::NotFound);
        assert!(erreur.to_string().contains("jamais écrite"), "le refus dit pourquoi");
        assert!(depot.version_active().expect("lecture").is_none(), "rien n'a été activé");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn une_bibliotheque_neuve_n_a_pas_de_version_active() {
        let (depot, racine) = depot_neuf("vide");
        assert!(depot.version_active().expect("lecture").is_none());
        assert!(depot.charge_active().expect("lecture").is_none());
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn l_ecriture_ne_laisse_aucun_temporaire_derriere_elle() {
        let (depot, racine) = depot_neuf("propre");
        depot.ecrire_version("v1", "{}").expect("écrite");
        depot.activer("v1", 1_000).expect("activée");

        let restes: Vec<_> = fs::read_dir(racine.join(BASE))
            .expect("base lisible")
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "tmp"))
            .collect();
        assert!(restes.is_empty(), "un temporaire oublié finit par être pris pour une donnée");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn les_derives_d_une_version_ont_leur_propre_dossier() {
        let (depot, racine) = depot_neuf("derives");
        let un = depot.derives_de("v1").expect("dossier créé");
        let deux = depot.derives_de("v2").expect("dossier créé");
        assert_ne!(un, deux, "deux versions n'écrivent pas au même endroit");
        assert!(un.is_dir() && deux.is_dir());
        // Le moteur écrit là, et nulle part ailleurs : une version non activée ne regarde personne.
        assert!(un.starts_with(racine.join(DERIVES)));
        fs::remove_dir_all(&racine).ok();
    }
}
