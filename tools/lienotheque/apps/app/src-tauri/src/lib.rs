//! Prototype bureau Liénothèque (lot 0).
//!
//! But : mesurer ce que Tauri 2 permet réellement, pas livrer l'application.
//! Quatre capacités sont éprouvées — ouvrir un PDF de 500 pages, lancer un sidecar Tesseract,
//! reprendre un travail après un arrêt forcé (JOB-02), lire un MP3 par plages — plus la taille
//! d'installation moteurs compris. La décision reste à prendre (docs/decisions.md).

pub mod arrivee;
pub mod captures;
pub mod depot;
pub mod doublons;
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
pub mod trace;
pub mod traitement;
pub mod travail;
pub mod volume;

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
    trace::ecrire(&format!("hôte · creer_bibliotheque « {racine} » ({} octets de description)", description.len()));
    let rendu = (|| {
        let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Dossier impossible à préparer : {e}"))?;
        if depot.deja_une_bibliotheque() {
            return Err("Une bibliothèque occupe déjà ce dossier. Ouvrez-la, ou choisissez-en un autre.".to_owned());
        }
        depot
            .ecrire_description(&description)
            .map(|chemin| chemin.to_string_lossy().into_owned())
            .map_err(|e| format!("Description impossible à écrire : {e}"))
    })();
    match &rendu {
        Ok(chemin) => trace::ecrire(&format!("hôte · creer_bibliotheque → écrite à « {chemin} »")),
        Err(souci) => trace::ecrire(&format!("hôte · creer_bibliotheque REFUSE : {souci}")),
    }
    rendu
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

