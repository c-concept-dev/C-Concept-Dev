// Pas de console sur Windows en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lienotheque_bureau::{depot::Depot, traitement};
use std::{path::PathBuf, process::ExitCode};

/// L'application, et une voie sans fenêtre pour la mesurer.
///
/// `--traiter <bibliothèque> <charge.json>` fait traiter un lot par l'application elle-même — même
/// exécutable, même signature, même moteur embarqué — sans ouvrir de fenêtre. C'est ce qui permet
/// de prouver qu'un paquet signé traite un corpus, là où piloter une interface graphique ne
/// prouverait que l'interface.
///
/// Ce n'est pas une ligne de commande de remplacement : elle ne sait rien faire que l'application
/// ne fasse, et elle emprunte exactement le même chemin.
fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().collect();
    if let Some(rang) = arguments.iter().position(|a| a == "--traiter") {
        let (Some(bibliotheque), Some(charge)) = (arguments.get(rang + 1), arguments.get(rang + 2)) else {
            eprintln!("Attendu : --traiter <dossier de bibliothèque> <charge.json>");
            return ExitCode::from(2);
        };
        return traiter_sans_fenetre(bibliotheque, charge);
    }

    lienotheque_bureau::run();
    ExitCode::SUCCESS
}

fn traiter_sans_fenetre(bibliotheque: &str, chemin_charge: &str) -> ExitCode {
    let executable = match std::env::current_exe() {
        Ok(chemin) => chemin,
        Err(e) => {
            eprintln!("Exécutable introuvable : {e}");
            return ExitCode::from(1);
        }
    };

    let Some(emplacements) = traitement::Emplacements::depuis_executable(&executable) else {
        eprintln!("Moteur introuvable à côté de l'application : le paquet est incomplet.");
        return ExitCode::from(1);
    };
    println!("moteur      : {}", emplacements.node.display());
    println!("chaîne      : {}", emplacements.chaine.display());

    let charge: serde_json::Value = match std::fs::read_to_string(chemin_charge).map(|t| serde_json::from_str(&t)) {
        Ok(Ok(valeur)) => valeur,
        Ok(Err(e)) => {
            eprintln!("Charge illisible : {e}");
            return ExitCode::from(2);
        }
        Err(e) => {
            eprintln!("Charge introuvable : {e}");
            return ExitCode::from(2);
        }
    };

    let depot = match Depot::ouvrir(PathBuf::from(bibliotheque)) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Bibliothèque impossible à ouvrir : {e}");
            return ExitCode::from(1);
        }
    };

    // De vrais identifiants : le contrat en exige, et un « travail-73991 » se fait refuser à
    // l'autre bout — là où le refus, lui, est bien plus difficile à lire que la cause.
    let travail = uuid::Uuid::new_v4().to_string();
    let version = uuid::Uuid::new_v4().to_string();

    match traitement::traiter(&depot, &emplacements, &travail, &version, &charge) {
        Ok(bilan) => {
            println!("résultat    : {} octets", bilan.octets);
            println!("journal     : {} lignes, {} erreur(s)", bilan.lignes_de_journal, bilan.erreurs);
            println!("version     : {} — {}", bilan.version, if bilan.active { "active" } else { "NON activée" });
            if bilan.active && bilan.erreurs == 0 {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
        Err(e) => {
            eprintln!("Traitement impossible : {e}");
            ExitCode::from(1)
        }
    }
}
