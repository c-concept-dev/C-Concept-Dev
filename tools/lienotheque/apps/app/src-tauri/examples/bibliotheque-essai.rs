//! Monte une bibliothèque d'essai et la fait traiter par la file (lot E2, bac à sable).
//!
//!     cargo run --release --example bibliotheque-essai -- \
//!       <racine> <description.json> <dossier de recettes> <manieres.json> <document>...
//!
//!  Pourquoi un bac à sable plutôt que le corpus entier : le classement et la recherche
//!  s'éprouvent en petit avant d'engager huit heures qu'il faudrait peut-être refaire (CLA-12).
//!  Sept documents suffisent à couvrir les quatre familles, les deux formats et les deux cas
//!  difficiles — une couche texte à moitié illisible, et des feuilles qui portent deux pages.
//!
//!  Rien ici n'est propre à l'essai : chaque pas est ce qu'une commande de l'hôte fait quand un
//!  écran l'appelle. C'est la condition pour que ce qu'on éprouve soit ce qui tournera.

use lienotheque_bureau::{arrivee, depot::Depot, file, roulement::Roulement, traitement::Emplacements};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{Duration, Instant},
};

/// Copie, sauf si la source **est** la destination.
///
/// Appelé avec les fichiers déjà en place — ce qui est la façon naturelle de s'en servir —,
/// `fs::copy` ouvre la destination en écriture avant de lire la source : il vide le fichier
/// qu'il devait recopier. La description et les affectations des sept documents sont parties
/// comme cela, et la file a ensuite échoué sur « Unexpected end of JSON input » sans que rien
/// ne dise que c'était la préparation qui les avait effacées.
fn poser(de: &Path, vers: &Path) -> std::io::Result<()> {
    let meme = fs::canonicalize(de).ok().zip(fs::canonicalize(vers).ok()).is_some_and(|(a, b)| a == b);
    if meme {
        println!("  {} est déjà en place", vers.display());
        return Ok(());
    }
    fs::copy(de, vers).map(|_| ())
}

/// Un fichier qui existe et n'est pas vide : la condition qu'on vérifie avant de déposer, parce
/// qu'un travail qui échoue pour une raison visible d'avance coûte le temps de toute la file.
fn tient_debout(chemin: &Path, quoi: &str) -> Result<(), String> {
    match fs::metadata(chemin) {
        Err(e) => Err(format!("{quoi} ({}) : {e}", chemin.display())),
        Ok(m) if m.len() == 0 => Err(format!("{quoi} ({}) est vide", chemin.display())),
        Ok(_) => Ok(()),
    }
}