/// Ce que la page dit d'elle-même, porté au journal de l'hôte.
///
/// Un paquet n'a pas de console, et son défaut ne se voit nulle part ailleurs. Plutôt que de
/// faire chercher un inspecteur à quelqu'un, la page raconte ce qu'elle affiche et l'hôte l'écrit
/// là où on peut le lire.
#[tauri::command]
fn journal_page(texte: String) {
    // **Dans le paquet livré aussi**, et c'est un changement du 22 octobre 2026. Elle était
    // silencieuse hors mise au point, au motif qu'« une trace sert à chercher, pas à
    // accompagner » — mais le seul endroit où l'on ne peut pas chercher autrement est
    // précisément le paquet : pas de console, pas d'inspecteur, pas de terminal. Le traceur de
    // la page parlait donc à personne, exactement quand il fallait l'écouter.
    //
    // Le coût est borné par `trace.rs` : un fichier remis à zéro à chaque démarrage, plafonné.
    trace::ecrire(&format!("page · {texte}"));
    #[cfg(debug_assertions)]
    eprintln!("page : {texte}");
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
fn apercu_de_pages(racine: String, empreinte: String, nom: String, depuis: u32, combien: u32) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    // **Par l'empreinte, jamais par le nom.** Les sources sont rangées sous leur empreinte, en
    // paliers — `sources/ab/abcdef….pdf` — parce que deux documents peuvent porter le même nom
    // dans deux dossiers sans avoir rien à voir. Cet aperçu, lui, les cherchait sous
    // `sources/<nom du fichier>`, un chemin qui n'existe jamais : il répondait donc « n'est plus
    // dans la bibliothèque » pour **tous** les documents, de **toutes** les bibliothèques.
    //
    // Conséquence en chaîne, relevée le 21 octobre 2026 sur la première vraie bibliothèque :
    // l'éditeur ne montrant aucune page, aucune manière de lire ne pouvait s'apprendre, donc
    // aucun document ne pouvait être relié.
    let extension = std::path::Path::new(&nom)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let document = depot.source(&empreinte, &extension);
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
    // Pourquoi rien ne sort, quand rien ne sort. La cause la plus fréquente fait foi : une
    // tranche de dix pages dont neuf portent plusieurs images et une est tronquée se résume par
    // « plusieurs images », ce qui est ce qu'il faut dire. Sans ce mot, l'écran annonce « pas
    // encore préparées » à quelqu'un qui attendrait pour rien — ces pages ne le seront jamais
    // par ce chemin-là.
    let refusees = lu["refusees"].as_array().unwrap_or(&vides);
    let mut comptes: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for refus in refusees {
        if let Some(cause) = refus["cause"].as_str() {
            *comptes.entry(cause).or_default() += 1;
        }
    }
    let dominante = comptes.into_iter().max_by_key(|(_, n)| *n).map(|(cause, _)| cause.to_owned());

    Ok(match (rendues.is_empty(), dominante) {
        (true, Some(cause)) => serde_json::json!({ "pages": rendues, "refus": cause }),
        _ => serde_json::json!({ "pages": rendues }),
    })
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
fn essayer_maniere(
    racine: String,
    empreinte: String,
    nom: String,
    recette: String,
    depuis: u32,
    pages: u32,
) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    // Par l'empreinte, comme l'aperçu et comme la file : `sources/ab/abcdef….pdf`. Cette
    // commande-ci cherchait encore sous `sources/<nom du fichier>`, un chemin qui n'existe
    // jamais — l'essai refusait donc tous les documents, et le bandeau restait affiché pendant
    // que les pages, elles, s'affichaient très bien. Deux commandes, une seule faute, et elle
    // vivait deux fois.
    let extension = std::path::Path::new(&nom)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    let document = depot.source(&empreinte, &extension);
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
            "inventaireMedias": depot.medias().map_err(|e| format!("Inventaire des médias illisible : {e}"))?
                .into_iter()
                .filter(|media| media.contenu == "audio")
                .map(|media| serde_json::json!({
                    "nom": media.nom,
                    "empreinte": media.empreinte,
                }))
                .collect::<Vec<_>>(),
            "recette": brouillon,
            "description": description,
            "depuis": depuis,
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

/// Ce que les écrans lisent d'une bibliothèque : sa version active (JOB-06, B5).
///
/// Jusqu'ici les écrans ne savaient lire qu'un instantané de développement, servi par le serveur
/// de Vite. Sur le bureau il n'y en a pas : après un traitement, Vérifier et le Lecteur
/// n'avaient donc rien à montrer — alors que le dépôt, lui, avait tout.
///
/// Rien si ce document n'a aucune version active : ce n'est pas une panne, c'est un document
/// qui n'a pas encore été traité.
///
/// Le document est désigné par l'empreinte de sa source. Sans elle, on rendait « la » version
/// active de la bibliothèque — ce qui n'avait de sens que tant qu'elle n'en portait qu'une.
#[tauri::command]
fn vue_de_document(etat: State<'_, Etat>, racine: String, empreinte: String) -> Result<Option<serde_json::Value>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let Some(mut vue) = vue_active(&depot, &empreinte)? else { return Ok(None) };
    brancher_sources_media(&etat, &depot, &mut vue)?;
    Ok(Some(vue))
}

/// Ce que la commande ci-dessus rend, séparé d'elle pour qu'on puisse l'éprouver sur une vraie
/// bibliothèque sans ouvrir de fenêtre.
pub fn vue_active(depot: &depot::Depot, empreinte: &str) -> Result<Option<serde_json::Value>, String> {
    let Some(charge) = depot
        .charge_active(empreinte)
        .map_err(|e| format!("Version active illisible : {e}"))?
    else {
        return Ok(None);
    };
    let lu: serde_json::Value = serde_json::from_str(&charge).map_err(|e| format!("Version active illisible : {e}"))?;
    let mut vue = lu["vue"].clone();
    greffer_le_texte(&mut vue, &lu["passages"]);
    Ok(Some(vue))
}

fn empreintes_media_de(vue: &serde_json::Value) -> std::collections::BTreeSet<String> {
    vue["pages"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|page| page["elements"].as_array().into_iter().flatten())
        .filter_map(|element| element["media"]["empreinte"].as_str().map(str::to_owned))
        .collect()
}

fn type_audio(extension: &str) -> Option<&'static str> {
    Some(match extension {
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" | "opus" => "audio/ogg",
        "aac" => "audio/aac",
        _ => return None,
    })
}

