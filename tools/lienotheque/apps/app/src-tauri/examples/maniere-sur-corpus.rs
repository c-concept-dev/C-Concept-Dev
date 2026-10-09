//! Le banc de l'épreuve REC-07 : apprendre une manière de lire à un document jamais vu.
//!
//! Il emprunte exactement ce que l'éditeur emprunte — `apercu-de-pages` pour voir, puis
//! `traitement-de-lot` borné à quelques pages pour essayer. Ce qu'il n'a pas, c'est la souris :
//! les zones arrivent par un fichier au lieu d'être tracées. Tout le reste est le chemin réel.
//!
//!     cargo run --example maniere-sur-corpus -- voir <travail> <document> <description> <depuis> <combien>
//!     cargo run --example maniere-sur-corpus -- essayer <travail> <document> <recette.json> <pages>
//!
//! `voir` prépare la bibliothèque et exporte des pages en images ; `essayer` lance la lecture sur
//! les premières pages et dit, page par page, ce qui a été lu. Les deux impriment leur durée :
//! c'est elle qu'on additionne pour REC-07.

use lienotheque_bureau::{depot::Depot, traitement};
use std::{fs, path::PathBuf, process::ExitCode, time::Instant};

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let Some(geste) = arguments.first().map(String::as_str) else {
        eprintln!("Attendu : voir | essayer");
        return ExitCode::from(2);
    };
    match geste {
        "voir" => voir(&arguments),
        "essayer" => essayer(&arguments),
        autre => {
            eprintln!("Geste inconnu : {autre}");
            ExitCode::from(2)
        }
    }
}

/// Ouvre la bibliothèque de travail, en la créant au besoin, et rend son dépôt.
fn bibliotheque(travail: &str) -> Result<(Depot, PathBuf), String> {
    let racine = PathBuf::from(travail).join("bibliotheque");
    let depot = Depot::ouvrir(&racine).map_err(|e| format!("Bibliothèque impossible à préparer : {e}"))?;
    Ok((depot, racine))
}

fn moteur() -> Result<traitement::Emplacements, String> {
    let executable = std::env::current_exe().map_err(|e| format!("Exécutable introuvable : {e}"))?;
    traitement::Emplacements::depuis_executable(&executable)
        .ok_or_else(|| "Moteur introuvable : préparez-le avec outils/preparer-moteur-node.py.".to_owned())
}

/// Prépare la bibliothèque et exporte quelques pages en images, comme l'éditeur les demande.
fn voir(arguments: &[String]) -> ExitCode {
    let (Some(travail), Some(document), Some(description), Some(depuis), Some(combien)) = (
        arguments.get(1),
        arguments.get(2),
        arguments.get(3),
        arguments.get(4).and_then(|a| a.parse::<u32>().ok()),
        arguments.get(5).and_then(|a| a.parse::<u32>().ok()),
    ) else {
        eprintln!("Attendu : voir <travail> <document> <description> <depuis> <combien>");
        return ExitCode::from(2);
    };

    let debut = Instant::now();
    let (depot, racine) = match bibliotheque(travail) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(1);
        }
    };

    // La description, pour que la bibliothèque existe vraiment ; le document, copié comme le
    // dépôt le copie — jamais déplacé, jamais modifié.
    let base = racine.join("base");
    if let Err(e) = fs::create_dir_all(&base).and_then(|()| fs::copy(description, base.join("bibliotheque.json")).map(|_| ())) {
        eprintln!("Description impossible à poser : {e}");
        return ExitCode::from(1);
    }
    let copie = match depot.deposer_source(&PathBuf::from(document)) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Document impossible à copier : {e}");
            return ExitCode::from(1);
        }
    };

    let images = racine.join("derives").join("apercu");
    let demande = serde_json::json!({
        "type": "demande",
        "protocole": lienotheque_bureau::limites::LIMITES.protocole,
        "travailId": uuid::Uuid::new_v4().to_string(),
        "outil": { "nom": "apercu-de-pages", "version": "1.0.0" },
        "versionCible": uuid::Uuid::new_v4().to_string(),
        "charge": { "document": copie, "images": images, "depuis": depuis, "combien": combien },
    });

    let emplacements = match moteur() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(1);
        }
    };
    match traitement::demander(&emplacements, &demande) {
        Ok(rendu) => {
            let lu: serde_json::Value = serde_json::from_str(&rendu).unwrap_or_default();
            let vides = Vec::new();
            for page in lu["pages"].as_array().unwrap_or(&vides) {
                println!(
                    "page {} : {}",
                    page["rang"].as_u64().unwrap_or(0),
                    images.join(page["fichier"].as_str().unwrap_or("")).display()
                );
            }
            println!("voir        : {:.1} s", debut.elapsed().as_secs_f32());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("Aperçu impossible : {e}");
            ExitCode::from(1)
        }
    }
}

