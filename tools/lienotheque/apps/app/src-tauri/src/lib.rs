//! Prototype bureau Liénothèque (lot 0).
//!
//! But : mesurer ce que Tauri 2 permet réellement, pas livrer l'application.
//! Quatre capacités sont éprouvées — ouvrir un PDF de 500 pages, lancer un sidecar Tesseract,
//! reprendre un travail après un arrêt forcé (JOB-02), lire un MP3 par plages — plus la taille
//! d'installation moteurs compris. La décision reste à prendre (docs/decisions.md).

pub mod arrivee;
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
pub mod reglages;
pub mod roulement;
pub mod traitement;
pub mod travail;

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
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
    /// Un roulement par bibliothèque ouverte : c'est lui qui fait tourner sa file. Il ne tient à
    /// aucune fenêtre — la fenêtre peut se fermer, le traitement continue (JOB-09).
    pub roulements: Mutex<std::collections::HashMap<String, std::sync::Arc<roulement::Roulement>>>,
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

/// Met la file d'une bibliothèque en route, et la laisse tourner.
///
/// Appelée dès qu'une bibliothèque est ouverte ou créée. Deux appels pour la même ne font qu'un
/// roulement : la file se mènerait deux fois, et deux moteurs liraient le même document.
#[tauri::command]
fn faire_tourner(app: tauri::AppHandle, etat: State<Etat>, racine: String) -> Result<bool, String> {
    let mut roulements = etat.roulements.lock().map_err(|_| "État inaccessible")?;
    if roulements.contains_key(&racine) {
        return Ok(false);
    }

    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let executable = std::env::current_exe().map_err(|e| format!("Exécutable introuvable : {e}"))?;
    let emplacements = traitement::Emplacements::depuis_executable(&executable)
        .ok_or("Moteur introuvable à côté de l’application : le paquet est incomplet.")?;
    let appareil = reglages::Reglages::lire(&dossier_des_reglages(&app)?).appareil;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Cache de travail introuvable : {e}"))?
        .join("lectures");

    roulements.insert(racine, roulement::Roulement::demarrer(depot, emplacements, appareil, cache));
    Ok(true)
}

/// Arrête proprement tous les roulements. Ce qui a été lu reste lu, et la reprise repart de là.
pub fn arreter_les_roulements(etat: &Etat) {
    if let Ok(roulements) = etat.roulements.lock() {
        for roulement in roulements.values() {
            roulement.arreter();
        }
    }
}

/// Dépose des fichiers dans une bibliothèque et met un travail en file par fichier (JOB-01).
///
/// Les originaux sont copiés, jamais déplacés ni modifiés. Un fichier déjà déposé retrouve son
/// travail au lieu d'en créer un second (JOB-04), et un fichier qu'on ne sait pas lire est
/// refusé avec sa raison — sans empêcher les autres d'entrer.
#[tauri::command]
fn deposer(racine: String, chemins: Vec<String>) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let origines: Vec<PathBuf> = chemins.iter().map(PathBuf::from).collect();
    let mut avertissements: Vec<String> = Vec::new();
    let arrivee = arrivee::deposer(&depot, &depot.travaux(), &origines, &mut |texte| avertissements.push(texte))
        .map_err(|e| format!("Dépôt impossible : {e}"))?;
    Ok(serde_json::json!({
        "travaux": arrivee.travaux.iter().map(travail::Travail::vu).collect::<Vec<_>>(),
        "accompagnements": arrivee.accompagnements.iter().map(|(nom, contenu)| serde_json::json!({ "nom": nom, "contenu": contenu })).collect::<Vec<_>>(),
        "refuses": arrivee.refuses.iter().map(|(nom, raison)| serde_json::json!({ "nom": nom, "raison": raison })).collect::<Vec<_>>(),
        "avertissements": avertissements,
    }))
}

/// La file d'une bibliothèque, telle que l'écran de traitement la montre.
#[tauri::command]
fn travaux(racine: String) -> Result<Vec<serde_json::Value>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let mut avertissements: Vec<String> = Vec::new();
    let tous = file::charger_tout(&depot.travaux(), &mut |texte| avertissements.push(texte))
        .map_err(|e| format!("File illisible : {e}"))?;
    Ok(tous.iter().map(travail::Travail::vu).collect())
}