/// Résout les empreintes de la vue au moment où elle est lue (ANC-05).
///
/// La version active reste portable : elle ne garde ni port, ni chemin de cette machine. Le
/// serveur local est unique pour la bibliothèque ouverte et ne reçoit que les fichiers de son
/// inventaire, jamais un chemin fourni par la page.
fn brancher_sources_media(etat: &State<'_, Etat>, depot: &depot::Depot, vue: &mut serde_json::Value) -> Result<(), String> {
    let demandees = empreintes_media_de(vue);
    if demandees.is_empty() {
        return Ok(());
    }

    let medias = depot.medias().map_err(|e| format!("Inventaire des médias illisible : {e}"))?;
    let fichiers = medias
        .into_iter()
        .filter_map(|media| {
            let mime = type_audio(&media.extension)?;
            let chemin = depot.source(&media.empreinte, &media.extension);
            chemin.is_file().then(|| (media.empreinte, (chemin, mime.to_owned())))
        })
        .collect::<std::collections::BTreeMap<_, _>>();
    let disponibles = fichiers.keys().cloned().collect::<std::collections::BTreeSet<_>>();
    if demandees.is_disjoint(&disponibles) {
        return Ok(());
    }

    let mut garde = etat.serveur.lock().map_err(|e| e.to_string())?;
    let reutilisable = garde
        .as_ref()
        .is_some_and(|serveur| serveur.bibliotheque.as_deref() == Some(depot.racine()) && demandees.is_subset(&serveur.empreintes));
    if !reutilisable {
        *garde = Some(media::servir_bibliotheque(depot.racine().to_path_buf(), fichiers)?);
    }
    let base = garde.as_ref().expect("serveur posé").infos.url.clone();
    let greffees = greffer_sources_media(vue, &base, &disponibles);
    trace::ecrire(&format!(
        "hôte · médias du document · {} demandés · {} disponibles · {} adresses résolues",
        demandees.len(),
        disponibles.len(),
        greffees
    ));
    Ok(())
}

fn greffer_sources_media(
    vue: &mut serde_json::Value,
    base: &str,
    disponibles: &std::collections::BTreeSet<String>,
) -> usize {
    let Some(pages) = vue["pages"].as_array_mut() else { return 0 };
    let mut greffees = 0;
    for page in pages {
        let Some(elements) = page["elements"].as_array_mut() else { continue };
        for element in elements {
            let Some(media) = element.get_mut("media") else { continue };
            let Some(empreinte) = media["empreinte"].as_str() else { continue };
            if disponibles.contains(empreinte) {
                media["source"] = serde_json::Value::String(format!("{base}/{empreinte}"));
                greffees += 1;
            }
        }
    }
    greffees
}

/// Pose sur chaque page le texte qui en a été tiré.
///
/// ## Le trou que cela comble, mesuré le 22 octobre 2026
///
/// `construireVue` écrit `texte: []` en dur : la vue n'a jamais reçu les passages. Sur la
/// bibliothèque réimportée, **aucune des 11 202 pages ne portait son texte** — zéro sur
/// cent trente-huit documents — alors que les mêmes versions contiennent 32 052 passages. Le
/// panneau « Texte de la page » du Lecteur était donc vide sur tout le corpus.
///
/// ## Pourquoi à la lecture, et non à la construction
///
/// Les deux, en vérité : la chaîne doit apprendre à le faire pour ce qu'elle produira ensuite.
/// Mais réparer la chaîne seule laisserait les 243 documents déjà traités sans texte jusqu'à un
/// réimport de cinq heures. La greffe vaut tout de suite, et elle ne coûte rien : les passages
/// sont déjà dans la main de celui qui lit la version.
///
/// Le rang de page fait foi des deux côtés — `Passage.page` et `PageAffichee.index` comptent à
/// partir de un —, et c'est la seule clé qui existe entre eux.
fn greffer_le_texte(vue: &mut serde_json::Value, passages: &serde_json::Value) {
    let Some(passages) = passages.as_array() else { return };
    if passages.is_empty() {
        return;
    }
    let mut par_page: std::collections::HashMap<u64, Vec<String>> = std::collections::HashMap::new();
    for passage in passages {
        let (Some(page), Some(texte)) = (passage["page"].as_u64(), passage["texte"].as_str()) else { continue };
        // Le texte d'un passage est d'un bloc, sauts de ligne compris : c'est la page qui les a
        // posés, et les recoller rendrait illisible ce que la mise en page séparait.
        par_page
            .entry(page)
            .or_default()
            .extend(texte.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_owned));
    }

    let Some(pages) = vue["pages"].as_array_mut() else { return };
    for page in pages.iter_mut() {
        // On ne touche pas une page qui porte déjà son texte : le jour où la chaîne le posera,
        // cette greffe se retirera d'elle-même, sans rien écraser entre-temps.
        if page["texte"].as_array().is_some_and(|t| !t.is_empty()) {
            continue;
        }
        let Some(index) = page["index"].as_u64() else { continue };
        if let Some(lignes) = par_page.get(&index) {
            page["texte"] = serde_json::json!(lignes);
        }
    }
}

