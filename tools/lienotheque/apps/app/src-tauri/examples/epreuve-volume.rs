//! Le volume s'en va, et revient. Épreuve réelle, pas simulée.
//!
//!     cargo run --example epreuve-volume -- <dossier de bibliothèque>
//!
//! Elle met un travail en file, lance le roulement, puis **attend que vous démontiez le volume**.
//! Elle observe ce que la file devient, attend qu'il revienne, et dit si le travail a repris.
//!
//! Ce qu'elle cherche à prendre en défaut : qu'un disque absent fasse passer un document en
//! échec. Avant la protection, trois tentatives à trente secondes y suffisaient — quatre-vingt-dix
//! secondes d'absence et le document était déclaré définitivement perdu.
//!
//! Elle n'écrit que dans le dossier qu'on lui donne, et refuse tout dossier dont le nom ne
//! contient pas « essai » : une épreuve qui peut remuer une vraie bibliothèque est une épreuve
//! que personne ne devrait lancer.

use lienotheque_bureau::{depot::Depot, file, travail::Travail, volume};
use std::{
    path::PathBuf,
    process::ExitCode,
    time::{Duration, Instant},
};

fn etat_du_travail(dossier: &std::path::Path) -> Option<Travail> {
    file::charger_tout(dossier, &mut |_| {}).ok()?.into_iter().next()
}

fn main() -> ExitCode {
    let Some(racine) = std::env::args().nth(1).map(PathBuf::from) else {
        eprintln!("Attendu : <dossier de bibliothèque>");
        return ExitCode::from(2);
    };
    if !racine.to_string_lossy().contains("essai") {
        eprintln!("Refus : « {} » ne porte pas « essai » dans son chemin.", racine.display());
        return ExitCode::from(1);
    }

    let depot = match Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Bibliothèque impossible à préparer : {e}");
            return ExitCode::from(1);
        }
    };

    // Un travail qui attend. On ne le fera pas tourner : ce qu'on éprouve, c'est ce que la file
    // décide de lui, et cela se décide avant que le moteur ait commencé quoi que ce soit.
    let dossier = depot.travaux();
    let mut attend = Travail::neuf(&uuid::Uuid::new_v4().to_string(), "lecture-de-pages", 1);
    attend.etat = "en_file".to_owned();
    if let Err(e) = lienotheque_bureau::travail::enregistrer(&dossier.join(format!("{}.json", attend.id)), &attend) {
        eprintln!("Travail impossible à poser : {e}");
        return ExitCode::from(1);
    }
    println!("Un travail attend dans la file : {}", attend.id);

    let marque = |quand: u64| volume::marque("epreuve", quand);
    let secondes = || std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();

    println!("\nLe volume répond : {:?}", volume::demander(&racine, &marque(secondes())));
    println!("\n>>> Démontez le volume maintenant. J'attends, et je regarde la file. <<<\n");

    let debut = Instant::now();
    let mut vu_absent = false;
    let mut etats: Vec<String> = Vec::new();

    while debut.elapsed() < Duration::from_secs(300) {
        std::thread::sleep(Duration::from_secs(2));
        let presence = volume::demander(&racine, &marque(secondes()));
        let etat = etat_du_travail(&dossier).map(|t| format!("{} (tentative {})", t.etat, t.tentative));

        match (&presence, &etat) {
            (volume::Presence::Absent(pourquoi), _) => {
                if !vu_absent {
                    println!("[{:>3} s] volume absent : {pourquoi}", debut.elapsed().as_secs());
                    vu_absent = true;
                }
            }
            (volume::Presence::La, Some(dit)) => {
                if vu_absent {
                    println!("[{:>3} s] volume revenu — le travail est « {dit} »", debut.elapsed().as_secs());
                    etats.push(dit.clone());
                    break;
                }
            }
            (volume::Presence::La, None) => {}
        }
        if let Some(dit) = etat {
            if etats.last() != Some(&dit) {
                println!("[{:>3} s] travail : {dit}", debut.elapsed().as_secs());
                etats.push(dit);
            }
        }
    }

    println!("\n── Ce qu'on a vu ──");
    if !vu_absent {
        println!("Le volume n'a jamais disparu : l'épreuve n'a rien éprouvé.");
        return ExitCode::from(1);
    }
    let dernier = etat_du_travail(&dossier);
    match &dernier {
        Some(t) if t.etat.starts_with("en_echec") => {
            println!("ÉCHEC : le travail est « {} » après une absence du volume.", t.etat);
            ExitCode::from(1)
        }
        Some(t) => {
            println!("Le travail est « {} », tentative {} — il n'a pas échoué.", t.etat, t.tentative);
            ExitCode::SUCCESS
        }
        None => {
            println!("Le travail a disparu de la file : ce n'est pas ce qu'on veut non plus.");
            ExitCode::from(1)
        }
    }
}
