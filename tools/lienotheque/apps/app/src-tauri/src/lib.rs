//! Prototype bureau Liénothèque (lot 0).
//!
//! But : mesurer ce que Tauri 2 permet réellement, pas livrer l'application.
//! Quatre capacités sont éprouvées — ouvrir un PDF de 500 pages, lancer un sidecar Tesseract,
//! reprendre un travail après un arrêt forcé (JOB-02), lire un MP3 par plages — plus la taille
//! d'installation moteurs compris. La décision reste à prendre (docs/decisions.md).

pub mod captures;
pub mod depot;
pub mod file;
pub mod journal;
pub mod limites;
pub mod media;
pub mod moteur;
pub mod mesures;
pub mod ocr;
pub mod pdf;
pub mod plateforme;
pub mod traitement;
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

/// Crée une bibliothèque dans un dossier, et y écrit sa description (CLA-01).
///
/// Refuse d'écraser une bibliothèque existante : perdre son schéma lui ferait perdre son
/// classement, donc le sens de tout ce qu'elle contient. L'assistant propose alors d'ouvrir
/// celle qui est là, ou d'en choisir un autre dossier.
///
/// La description arrive validée par son contrat, côté interface, là où ce contrat vit. L'hôte
/// n'a pas de contrat à lui opposer — il ne connaît aucun domaine — et garantit ce qu'il sait
/// garantir : qu'elle s'écrit entière ou pas du tout.
#[tauri::command]
fn creer_bibliotheque(racine: String, description: String) -> Result<String, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Dossier impossible à préparer : {e}"))?;
    if depot.deja_une_bibliotheque() {
        return Err("Une bibliothèque occupe déjà ce dossier. Ouvrez-la, ou choisissez-en un autre.".to_owned());
    }
    depot
        .ecrire_description(&description)
        .map(|chemin| chemin.to_string_lossy().into_owned())
        .map_err(|e| format!("Description impossible à écrire : {e}"))
}

/// Lit la description d'une bibliothèque, ou rien si le dossier n'en porte pas.
#[tauri::command]
fn lire_bibliotheque(racine: String) -> Result<Option<String>, String> {
    depot::Depot::ouvrir(&racine)
        .and_then(|d| d.lire_description())
        .map_err(|e| format!("Bibliothèque illisible : {e}"))
}

/// Remplace la description d'une bibliothèque — c'est par là que passe l'écran Organisation.
///
/// Remplace, et n'ajoute pas : le classement est un tout, et deux moitiés de schéma écrites à
/// deux moments ne décrivent rien. L'écriture reste entière ou nulle.
#[tauri::command]
fn ecrire_bibliotheque(racine: String, description: String) -> Result<(), String> {
    depot::Depot::ouvrir(&racine)
        .and_then(|d| d.ecrire_description(&description).map(|_| ()))
        .map_err(|e| format!("Description impossible à écrire : {e}"))
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
    lancer(false);
}

/// L'application, posée tour à tour sur chaque écran pour qu'on la photographie (captures.rs).
///
/// Même assemblage, mêmes commandes : on montre l'application, pas une maquette d'elle.
pub fn run_captures() {
    lancer(true);
}

fn lancer(captures: bool) {
    tauri::Builder::default()
        .setup(move |app| if captures { captures::brancher(app) } else { Ok(()) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Etat::default())
        .invoke_handler(tauri::generate_handler![
            creer_bibliotheque,
            lire_bibliotheque,
            ecrire_bibliotheque,
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