/// Le texte d'un document, tel que la chaîne l'a rangé dans sa version active (RCH-07).
///
/// Servi à part de la vue, et non dedans. `PageAffichee.texte` existe au contrat et rien ne le
/// remplit : la recherche de l'écran ne trouvait donc rien, alors que la même requête aboutissait
/// en ligne de commande. Recopier les passages dans la vue aurait donné deux endroits pour un
/// même fait — on les sert d'où ils sont.
///
/// Rien si ce document n'a aucune version active, pour la même raison que la vue : ce n'est pas
/// une panne, c'est un document qui n'a pas encore été traité.
#[tauri::command]
fn passages_de_document(racine: String, empreinte: String) -> Result<Option<serde_json::Value>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let Some(charge) = depot
        .charge_active(&empreinte)
        .map_err(|e| format!("Version active illisible : {e}"))?
    else {
        return Ok(None);
    };
    let lu: serde_json::Value = serde_json::from_str(&charge).map_err(|e| format!("Version active illisible : {e}"))?;
    Ok(Some(lu["passages"].clone()))
}

/// Range un document sur les axes de sa bibliothèque (CLA-01, CLA-03).
///
/// Le classement arrive **déjà vérifié** contre le schéma : c'est le noyau qui sait lire un
/// schéma, et l'hôte n'a pas à le réapprendre dans un second langage. Il porte son origine —
/// import ou geste de la personne — et jamais une déduction depuis le texte.
#[tauri::command]
fn classer_document(racine: String, empreinte: String, classement: serde_json::Value) -> Result<(), String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    depot
        .classer(&empreinte, &classement)
        .map_err(|e| format!("Classement non enregistré : {e}"))
}

#[tauri::command]
fn lire_decisions(racine: String, empreinte: String) -> Result<std::collections::BTreeMap<String, String>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    depot.decisions(&empreinte).map_err(|e| format!("Décisions illisibles : {e}"))
}

#[tauri::command]
fn enregistrer_decision(
    racine: String,
    empreinte: String,
    cas: String,
    decision: String,
) -> Result<(), String> {
    if !matches!(decision.as_str(), "confirme" | "corrige" | "ignore" | "vu") {
        return Err("Décision inconnue".to_owned());
    }
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    depot.decider(&empreinte, &cas, &decision).map_err(|e| format!("Décision non enregistrée : {e}"))
}

#[tauri::command]
fn annuler_decision(racine: String, empreinte: String, cas: String) -> Result<(), String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    depot.annuler_decision(&empreinte, &cas).map_err(|e| format!("Décision non annulée : {e}"))
}

/// Les classements de toute la bibliothèque, en une lecture.
///
/// En une lecture parce que les filtres comptent dessus : demander document par document
/// vaudrait deux cent cinquante allers-retours pour afficher une liste.
#[tauri::command]
fn classements_de_bibliotheque(racine: String) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let table = depot.classements().map_err(|e| format!("Classements illisibles : {e}"))?;
    serde_json::to_value(table).map_err(|e| format!("Classements illisibles : {e}"))
}

/// Ce que le Catalogue lit : **une projection légère** de tous les documents (B5).
///
/// Une projection, jamais une concaténation. Mesuré : 1,10 Mo par version — à deux cent
/// cinquante documents, les assembler voudrait dire lire deux cent soixante-quinze mégaoctets
/// pour afficher une liste de titres. On ne rend donc que ce qu'un catalogue montre : le
/// document, sa version active, ses compteurs, et ce qui reste à vérifier.
///
/// Aucune logique d'activation n'est reprise ici : cette commande **consulte** ce que
/// l'activation a écrit. C'est la différence entre lire un index et le tenir.
#[tauri::command]
fn apercu_de_bibliotheque(racine: String) -> Result<Vec<serde_json::Value>, String> {
    apercus_de(&racine)
}