/// Essaie une manière de lire sur les premières pages, et dit ce qui a été lu.
fn essayer(arguments: &[String]) -> ExitCode {
    let (Some(travail), Some(document), Some(recette), Some(depuis), Some(pages)) = (
        arguments.get(1),
        arguments.get(2),
        arguments.get(3),
        arguments.get(4).and_then(|a| a.parse::<u32>().ok()),
        arguments.get(5).and_then(|a| a.parse::<u32>().ok()),
    ) else {
        eprintln!("Attendu : essayer <travail> <document> <recette.json> <depuis> <pages>");
        return ExitCode::from(2);
    };

    let debut = Instant::now();
    let (depot, racine) = match bibliotheque(travail) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(1);
        }
    };
    let _ = &depot;

    let demande = serde_json::json!({
        "type": "demande",
        "protocole": lienotheque_bureau::limites::LIMITES.protocole,
        "travailId": uuid::Uuid::new_v4().to_string(),
        "outil": { "nom": "traitement-de-lot", "version": "1.0.0" },
        "versionCible": uuid::Uuid::new_v4().to_string(),
        "charge": {
            "document": racine.join("sources").join(document),
            "medias": racine.join("sources"),
            "recette": recette,
            "description": racine.join("base").join("bibliotheque.json"),
            "depuis": depuis,
            "pages": pages,
        },
    });

    let emplacements = match moteur() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(1);
        }
    };
    match traitement::demander(&emplacements, &demande) {
        Ok(rendu) => {
            let lu: serde_json::Value = serde_json::from_str(&rendu).unwrap_or_default();
            let vides = Vec::new();
            // Les pages **regardées**, et non seulement celles qui ont rendu quelque chose :
            // « rien lu » et « rien regardé » doivent se distinguer, sans quoi on ne sait pas si
            // la zone est fausse ou la page vide.
            let pages_lues = lu["resultat"]["pages"].as_array().unwrap_or(&vides);
            let mut total = 0;
            for page in pages_lues {
                let elements: Vec<String> = page["elements"]
                    .as_array()
                    .map(|e| {
                        e.iter()
                            .map(|el| {
                                // Le numéro tel qu'il est imprimé quand il en porte un : c'est
                                // celui-là qu'on montre, et non son rang.
                                el["numeroLu"]
                                    .as_str()
                                    .map(String::from)
                                    .or_else(|| el["numero"].as_str().map(String::from))
                                    .or_else(|| el["numero"].as_u64().map(|n| n.to_string()))
                                    .unwrap_or_else(|| el.to_string())
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let _ignore: Vec<String> = page["elements"]
                    .as_array()
                    .map(|e| {
                        e.iter()
                            .map(|el| {
                                el["numero"]
                                    .as_str()
                                    .map(String::from)
                                    .or_else(|| el["numero"].as_u64().map(|n| n.to_string()))
                                    .unwrap_or_else(|| el.to_string())
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                total += elements.len();
                println!(
                    "rang {:>3} (imprimée {:>4}) : {}",
                    page["index"].as_u64().unwrap_or(0),
                    page["pageLue"].as_u64().map_or_else(|| "—".to_owned(), |n| n.to_string()),
                    if elements.is_empty() { "—".to_owned() } else { elements.join(", ") }
                );
            }
            println!("lus         : {total} sur {} pages", pages_lues.len());
            println!("à vérifier  : {}", lu["vue"]["aVerifier"].as_u64().unwrap_or(0));
            println!("essayer     : {:.1} s", debut.elapsed().as_secs_f32());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("Essai impossible : {e}");
            ExitCode::from(1)
        }
    }
}
