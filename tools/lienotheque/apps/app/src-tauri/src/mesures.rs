//! Mesure de la taille d'installation, moteurs embarqués compris (décision Tauri, lot 0).

use serde::Serialize;
use std::{fs, path::Path};

#[derive(Serialize, Clone, Debug, Default)]
pub struct Poids {
    pub octets: u64,
    pub fichiers: u64,
}

pub fn peser(chemin: &Path) -> Poids {
    let mut poids = Poids::default();
    let Ok(metadonnees) = fs::symlink_metadata(chemin) else {
        return poids;
    };
    if metadonnees.is_symlink() {
        return poids; // un lien ne pèse que son chemin : il pointe sur un fichier déjà compté
    }
    if metadonnees.is_file() {
        poids.octets = metadonnees.len();
        poids.fichiers = 1;
        return poids;
    }
    let Ok(entrees) = fs::read_dir(chemin) else {
        return poids;
    };
    for entree in entrees.flatten() {
        let sous = peser(&entree.path());
        poids.octets += sous.octets;
        poids.fichiers += sous.fichiers;
    }
    poids
}

/// Mégaoctets décimaux, comme les affichent les systèmes et les boutiques d'applications.
pub fn en_mo(octets: u64) -> f64 {
    (octets as f64 / 1_000_000.0 * 100.0).round() / 100.0
}