/// Ce que la commande ci-dessus fait, séparé d'elle pour qu'on puisse le mesurer.
///
/// Une commande Tauri ne s'appelle que depuis une page ; sa logique, elle, doit pouvoir
/// s'éprouver sur une vraie bibliothèque sans ouvrir de fenêtre. C'est ce que demande LIV-07 :
/// ma vérification accélère le travail, elle ne remplace pas le dernier geste — encore faut-il
/// qu'elle soit possible.
/// Le titre d'un document vit dans son travail, et nulle part ailleurs.
///
/// **Une version n'en porte aucun.** Son champ `vue` est une `VueBibliotheque` : son `nom` est
/// celui de la **bibliothèque**, pas du document. Le lire comme un titre était une erreur de
/// catégorie, et elle se voyait : sur la bibliothèque réimportée, les 243 documents
/// s'appelaient tous « Base de connaissance ». Pire, ce nom servait ensuite à dériver une
/// extension de fichier — un nom sans extension donne « .bin », donc un chemin qui n'existe
/// jamais, donc « ce fichier n'est plus dans la bibliothèque » sur un document bien présent.
///
/// Le travail, lui, garde le nom du fichier déposé. On le relit une fois — 249 travaux font
/// 137 Ko — et on joint par l'empreinte, qui est la seule clé commune (ID-01).
pub fn titres_de(depot: &depot::Depot) -> std::collections::HashMap<String, String> {
    let mut titres: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Ok(travaux) = file::charger_tout(&depot.travaux(), &mut |_| {}) {
        for travail in travaux {
            let (Some(empreinte), Some(sujet)) = (travail.empreinte, travail.sujet) else { continue };
            // Un même contenu peut avoir plusieurs travaux — une reprise, un redépôt. Ils
            // portent le même nom de fichier : le premier venu suffit.
            titres.entry(empreinte).or_insert(sujet.nom);
        }
    }
    titres
}

/// Le nom d'un document, ou de quoi le distinguer des autres à défaut.
///
/// Sans travail retrouvé, on ne devine pas : l'empreinte abrégée distingue au moins les documents
/// les uns des autres, ce que le nom de la bibliothèque ne faisait pas.
pub fn titre_ou_empreinte(titres: &std::collections::HashMap<String, String>, empreinte: &str) -> String {
    titres
        .get(empreinte)
        .cloned()
        .unwrap_or_else(|| format!("Document {}", &empreinte[..empreinte.len().min(8)]))
}

pub fn apercus_de(racine: &str) -> Result<Vec<serde_json::Value>, String> {
    let depot = depot::Depot::ouvrir(racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let actives = depot.actives().map_err(|e| format!("Versions actives illisibles : {e}"))?;
    let titres = titres_de(&depot);

    let mut apercus = Vec::with_capacity(actives.len());
    for (empreinte, pointeur) in actives {
        // Une version absente ne fait pas échouer l'aperçu des autres : on la saute, et le
        // document paraîtra simplement sans compteurs. Refuser tout le catalogue parce qu'un
        // fichier manque serait perdre deux cent quarante-neuf documents pour un.
        let Some(charge) = depot.lire_version(&pointeur.version).map_err(|e| format!("Version illisible : {e}"))? else {
            continue;
        };
        let Ok(lu) = serde_json::from_str::<serde_json::Value>(&charge) else { continue };
        let titre = titre_ou_empreinte(&titres, &empreinte);
        // Un livre lu ne doit pas paraître vide.
        //
        // Les compteurs d'une version sont justes — « 130 pages » pour un document de 130 pages —
        // mais un document **composé en texte** n'a aucune page affichable, et ses trois
        // compteurs tombent donc à zéro. Sur la bibliothèque réimportée, 105 documents sur 243
        // s'annonçaient ainsi vides alors qu'ils portent de 38 à 1 275 passages chacun.
        //
        // On ajoute donc ce qu'on sait : le nombre de passages réellement lus. Il accompagne les
        // pages plutôt que de les remplacer, car l'en-tête de la bibliothèque additionne ces
        // projections. Le jour où la chaîne comptera elle-même les passages sous le même mot,
        // cette garde empêchera le doublon et ces lignes pourront partir.
        let mut compteurs = lu["vue"]["compteurs"].clone();
        let passages = lu["passages"].as_array().map(Vec::len).unwrap_or(0);
        if passages > 0 {
            if !compteurs.is_array() {
                compteurs = serde_json::json!([]);
            }
            let liste = compteurs.as_array_mut().expect("tableau posé ci-dessus");
            if !liste.iter().any(|c| c["mot"].as_str() == Some("passages lus")) {
                liste.push(serde_json::json!({ "nombre": passages, "mot": "passages lus" }));
            }
        }

        apercus.push(serde_json::json!({
            "empreinte": empreinte,
            "version": pointeur.version,
            "activeeLe": pointeur.activee_le,
            "nom": titre,
            "compteurs": compteurs,
            "aVerifier": lu["vue"]["aVerifier"].clone(),
        }));
    }
    Ok(apercus)
}

/// L'image d'une page, à la demande.
///
/// Une par une, et non toutes d'un coup : un livre de trois cents pages pèse des centaines de
/// mégaoctets, et le Lecteur n'en montre qu'une à la fois. Elle revient dans la réponse plutôt
/// que par un chemin que la page irait lire — la page web ne touche pas au disque.
/// Les groupes de documents qui disent la même chose, dans cette bibliothèque (HER-08).
///
/// Elle **trouve et décrit, et ne supprime rien** : aucune mesure de texte ne distingue un vrai
/// doublon d'un même ouvrage en deux formats, et garder l'un et l'autre est un choix légitime.
/// Voir le module `doublons` pour les mesures qui l'établissent. Le retrait, lui, se demande
/// document par document, par `retirer_document`.
#[tauri::command]
fn doublons_de_bibliotheque(racine: String) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let titres = titres_de(&depot);
    let trouvaille = doublons::chercher(&depot, &|empreinte: &str| titre_ou_empreinte(&titres, empreinte))
        .map_err(|e| format!("Recherche de doublons impossible : {e}"))?;
    serde_json::to_value(trouvaille).map_err(|e| format!("Résultat illisible : {e}"))
}

