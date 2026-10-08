//! Travail long, volontairement tuable : sert à éprouver la reprise après arrêt forcé (JOB-02).
//!
//! C'est un **exemple** Cargo, pas un binaire du projet : `cargo test` le construit, mais Tauri
//! ne l'embarque pas dans le paquet livré (il ne reprend que les cibles `[[bin]]`).
//!
//!     cargo run --release --example travail-long -- <fichier-d-etat> [total] [ms-par-pas] [expiration-s]
//!
//! Il persiste son état avant de commencer (JOB-01), prend un verrou à expiration (JOB-02) et
//! enregistre un point de reprise à chaque pas (JOB-03). Tué par `kill -9`, il reprend au pas
//! suivant au prochain lancement, sans retraiter ce qui est fait.

use lienotheque_bureau::travail::{
    battement_secondes, charger, enregistrer, expiration_secondes, maintenant, Travail,
};
use std::{env, path::PathBuf, process, thread, time::Duration};

fn main() {
    let arguments: Vec<String> = env::args().collect();
    let Some(chemin) = arguments.get(1).map(PathBuf::from) else {
        eprintln!("usage : travail-long <fichier-d-etat> [total] [ms-par-pas] [secondes-d-expiration]");
        process::exit(2);
    };
    let total: u32 = arguments.get(2).and_then(|a| a.parse().ok()).unwrap_or(500);
    let pas_ms: u64 = arguments.get(3).and_then(|a| a.parse().ok()).unwrap_or(20);
    let expiration_s: u64 = arguments.get(4).and_then(|a| a.parse().ok()).unwrap_or(expiration_secondes());

    let mut travail = match charger(&chemin) {
        Ok(Some(existant)) => existant,
        Ok(None) => Travail::neuf("transcription-f3", "transcripteur", total),
        Err(erreur) => {
            eprintln!("état illisible : {erreur}");
            process::exit(1);
        }
    };

    if !travail.reprenable(maintenant()) {
        eprintln!("bail encore valide : rien à reprendre");
        process::exit(3);
    }

    let depart = travail.reprise_a();
    if depart > 0 {
        travail.tentative += 1;
    }
    travail.battre("prototype", maintenant(), expiration_s);
    enregistrer(&chemin, &travail).expect("état persisté avant de commencer (JOB-01)");
    println!("reprise au pas {depart} sur {total} (tentative {})", travail.tentative);

    for pas in (depart + 1)..=total {
        thread::sleep(Duration::from_millis(pas_ms));
        // Le bail est renouvelé quand le battement est dû ; au dernier pas, `avancer` le libère.
        if travail.battre_si_du("prototype", maintenant(), battement_secondes(), expiration_s) {
            println!("battement");
        }
        travail.avancer(pas, "lot");
        enregistrer(&chemin, &travail).expect("point de reprise enregistré (JOB-03)");
        println!("pas {pas}/{total}");
    }

    println!("terminé");
}
