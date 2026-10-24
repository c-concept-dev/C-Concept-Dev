//! Retire un document d'une bibliothèque, par la fonction de l'hôte (HER-07).
//!
//!     cargo run --example retrait -- <racine> <empreinte ou début d'empreinte>
//!
//! Il appelle `Depot::retirer_document`, c'est-à-dire exactement ce que la commande de l'hôte
//! appelle quand l'écran le demande. Il dit ensuite ce qui reste, parce que c'est là que les
//! défauts se cachent : un pointeur vers une version effacée, ou une source que plus rien ne
//! nomme, ne se voient pas dans le compte rendu du retrait.

use lienotheque_bureau::{apercus_de, depot::Depot};
use std::{path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    let (Some(racine), Some(debut)) = (arguments.next(), arguments.next()) else {
        eprintln!("Attendu : <racine> <empreinte ou début d'empreinte>");
        return ExitCode::from(2);
    };

    let depot = match Depot::ouvrir(&PathBuf::from(&racine)) {
        Ok(ouvert) => ouvert,
        Err(souci) => {
            eprintln!("Bibliothèque introuvable : {souci}");
            return ExitCode::from(1);
        }
    };
    let actives = match depot.actives() {
        Ok(table) => table,
        Err(souci) => {
            eprintln!("Versions actives illisibles : {souci}");
            return ExitCode::from(1);
        }
    };
    let candidates: Vec<String> = actives.keys().filter(|clef| clef.starts_with(&debut)).cloned().collect();
    let [empreinte] = &candidates[..] else {
        eprintln!("« {debut} » désigne {} documents : il en faut exactement un.", candidates.len());
        return ExitCode::from(2);
    };

    let titres = lienotheque_bureau::titres_de(&depot);
    let nom = lienotheque_bureau::titre_ou_empreinte(&titres, empreinte);
    println!("Avant : {} document(s) actif(s)", actives.len());
    println!("À retirer : {nom}\n");

    let retrait = match depot.retirer_document(empreinte) {
        Ok(compte) => compte,
        Err(souci) => {
            eprintln!("Retrait impossible : {souci}");
            return ExitCode::from(1);
        }
    };
    println!("{} version(s) et {} travail/travaux effacés", retrait.versions, retrait.travaux);
    match &retrait.source {
        Some(ou) => println!("Source à la corbeille : {}", ou.display()),
        None => println!("Aucune source à jeter : il n'en avait plus."),
    }

    // Ce qui reste, lu comme le catalogue le lit : c'est le seul contrôle qui compte.
    match apercus_de(&racine) {
        Ok(apercus) => {
            println!("\nAprès : {} document(s) au catalogue", apercus.len());
            for apercu in &apercus {
                println!("  {}", apercu["nom"].as_str().unwrap_or("(sans nom)"));
            }
        }
        Err(souci) => eprintln!("\nCatalogue illisible après le retrait : {souci}"),
    }
    ExitCode::SUCCESS
}