/// Met un travail en pause, le reprend, ou l'annule (JOB-08).
///
/// Une seule porte pour les trois : les transitions vivent dans `file::appliquer`, éprouvées
/// contre la table partagée. Une commande qui les réécrirait les ferait diverger.
#[tauri::command]
fn agir_sur_travail(racine: String, id: String, action: String) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let chemin = depot.travaux().join(format!("{id}.json"));
    let vise = travail::charger(&chemin)
        .map_err(|e| format!("Travail illisible : {e}"))?
        .ok_or("Ce travail n’existe plus.")?;
    let apres = file::appliquer(&vise, &action, travail::maintenant())
        .ok_or_else(|| format!("Action inconnue : {action}"))?;
    travail::enregistrer(&chemin, &apres).map_err(|e| format!("Travail impossible à écrire : {e}"))?;
    Ok(apres.vu())
}

/// Les emplacements du moteur embarqué, pour les commandes qui l'interrogent directement.
fn moteur_embarque() -> Result<traitement::Emplacements, String> {
    let executable = std::env::current_exe().map_err(|e| format!("Exécutable introuvable : {e}"))?;
    traitement::Emplacements::depuis_executable(&executable)
        .ok_or_else(|| "Moteur introuvable à côté de l’application : le paquet est incomplet.".to_owned())
}

/// Exporte quelques pages d'un document déposé, pour les montrer dans l'éditeur.
///
/// On ne peut pas montrer où regarder sur une page qu'on ne voit pas : c'est la première chose
/// dont l'éditeur de manière de lire a besoin, et elle vient avant toute recette.
#[tauri::command]
fn apercu_de_pages(racine: String, nom: String, depuis: u32, combien: u32) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let document = depot.racine().join(depot::SOURCES).join(&nom);
    if !document.exists() {
        return Err(format!("Le fichier « {nom} » n’est plus dans la bibliothèque."));
    }
    let images = depot.racine().join(depot::DERIVES).join("apercu");

    let demande = serde_json::json!({
        "type": "demande",
        "protocole": limites::LIMITES.protocole,
        "travailId": uuid::Uuid::new_v4().to_string(),
        "outil": { "nom": "apercu-de-pages", "version": "1.0.0" },
        "versionCible": uuid::Uuid::new_v4().to_string(),
        "charge": { "document": document, "images": images, "depuis": depuis, "combien": combien },
    });

    let rendu = traitement::demander(&moteur_embarque()?, &demande)?;
    let lu: serde_json::Value = serde_json::from_str(&rendu).map_err(|e| format!("Aperçu illisible : {e}"))?;

    // Les images reviennent dans la réponse, et non par un chemin que la page irait lire : ouvrir
    // l'accès au disque depuis la page pour montrer huit vignettes serait payer très cher une
    // commodité. Huit pages pèsent moins d'un mégaoctet.
    let vides = Vec::new();
    let pages = lu["pages"].as_array().unwrap_or(&vides);
    let mut rendues = Vec::with_capacity(pages.len());
    for page in pages {
        let Some(fichier) = page["fichier"].as_str() else { continue };
        let octets = std::fs::read(images.join(fichier))
            .map_err(|e| format!("Image de page illisible : {e}"))?;
        rendues.push(serde_json::json!({
            "rang": page["rang"],
            "largeur": page["largeur"],
            "hauteur": page["hauteur"],
            "image": format!("data:image/webp;base64,{}", BASE64.encode(&octets)),
        }));
    }
    Ok(serde_json::json!({ "pages": rendues }))
}

/// Essaie une manière de lire sur quelques pages, sans rien enregistrer (REC-07).
///
/// Le brouillon est écrit à côté de la bibliothèque, dans un fichier qui porte ce nom : on
/// l'essaie, on le corrige, on l'essaie encore. Il ne devient la manière de lire de la
/// bibliothèque qu'au moment où on l'enregistre, et c'est un autre geste.
///
/// Rien n'est activé : l'essai rend ce qui a été lu, et l'écran le montre. Une version du dépôt
/// ne s'écrit que pour un vrai traitement (JOB-06).
#[tauri::command]
fn essayer_maniere(racine: String, nom: String, recette: String, pages: u32) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let document = depot.racine().join(depot::SOURCES).join(&nom);
    if !document.exists() {
        return Err(format!("Le fichier « {nom} » n’est plus dans la bibliothèque."));
    }
    let base = depot.racine().join("base");
    let description = base.join("bibliotheque.json");
    if !description.exists() {
        return Err("Cette bibliothèque n’a pas de description.".to_owned());
    }

    // Le brouillon s'écrit avant d'être essayé : le moteur lit des fichiers, pas des messages.
    let brouillon = base.join("brouillon-recette.json");
    std::fs::create_dir_all(&base).map_err(|e| format!("Dossier impossible à préparer : {e}"))?;
    std::fs::write(&brouillon, recette).map_err(|e| format!("Brouillon impossible à écrire : {e}"))?;

    let demande = serde_json::json!({
        "type": "demande",
        "protocole": limites::LIMITES.protocole,
        "travailId": uuid::Uuid::new_v4().to_string(),
        "outil": { "nom": "traitement-de-lot", "version": "1.0.0" },
        "versionCible": uuid::Uuid::new_v4().to_string(),
        "charge": {
            "document": document,
            "medias": depot.racine().join(depot::SOURCES),
            "recette": brouillon,
            "description": description,
            "pages": pages,
        },
    });

    let rendu = traitement::demander(&moteur_embarque()?, &demande)?;
    serde_json::from_str(&rendu).map_err(|e| format!("Résultat de l’essai illisible : {e}"))
}

