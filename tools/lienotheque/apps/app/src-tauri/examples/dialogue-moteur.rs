//! Fait dialoguer l'hôte avec un vrai moteur, de bout en bout (PLT-02).
//!
//! Les contrôles de `moteur.rs` éprouvent le dialogue contre un moteur de pacotille : c'est ce
//! qu'il faut pour tenir les règles, et cela ne demande ni Node ni le dépôt. Ce qu'ils ne peuvent
//! pas prouver, c'est que les deux côtés s'entendent réellement. D'où cet exemple, lancé à la
//! main, qui parle au moteur réel.
//!
//! Il reste un exemple et non un contrôle : l'intégration continue de l'hôte n'a pas à dépendre
//! de la présence de Node ni des fichiers sous droits. La preuve en paquet, elle, viendra de
//! l'essai de signature.
//!
//!     cargo run --example dialogue-moteur -- <programme> [arguments...] -- <charge.json>
//!
//! Par exemple, depuis `apps/app/src-tauri` :
//!
//!     cargo run --example dialogue-moteur -- npx tsx ../../../outils/ingestion/src/moteur.ts -- charge.json

use lienotheque_bureau::moteur::{Lancement, Message, Session};
use std::{path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let Some(separateur) = arguments.iter().position(|a| a == "--") else {
        eprintln!("Attendu : <programme> [arguments...] -- <charge.json>");
        return ExitCode::from(2);
    };
    let (commande, reste) = arguments.split_at(separateur);
    let Some(chemin_charge) = reste.get(1) else {
        eprintln!("Chemin de la charge attendu après « -- ».");
        return ExitCode::from(2);
    };
    let Some((programme, args)) = commande.split_first() else {
        eprintln!("Programme du moteur attendu.");
        return ExitCode::from(2);
    };

    let charge = match std::fs::read_to_string(chemin_charge) {
        Ok(texte) => texte,
        Err(e) => {
            eprintln!("Charge illisible : {e}");
            return ExitCode::from(2);
        }
    };

    let lancement = Lancement { programme: PathBuf::from(programme), arguments: args.to_vec(), environnement: Vec::new() };
    let mut session = match Session::ouvrir(&lancement) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Moteur impossible à lancer : {e}");
            return ExitCode::from(1);
        }
    };

    // La demande, telle que l'hôte l'enverra : une ligne, et on écoute.
    if let Err(e) = session.dire(charge.trim()) {
        eprintln!("Demande impossible à transmettre : {e}");
        return ExitCode::from(1);
    }

    // Le travail fini, l'hôte clôt la conversation : un processus par travail, et le moteur ne
    // reste pas à attendre une suite qui ne viendra pas. Sans ce geste, l'hôte écoute un tuyau
    // que personne n'alimente plus — la boucle du moteur, elle, attend sagement une autre ligne.
    let travail_id = serde_json::from_str::<serde_json::Value>(charge.trim())
        .ok()
        .and_then(|v| v.get("travailId").and_then(|i| i.as_str().map(str::to_owned)))
        .unwrap_or_default();
    let arret = format!(
        r#"{{"type":"arret","protocole":{},"travailId":"{travail_id}","raison":"fermeture"}}"#,
        lienotheque_bureau::limites::LIMITES.protocole
    );

    let mut avancements = 0;
    let mut abouti = false;
    while let Some(message) = session.ecouter() {
        match message {
            Ok(Message::Salutation { protocole, moteur, version }) => {
                println!("salutation  : {moteur} {version}, protocole {protocole}");
            }
            Ok(Message::Journal { niveau, texte }) => println!("journal     : [{niveau}] {texte}"),
            Ok(Message::Progression { progression, point, total }) => {
                avancements += 1;
                if avancements <= 3 || progression >= 1.0 {
                    let rang = point.map_or_else(|| "—".to_owned(), |p| format!("{} {}", p.valeur, p.unite));
                    let sur = total.map_or_else(|| "total inconnu".to_owned(), |t| format!("sur {t}"));
                    println!("avancement  : {:.0} % ({rang} {sur})", progression * 100.0);
                }
            }
            Ok(Message::Resultat { charge }) => {
                println!("résultat    : {} octets sur le tuyau", charge.len());
                abouti = true;
                let propre = session.arreter(&arret).unwrap_or(false);
                println!("arrêt       : {}", if propre { "le moteur a rendu la main seul" } else { "il a fallu le tuer" });
                break;
            }
            Ok(Message::Echec { cause, reprise_possible }) => {
                println!("échec       : {cause} (reprise possible : {reprise_possible})");
                let _ = session.arreter(&arret);
                break;
            }
            Err(refus) => println!("refusé      : {}", refus.message()),
        }
    }

    println!("avancements : {avancements}");
    if abouti {
        println!("\nL'hôte et le moteur se sont entendus.");
        ExitCode::SUCCESS
    } else {
        println!("\nAucun résultat : le dialogue n'a pas abouti.");
        ExitCode::from(1)
    }
}
