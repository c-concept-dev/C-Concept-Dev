//! Un moteur de pacotille : il récite des lignes, puis se tait — ou s'endort.
//!
//! Il sert à éprouver le dialogue de l'hôte sans Node, sans fichier sous droits, et surtout sans
//! shell. Les deux montages précédents passaient par `sh` puis par `sh` ou `cmd` selon le
//! système ; le premier ne tournait pas sous Windows, le second s'y cassait sur l'échappement —
//! Rust entoure de guillemets un argument qui contient des espaces, et `cmd` ne comprend pas les
//! guillemets échappés de cette façon. Un petit programme Rust n'a aucun de ces problèmes : il
//! est le même partout, et `cargo test` le construit.
//!
//!     reciteur <fichier de lignes> [--dormir]

use std::io::Write;

fn main() -> std::process::ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let Some(fichier) = arguments.first() else {
        eprintln!("Attendu : <fichier de lignes> [--dormir]");
        return std::process::ExitCode::from(2);
    };

    match std::fs::read_to_string(fichier) {
        Ok(contenu) => {
            print!("{contenu}");
            // Sans ce vidage, les lignes resteraient dans le tampon pendant tout le sommeil, et
            // l'hôte attendrait une salutation déjà écrite.
            std::io::stdout().flush().ok();
        }
        Err(e) => {
            eprintln!("Lignes illisibles : {e}");
            return std::process::ExitCode::from(1);
        }
    }

    if arguments.iter().any(|a| a == "--dormir") {
        std::thread::sleep(std::time::Duration::from_secs(600));
    }
    std::process::ExitCode::SUCCESS
}
