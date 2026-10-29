//! Retraite une sélection déjà rangée sans toucher à la description, aux classements ni aux
//! anciennes versions de la bibliothèque.
//!
//! Le manifeste est une liste JSON dont chaque entrée porte au moins `nom` et `source`. Le nom
//! de fichier de `source` est l'empreinte déjà rangée dans `sources/`.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use lienotheque_bureau::depot::Depot;
use lienotheque_bureau::roulement::Roulement;
use lienotheque_bureau::traitement::Emplacements;
use lienotheque_bureau::{file, travail};
use serde::Deserialize;

#[derive(Deserialize)]
struct Entree {
    nom: String,
    source: PathBuf,
}

fn travail_a_reprendre(travaux: &[travail::Travail], empreinte: &str) -> Option<String> {
    travaux
        .iter()
        .find(|un| {
            un.empreinte.as_deref() == Some(empreinte)
                && !matches!(un.etat.as_str(), "termine" | "annule" | "en_echec_definitif")
        })
        .map(|un| un.id.clone())
}

fn sujet_pour_retraitement(
    travaux: &[travail::Travail],
    empreinte: &str,
    nom: &str,
) -> travail::Sujet {
    let mut provenances_medias = travaux
        .iter()
        .filter(|un| un.empreinte.as_deref() == Some(empreinte))
        .filter_map(|un| un.sujet.as_ref())
        .flat_map(|sujet| sujet.provenances_medias.iter().cloned())
        .collect::<Vec<_>>();
    provenances_medias.sort();
    provenances_medias.dedup();
    travail::Sujet {
        nom: nom.to_owned(),
        contenu: "documents".to_owned(),
        medias_accompagnants: true,
        provenances_medias,
    }
}

#[cfg(test)]
mod provenance_tests {
    use super::*;

    #[test]
    fn un_retraitement_conserve_toutes_les_provenances_du_document() {
        let mut ancien = travail::Travail::neuf("ancien", "traitement-de-lot", 0);
        ancien.empreinte = Some("empreinte".to_owned());
        ancien.sujet = Some(travail::Sujet {
            nom: "ancien.pdf".to_owned(),
            contenu: "documents".to_owned(),
            medias_accompagnants: true,
            provenances_medias: vec!["zip:b".to_owned(), "zip:a".to_owned()],
        });
        let sujet = sujet_pour_retraitement(&[ancien], "empreinte", "nouveau.pdf");
        assert_eq!(sujet.provenances_medias, ["zip:a", "zip:b"]);
    }
}