/// Retire un document de la bibliothèque, et dit ce que le retrait a emporté (HER-07).
///
/// La source part à la corbeille du système : se tromper de document ne doit pas coûter un livre.
/// Le reste — versions, dérivés, travaux, classement — s'efface, puisqu'il se reconstruit depuis
/// cette source.
#[tauri::command]
fn retirer_document(racine: String, empreinte: String) -> Result<serde_json::Value, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let retrait = depot
        .retirer_document(&empreinte)
        .map_err(|e| format!("Retrait impossible : {e}"))?;
    serde_json::to_value(retrait).map_err(|e| format!("Compte rendu illisible : {e}"))
}

#[tauri::command]
fn image_de_page(racine: String, version: String, fichier: String) -> Result<Option<String>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    // Un nom de fichier, rien d'autre : jamais un chemin qui remonte hors du dossier.
    let nom = std::path::Path::new(&fichier)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nom d’image invalide.")?;
    if !nom.ends_with(".webp") {
        return Err("Seules les images de page se servent ainsi.".to_owned());
    }
    let chemin = depot.racine().join(depot::DERIVES).join(&version).join("pages").join(nom);
    match std::fs::read(&chemin) {
        Ok(octets) => Ok(Some(format!("data:image/webp;base64,{}", BASE64.encode(&octets)))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Image de page illisible : {e}")),
    }
}

fn nom_image_page(fichier: &str) -> Result<&str, String> {
    let nom = std::path::Path::new(fichier)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nom d’image invalide.")?;
    if nom != fichier || !nom.ends_with(".webp") {
        return Err("Seule une image de page peut être relue.".to_owned());
    }
    Ok(nom)
}

fn langue_tesseract(langue: &str) -> &'static str {
    if langue.to_ascii_lowercase().starts_with("en") { "eng" } else { "fra" }
}