fn copier_recettes(de: &Path, vers: &Path) -> std::io::Result<usize> {
    fs::create_dir_all(vers)?;
    let mut combien = 0;
    for entree in fs::read_dir(de)? {
        let chemin = entree?.path();
        if chemin.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        // Le nom perd sa version : l'affectation désigne une manière de lire, pas une révision.
        let nom = chemin.file_stem().and_then(|n| n.to_str()).unwrap_or_default();
        let sans_version = nom.rsplit_once(".v").map(|(avant, _)| avant).unwrap_or(nom);
        fs::copy(&chemin, vers.join(format!("{sans_version}.json")))?;
        combien += 1;
    }
    Ok(combien)
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let [racine, description, recettes, manieres] = match arguments.get(..4) {
        Some([a, b, c, d]) => [a.clone(), b.clone(), c.clone(), d.clone()],
        _ => {
            eprintln!("Attendu : <racine> <description.json> <dossier de recettes> <manieres.json> <document>...");
            return ExitCode::from(2);
        }
    };
    let documents: Vec<PathBuf> = arguments[4..].iter().map(PathBuf::from).collect();
    if documents.is_empty() {
        eprintln!("Aucun document à déposer.");
        return ExitCode::from(2);
    }

    let racine = PathBuf::from(racine);
    let depot = match Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Bibliothèque impossible à préparer : {e}");
            return ExitCode::from(1);
        }
    };

    // La description et les manières de lire d'abord : un dépôt sans elles pose des travaux qui
    // échoueront, et un travail qui échoue pour une raison qu'on pouvait voir avant est du temps
    // perdu deux fois.
    let base = racine.join("base");
    if let Err(e) = fs::create_dir_all(&base)
        .and_then(|()| poser(Path::new(&description), &base.join("bibliotheque.json")))
        .and_then(|()| poser(Path::new(&manieres), &base.join("manieres.json")))
    {
        eprintln!("Préparation impossible : {e}");
        return ExitCode::from(1);
    }
    // On relit ce qu'on vient de poser avant de déposer quoi que ce soit : une description vide
    // fait échouer les sept travaux, trois minutes plus tard, sur un message qui ne la nomme pas.
    for (chemin, quoi) in [
        (base.join("bibliotheque.json"), "La description de la bibliothèque"),
        (base.join("manieres.json"), "L'affectation des manières de lire"),
    ] {
        if let Err(pourquoi) = tient_debout(&chemin, quoi) {
            eprintln!("Préparation impossible — {pourquoi}");
            return ExitCode::from(1);
        }
    }
    match copier_recettes(Path::new(&recettes), &base.join("recettes")) {
        Ok(combien) => println!("{combien} manière(s) de lire posée(s)"),
        Err(e) => {
            eprintln!("Manières de lire impossibles à poser : {e}");
            return ExitCode::from(1);
        }
    }
    // Une manière par défaut, pour un document que l'affectation ne nommerait pas.
    let premiere = base.join("recettes").join("page-native.json");
    if premiere.exists() {
        let _ = fs::copy(&premiere, base.join(lienotheque_bureau::roulement::RECETTE));
    }

    let debut = Instant::now();
    let arrivee = match arrivee::deposer(&depot, &depot.travaux(), &documents, &mut |t| eprintln!("file : {t}")) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Dépôt impossible : {e}");
            return ExitCode::from(1);
        }
    };
    println!(
        "Déposé en {:.0} s : {} travail(aux), {} média(s), {} refusé(s)",
        debut.elapsed().as_secs_f32(),
        arrivee.travaux.len(),
        arrivee.accompagnements.len(),
        arrivee.refuses.len()
    );
    for (nom, pourquoi) in &arrivee.refuses {
        println!("  refusé : {nom} — {pourquoi}");
    }

    let emplacements = match std::env::current_exe().ok().and_then(|exe| Emplacements::depuis_executable(&exe)) {
        Some(e) => e,
        None => {
            eprintln!("Moteur introuvable : préparez-le avec outils/preparer-moteur-node.py.");
            return ExitCode::from(1);
        }
    };

    let roulement = Roulement::demarrer(
        Depot::ouvrir(&racine).expect("dépôt"),
        emplacements,
        "0190f0a0-0000-7000-8000-00000000ff02".to_owned(),
        racine.join("cache"),
    );

    let dossier_file = depot.travaux();
    let traitement = Instant::now();
    let mut vus: HashMap<String, String> = HashMap::new();
    loop {
        std::thread::sleep(Duration::from_secs(5));
        let tous = file::charger_tout(&dossier_file, &mut |t| eprintln!("file : {t}")).unwrap_or_default();
        if tous.is_empty() {
            break;
        }
        for t in &tous {
            let dit = format!("{} {:.0}%", t.etat, t.progression() * 100.0);
            let sujet = t.sujet.as_ref().map(|s| s.nom.clone()).unwrap_or_default();
            if vus.get(&t.id) != Some(&dit) {
                println!("[{:>5.0} s] {:<52} {dit}", traitement.elapsed().as_secs_f32(), &sujet[..sujet.len().min(52)]);
                vus.insert(t.id.clone(), dit);
            }
        }
        let finis = tous
            .iter()
            .filter(|t| ["termine", "annule", "en_echec_definitif"].contains(&t.etat.as_str()))
            .count();
        if finis == tous.len() {
            break;
        }
        if traitement.elapsed() > Duration::from_secs(5400) {
            println!("Une heure et demie sans conclusion : on s'arrête, la file reprendra où elle en est.");
            break;
        }
    }
    roulement.arreter();

    let tous = file::charger_tout(&dossier_file, &mut |_| {}).unwrap_or_default();
    println!("\n── Au bout de {:.0} s ──", traitement.elapsed().as_secs_f32());
    for t in &tous {
        let sujet = t.sujet.as_ref().map(|s| s.nom.clone()).unwrap_or_default();
        println!("  {:<54} {}{}", &sujet[..sujet.len().min(54)], t.etat, t.cause.as_deref().map(|c| format!(" — {c}")).unwrap_or_default());
    }
    let termines = tous.iter().filter(|t| t.etat == "termine").count();
    println!("\n{termines} / {} document(s) traité(s)", tous.len());
    if termines == tous.len() { ExitCode::SUCCESS } else { ExitCode::from(1) }
}
