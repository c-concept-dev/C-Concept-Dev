//! Monte une bibliothèque qui contient un doublon, pour éprouver l'écran sur du vrai.
//!
//!     cargo run --example bibliotheque-de-doublons -- <racine> <document.pdf>...
//!
//! ## Pourquoi un banc et non la file
//!
//! La file demande une description, des manières de lire et toute la chaîne de traitement — et ce
//! qu'on veut éprouver ici est en aval de tout cela : un écran qui lit des versions déjà posées.
//! Ce banc pose donc ce que la file aurait posé, **par les mêmes fonctions du dépôt**
//! (`ecrire_version`, `activer`), avec de vraies sources sur le disque pour que les poids et les
//! empreintes soient vrais.
//!
//! ## D'où vient le texte, et pourquoi pas du PDF
//!
//! Le lecteur de texte d'un PDF vit dans la chaîne Node (`outils/formats`), pas dans l'hôte
//! Rust : ce banc ne peut donc pas tirer le texte des fichiers qu'il pose. Il relit celui que le
//! générateur a écrit à côté, dans `<document>.texte.json`. La bibliothèque montée est
//! **synthétique**, et elle ne prétend pas autre chose : ce qu'elle éprouve, c'est la recherche
//! de doublons et le retrait, pas la lecture des formats.

use lienotheque_bureau::{arrivee, depot::Depot};
use std::{fs, path::PathBuf, process::ExitCode, time::{SystemTime, UNIX_EPOCH}};

fn maintenant() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|ecoule| ecoule.as_millis() as u64).unwrap_or(0)
}

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    let Some(racine) = arguments.next() else {
        eprintln!("Attendu : <racine> <document.pdf>...");
        return ExitCode::from(2);
    };
    let documents: Vec<PathBuf> = arguments.map(PathBuf::from).collect();
    if documents.is_empty() {
        eprintln!("Aucun document à poser.");
        return ExitCode::from(2);
    }

    let racine = PathBuf::from(&racine);
    let depot = match Depot::ouvrir(&racine) {
        Ok(ouvert) => ouvert,
        Err(souci) => {
            eprintln!("Bibliothèque impossible à préparer : {souci}");
            return ExitCode::from(1);
        }
    };
    let description = serde_json::json!({
        "id": "essai-doublons",
        "nom": "Essai des doublons",
        "schema": {
            "mots": {
                "element": { "un": "document", "plusieurs": "documents" },
                "piste": { "un": "piste", "plusieurs": "pistes" },
                "page": { "un": "page", "plusieurs": "pages" }
            },
            "champs": [],
            "types": ["document"]
        }
    });
    if let Err(souci) = depot.ecrire_description(&description.to_string()) {
        eprintln!("Description impossible à écrire : {souci}");
        return ExitCode::from(1);
    }

    for (rang, chemin) in documents.iter().enumerate() {
        let Ok(octets) = fs::metadata(chemin).map(|mesure| mesure.len()) else {
            eprintln!("  {} introuvable", chemin.display());
            continue;
        };
        // L'empreinte du contenu, par la fonction de la chaîne : c'est elle qui range la source.
        let empreinte = match arrivee::empreinte_de(chemin) {
            Ok(calculee) => calculee,
            Err(souci) => {
                eprintln!("  {} illisible : {souci}", chemin.display());
                continue;
            }
        };
        let extension = chemin.extension().and_then(|bout| bout.to_str()).unwrap_or("pdf").to_lowercase();
        let palier = racine.join("sources").join(&empreinte[..2]);
        if let Err(souci) =
            fs::create_dir_all(&palier).and_then(|()| fs::copy(chemin, palier.join(format!("{empreinte}.{extension}"))).map(|_| ()))
        {
            eprintln!("  source impossible à poser : {souci}");
            continue;
        }

        let a_cote = chemin.with_extension("texte.json");
        let textes: Vec<String> = match fs::read_to_string(&a_cote).map(|lu| serde_json::from_str(&lu)) {
            Ok(Ok(lus)) => lus,
            _ => {
                eprintln!("  texte introuvable à côté : {}", a_cote.display());
                continue;
            }
        };

        let passages: Vec<serde_json::Value> = textes
            .iter()
            .enumerate()
            .map(|(page, texte)| serde_json::json!({ "rang": page + 1, "texte": texte }))
            .collect();
        let pages: Vec<serde_json::Value> = (1..=textes.len())
            .map(|page| serde_json::json!({ "rang": page, "fichier": format!("page-{page:04}.webp") }))
            .collect();

        let version = format!("v-{rang}");
        let charge = serde_json::json!({
            "vue": { "nom": "Essai des doublons", "pages": pages },
            "passages": passages,
        });
        if let Err(souci) = depot
            .ecrire_version(&version, &charge.to_string())
            .and_then(|_| depot.activer(&empreinte, &version, maintenant()))
        {
            eprintln!("  version impossible à poser : {souci}");
            continue;
        }

        // Le nom déposé vit dans le travail, et nulle part ailleurs : sans lui, le catalogue
        // appellerait tous les documents par le nom de la bibliothèque.
        //
        // **Complet, ou il ne compte pas.** `id`, `outil`, `etat`, `tentative` et `total` n'ont
        // pas de valeur par défaut dans le contrat : un travail qui en omet un seul ne se lit
        // pas, le fichier est sauté en silence, et le catalogue retombe sur « Document ab12cd34 ».
        // C'est arrivé à ce banc-ci, et c'était le banc qui avait tort.
        let nom = chemin.file_name().map(|bout| bout.to_string_lossy().into_owned()).unwrap_or_default();
        let travail = serde_json::json!({
            "id": format!("t-{rang}"),
            "outil": "pages-images",
            "etat": "termine",
            "tentative": 1,
            "total": textes.len(),
            "empreinte": empreinte,
            "versionCible": version,
            "sujet": { "nom": nom, "contenu": "document/portable" },
        });
        let _ = fs::create_dir_all(depot.travaux());
        let _ = fs::write(depot.travaux().join(format!("t-{rang}.json")), travail.to_string());

        println!("  posé · {:3} pages · {:5.0} Ko · {nom}", textes.len(), octets as f64 / 1024.0);
    }

    println!("\nBibliothèque prête : {}", racine.display());
    ExitCode::SUCCESS
}
