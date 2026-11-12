//! BANC JETABLE — 4 novembre 2026. Non commité tant que Christophe ne l'a pas validé.
//!
//! Donne à `moteur::lire_message` — exactement le code de lecture de l'hôte — chaque ligne
//! produite par le rejeu du moteur embarqué, et dit pour chacune : acceptée, ou l'erreur exacte.
//! Puis écrit chaque message accepté par `journal::Journal`, comme le fait `noter()`.
//!
//! Aucune modification du code de production : ce fichier ne fait qu'appeler ses fonctions.
//!
//! Usage : cargo run --example banc-lecture-messages -- <fichier.jsonl> <dossier-journal>

use lienotheque_bureau::journal::{Journal, Ligne};
use lienotheque_bureau::moteur::{lire_message, Message};

fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    let source = args.next().expect("premier argument : le fichier .jsonl");
    let dossier = args.next().expect("second argument : le dossier du journal");

    let texte = std::fs::read_to_string(&source)?;
    let journal = Journal::pour(std::path::Path::new(&dossier), "banc-4nov")?;

    let (mut acceptes, mut refuses, mut ecrits) = (0usize, 0usize, 0usize);
    for (rang, ligne) in texte.lines().enumerate() {
        if ligne.trim().is_empty() {
            continue;
        }
        match lire_message(ligne) {
            Ok(message) => {
                acceptes += 1;
                // Exactement ce que fait `noter()` dans roulement.rs / traitement.rs.
                if let Message::Journal { niveau, texte } = &message {
                    match journal.ecrire(&Ligne {
                        niveau: niveau.clone(),
                        texte: texte.clone(),
                        le: 0,
                    }) {
                        Ok(()) => ecrits += 1,
                        Err(e) => println!("rang {rang} : ÉCRITURE REFUSÉE — {e}"),
                    }
                }
                let quoi = match &message {
                    Message::Salutation { .. } => "salutation",
                    Message::Journal { .. } => "journal",
                    Message::Progression { .. } => "progression",
                    Message::Resultat { .. } => "resultat",
                    Message::Echec { .. } => "echec",
                };
                if rang >= 100 && rang <= 110 {
                    println!("rang {rang:3} : accepté ({quoi}, {} octets)", ligne.len());
                }
            }
            Err(refus) => {
                refuses += 1;
                println!("rang {rang:3} : REFUSÉ — {}", refus.message());
            }
        }
    }
    println!("\nacceptés : {acceptes}   refusés : {refuses}   lignes de journal écrites : {ecrits}");
    Ok(())
}
