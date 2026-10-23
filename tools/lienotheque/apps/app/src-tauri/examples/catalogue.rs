//! Ce que le catalogue reçoit réellement d'une bibliothèque, sans ouvrir de fenêtre.
//!
//!     cargo run --example catalogue -- "<racine de la bibliothèque>" [combien]
//!
//! Il appelle la **même fonction** que la commande de l'hôte — `apercus_de` — et imprime ce
//! qu'elle rend. Aucune reproduction, aucun raccourci : ce qui s'affiche ici est ce que l'écran
//! recevrait.
//!
//! Écrit le 22 octobre 2026, après avoir découvert que les 243 documents d'une bibliothèque
//! réimportée s'appelaient tous « Base de connaissance » — le nom de la bibliothèque, lu là où
//! un titre de document était attendu.

use std::collections::HashSet;

fn main() {
    let mut arguments = std::env::args().skip(1);
    let Some(racine) = arguments.next() else {
        eprintln!("Donnez la racine d'une bibliothèque.");
        std::process::exit(2);
    };
    let combien: usize = arguments.next().and_then(|n| n.parse().ok()).unwrap_or(12);

    let apercus = match lienotheque_bureau::apercus_de(&racine) {
        Ok(a) => a,
        Err(souci) => {
            eprintln!("Aperçu impossible : {souci}");
            std::process::exit(1);
        }
    };

    println!("{} documents\n", apercus.len());
    for apercu in apercus.iter().take(combien) {
        let nom = apercu["nom"].as_str().unwrap_or("(sans nom)");
        let dits: Vec<String> = apercu["compteurs"]
            .as_array()
            .map(|liste| {
                liste
                    .iter()
                    .filter(|c| c["nombre"].as_u64().unwrap_or(0) > 0)
                    .map(|c| format!("{} {}", c["nombre"], c["mot"].as_str().unwrap_or("")))
                    .collect()
            })
            .unwrap_or_default();
        let resume = if dits.is_empty() { "— rien".to_owned() } else { dits.join(", ") };
        println!("  {resume:28}  {nom}");
    }

    // Le chiffre qui compte : combien de titres différents. Un seul pour deux cent quarante-trois
    // documents est le défaut lui-même ; autant de titres que de documents est sa correction.
    let distincts: HashSet<&str> = apercus.iter().filter_map(|a| a["nom"].as_str()).collect();
    println!("\ntitres distincts : {} sur {} documents", distincts.len(), apercus.len());
}
