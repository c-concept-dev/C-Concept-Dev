//! Ouverture bornée d'un ZIP qui réunit un document et ses enregistrements (C9.1).
//!
//! Rien n'entre dans la bibliothèque pendant cette étape. L'archive entière est d'abord inspectée,
//! puis ouverte dans un espace temporaire. Une entrée invalide refuse donc le lot entier : jamais
//! un demi-dépôt dont il faudrait deviner ce qui manque.

use crate::limites::LIMITES;
use std::{
    collections::HashSet,
    fs,
    io,
    path::{Component, Path, PathBuf},
};
use tempfile::TempDir;
use zip::ZipArchive;

#[derive(Debug)]
pub struct FichierExtrait {
    pub chemin: PathBuf,
    /// Chemin d'origine portable, avec `/` quel que soit le système.
    pub nom: String,
}

pub struct ArchiveExtraite {
    _temporaire: TempDir,
    pub fichiers: Vec<FichierExtrait>,
}

fn message_taille(octets: u64) -> String {
    format!("{:.1} Mio", octets as f64 / 1_048_576.0)
}

fn est_accessoire(nom: &Path) -> bool {
    nom.components().any(|partie| partie.as_os_str() == "__MACOSX")
        || nom
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n == ".DS_Store" || n.starts_with("._"))
}

fn nom_portable(chemin: &Path) -> String {
    chemin
        .components()
        .filter_map(|c| match c {
            Component::Normal(n) => n.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Inspecte puis ouvre une archive PDF + MP3, sans toucher à la bibliothèque.
pub fn extraire(chemin: &Path) -> Result<ArchiveExtraite, String> {
    let poids = fs::metadata(chemin)
        .map_err(|e| format!("Archive illisible : {e}. Choisissez de nouveau le fichier ZIP."))?
        .len();
    if poids > LIMITES.archive_octets_max {
        return Err(format!(
            "Archive trop volumineuse ({} ; maximum {}). Répartissez-la en plusieurs ZIP.",
            message_taille(poids),
            message_taille(LIMITES.archive_octets_max)
        ));
    }

    let fichier = fs::File::open(chemin)
        .map_err(|e| format!("Archive illisible : {e}. Choisissez de nouveau le fichier ZIP."))?;
    let mut archive = ZipArchive::new(fichier)
        .map_err(|e| format!("Ce ZIP est endommagé ou incomplet : {e}. Recréez-le puis réessayez."))?;
    if archive.len() > LIMITES.archive_entrees_max {
        return Err(format!(
            "Ce ZIP contient {} entrées ; le maximum est {}. Répartissez-le en plusieurs ZIP.",
            archive.len(), LIMITES.archive_entrees_max
        ));
    }

    let mut a_ouvrir: Vec<(usize, PathBuf, String)> = Vec::new();
    let mut vus = HashSet::new();
    let mut total = 0_u64;
    let mut pdf = 0_usize;
    let mut mp3 = 0_usize;

    for rang in 0..archive.len() {
        let entree = archive
            .by_index(rang)
            .map_err(|e| format!("Entrée {rang} illisible dans le ZIP : {e}. Recréez l'archive."))?;
        let brut = entree.name();
        if brut.contains('\\')
            || brut.starts_with('/')
            || brut.get(1..3).is_some_and(|morceau| morceau.starts_with(":/"))
        {
            return Err(format!("Le ZIP contient un chemin dangereux (« {brut} »). Retirez cette entrée puis recréez le ZIP."));
        }
        let relatif = entree.enclosed_name().ok_or_else(|| {
            format!("Le ZIP contient un chemin dangereux (« {brut} »). Retirez cette entrée puis recréez le ZIP.")
        })?;
        if est_accessoire(&relatif) || entree.is_dir() {
            continue;
        }
        if entree.encrypted() {
            return Err(format!("« {brut} » est chiffré. Créez un ZIP sans mot de passe puis réessayez."));
        }
        if entree.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err(format!("« {brut} » est un lien symbolique. Remplacez-le par le vrai fichier dans le ZIP."));
        }
        if entree.size() > LIMITES.archive_entree_octets_max {
            return Err(format!(
                "« {brut} » est trop volumineux une fois ouvert ({} ; maximum {}).",
                message_taille(entree.size()),
                message_taille(LIMITES.archive_entree_octets_max)
            ));
        }
        total = total
            .checked_add(entree.size())
            .ok_or_else(|| "Le volume annoncé par le ZIP est incohérent. Recréez l'archive.".to_owned())?;
        if total > LIMITES.archive_total_octets_max {
            return Err(format!(
                "Le ZIP dépasserait {} une fois ouvert. Répartissez-le en plusieurs ZIP.",
                message_taille(LIMITES.archive_total_octets_max)
            ));
        }
        let rapport = if entree.compressed_size() == 0 {
            if entree.size() == 0 { 1.0 } else { f64::INFINITY }
        } else {
            entree.size() as f64 / entree.compressed_size() as f64
        };
        if rapport > LIMITES.archive_rapport_compression_max {
            return Err(format!(
                "« {brut} » se décompresse anormalement (rapport ×{rapport:.1}). Recréez le ZIP sans compression extrême."
            ));
        }

        let portable = nom_portable(&relatif);
        if portable.is_empty() || !vus.insert(portable.to_lowercase()) {
            return Err(format!("Le chemin « {brut} » est vide ou apparaît deux fois. Renommez l'entrée puis recréez le ZIP."));
        }
        match relatif.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
            Some("pdf") => pdf += 1,
            Some("mp3") => mp3 += 1,
            _ => {
                return Err(format!(
                    "« {portable} » n'est ni un PDF ni un MP3. Retirez ce fichier du ZIP puis réessayez."
                ))
            }
        }
        a_ouvrir.push((rang, relatif, portable));
    }

    if pdf != 1 {
        return Err(format!(
            "Ce ZIP contient {pdf} PDF ; il doit contenir un seul PDF et ses MP3. Gardez un seul PDF puis réessayez."
        ));
    }
    if mp3 == 0 {
        return Err("Ce ZIP ne contient aucun MP3. Ajoutez les MP3 qui accompagnent le PDF puis réessayez.".to_owned());
    }

    let temporaire = tempfile::Builder::new()
        .prefix("lienotheque-zip-")
        .tempdir()
        .map_err(|e| format!("Espace temporaire indisponible : {e}. Libérez de la place puis réessayez."))?;
    let mut fichiers = Vec::with_capacity(a_ouvrir.len());
    for (rang, relatif, portable) in a_ouvrir {
        let destination = temporaire.path().join(&relatif);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Impossible de préparer « {portable} » : {e}. Libérez de la place puis réessayez."))?;
        }
        let mut entree = archive
            .by_index(rang)
            .map_err(|e| format!("« {portable} » est illisible : {e}. Recréez le ZIP puis réessayez."))?;
        let mut sortie = fs::File::create(&destination)
            .map_err(|e| format!("Impossible de préparer « {portable} » : {e}. Libérez de la place puis réessayez."))?;
        io::copy(&mut entree, &mut sortie)
            .map_err(|e| format!("« {portable} » est tronqué ou illisible : {e}. Recréez le ZIP puis réessayez."))?;
        fichiers.push(FichierExtrait { chemin: destination, nom: portable });
    }

    Ok(ArchiveExtraite { _temporaire: temporaire, fichiers })
}
