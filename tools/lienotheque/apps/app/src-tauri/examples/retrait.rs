//! Retire un document d'une bibliothèque, par la fonction de l'hôte (HER-07).
//!
//!     cargo run --example retrait -- <racine> <empreinte ou début d'empreinte>
//!
//! Il appelle `Depot::retirer_document`, c'est-à-dire exactement ce que la commande de l'hôte
//! appelle quand l'écran le demande. Il dit ensuite ce qui reste, parce que c'est là que les
//! défauts se cachent : un pointeur vers une version effacée, ou une source que plus rien ne
//! nomme, ne se voient pas dans le compte rendu du retrait.
//!
//! ## Il tient désormais cette promesse (lot `0z decies`)
//!
//! Il ne relisait que le **catalogue**, c'est-à-dire la seule vue aveugle à tout cela : le
//! catalogue est construit depuis la table des versions actives, et ce qui n'a plus de pointeur
//! en est absent par construction. Un dossier de dérivés de trois cents mégaoctets pouvait donc
//! rester sur le disque et ne paraître nulle part.
//!
//! Il **relève** maintenant ce que plus rien ne nomme : les dossiers de dérivés, les
//! enregistrements de version, les sources. Il **n'efface rien** — un relevé qui effacerait
//! serait un second retrait, non une mesure — et il n'y a pas d'écran : les restes d'un retrait
//! en cours sont dits par son compte rendu, ce relevé-ci sert à voir ce qu'une bibliothèque
//! porte déjà.
//!
//! **Une source sans pointeur n'est pas forcément orpheline** : un média déposé — un fichier
//! sonore qui accompagne un livre — reçoit une source et une entrée dans `base/medias.json`,
//! sans travail ni pointeur. Le relevé les écarte donc, et dit combien il en a écartés.

use lienotheque_bureau::{apercus_de, depot::Depot};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

/// Ce qu'une bibliothèque porte et que plus rien ne nomme. **Lecture seule, sans exception.**
struct Orphelins {
    derives: Vec<PathBuf>,
    versions: Vec<PathBuf>,
    sources: Vec<PathBuf>,
    medias_ecartes: usize,
}

/// Les noms de version que la bibliothèque **revendique** : par un pointeur actif, ou par un
/// travail qui les visait. Une version nommée par un travail n'est pas orpheline — c'est une
/// version précédente d'un document, gardée à dessein.
fn versions_revendiquees(depot: &Depot) -> BTreeSet<String> {
    let mut noms: BTreeSet<String> = BTreeSet::new();
    if let Ok(actives) = depot.actives() {
        for pointeur in actives.values() {
            noms.insert(pointeur.version.clone());
        }
    }
    if let Ok(entrees) = fs::read_dir(depot.travaux()) {
        for entree in entrees.flatten() {
            let Ok(texte) = fs::read_to_string(entree.path()) else { continue };
            let Ok(lu) = serde_json::from_str::<serde_json::Value>(&texte) else { continue };
            if let Some(cible) = lu["version_cible"].as_str() {
                noms.insert(cible.to_owned());
            }
        }
    }
    noms
}

fn noms_des_entrees(dossier: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entrees) = fs::read_dir(dossier) else { return Vec::new() };
    entrees
        .flatten()
        .filter_map(|entree| {
            let chemin = entree.path();
            let nom = chemin.file_stem()?.to_str()?.to_owned();
            Some((nom, chemin))
        })
        .collect()
}

fn relever(depot: &Depot) -> Orphelins {
    let revendiquees = versions_revendiquees(depot);
    let actives = depot.actives().unwrap_or_default();
    let medias: BTreeSet<String> = depot
        .medias()
        .unwrap_or_default()
        .into_iter()
        .map(|media| media.empreinte)
        .collect();

    let derives = noms_des_entrees(&depot.racine().join(lienotheque_bureau::depot::DERIVES))
        .into_iter()
        .filter(|(nom, _)| !revendiquees.contains(nom))
        .map(|(_, chemin)| chemin)
        .collect();

    let versions = noms_des_entrees(&depot.racine().join(lienotheque_bureau::depot::BASE).join(lienotheque_bureau::depot::VERSIONS))
        .into_iter()
        .filter(|(nom, _)| !revendiquees.contains(nom))
        .map(|(_, chemin)| chemin)
        .collect();

    // Les sources sont rangées par paliers de deux caractères : on descend d'un cran.
    let mut sources: Vec<PathBuf> = Vec::new();
    let mut medias_ecartes = 0;
    let paliers = noms_des_entrees(&depot.racine().join(lienotheque_bureau::depot::SOURCES));
    for (_, palier) in paliers {
        if !palier.is_dir() {
            continue;
        }
        for (empreinte, chemin) in noms_des_entrees(&palier) {
            if actives.contains_key(&empreinte) {
                continue;
            }
            if medias.contains(&empreinte) {
                medias_ecartes += 1;
                continue;
            }
            sources.push(chemin);
        }
    }

    Orphelins { derives, versions, sources, medias_ecartes }
}

