//! Préparer un ensemble avant son dépôt : parcourir, mesurer, repérer les copies exactes et,
//! si on le souhaite, fabriquer une archive portable. Le module ne décide jamais qu'un média
//! correspond à une page : il ne fait que réunir des originaux explicitement choisis.

use crate::arrivee::{contenu_de, empreinte_de};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FichierPrepare {
    pub chemin: String,
    pub nom: String,
    pub taille: u64,
    pub contenu: String,
    pub empreinte: String,
    pub role: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct DoublonPrepare {
    pub empreinte: String,
    pub chemins: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AnalyseDepot {
    pub fichiers: Vec<FichierPrepare>,
    pub doublons: Vec<DoublonPrepare>,
    pub avertissements: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ArchivePreparee {
    pub chemin: String,
    pub fichiers: usize,
    pub taille: u64,
    pub empreinte: String,
}

fn est_accessoire(chemin: &Path) -> bool {
    chemin.components().any(|partie| {
        let texte = partie.as_os_str().to_string_lossy();
        texte == "__MACOSX" || texte == ".DS_Store" || texte.starts_with("._")
    })
}

fn parcourir(chemin: &Path, rendus: &mut Vec<PathBuf>) -> io::Result<()> {
    let meta = fs::symlink_metadata(chemin)?;
    if meta.file_type().is_symlink() || est_accessoire(chemin) {
        return Ok(());
    }
    if meta.is_file() {
        if contenu_de(chemin.to_string_lossy().as_ref()).is_some() {
            rendus.push(chemin.to_path_buf());
        }
        return Ok(());
    }
    if meta.is_dir() {
        let mut entrees = fs::read_dir(chemin)?.collect::<Result<Vec<_>, _>>()?;
        entrees.sort_by_key(|entree| entree.file_name());
        for entree in entrees {
            parcourir(&entree.path(), rendus)?;
        }
    }
    Ok(())
}

/// Développe fichiers et dossiers, récursivement, sans suivre les liens symboliques.
pub fn fichiers_reconnus(chemins: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    let mut fichiers = Vec::new();
    for chemin in chemins {
        parcourir(chemin, &mut fichiers).map_err(|e| format!("Impossible de parcourir « {} » : {e}", chemin.display()))?;
    }
    let mut vus = HashSet::new();
    fichiers.retain(|chemin| vus.insert(chemin.clone()));
    Ok(fichiers)
}

pub fn analyser(chemins: &[PathBuf]) -> Result<AnalyseDepot, String> {
    let chemins = fichiers_reconnus(chemins)?;
    let mut fichiers = Vec::new();
    let mut premier_document = true;
    for chemin in chemins {
        let nom = chemin.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
            format!("Le nom de « {} » ne peut pas être représenté.", chemin.display())
        })?;
        let contenu = contenu_de(nom).ok_or_else(|| format!("Type inconnu pour « {nom} »."))?;
        if contenu == "archive" {
            continue;
        }
        let role = if contenu == "documents" {
            if premier_document {
                premier_document = false;
                "principal"
            } else {
                "supplement"
            }
        } else {
            "accompagnement"
        };
        fichiers.push(FichierPrepare {
            chemin: chemin.to_string_lossy().into_owned(),
            nom: nom.to_owned(),
            taille: fs::metadata(&chemin).map_err(|e| format!("« {} » est illisible : {e}", chemin.display()))?.len(),
            contenu: contenu.to_owned(),
            empreinte: empreinte_de(&chemin).map_err(|e| format!("Empreinte impossible pour « {} » : {e}", chemin.display()))?,
            role: role.to_owned(),
        });
    }

    let mut par_empreinte: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for fichier in &fichiers {
        par_empreinte.entry(fichier.empreinte.clone()).or_default().push(fichier.chemin.clone());
    }
    let doublons = par_empreinte
        .into_iter()
        .filter(|(_, chemins)| chemins.len() > 1)
        .map(|(empreinte, chemins)| DoublonPrepare { empreinte, chemins })
        .collect::<Vec<_>>();
    let mut avertissements = Vec::new();
    if !fichiers.iter().any(|f| f.contenu == "documents") {
        avertissements.push("Aucun document reconnu dans cette sélection.".to_owned());
    }
    if !fichiers.iter().any(|f| f.role == "accompagnement") {
        avertissements.push("Aucun média d'accompagnement reconnu dans cette sélection.".to_owned());
    }
    if !doublons.is_empty() {
        avertissements.push(format!(
            "{} groupe{} de copies strictement identiques détecté{}.",
            doublons.len(),
            if doublons.len() > 1 { "s" } else { "" },
            if doublons.len() > 1 { "s" } else { "" }
        ));
    }
    Ok(AnalyseDepot { fichiers, doublons, avertissements })
}

fn nom_archive(nom: &str) -> String {
    let propre = nom
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    format!("{}.zip", if propre.is_empty() { "Ensemble" } else { &propre })
}

fn copier_dans_zip(zip: &mut ZipWriter<fs::File>, source: &Path, nom: &str) -> Result<(), String> {
    zip.start_file(
        nom,
        SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
    )
    .map_err(|e| format!("Impossible de préparer « {nom} » : {e}"))?;
    let mut entree = fs::File::open(source).map_err(|e| format!("« {} » est illisible : {e}", source.display()))?;
    let mut tampon = vec![0_u8; 1 << 16];
    loop {
        let lus = entree.read(&mut tampon).map_err(|e| format!("Lecture interrompue pour « {} » : {e}", source.display()))?;
        if lus == 0 {
            break;
        }
        zip.write_all(&tampon[..lus]).map_err(|e| format!("Écriture interrompue pour « {nom} » : {e}"))?;
    }
    Ok(())
}

pub fn creer_archive(
    analyse: &AnalyseDepot,
    principal: &str,
    destination: &Path,
    nom: &str,
) -> Result<ArchivePreparee, String> {
    let principal = analyse
        .fichiers
        .iter()
        .find(|f| f.chemin == principal && f.contenu == "documents")
        .ok_or_else(|| "Choisissez un document principal présent dans l'analyse.".to_owned())?;
    fs::create_dir_all(destination).map_err(|e| format!("Dossier de sortie inaccessible : {e}"))?;
    let chemin = destination.join(nom_archive(nom));
    if chemin.exists() {
        return Err(format!("« {} » existe déjà. Choisissez un autre nom : rien n'a été écrasé.", chemin.display()));
    }
    let temporaire = chemin.with_extension("zip.partiel");
    let resultat = (|| {
        let sortie = fs::File::create(&temporaire).map_err(|e| format!("Archive impossible à créer : {e}"))?;
        let mut zip = ZipWriter::new(sortie);
        let mut noms = HashSet::new();
        for fichier in &analyse.fichiers {
            // Une seule copie de chaque contenu dans l'archive : les autres restent signalées dans l'analyse.
            if analyse.fichiers.iter().any(|autre| autre.chemin < fichier.chemin && autre.empreinte == fichier.empreinte) {
                continue;
            }
            let interne = if fichier.chemin == principal.chemin {
                fichier.nom.clone()
            } else if fichier.contenu == "documents" {
                format!("Supplements/{}", fichier.nom)
            } else {
                let parent = Path::new(&fichier.chemin)
                    .parent()
                    .and_then(Path::file_name)
                    .and_then(|n| n.to_str())
                    .unwrap_or("Medias");
                format!("{parent}/{}", fichier.nom)
            };
            if !noms.insert(interne.to_lowercase()) {
                return Err(format!("Deux fichiers produiraient le même chemin « {interne} ». Renommez-les avant de continuer."));
            }
            copier_dans_zip(&mut zip, Path::new(&fichier.chemin), &interne)?;
        }
        zip.finish().map_err(|e| format!("Archive incomplète : {e}"))?;
        fs::rename(&temporaire, &chemin).map_err(|e| format!("Impossible de finaliser l'archive : {e}"))?;
        let taille = fs::metadata(&chemin).map_err(|e| format!("Archive créée mais impossible à vérifier : {e}"))?.len();
        let empreinte = empreinte_de(&chemin).map_err(|e| format!("Archive créée mais empreinte impossible : {e}"))?;
        Ok(ArchivePreparee { chemin: chemin.to_string_lossy().into_owned(), fichiers: noms.len(), taille, empreinte })
    })();
    if resultat.is_err() {
        fs::remove_file(&temporaire).ok();
    }
    resultat
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyse_recursivement_et_signale_les_copies_exactes() {
        let racine = tempfile::tempdir().expect("racine");
        fs::create_dir_all(racine.path().join("documents")).expect("documents");
        fs::create_dir_all(racine.path().join("medias/CD1")).expect("medias");
        fs::write(racine.path().join("documents/un.pdf"), b"pdf").expect("pdf");
        fs::write(racine.path().join("medias/CD1/un.mp3"), b"audio").expect("audio");
        fs::write(racine.path().join("medias/CD1/copie.mp3"), b"audio").expect("copie");

        let analyse = analyser(&[racine.path().to_path_buf()]).expect("analyse");

        assert_eq!(analyse.fichiers.len(), 3);
        assert_eq!(analyse.doublons.len(), 1);
        assert_eq!(analyse.fichiers.iter().filter(|f| f.role == "principal").count(), 1);
    }

    #[test]
    fn fabrique_une_archive_sans_ecraser_et_range_les_documents_secondaires() {
        let racine = tempfile::tempdir().expect("racine");
        let sortie = tempfile::tempdir().expect("sortie");
        let principal = racine.path().join("principal.pdf");
        let supplement = racine.path().join("annexe.pdf");
        let media = racine.path().join("lecture.mp3");
        fs::write(&principal, b"principal").expect("principal");
        fs::write(&supplement, b"annexe").expect("annexe");
        fs::write(&media, b"audio").expect("audio");
        let analyse = analyser(&[principal.clone(), supplement, media]).expect("analyse");

        let creee = creer_archive(&analyse, principal.to_string_lossy().as_ref(), sortie.path(), "Un ensemble").expect("archive");
        assert!(Path::new(&creee.chemin).exists());
        assert!(creer_archive(&analyse, principal.to_string_lossy().as_ref(), sortie.path(), "Un ensemble")
            .expect_err("pas d'écrasement")
            .contains("rien n'a été écrasé"));
    }
}
