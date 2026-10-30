//! Monte une bibliothèque à partir d'un dossier de familles : **un dépôt par famille, une file**.
//!
//!     cargo run --release --example monter-un-eventail -- \
//!       <destination nouvelle> <description.json> <manieres.json> <corpus des familles>
//!
//! Deux choses le distinguent de `bibliotheque-essai`, et les deux ont été payées :
//!
//! **Un dépôt par famille.** Chaque appel à `arrivee::deposer` ouvre son propre lot, donc son
//! propre vivier de pistes. Tout déposer d'un coup remettrait sept cents pistes en commun — c'est
//! exactement ce qui a produit cinquante-deux faux liens sur un document de la bibliothèque
//! réelle.
//!
//! **Une seule file, à la fin.** Lancer l'outil une fois par famille paraissait équivalent : il
//! n'en est rien. Arrêter un roulement ne tue pas le moteur qu'il a lancé — le processus suivant
//! reprend un travail que l'ancien moteur est encore en train de lire, et deux moteurs écrivent
//! alors le même journal. Le 30 octobre 2026, onze travaux sur dix-sept ont vu deux moteurs : le
//! document était entièrement lu, et c'est le verdict du second qui était inscrit. Ici, on dépose
//! tout, puis on fait tourner **un** roulement jusqu'à ce que la file soit vide.

use lienotheque_bureau::{
    arrivee,
    depot::Depot,
    file,
    reconstruction::PlanReconstruction,
    roulement::Roulement,
    traitement::Emplacements,
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{Duration, Instant},
};

/// Les fichiers d'une famille, dans l'ordre, quel que soit son rangement intérieur.
fn fichiers_de(dossier: &Path) -> Vec<PathBuf> {
    let mut trouves = Vec::new();
    let Ok(entrees) = fs::read_dir(dossier) else { return trouves };
    for entree in entrees.flatten() {
        let chemin = entree.path();
        if chemin.is_dir() {
            trouves.extend(fichiers_de(&chemin));
        } else if arrivee::contenu_de(&chemin.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase())
            .is_some()
        {
            trouves.push(chemin);
        }
    }
    trouves.sort();
    trouves
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let [racine, description, manieres, familles] = match arguments.get(..4) {
        Some([a, b, c, d]) => [a.clone(), b.clone(), c.clone(), d.clone()],
        _ => {
            eprintln!("Attendu : <destination nouvelle> <description.json> <manieres.json> <corpus des familles>");
            return ExitCode::from(2);
        }
    };

    let racine = PathBuf::from(racine);
    let plan = match PlanReconstruction::verifier(&familles, &racine) {
        Ok(plan) => plan,
        Err(e) => {
            eprintln!("Reconstruction refusée avant toute écriture : {e}");
            return ExitCode::from(1);
        }
    };
    let (depot, photographie) = match plan.preparer_destination() {
        Ok(preparation) => preparation,
        Err(e) => {
            eprintln!("Bibliothèque impossible à préparer : {e}");
            return ExitCode::from(1);
        }
    };
    let base = racine.join("base");
    if let Err(e) = fs::create_dir_all(&base)
        .and_then(|()| fs::copy(Path::new(&description), base.join("bibliotheque.json")).map(|_| ()))
        .and_then(|()| fs::copy(Path::new(&manieres), base.join("manieres.json")).map(|_| ()))
    {
        eprintln!("Préparation impossible : {e}");
        return ExitCode::from(1);
    }

    // Un dépôt par famille : chacune forme son lot, donc son vivier.
    let mut dossiers: Vec<PathBuf> = match fs::read_dir(plan.corpus()) {
        Ok(entrees) => entrees
            .flatten()
            .map(|e| e.path())
            .filter(|c| c.is_dir())
            .collect(),
        Err(e) => {
            eprintln!("Dossier des familles illisible : {e}");
            return ExitCode::from(1);
        }
    };
    dossiers.sort();

    let mut deposes = 0;
    for famille in &dossiers {
        let nom = famille.file_name().and_then(|n| n.to_str()).unwrap_or("").to_owned();
        let fichiers = fichiers_de(famille);
        if fichiers.is_empty() {
            continue;
        }
        match arrivee::deposer(&depot, &depot.travaux(), &fichiers, &mut |t| eprintln!("file : {t}")) {
            Ok(a) => {
                deposes += a.travaux.len();
                println!(
                    "══ {nom} · {} fichier(s) → {} travail(aux), {} média(s), {} refusé(s)",
                    fichiers.len(),
                    a.travaux.len(),
                    a.accompagnements.len(),
                    a.refuses.len()
                );
                for (quoi, pourquoi) in &a.refuses {
                    println!("   refusé : {quoi} — {pourquoi}");
                }
            }
            Err(e) => println!("══ {nom} · dépôt impossible : {e}"),
        }
    }
    println!("\n{deposes} travail(aux) en file, {} famille(s)\n", dossiers.len());

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
        "0190f0a0-0000-7000-8000-00000000ff03".to_owned(),
        racine.join("cache"),
    );

    let dossier_file = depot.travaux();
    let debut = Instant::now();
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
                println!("[{:>6.0} s] {:<54} {dit}", debut.elapsed().as_secs_f32(), &sujet[..sujet.len().min(54)]);
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
    }
    roulement.arreter();

    let tous = file::charger_tout(&dossier_file, &mut |_| {}).unwrap_or_default();
    println!("\n── Au bout de {:.0} s ──", debut.elapsed().as_secs_f32());
    for t in &tous {
        let sujet = t.sujet.as_ref().map(|s| s.nom.clone()).unwrap_or_default();
        println!(
            "  {:<56} {}{}",
            &sujet[..sujet.len().min(56)],
            t.etat,
            t.cause.as_deref().map(|c| format!(" — {c}")).unwrap_or_default()
        );
    }
    let termines = tous.iter().filter(|t| t.etat == "termine").count();
    println!("\n{termines} / {} document(s) traité(s)", tous.len());
    match plan.ecrire_rapport(&depot, photographie.as_deref()) {
        Ok(rapport) => println!(
            "Rapport à comparer avant toute activation explicite : {}",
            rapport.display()
        ),
        Err(e) => {
            eprintln!("Rapport final impossible : {e}");
            return ExitCode::from(1);
        }
    }
    if termines == tous.len() { ExitCode::SUCCESS } else { ExitCode::from(1) }
}
