//! Le parcours entier d'un administrateur, de la création à la lecture (lot D2, étape 7).
//!
//! Chaque pas de cet essai est **exactement ce qu'une commande de l'hôte fait** quand un écran
//! l'appelle : créer la bibliothèque, écrire son organisation, déposer des fichiers, montrer une
//! page, essayer une manière de lire, l'enregistrer, laisser la file tourner, relire la version
//! active, prendre l'image d'une page. Aucun chemin n'est propre à cet essai.
//!
//! Ce qu'il ne fait pas : cliquer. Les captures de `docs/captures/` montrent les écrans ; cet
//! essai montre que ce qu'ils demandent répond, dans l'ordre, sur un vrai corpus.
//!
//!     cargo run --example parcours-complet -- <travail> <document> <description> <recette> [médias]

use lienotheque_bureau::{arrivee, depot::Depot, file, roulement::Roulement, traitement};
use std::{
    fs,
    path::PathBuf,
    process::ExitCode,
    time::{Duration, Instant},
};

/// Un pas du parcours : ce qu'on fait, et ce que cela a pris.
fn pas(nom: &str, depuis: Instant, dit: &str) {
    println!("{nom:<24} {:>6.1} s   {dit}", depuis.elapsed().as_secs_f32());
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let (Some(travail), Some(document), Some(description), Some(recette)) =
        (arguments.first(), arguments.get(1), arguments.get(2), arguments.get(3))
    else {
        eprintln!("Attendu : <travail> <document> <description> <recette> [médias]");
        return ExitCode::from(2);
    };

    let racine = PathBuf::from(travail).join("bibliotheque");
    fs::remove_dir_all(&racine).ok();

    // 1. Créer la bibliothèque — ce que fait `creer_bibliotheque` au bout de l'assistant.
    let debut = Instant::now();
    let depot = match Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Bibliothèque impossible à préparer : {e}");
            return ExitCode::from(1);
        }
    };
    if depot.deja_une_bibliotheque() {
        eprintln!("Une bibliothèque occupe déjà ce dossier.");
        return ExitCode::from(1);
    }
    let texte = match fs::read_to_string(description) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("Description illisible : {e}");
            return ExitCode::from(1);
        }
    };
    if let Err(e) = depot.ecrire_description(&texte) {
        eprintln!("Description impossible à écrire : {e}");
        return ExitCode::from(1);
    }
    pas("créer", debut, "la bibliothèque existe, sa description est écrite");

    // 2. L'organisation — ce que fait `ecrire_bibliotheque` quand on valide l'écran.
    let etape = Instant::now();
    if let Err(e) = depot.ecrire_description(&texte) {
        eprintln!("Organisation impossible à écrire : {e}");
        return ExitCode::from(1);
    }
    pas("organiser", etape, "le schéma est enregistré, une version de plus");

    // 3. Déposer — ce que fait `deposer`.
    let etape = Instant::now();
    let mut a_deposer: Vec<PathBuf> = vec![PathBuf::from(document)];
    for dossier in arguments.iter().skip(4) {
        match fs::read_dir(dossier) {
            Ok(entrees) => a_deposer.extend(entrees.filter_map(|e| e.ok()).map(|e| e.path()).filter(|c| c.is_file())),
            Err(e) => {
                eprintln!("Médias illisibles : {e}");
                return ExitCode::from(1);
            }
        }
    }
    let arrivee = match arrivee::deposer(&depot, &depot.travaux(), &a_deposer, &mut |t| eprintln!("file : {t}")) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Dépôt impossible : {e}");
            return ExitCode::from(1);
        }
    };
    pas(
        "déposer",
        etape,
        &format!(
            "{} travail(aux), {} média(s), {} refusé(s)",
            arrivee.travaux.len(),
            arrivee.accompagnements.len(),
            arrivee.refuses.len()
        ),
    );

    let emplacements = match std::env::current_exe()
        .ok()
        .and_then(|exe| traitement::Emplacements::depuis_executable(&exe))
    {
        Some(e) => e,
        None => {
            eprintln!("Moteur introuvable : préparez-le avec outils/preparer-moteur-node.py.");
            return ExitCode::from(1);
        }
    };

    // 4. Montrer une page — ce que fait `apercu_de_pages` à l'ouverture de l'éditeur.
    let etape = Instant::now();
    let images = racine.join("derives").join("apercu");
    let apercu = serde_json::json!({
        "type": "demande",
        "protocole": lienotheque_bureau::limites::LIMITES.protocole,
        "travailId": uuid::Uuid::new_v4().to_string(),
        "outil": { "nom": "apercu-de-pages", "version": "1.0.0" },
        "versionCible": uuid::Uuid::new_v4().to_string(),
        "charge": {
            "document": racine.join("sources").join(PathBuf::from(document).file_name().unwrap_or_default()),
            "images": &images,
            "depuis": 0,
            "combien": 3,
        },
    });
    match traitement::demander(&emplacements, &apercu) {
        Ok(rendu) => {
            let lu: serde_json::Value = serde_json::from_str(&rendu).unwrap_or_default();
            let combien = lu["pages"].as_array().map_or(0, Vec::len);
            pas("montrer la page", etape, &format!("{combien} page(s) exportée(s) pour l'éditeur"));
        }
        Err(e) => {
            eprintln!("Aperçu impossible : {e}");
            return ExitCode::from(1);
        }
    }

    // 5. Enregistrer la manière de lire — ce que fait `enregistrer_maniere`.
    let etape = Instant::now();
    let base = racine.join("base");
    if let Err(e) = fs::create_dir_all(&base)
        .and_then(|()| fs::copy(recette, base.join(lienotheque_bureau::roulement::RECETTE)).map(|_| ()))
    {
        eprintln!("Manière de lire impossible à écrire : {e}");
        return ExitCode::from(1);
    }
    pas("apprendre à lire", etape, "la manière de lire est enregistrée");

    // 6. La file tourne — ce que fait `faire_tourner`, et qui continue fenêtre fermée.
    let etape = Instant::now();
    let roulement = Roulement::demarrer(
        Depot::ouvrir(&racine).expect("dépôt"),
        emplacements,
        "0190f0a0-0000-7000-8000-00000000ff01".to_owned(),
        PathBuf::from(travail).join("cache"),
    );
    let dossier_file = base.join("travaux");
    let mut conclu = false;
    loop {
        std::thread::sleep(Duration::from_secs(3));
        let tous = file::charger_tout(&dossier_file, &mut |t| eprintln!("file : {t}")).unwrap_or_default();
        let Some(suivi) = tous.first() else { break };
        if ["termine", "annule", "en_echec_definitif", "en_echec_recuperable"].contains(&suivi.etat.as_str()) {
            conclu = suivi.etat == "termine";
            if let Some(cause) = &suivi.cause {
                eprintln!("cause : {cause}");
            }
            break;
        }
        if etape.elapsed() > Duration::from_secs(2400) {
            eprintln!("Quarante minutes sans conclusion : on arrête.");
            break;
        }
    }
    roulement.arreter();
    pas("traiter", etape, if conclu { "version écrite et activée" } else { "le travail n'a pas abouti" });
    if !conclu {
        return ExitCode::from(1);
    }

    // 7. Ce que les écrans lisent — `vue_de_bibliotheque`, puis `image_de_page`.
    let etape = Instant::now();
    let depot = Depot::ouvrir(&racine).expect("dépôt");
    let Ok(Some(charge)) = depot.charge_active() else {
        eprintln!("Aucune version active : les écrans n'auraient rien à montrer.");
        return ExitCode::from(1);
    };
    let lu: serde_json::Value = serde_json::from_str(&charge).unwrap_or_default();
    let vue = &lu["vue"];
    let pages = vue["pages"].as_array().cloned().unwrap_or_default();
    let elements: usize = pages.iter().map(|p| p["elements"].as_array().map_or(0, Vec::len)).sum();
    let relies: usize = pages
        .iter()
        .map(|p| {
            p["elements"]
                .as_array()
                .map_or(0, |e| e.iter().filter(|el| !el["media"].is_null()).count())
        })
        .sum();
    pas(
        "lire la bibliothèque",
        etape,
        &format!("{} page(s), {relies} / {elements} éléments reliés, {} à vérifier", pages.len(), vue["aVerifier"]),
    );

    // L'image de la première page qui en porte une : c'est ce que le Lecteur demande.
    let etape = Instant::now();
    let version = depot.version_active().ok().flatten().map(|p| p.version).unwrap_or_default();
    let fichier = pages
        .iter()
        .find_map(|p| p["image"].as_str())
        .and_then(|adresse| adresse.rsplit('/').next())
        .map(String::from);
    match fichier {
        Some(nom) => {
            let chemin = racine.join("derives").join(&version).join("pages").join(&nom);
            let octets = fs::metadata(&chemin).map(|m| m.len()).unwrap_or(0);
            pas("montrer une page", etape, &format!("{nom} — {octets} octets"));
            if octets == 0 {
                eprintln!("L'image de page est absente : le Lecteur n'aurait rien à montrer.");
                return ExitCode::from(1);
            }
        }
        None => pas("montrer une page", etape, "aucune page n'a d'image — le Lecteur le dira"),
    }

    println!("\nparcours complet : {:.0} s du premier geste à la lecture", debut.elapsed().as_secs_f32());
    ExitCode::SUCCESS
}