fn main() -> Result<(), String> {
    let mut arguments = std::env::args().skip(1);
    let racine = PathBuf::from(arguments.next().ok_or("Attendu : <bibliothèque> <manifest.json>")?);
    let manifeste = PathBuf::from(arguments.next().ok_or("Attendu : <bibliothèque> <manifest.json>")?);
    if arguments.next().is_some() {
        return Err("Trop d’arguments : attendu <bibliothèque> <manifest.json>".to_owned());
    }

    let entrees: Vec<Entree> = serde_json::from_slice(&fs::read(&manifeste).map_err(|e| format!("manifeste : {e}"))?)
        .map_err(|e| format!("manifeste JSON : {e}"))?;
    let depot = Depot::ouvrir(&racine).map_err(|e| format!("bibliothèque : {e}"))?;
    fs::create_dir_all(depot.travaux()).map_err(|e| format!("travaux : {e}"))?;
    let existants = file::charger_tout(&depot.travaux(), &mut |message| eprintln!("file : {message}"))
        .map_err(|e| format!("file : {e}"))?;

    let mut ids = HashSet::new();
    for entree in &entrees {
        let empreinte = entree
            .source
            .file_stem()
            .and_then(|un| un.to_str())
            .ok_or_else(|| format!("empreinte absente du chemin : {}", entree.source.display()))?;
        if empreinte.len() != 64 || !empreinte.bytes().all(|un| un.is_ascii_hexdigit()) {
            return Err(format!("empreinte invalide dans le manifeste : {empreinte}"));
        }
        let extension = entree.source.extension().and_then(|un| un.to_str()).unwrap_or("pdf");
        let source_rangee = depot.source(empreinte, extension);
        if !source_rangee.exists() {
            return Err(format!("source rangée absente : {}", source_rangee.display()));
        }

        if let Some(id) = travail_a_reprendre(&existants, empreinte) {
            println!("Travail existant repris : {} — {}", &id[..8.min(id.len())], entree.nom);
            ids.insert(id);
            continue;
        }

        let id = uuid::Uuid::new_v4().to_string();
        let mut nouveau = travail::Travail::neuf(&id, "traitement-de-lot", 0);
        nouveau.version_cible = uuid::Uuid::new_v4().to_string();
        nouveau.sujet = Some(sujet_pour_retraitement(&existants, empreinte, &entree.nom));
        nouveau.empreinte = Some(empreinte.to_owned());
        file::enregistrer(&depot.travaux(), &nouveau).map_err(|e| format!("mise en file : {e}"))?;
        ids.insert(id);
    }

    let manifeste_cargo = Path::new(env!("CARGO_MANIFEST_DIR"));
    let node = manifeste_cargo.join("moteurs/bin/node");
    let chaine = manifeste_cargo.join("moteurs/chaine/moteur.js");
    for requis in [&node, &chaine] {
        if !requis.exists() {
            return Err(format!("moteur absent : {}", requis.display()));
        }
    }

    println!("Retraitement ciblé : {} document(s)", ids.len());
    let roulement = Roulement::demarrer(
        Depot::ouvrir(&racine).map_err(|e| format!("dépôt : {e}"))?,
        Emplacements { node, chaine },
        uuid::Uuid::new_v4().to_string(),
        racine.join("cache"),
    );
    let depart = Instant::now();
    let mut conclus = HashSet::new();
    let mut echecs = Vec::new();
    while conclus.len() < ids.len() {
        std::thread::sleep(Duration::from_secs(2));
        let travaux = file::charger_tout(&depot.travaux(), &mut |message| eprintln!("file : {message}"))
            .map_err(|e| format!("file : {e}"))?;
        for courant in travaux.iter().filter(|un| ids.contains(&un.id)) {
            if !matches!(courant.etat.as_str(), "termine" | "en_echec_definitif" | "annule") || !conclus.insert(courant.id.clone()) {
                continue;
            }
            let nom = courant.sujet.as_ref().map(|un| un.nom.as_str()).unwrap_or("sans nom");
            println!("[{:.0} s] {} — {nom}", depart.elapsed().as_secs_f64(), courant.etat);
            if courant.etat != "termine" {
                echecs.push(format!("{nom} : {}", courant.cause.as_deref().unwrap_or("cause absente")));
            }
        }
    }
    roulement.arreter();

    if echecs.is_empty() {
        println!("Retraitement terminé : {}/{} réussis", conclus.len(), ids.len());
        Ok(())
    } else {
        Err(format!("{} échec(s) :\n{}", echecs.len(), echecs.join("\n")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reprend_un_travail_non_terminal_de_la_meme_empreinte() {
        let mut existant = travail::Travail::neuf("deja-la", "traitement-de-lot", 0);
        existant.empreinte = Some("a".repeat(64));
        existant.etat = "en_file".to_owned();
        assert_eq!(travail_a_reprendre(&[existant], &"a".repeat(64)), Some("deja-la".to_owned()));
    }

    #[test]
    fn ne_reprend_pas_un_travail_termine() {
        let mut existant = travail::Travail::neuf("fini", "traitement-de-lot", 0);
        existant.empreinte = Some("b".repeat(64));
        existant.etat = "termine".to_owned();
        assert_eq!(travail_a_reprendre(&[existant], &"b".repeat(64)), None);
    }
}
