//! Prototype bureau Liénothèque (lot 0).
//!
//! But : mesurer ce que Tauri 2 permet réellement, pas livrer l'application.
//! Quatre capacités sont éprouvées — ouvrir un PDF de 500 pages, lancer un sidecar Tesseract,
//! reprendre un travail après un arrêt forcé (JOB-02), lire un MP3 par plages — plus la taille
//! d'installation moteurs compris. La décision reste à prendre (docs/decisions.md).

pub mod file;
pub mod limites;
pub mod media;
pub mod moteur;
pub mod mesures;
pub mod ocr;
pub mod pdf;
pub mod plateforme;
pub mod travail;

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};

/// Emplacement des moteurs embarqués : dans le paquet installé, à côté de l'exécutable ;
/// en développement, dans `src-tauri/moteurs/` préparé par `outils/preparer-moteurs.sh`.
pub struct Moteurs {
    pub binaire: PathBuf,
    pub tessdata: PathBuf,
}

/// Nom du moteur selon le système : Windows veut l'extension, pas les autres.
pub const NOM_MOTEUR: &str = if cfg!(windows) { "tesseract.exe" } else { "tesseract" };

impl Moteurs {
    pub fn depuis(racine: &Path) -> Self {
        Self {
            binaire: racine.join("bin").join(NOM_MOTEUR),
            tessdata: racine.join("tessdata"),
        }
    }

    /// Dans le paquet macOS, Tauri pose le binaire annexe à côté de l'exécutable et les
    /// ressources sous `Resources/` : on prend le premier des deux agencements qui existe.
    pub fn installes(ressources: &Path) -> Self {
        let a_cote = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.join(NOM_MOTEUR)))
            .filter(|c| c.exists());
        let developpement = Self::depuis(ressources);
        Self {
            binaire: a_cote.unwrap_or(developpement.binaire),
            tessdata: developpement.tessdata,
        }
    }
}

#[derive(Default)]
pub struct Etat {
    pub serveur: Mutex<Option<media::Serveur>>,
}

#[tauri::command]
fn ouvrir_pdf(chemin: String) -> Result<pdf::MesurePdf, String> {
    pdf::ouvrir(Path::new(&chemin))
}

#[tauri::command]
fn lancer_ocr(application: tauri::AppHandle, chemin: String, langue: String) -> Result<ocr::MesureOcr, String> {
    let racine = application
        .path()
        .resolve("moteurs", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let moteurs = Moteurs::installes(&racine);
    ocr::reconnaitre(&moteurs.binaire, &moteurs.tessdata, Path::new(&chemin), &langue)
}

#[tauri::command]
fn servir_media(etat: State<'_, Etat>, chemin: String) -> Result<media::Servi, String> {
    let serveur = media::servir(PathBuf::from(chemin), "audio/mpeg")?;
    let infos = serveur.infos.clone();
    *etat.serveur.lock().map_err(|e| e.to_string())? = Some(serveur);
    Ok(infos)
}

#[tauri::command]
fn plages_servies(etat: State<'_, Etat>) -> Result<u64, String> {
    let serveur = etat.serveur.lock().map_err(|e| e.to_string())?;
    Ok(serveur
        .as_ref()
        .map_or(0, |s| s.plages_servies.load(std::sync::atomic::Ordering::Relaxed)))
}

#[tauri::command]
fn etat_travail(chemin: String) -> Result<Option<travail::Travail>, String> {
    travail::charger(Path::new(&chemin)).map_err(|e| e.to_string())
}

/// Fixtures locales du prototype, cherchées à côté du projet. Elles ne sont pas empaquetées :
/// ce sont des fichiers de mesure, pas du contenu de l'application.
#[tauri::command]
fn fixtures() -> std::collections::BTreeMap<String, String> {
    let candidats = [
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/fichiers"),
        std::env::current_dir().unwrap_or_default().join("fixtures/fichiers"),
    ];
    let dossier = candidats.into_iter().find(|c| c.is_dir());
    ["500-pages.pdf", "500-pages-scan.pdf", "page-ocr.png", "piste.mp3"]
        .into_iter()
        .filter_map(|nom| {
            let chemin = dossier.as_ref()?.join(nom);
            chemin.is_file().then(|| (nom.to_owned(), chemin.display().to_string()))
        })
        .collect()
}

#[tauri::command]
fn peser_installation(chemin: String) -> mesures::Poids {
    mesures::peser(Path::new(&chemin))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Etat::default())
        .invoke_handler(tauri::generate_handler![
            ouvrir_pdf,
            lancer_ocr,
            servir_media,
            plages_servies,
            etat_travail,
            fixtures,
            peser_installation
        ])
        .run(tauri::generate_context!())
        .expect("démarrage de l'application impossible");
}