/// Enregistre la manière de lire d'une bibliothèque. C'est elle que les traitements emploieront.
#[tauri::command]
fn enregistrer_maniere(racine: String, recette: String) -> Result<String, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let base = depot.racine().join("base");
    std::fs::create_dir_all(&base).map_err(|e| format!("Dossier impossible à préparer : {e}"))?;
    let chemin = base.join(roulement::RECETTE);
    std::fs::write(&chemin, recette).map_err(|e| format!("Manière de lire impossible à écrire : {e}"))?;
    Ok(chemin.to_string_lossy().into_owned())
}

/// La manière de lire d'une bibliothèque, ou rien si elle n'en a pas encore.
#[tauri::command]
fn lire_maniere(racine: String) -> Result<Option<String>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    match std::fs::read_to_string(depot.racine().join("base").join(roulement::RECETTE)) {
        Ok(texte) => Ok(Some(texte)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Manière de lire illisible : {e}")),
    }
}

/// Ce que l'hôte retient d'une session à l'autre : cet appareil, et les bibliothèques ouvertes.
///
/// L'application le demande au démarrage. Sans lui, il faudrait repointer l'application vers son
/// dossier à chaque lancement, et aucun bail ne saurait dire qui le tient (JOB-02).
#[tauri::command]
fn reglages(app: tauri::AppHandle) -> Result<reglages::Reglages, String> {
    let dossier = dossier_des_reglages(&app)?;
    let lus = reglages::Reglages::lire(&dossier);
    // L'identifiant d'appareil est fabriqué au premier lancement : on l'écrit tout de suite,
    // sinon il changerait à chaque démarrage et un bail ne désignerait plus rien.
    lus.ecrire(&dossier).map_err(|e| format!("Réglages impossibles à écrire : {e}"))?;
    Ok(lus)
}

/// Met une bibliothèque en tête des récentes. Appelé après l'avoir créée ou ouverte.
#[tauri::command]
fn retenir_bibliotheque(app: tauri::AppHandle, racine: String) -> Result<reglages::Reglages, String> {
    let dossier = dossier_des_reglages(&app)?;
    let mut lus = reglages::Reglages::lire(&dossier);
    lus.retenir(&racine);
    lus.ecrire(&dossier).map_err(|e| format!("Réglages impossibles à écrire : {e}"))?;
    Ok(lus)
}

/// Retire une bibliothèque de la liste des récentes. Le dossier n'est pas touché : oublier n'est
/// pas supprimer, et rien de ce qui est à l'utilisateur ne disparaît d'un clic dans une liste.
#[tauri::command]
fn oublier_bibliotheque(app: tauri::AppHandle, racine: String) -> Result<reglages::Reglages, String> {
    let dossier = dossier_des_reglages(&app)?;
    let mut lus = reglages::Reglages::lire(&dossier);
    lus.oublier(&racine);
    lus.ecrire(&dossier).map_err(|e| format!("Réglages impossibles à écrire : {e}"))?;
    Ok(lus)
}

fn dossier_des_reglages(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("Dossier de réglages introuvable : {e}"))
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
            reglages,
            retenir_bibliotheque,
            oublier_bibliotheque,
            deposer,
            apercu_de_pages,
            essayer_maniere,
            enregistrer_maniere,
            lire_maniere,
            faire_tourner,
            travaux,
            agir_sur_travail,
            ouvrir_pdf,
            lancer_ocr,
            servir_media,
            plages_servies,
            etat_travail,
            fixtures,
            peser_installation
        ])
        .build(tauri::generate_context!())
        .expect("démarrage de l'application impossible")
        .run(|app, evenement| {
            // Fermer la fenêtre n'interrompt pas un traitement ; quitter l'application, si — et
            // proprement : les moteurs s'arrêtent, les baux se lâchent, et ce qui a été lu se
            // reprend au prochain lancement (JOB-02, JOB-03).
            if matches!(evenement, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                arreter_les_roulements(&app.state::<Etat>());
            }
        });
}