fn dire(titre: &str, chemins: &[PathBuf]) {
    if chemins.is_empty() {
        println!("  {titre} : aucun");
        return;
    }
    println!("  {titre} : {}", chemins.len());
    for chemin in chemins {
        println!("    {}", chemin.display());
    }
}

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    let (Some(racine), Some(debut)) = (arguments.next(), arguments.next()) else {
        eprintln!("Attendu : <racine> <empreinte ou début d'empreinte>");
        return ExitCode::from(2);
    };

    let depot = match Depot::ouvrir(&PathBuf::from(&racine)) {
        Ok(ouvert) => ouvert,
        Err(souci) => {
            eprintln!("Bibliothèque introuvable : {souci}");
            return ExitCode::from(1);
        }
    };
    let actives = match depot.actives() {
        Ok(table) => table,
        Err(souci) => {
            eprintln!("Versions actives illisibles : {souci}");
            return ExitCode::from(1);
        }
    };
    let candidates: Vec<String> = actives.keys().filter(|clef| clef.starts_with(&debut)).cloned().collect();
    let [empreinte] = &candidates[..] else {
        eprintln!("« {debut} » désigne {} documents : il en faut exactement un.", candidates.len());
        return ExitCode::from(2);
    };

    let titres = lienotheque_bureau::titres_de(&depot);
    let nom = lienotheque_bureau::titre_ou_empreinte(&titres, empreinte);
    println!("Avant : {} document(s) actif(s)", actives.len());
    println!("À retirer : {nom}\n");

    let retrait = match depot.retirer_document(empreinte) {
        Ok(compte) => compte,
        Err(souci) => {
            eprintln!("Retrait impossible : {souci}");
            return ExitCode::from(1);
        }
    };
    println!("{} version(s) et {} travail/travaux effacés", retrait.versions, retrait.travaux);
    match &retrait.source {
        Some(ou) => println!("Source à la corbeille : {}", ou.display()),
        None => println!("Aucune source à jeter : il n'en avait plus."),
    }

    println!("Travaux illisibles ou abîmés : {}", retrait.travaux_illisibles);
    if retrait.restes.is_empty() {
        println!("Rien n'a résisté.");
    } else {
        println!("\n{} élément(s) n'ont pas pu être effacés :", retrait.restes.len());
        for reste in &retrait.restes {
            println!("  {} — {}", reste.quoi, reste.chemin.display());
            println!("    {}", reste.cause);
        }
    }

    // Ce qui reste, lu comme le catalogue le lit. Nécessaire, et PAS suffisant : le catalogue
    // vient de la table des versions actives, donc tout ce qui n'a plus de pointeur en est absent
    // par construction — c'est exactement ce qu'un relevé d'orphelins doit montrer.
    match apercus_de(&racine) {
        Ok(apercus) => {
            println!("\nAprès : {} document(s) au catalogue", apercus.len());
            for apercu in &apercus {
                println!("  {}", apercu["nom"].as_str().unwrap_or("(sans nom)"));
            }
        }
        Err(souci) => eprintln!("\nCatalogue illisible après le retrait : {souci}"),
    }

    // Et ce que plus rien ne nomme, sur le disque. **Lecture seule.**
    let orphelins = relever(&depot);
    println!("\nCe que plus rien ne nomme (relevé en lecture seule, rien n'est effacé) :");
    dire("dossiers de dérivés", &orphelins.derives);
    dire("enregistrements de version", &orphelins.versions);
    dire("sources", &orphelins.sources);
    if orphelins.medias_ecartes > 0 {
        println!(
            "  {} source(s) de média écartée(s) : un média déposé n'a pas de pointeur, et ce n'est pas un orphelin",
            orphelins.medias_ecartes,
        );
    }
    ExitCode::SUCCESS
}