fn relire_page(
    moteurs: &Moteurs,
    racine: &str,
    version: &str,
    fichier: &str,
    langue: &str,
) -> Result<Option<String>, String> {
    let depot = depot::Depot::ouvrir(racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let nom = nom_image_page(fichier)?;
    let chemin = depot.racine().join(depot::DERIVES).join(version).join("pages").join(nom);
    if !chemin.exists() {
        return Ok(None);
    }
    let mesure = ocr::reconnaitre(&moteurs.binaire, &moteurs.tessdata, &chemin, langue_tesseract(langue))?;
    Ok((!mesure.texte.is_empty()).then_some(mesure.texte))
}

/// Relit le texte de la seule page ouverte dans le Lecteur.
///
/// La version conservée n'est jamais modifiée : le panneau et la recherche de la session gagnent
/// une lecture propre, tandis que la preuve d'ingestion reste intacte et réparable par un nouveau
/// traitement explicite.
#[tauri::command]
fn relire_texte_page(
    application: tauri::AppHandle,
    racine: String,
    version: String,
    fichier: String,
    langue: String,
) -> Result<Option<String>, String> {
    let ressources = application
        .path()
        .resolve("moteurs", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    relire_page(&Moteurs::installes(&ressources), &racine, &version, &fichier, &langue)
}

/// La version active d'un document, pour savoir où prendre ses images.
#[tauri::command]
fn version_active(racine: String, empreinte: String) -> Result<Option<String>, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    depot
        .version_active(&empreinte)
        .map(|pointeur| pointeur.map(|p| p.version))
        .map_err(|e| format!("Version active illisible : {e}"))
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

/// Met une bibliothèque à la corbeille, et l'oublie.
///
/// **Deux gestes, et le second ne se fait que si le premier a réussi** : une bibliothèque oubliée
/// dont le dossier serait resté réapparaîtrait à la prochaine ouverture, et une bibliothèque jetée
/// dont le chemin serait resté retenu afficherait une entrée vers rien.
///
/// Le dossier part à la corbeille, jamais en effacement direct : se tromper de bouton ne doit pas
/// coûter une collection. Et le dépôt refuse de jeter un dossier qui ne porte pas de bibliothèque.
#[tauri::command]
fn supprimer_bibliotheque(app: tauri::AppHandle, racine: String) -> Result<String, String> {
    let depot = depot::Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque introuvable : {e}"))?;
    let jetee = depot
        .a_la_corbeille()
        .map_err(|e| format!("Impossible de mettre cette bibliothèque à la corbeille : {e}"))?;

    let dossier = dossier_des_reglages(&app)?;
    let mut lus = reglages::Reglages::lire(&dossier);
    lus.oublier(&racine);
    lus.ecrire(&dossier).map_err(|e| format!("Réglages impossibles à écrire : {e}"))?;

    Ok(jetee.to_string_lossy().into_owned())
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
        .setup(move |app| {
            // La trace d'abord, et avant tout le reste : ce qu'on cherche peut arriver au
            // démarrage, et une trace ouverte après coup ne dit rien de ce qui l'a précédée.
            // Le dossier vient de l'hôte — « ~/Library/Logs/<identifiant> » sur macOS — pour que
            // la trace soit au même endroit qu'un autre journal d'application, et non dans un
            // coin inventé par nous.
            match app.path().app_log_dir() {
                Ok(dossier) => {
                    trace::ouvrir(&dossier);
                    trace::ecrire(&format!("hôte · démarrage · trace dans « {} »", dossier.display()));
                }
                // Sans dossier de journaux, on ne trace pas, et l'application démarre quand même.
                Err(souci) => eprintln!("trace impossible à ouvrir : {souci}"),
            }
            if captures {
                captures::brancher(app)
            } else {
                Ok(())
            }
        })
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
            supprimer_bibliotheque,
            deposer,
            apercu_de_pages,
            essayer_maniere,
            enregistrer_maniere,
            lire_maniere,
            vue_de_document,
            passages_de_document,
            journal_page,
            classer_document,
            classements_de_bibliotheque,
            lire_decisions,
            enregistrer_decision,
            annuler_decision,
            apercu_de_bibliotheque,
            image_de_page,
            relire_texte_page,
            doublons_de_bibliotheque,
            retirer_document,
            version_active,
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

#[cfg(test)]
mod greffe {
    use super::{greffer_le_texte, greffer_sources_media};
    use std::collections::BTreeSet;

    /// Une vue de deux pages, telle que `construireVue` la rend : `texte` vide en dur.
    fn vue_de_deux_pages() -> serde_json::Value {
        serde_json::json!({ "pages": [
            { "index": 1, "texte": [], "elements": [] },
            { "index": 2, "texte": [], "elements": [] },
        ]})
    }

    #[test]
    fn le_texte_d_un_passage_se_pose_sur_sa_page() {
        let mut vue = vue_de_deux_pages();
        let passages = serde_json::json!([
            { "page": 1, "texte": "Première ligne.\nSeconde ligne." },
            { "page": 2, "texte": "Page deux." },
        ]);
        greffer_le_texte(&mut vue, &passages);
        assert_eq!(vue["pages"][0]["texte"], serde_json::json!(["Première ligne.", "Seconde ligne."]));
        assert_eq!(vue["pages"][1]["texte"], serde_json::json!(["Page deux."]));
    }

    #[test]
    fn une_page_sans_passage_reste_sans_texte() {
        let mut vue = vue_de_deux_pages();
        greffer_le_texte(&mut vue, &serde_json::json!([{ "page": 1, "texte": "Seule." }]));
        assert_eq!(vue["pages"][1]["texte"], serde_json::json!([]));
    }

    #[test]
    fn un_texte_deja_pose_ne_se_remplace_pas() {
        // Le jour où la chaîne posera le texte elle-même, la greffe doit s'effacer devant lui.
        let mut vue = serde_json::json!({ "pages": [{ "index": 1, "texte": ["Déjà là."] }] });
        greffer_le_texte(&mut vue, &serde_json::json!([{ "page": 1, "texte": "Autre chose." }]));
        assert_eq!(vue["pages"][0]["texte"], serde_json::json!(["Déjà là."]));
    }

    #[test]
    fn sans_passage_la_vue_ne_bouge_pas() {
        let mut vue = vue_de_deux_pages();
        let avant = vue.clone();
        greffer_le_texte(&mut vue, &serde_json::json!([]));
        assert_eq!(vue, avant);
    }

    #[test]
    fn les_lignes_vides_ne_se_montrent_pas() {
        let mut vue = vue_de_deux_pages();
        greffer_le_texte(&mut vue, &serde_json::json!([{ "page": 1, "texte": "Un.\n\n   \nDeux." }]));
        assert_eq!(vue["pages"][0]["texte"], serde_json::json!(["Un.", "Deux."]));
    }

    #[test]
    fn une_empreinte_disponible_recoit_une_adresse_locale_anc_05() {
        let empreinte = "a".repeat(64);
        let mut vue = serde_json::json!({ "pages": [{ "elements": [{
            "media": { "empreinte": empreinte, "nom": "01.mp3", "piste": 1, "position": { "segment": "inconnu" } }
        }] }] });
        let greffees =
            greffer_sources_media(&mut vue, "http://127.0.0.1:4321/media/jeton", &BTreeSet::from([empreinte.clone()]));
        assert_eq!(greffees, 1);
        assert_eq!(
            vue["pages"][0]["elements"][0]["media"]["source"],
            format!("http://127.0.0.1:4321/media/jeton/{empreinte}")
        );
    }

    #[test]
    fn une_empreinte_absente_reste_indisponible_anc_05() {
        let mut vue = serde_json::json!({ "pages": [{ "elements": [{
            "media": { "empreinte": "b".repeat(64), "nom": "02.mp3", "piste": 2, "position": { "segment": "inconnu" } }
        }] }] });
        let greffees = greffer_sources_media(&mut vue, "http://127.0.0.1:4321/media/jeton", &BTreeSet::new());
        assert_eq!(greffees, 0);
        assert!(vue["pages"][0]["elements"][0]["media"].get("source").is_none());
    }
}

#[cfg(test)]
mod relecture_ocr {
    use super::{relire_page, Moteurs};
    use std::{fs, path::Path};

    #[test]
    fn une_image_de_page_est_relue_par_le_moteur_embarque() {
        let racine = std::env::temp_dir().join(format!("lienotheque-relecture-{}", std::process::id()));
        fs::remove_dir_all(&racine).ok();
        let pages = racine.join("derives").join("version-test").join("pages");
        fs::create_dir_all(&pages).expect("pages");
        fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/fichiers/page-ocr.png"),
            pages.join("page-0000.webp"),
        )
        .expect("fixture");
        let moteurs = Moteurs::depuis(&Path::new(env!("CARGO_MANIFEST_DIR")).join("moteurs"));

        let texte = relire_page(
            &moteurs,
            racine.to_str().expect("racine utf8"),
            "version-test",
            "page-0000.webp",
            "fr",
        )
        .expect("relecture")
        .expect("texte");

        assert!(texte.contains("Liénothèque reconnaît cette page"), "{texte}");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_chemin_traverse_ne_sort_pas_des_pages() {
        let moteurs = Moteurs::depuis(&Path::new(env!("CARGO_MANIFEST_DIR")).join("moteurs"));
        let refus = relire_page(&moteurs, "/tmp", "version-test", "../secret.webp", "fr").expect_err("refus");
        assert!(refus.contains("image de page"), "{refus}");
    }
}
