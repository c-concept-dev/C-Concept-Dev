//! La vue d'un document **telle que l'hôte la rend**, écrite en JSON, sans ouvrir de fenêtre.
//!
//!     cargo run --example vue-telle-que-l-hote-la-rend -- "<racine>" [empreinte] > vue.json
//!
//! Pourquoi : l'écran ne reçoit pas la vue rangée dans la version, il reçoit celle que l'hôte
//! **compose** — le texte des passages greffé page par page. Entre les deux, le contrat peut
//! refuser, et l'écran retombe alors sur une vue vide : aucune page, aucun lien, et des filtres
//! à zéro. Constater « aucune page à l'écran » ne dit pas laquelle des deux vues est en cause.
//!
//! Ce banc rend la première des deux, celle de `vue_active`. La seconde — les adresses de médias
//! greffées par la fenêtre — demande l'état de l'application, donc une fenêtre : ce qui est hors
//! d'ici, et dit comme tel plutôt que deviné.

use lienotheque_bureau::depot;

fn main() {
    let mut arguments = std::env::args().skip(1);
    let Some(racine) = arguments.next() else {
        eprintln!("Donnez la racine d'une bibliothèque.");
        std::process::exit(2);
    };

    let depot = match depot::Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(souci) => {
            eprintln!("bibliothèque : ÉCHEC — {souci}");
            std::process::exit(1);
        }
    };

    let actives = depot.actives().expect("table des actives");
    let empreinte = match arguments.next() {
        Some(donnee) => donnee,
        None => {
            // Le document que l'application ouvre d'elle-même : le plus récemment activé.
            let Some((empreinte, _)) = actives.iter().max_by_key(|(_, p)| p.activee_le) else {
                eprintln!("aucune version active");
                std::process::exit(1);
            };
            empreinte.clone()
        }
    };

    match lienotheque_bureau::vue_active(&depot, &empreinte) {
        Err(souci) => {
            eprintln!("vue : ÉCHEC — {souci}");
            std::process::exit(1);
        }
        Ok(None) => {
            eprintln!("vue : AUCUNE version active pour {empreinte}");
            std::process::exit(1);
        }
        Ok(Some(vue)) => {
            eprintln!(
                "vue composée · empreinte {}… · {} page(s)",
                &empreinte[..8],
                vue["pages"].as_array().map(Vec::len).unwrap_or(0)
            );
            println!("{vue}");
        }
    }
}
