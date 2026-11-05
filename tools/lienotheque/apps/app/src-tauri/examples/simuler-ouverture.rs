//! Ce que l'ouverture d'une bibliothèque ÉCRIT, mesuré sur une copie.
//!
//! `Depot::ouvrir` lance `migrer_les_actives`, qui peut réécrire `base/actives.json`. La question
//! qu'on lui pose ici : une entrée posée à la main — celle que R2 a écrite — survit-elle à
//! l'ouverture, ou le rattrapage la remet-il sur l'ancienne version ?
//!
//! On ne la pose pas au code en le lisant : on la pose en l'exécutant, sur une COPIE, jamais sur
//! une vraie bibliothèque. Le programme refuse d'ailleurs de travailler ailleurs que sur un
//! dossier dont le nom le dit.
//!
//! Il relève l'empreinte de chaque fichier avant et après, et nomme tout ce qui a changé — pas
//! seulement ce qu'on s'attendait à voir changer.
//!
//! Usage : cargo run --example simuler-ouverture -- <copie> <préfixe-du-document>
use lienotheque_bureau::depot::Depot;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::{fs, io};

fn empreintes(racine: &Path) -> BTreeMap<String, String> {
    let mut vus = BTreeMap::new();
    let mut piles = vec![racine.to_path_buf()];
    while let Some(dossier) = piles.pop() {
        let Ok(entrees) = fs::read_dir(&dossier) else { continue };
        for entree in entrees.flatten() {
            let chemin = entree.path();
            if chemin.is_dir() {
                piles.push(chemin);
            } else if let Ok(octets) = fs::read(&chemin) {
                let relatif = chemin.strip_prefix(racine).unwrap_or(&chemin).display().to_string();
                vus.insert(relatif, format!("{:x}", Sha256::digest(&octets)));
            }
        }
    }
    vus
}

fn actives(racine: &Path) -> BTreeMap<String, serde_json::Value> {
    let texte = fs::read_to_string(racine.join("base/actives.json")).unwrap_or_default();
    serde_json::from_str(&texte).unwrap_or_default()
}

fn main() -> io::Result<()> {
    let racine = PathBuf::from(std::env::args().nth(1).expect("argument 1 : la copie"));
    let prefixe = std::env::args().nth(2).expect("argument 2 : le préfixe du document");

    // Un garde-fou qui ne dépend pas de ma vigilance : le nom du dossier doit dire que c'est une
    // copie. Une vraie bibliothèque ne s'appelle pas « copie-simulation ».
    let nom = racine.file_name().unwrap_or_default().to_string_lossy().to_string();
    if !nom.contains("copie-simulation") {
        eprintln!("Refus : « {nom} » ne porte pas « copie-simulation » dans son nom.");
        std::process::exit(2);
    }

    let avant_f = empreintes(&racine);
    let avant_a = actives(&racine);
    println!("avant  : {} fichiers · {} entrées actives", avant_f.len(), avant_a.len());
    let cle_avant = avant_a.keys().find(|c| c.starts_with(&prefixe)).cloned();
    println!(
        "avant  : {prefixe} → {}",
        cle_avant.as_ref().map_or("ABSENT".into(), |c| avant_a[c]["version"].as_str().unwrap_or("?").to_string())
    );

    // L'ouverture. C'est elle qu'on mesure, et rien d'autre.
    let _depot = Depot::ouvrir(&racine)?;

    let apres_f = empreintes(&racine);
    let apres_a = actives(&racine);
    println!("après  : {} fichiers · {} entrées actives", apres_f.len(), apres_a.len());
    let cle_apres = apres_a.keys().find(|c| c.starts_with(&prefixe)).cloned();
    println!(
        "après  : {prefixe} → {}",
        cle_apres.as_ref().map_or("ABSENT".into(), |c| apres_a[c]["version"].as_str().unwrap_or("?").to_string())
    );

    let mut changements = Vec::new();
    for (chemin, empreinte) in &apres_f {
        match avant_f.get(chemin) {
            None => changements.push(format!("CRÉÉ     {chemin}")),
            Some(ancienne) if ancienne != empreinte => changements.push(format!("MODIFIÉ  {chemin}")),
            _ => {}
        }
    }
    for chemin in avant_f.keys() {
        if !apres_f.contains_key(chemin) {
            changements.push(format!("SUPPRIMÉ {chemin}"));
        }
    }
    println!("\n── ce que l'ouverture a écrit ──");
    if changements.is_empty() {
        println!("  RIEN : aucun fichier créé, modifié ou supprimé.");
    } else {
        for c in &changements {
            println!("  {c}");
        }
    }

    let mut entrees_changees: Vec<String> = Vec::new();
    for (cle, valeur) in &apres_a {
        if avant_a.get(cle) != Some(valeur) {
            entrees_changees.push(cle[..8.min(cle.len())].to_string());
        }
    }
    for cle in avant_a.keys() {
        if !apres_a.contains_key(cle) {
            entrees_changees.push(format!("retirée {}", &cle[..8.min(cle.len())]));
        }
    }
    println!("\n── entrées de actives.json modifiées ──");
    println!("  {}", if entrees_changees.is_empty() { "aucune".to_string() } else { entrees_changees.join(", ") });
    Ok(())
}
