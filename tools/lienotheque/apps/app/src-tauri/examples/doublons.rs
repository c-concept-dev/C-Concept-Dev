//! Les doublons d'une bibliothèque, par la même fonction que la commande de l'hôte.
//!
//!     cargo run --example doublons -- "<racine de la bibliothèque>"
//!
//! Il ne supprime rien et n'en a pas le moyen : il cherche, il décrit, il s'arrête là.

use lienotheque_bureau::{depot, doublons};
use std::collections::HashMap;

/// Un poids qui se lit. « 0.0 Mo » pour vingt-huit kilooctets ne dit rien à personne, et c'est
/// justement le poids qui distingue deux numérisations d'un même livre.
fn poids(octets: u64) -> String {
    if octets == 0 {
        return "source absente".to_owned();
    }
    if octets < 1024 * 1024 {
        return format!("{} Ko", (octets as f64 / 1024.0).round().max(1.0));
    }
    format!("{:.1} Mo", octets as f64 / 1024.0 / 1024.0)
}

fn main() {
    let Some(racine) = std::env::args().nth(1) else {
        eprintln!("Donnez la racine d'une bibliothèque.");
        std::process::exit(2);
    };
    let depot = match depot::Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(souci) => {
            eprintln!("Bibliothèque introuvable : {souci}");
            std::process::exit(1);
        }
    };

    // Le nom déposé d'un document vit dans son travail, jamais dans sa version.
    let mut titres: HashMap<String, String> = HashMap::new();
    if let Ok(entrees) = std::fs::read_dir(depot.travaux()) {
        for entree in entrees.flatten() {
            let Ok(texte) = std::fs::read_to_string(entree.path()) else { continue };
            let Ok(lu) = serde_json::from_str::<serde_json::Value>(&texte) else { continue };
            if let (Some(empreinte), Some(nom)) = (lu["empreinte"].as_str(), lu["sujet"]["nom"].as_str()) {
                titres.entry(empreinte.to_owned()).or_insert_with(|| nom.to_owned());
            }
        }
    }

    let debut = std::time::Instant::now();
    let trouvaille = match doublons::chercher(&depot, &|empreinte: &str| {
        titres.get(empreinte).cloned().unwrap_or_else(|| format!("Document {}", &empreinte[..8]))
    }) {
        Ok(g) => g,
        Err(souci) => {
            eprintln!("Recherche impossible : {souci}");
            std::process::exit(1);
        }
    };

    let groupes = &trouvaille.groupes;
    println!("{} groupe(s) trouvé(s) en {:.1} s\n", groupes.len(), debut.elapsed().as_secs_f64());
    for groupe in groupes {
        println!("── ressemblance {:.3}", groupe.ressemblance);
        for document in &groupe.documents {
            println!(
                "   {:5} pages · {:5} passages · {:7} mots · {:>13}   {}",
                document.pages,
                document.passages,
                document.mots,
                poids(document.octets),
                document.nom.chars().take(46).collect::<String>(),
            );
        }
        println!();
    }
    if groupes.is_empty() {
        println!("Aucun doublon : la bibliothèque est propre.");
    }
    if !trouvaille.trop_peu_de_texte.is_empty() {
        println!(
            "── {} document(s) non comparés, faute de texte lu (moins de {} mots)",
            trouvaille.trop_peu_de_texte.len(),
            doublons::MOTS_MINIMUM,
        );
        for document in &trouvaille.trop_peu_de_texte {
            println!(
                "   {:5} pages · {:7} mots · {:>13}   {}",
                document.pages,
                document.mots,
                poids(document.octets),
                document.nom.chars().take(46).collect::<String>(),
            );
        }
    }
}
