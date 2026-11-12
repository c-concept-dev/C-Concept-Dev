//! BANC JETABLE — 4 novembre 2026. Non commité tant que Christophe ne l'a pas validé.
//!
//! Rejoue la sortie complète du moteur à travers la BOUCLE DE LECTURE de l'hôte, avec un faux
//! processus qui réémet un fichier. On éprouve le dialogue, pas le moteur — ce que la
//! documentation de `Lancement` prévoit explicitement.
//!
//! Usage : cargo run --example banc-boucle-hote -- <fichier.jsonl>

use lienotheque_bureau::moteur::{Lancement, Message, Session};

fn main() -> std::io::Result<()> {
    let source = std::env::args().nth(1).expect("argument : le fichier .jsonl");

    let lancement = Lancement {
        programme: std::path::PathBuf::from("/bin/sh"),
        arguments: vec!["-c".to_owned(), format!("cat {}", shell_quote(&source))],
        environnement: Vec::new(),
    };

    let mut session = Session::ouvrir(&lancement)?;

    // L'hôte écrit toujours une demande en premier. Le faux processus ne la lit pas : on
    // observe aussi ce que cela fait.
    let demande = r#"{"type":"demande","protocole":1,"travailId":"00000000-0000-4000-8000-000000000000","outil":{"nom":"traitement-de-lot","version":"1.0.0"},"versionCible":"00000000-0000-4000-8000-000000000001","charge":{}}"#;
    match session.dire(demande) {
        Ok(()) => println!("demande écrite"),
        Err(e) => println!("ÉCRITURE DE LA DEMANDE REFUSÉE — {e} (kind={:?})", e.kind()),
    }

    let (mut vus, mut refus, mut resultat, mut echec) = (0usize, 0usize, 0usize, 0usize);
    let mut dernier = String::new();
    while let Some(message) = session.ecouter() {
        vus += 1;
        match message {
            Ok(Message::Salutation { .. }) => dernier = "salutation".to_owned(),
            Ok(Message::Journal { texte, .. }) => {
                // Par caractères : c'est le défaut même qu'on éprouve ici.
                dernier = format!("journal « {} »", texte.chars().take(40).collect::<String>())
            }
            Ok(Message::Progression { .. }) => dernier = "progression".to_owned(),
            Ok(Message::Resultat { charge }) => {
                resultat += 1;
                dernier = format!("resultat ({} octets)", charge.len());
            }
            Ok(Message::Echec { .. }) => echec += 1,
            Err(r) => {
                refus += 1;
                println!("REFUS au message {vus} : {}", r.message());
            }
        }
    }
    println!("\nla boucle s'est terminée d'elle-même");
    println!("  messages vus : {vus}   refus : {refus}   résultats : {resultat}   échecs : {echec}");
    println!("  dernier message : {dernier}");
    println!("  sortie du processus : {:?}", session.sortie());
    Ok(())
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}
