//! Fait traiter un corpus réel **par la file**, et non par un appel direct (JOB-01 à JOB-09).
//!
//! Les contrôles de `roulement.rs` éprouvent les règles — ce qui part, ce qui attend, ce qu'une
//! pause fait. Ce qu'ils ne peuvent pas prouver, c'est que la file mène un vrai document de bout
//! en bout : dépôt, moteur embarqué, progression, version écrite puis activée.
//!
//! Il reste un exemple et non un contrôle : l'intégration continue n'a ni Node préparé ni les
//! fichiers sous droits.
//!
//!     cargo run --example file-sur-corpus -- <dossier de travail> <document> <recette> <description> [médias...]
//!
//! Par exemple, depuis `apps/app/src-tauri` :
//!
//!     cargo run --example file-sur-corpus -- \
//!       "/Volumes/Carte Ext/lienotheque-preuve" \
//!       "../../../fixtures/fichiers/F3/<document>.pdf" \
//!       ../../../fixtures/recettes/methode-pastille-piste.v2.json \
//!       ../../../fixtures/bibliotheques/F3.json \
//!       "../../../fixtures/fichiers/F3/<dossier de médias>"

use lienotheque_bureau::{arrivee, depot::Depot, file, roulement::Roulement, traitement::Emplacements};
use std::{fs, path::PathBuf, process::ExitCode, time::{Duration, Instant}};

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let (Some(travail_dir), Some(document), Some(recette), Some(description)) =
        (arguments.first(), arguments.get(1), arguments.get(2), arguments.get(3))
    else {
        eprintln!("Attendu : <dossier de travail> <document> <recette> <description> [médias...]");
        return ExitCode::from(2);
    };

    let racine = PathBuf::from(travail_dir);
    let bibliotheque = racine.join("bibliotheque");
    let cache = racine.join("cache");
    fs::remove_dir_all(&bibliotheque).ok();

    let depot = match Depot::ouvrir(&bibliotheque) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Bibliothèque impossible à préparer : {e}");
            return ExitCode::from(1);
        }
    };

    // La bibliothèque porte sa description et sa manière de lire : sans elles, le travail se
    // refuse avant même de partir, et c'est bien ce qu'on veut qu'il fasse.
    let base = bibliotheque.join("base");
    if let Err(e) = fs::create_dir_all(&base)
        .and_then(|()| fs::copy(description, base.join("bibliotheque.json")).map(|_| ()))
        .and_then(|()| fs::copy(recette, base.join(lienotheque_bureau::roulement::RECETTE)).map(|_| ()))
    {
        eprintln!("Description ou recette impossibles à poser : {e}");
        return ExitCode::from(1);
    }

    // Tout ce qu'on dépose : le document, et les médias qui l'accompagnent.
    let mut a_deposer: Vec<PathBuf> = vec![PathBuf::from(document)];
    for dossier_medias in arguments.iter().skip(4) {
        match fs::read_dir(dossier_medias) {
            Ok(entrees) => a_deposer.extend(entrees.filter_map(|e| e.ok()).map(|e| e.path()).filter(|c| c.is_file())),
            Err(e) => {
                eprintln!("Médias illisibles dans {dossier_medias} : {e}");
                return ExitCode::from(1);
            }
        }
    }

    let depart = Instant::now();
    let arrivee = match arrivee::deposer(&depot, &depot.travaux(), &a_deposer, &mut |t| eprintln!("file : {t}")) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Dépôt impossible : {e}");
            return ExitCode::from(1);
        }
    };
    println!("dépôt       : {} travail(aux), {} média(s) déposé(s), {} refusé(s) en {:.1} s",
        arrivee.travaux.len(), arrivee.accompagnements.len(), arrivee.refuses.len(), depart.elapsed().as_secs_f32());
    for (nom, raison) in &arrivee.refuses {
        println!("  refusé    : {nom} — {raison}");
    }
    if arrivee.travaux.is_empty() {
        eprintln!("Aucun travail en file : rien à prouver.");
        return ExitCode::from(1);
    }

    let executable = match std::env::current_exe() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Exécutable introuvable : {e}");
            return ExitCode::from(1);
        }
    };
    let Some(emplacements) = Emplacements::depuis_executable(&executable) else {
        eprintln!("Moteur introuvable : préparez-le avec outils/preparer-moteur-node.py.");
        return ExitCode::from(1);
    };
    println!("moteur      : {}", emplacements.node.display());

    let roulement = Roulement::demarrer(
        depot,
        emplacements,
        "0190f0a0-0000-7000-8000-00000000ff01".to_owned(),
        cache,
    );

    // On regarde la file comme l'écran la regarde : on la relit, on ne la devine pas.
    let dossier_file = bibliotheque.join("base").join("travaux");
    let mut dernier_rang = 0_u32;
    let debut = Instant::now();
    loop {
        std::thread::sleep(Duration::from_secs(2));
        let tous = file::charger_tout(&dossier_file, &mut |t| eprintln!("file : {t}")).unwrap_or_default();
        let Some(suivi) = tous.first() else { break };

        let rang = suivi.reprise_a();
        if rang != dernier_rang {
            dernier_rang = rang;
            println!("avancement  : {rang} / {} — {:.0} %", suivi.total, suivi.progression() * 100.0);
        }
        if ["termine", "annule", "en_echec_definitif", "en_echec_recuperable"].contains(&suivi.etat.as_str()) {
            println!("état final  : {} après {:.0} s", suivi.etat, debut.elapsed().as_secs_f32());
            if let Some(cause) = &suivi.cause {
                println!("cause       : {cause}");
            }
            roulement.arreter();
            if suivi.etat != "termine" {
                return ExitCode::from(1);
            }
            break;
        }
        if debut.elapsed() > Duration::from_secs(3600) {
            eprintln!("Une heure sans conclusion : on arrête.");
            roulement.arreter();
            return ExitCode::from(1);
        }
    }

    // Ce que la version active contient. C'est elle que les écrans liront.
    let depot = Depot::ouvrir(&bibliotheque).expect("dépôt");
    match depot.charge_active() {
        Ok(Some(charge)) => {
            let lu: serde_json::Value = serde_json::from_str(&charge).unwrap_or_default();
            let vue = &lu["vue"];
            // Les éléments vivent sous leur page, et non à la racine de la vue : les compter
            // ailleurs donnerait « 0 / 0 » sur un résultat parfaitement bon.
            let tous: Vec<&serde_json::Value> = vue["pages"]
                .as_array()
                .map(|pages| pages.iter().filter_map(|p| p["elements"].as_array()).flatten().collect())
                .unwrap_or_default();
            let relies = tous.iter().filter(|el| !el["media"].is_null()).count();
            let association = &lu["association"];
            println!("version     : active, {} octets", charge.len());
            println!(
                "résultat    : {relies} / {} éléments reliés, {} à vérifier",
                tous.len(),
                vue["aVerifier"].as_u64().unwrap_or(0)
            );
            println!(
                "association : {} appariements, {} manquants, {} orphelins",
                association["appariements"].as_array().map_or(0, Vec::len),
                association["manquants"].as_array().map_or(0, Vec::len),
                association["orphelins"].as_array().map_or(0, Vec::len)
            );
            ExitCode::SUCCESS
        }
        Ok(None) => {
            eprintln!("Aucune version active : le travail a dit « terminé » sans rien poser.");
            ExitCode::from(1)
        }
        Err(e) => {
            eprintln!("Version active illisible : {e}");
            ExitCode::from(1)
        }
    }
}
