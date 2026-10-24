//! La chaîne du Lecteur, éprouvée jusqu'aux octets, sans ouvrir de fenêtre.
//!
//!     cargo run --example lecteur -- "<racine>" [rang de page]
//!
//! Il refait, dans l'ordre, ce que l'écran demande à l'hôte :
//!
//!   1. la version active du document le plus récemment activé — celui que l'application ouvre ;
//!   2. sa vue, et la page du rang demandé ;
//!   3. le nom de fichier que la page désigne ;
//!   4. **les octets de l'image**, par le même chemin que la commande de l'hôte.
//!
//! Chaque étape dit ce qu'elle a trouvé. Celle qui casse se nomme elle-même — c'est tout l'objet
//! de ce banc : savoir **où** la chaîne s'interrompt, plutôt que de constater qu'aucune page ne
//! s'affiche.

use lienotheque_bureau::depot;

fn main() {
    let mut arguments = std::env::args().skip(1);
    let Some(racine) = arguments.next() else {
        eprintln!("Donnez la racine d'une bibliothèque.");
        std::process::exit(2);
    };
    let rang: u32 = arguments.next().and_then(|n| n.parse().ok()).unwrap_or(1);

    let depot = match depot::Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(souci) => {
            eprintln!("1. bibliothèque : ÉCHEC — {souci}");
            std::process::exit(1);
        }
    };
    println!("1. bibliothèque ouverte");

    let actives = depot.actives().expect("table des actives");
    let Some((empreinte, pointeur)) = actives.iter().max_by_key(|(_, p)| p.activee_le) else {
        eprintln!("2. aucune version active");
        std::process::exit(1);
    };
    println!("2. document le plus récent · empreinte {}… · version {}", &empreinte[..8], &pointeur.version[26..]);

    let Some(charge) = depot.charge_active(empreinte).expect("charge") else {
        eprintln!("3. charge active : ABSENTE");
        std::process::exit(1);
    };
    // Par la **même fonction** que la commande de l'hôte : c'est elle qui greffe le texte.
    let vue = lienotheque_bureau::vue_active(&depot, empreinte).expect("vue").expect("vue présente");
    let vide = Vec::new();
    let pages = vue["pages"].as_array().unwrap_or(&vide);
    let lu: serde_json::Value = serde_json::from_str(&charge).expect("version lisible");
    println!("3. vue lue · {} page(s)", pages.len());

    let Some(page) = pages.iter().find(|p| p["index"].as_u64() == Some(u64::from(rang))) else {
        eprintln!("4. aucune page au rang {rang} — rangs présents : {:?}", pages.iter().take(5).map(|p| p["index"].clone()).collect::<Vec<_>>());
        std::process::exit(1);
    };
    let Some(adresse) = page["image"].as_str() else {
        eprintln!("4. la page {rang} ne désigne aucune image");
        std::process::exit(1);
    };
    println!("4. page {rang} · image annoncée « {adresse} »");

    let Some(fichier) = adresse.rsplit('/').next() else {
        eprintln!("5. adresse d'image sans nom de fichier");
        std::process::exit(1);
    };
    let chemin = depot.racine().join(depot::DERIVES).join(&pointeur.version).join("pages").join(fichier);
    match std::fs::read(&chemin) {
        Ok(octets) => println!("5. image servie · {} Ko depuis {}", octets.len() / 1024, chemin.display()),
        Err(souci) => {
            eprintln!("5. IMAGE INTROUVABLE · {} — {souci}", chemin.display());
            std::process::exit(1);
        }
    }

    let texte = page["texte"].as_array().map(Vec::len).unwrap_or(0);
    let elements = page["elements"].as_array().map(Vec::len).unwrap_or(0);
    let passages = lu["passages"].as_array().map(Vec::len).unwrap_or(0);
    println!("6. cette page porte {texte} ligne(s) de texte et {elements} élément(s) · le document a {passages} passage(s)");
    if let Some(premiere) = page["texte"].as_array().and_then(|t| t.first()).and_then(|l| l.as_str()) {
        let apercu: String = premiere.chars().take(90).collect();
        println!("   première ligne : « {apercu}… »");
    }
    println!("\nLa chaîne du Lecteur est entière.");
}
