//! Rattache des fichiers déjà présents à leur groupe d'origine, sans réimporter leur contenu.
//!
//! Le manifeste est produit par une comparaison d'empreintes indépendante. Sans `--appliquer`,
//! cette commande ne fait qu'en vérifier chaque ligne. L'application explicite est reprenable :
//! une provenance déjà écrite à l'identique est acceptée, toute provenance différente est
//! refusée plutôt qu'écrasée.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use lienotheque_bureau::depot::{Depot, MediaDepose};
use lienotheque_bureau::{file, travail};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
struct Rattachement {
    empreinte: String,
    provenance: String,
}

#[derive(Debug, Deserialize)]
struct Manifeste {
    #[serde(default, rename = "remplacerMediasExistants")]
    remplacer_medias_existants: bool,
    medias: Vec<Rattachement>,
    documents: Vec<Rattachement>,
}

#[derive(Debug)]
struct Plan {
    medias: Vec<MediaDepose>,
    travaux: Vec<travail::Travail>,
    medias_deja_faits: usize,
    medias_corriges: usize,
    travaux_deja_faits: usize,
    travaux_corriges: usize,
}

fn provenance_valide(provenance: &str) -> bool {
    provenance
        .strip_prefix("zip:")
        .is_some_and(|empreinte| empreinte.len() == 64 && empreinte.bytes().all(|octet| octet.is_ascii_hexdigit()))
}

fn empreinte_valide(empreinte: &str) -> bool {
    empreinte.len() == 64 && empreinte.bytes().all(|octet| octet.is_ascii_hexdigit())
}

fn sans_doublon(lignes: &[Rattachement], nature: &str) -> Result<(), String> {
    let mut vues = HashSet::new();
    for ligne in lignes {
        if !empreinte_valide(&ligne.empreinte) {
            return Err(format!("empreinte {nature} invalide : {}", ligne.empreinte));
        }
        if !provenance_valide(&ligne.provenance) {
            return Err(format!("provenance {nature} invalide : {}", ligne.provenance));
        }
        if !vues.insert(&ligne.empreinte) {
            return Err(format!("empreinte {nature} répétée : {}", ligne.empreinte));
        }
    }
    Ok(())
}

fn preparer(depot: &Depot, manifeste: &Manifeste) -> Result<Plan, String> {
    sans_doublon(&manifeste.medias, "média")?;
    sans_doublon(&manifeste.documents, "document")?;

    let inventaire = depot.medias().map_err(|e| format!("inventaire des médias : {e}"))?;
    let medias_connus: HashMap<&str, &MediaDepose> = inventaire.iter().map(|media| (media.empreinte.as_str(), media)).collect();
    let actives = depot.actives().map_err(|e| format!("documents actifs : {e}"))?;
    let travaux = file::charger_tout(&depot.travaux(), &mut |message| eprintln!("file : {message}"))
        .map_err(|e| format!("file : {e}"))?;

    let mut medias_a_ecrire = Vec::new();
    let mut medias_deja_faits = 0;
    let mut medias_corriges = 0;
    for ligne in &manifeste.medias {
        let connu = medias_connus
            .get(ligne.empreinte.as_str())
            .ok_or_else(|| format!("média absent de l'inventaire : {}", ligne.empreinte))?;
        let source = depot.source(&connu.empreinte, &connu.extension);
        if !source.is_file() {
            return Err(format!("source du média absente : {}", source.display()));
        }
        match connu.provenances.as_slice() {
            [] => {
                let mut enrichi = (*connu).clone();
                enrichi.provenances.push(ligne.provenance.clone());
                medias_a_ecrire.push(enrichi);
            }
            [provenance] if provenance == &ligne.provenance => medias_deja_faits += 1,
            _ if manifeste.remplacer_medias_existants => {
                let mut corrige = (*connu).clone();
                corrige.provenances = vec![ligne.provenance.clone()];
                medias_a_ecrire.push(corrige);
                medias_corriges += 1;
            }
            autres => {
                return Err(format!(
                    "le média {} porte déjà une provenance différente : {:?}",
                    ligne.empreinte, autres
                ));
            }
        }
    }

    let demandes: BTreeMap<&str, &str> = manifeste
        .documents
        .iter()
        .map(|ligne| (ligne.empreinte.as_str(), ligne.provenance.as_str()))
        .collect();
    for empreinte in demandes.keys() {
        if !actives.contains_key(*empreinte) {
            return Err(format!("document non actif ou absent : {empreinte}"));
        }
    }

    let mut documents_vus = HashSet::new();
    let mut travaux_a_ecrire = Vec::new();
    let mut travaux_deja_faits = 0;
    let mut travaux_corriges = 0;
    for courant in travaux {
        let Some(empreinte) = courant.empreinte.as_deref() else { continue };
        let Some(provenance) = demandes.get(empreinte) else { continue };
        documents_vus.insert(empreinte.to_owned());
        let mut enrichi = courant.clone();
        let sujet = enrichi
            .sujet
            .as_mut()
            .ok_or_else(|| format!("travail sans sujet pour le document {empreinte}"))?;
        if sujet.provenances_medias.iter().any(|connue| connue == provenance) {
            travaux_deja_faits += 1;
            continue;
        }
        if sujet.provenances_medias.is_empty() {
            sujet.provenances_medias.push((*provenance).to_owned());
        } else {
            // Les documents sont précisément la partie que ce retraçage répare : certains
            // portent encore le groupe emprunté lors du tout premier essai. Le manifeste est
            // fermé aux documents actifs et fondé sur l'empreinte des octets dans le ZIP ; il
            // remplace donc cette ancienne attribution au lieu de la conserver à côté.
            sujet.provenances_medias = vec![(*provenance).to_owned()];
            travaux_corriges += 1;
        }
        travaux_a_ecrire.push(enrichi);
    }
    let absents = demandes
        .keys()
        .filter(|empreinte| !documents_vus.contains(**empreinte))
        .copied()
        .collect::<Vec<_>>();
    if !absents.is_empty() {
        return Err(format!("document(s) sans travail : {}", absents.join(", ")));
    }

    Ok(Plan {
        medias: medias_a_ecrire,
        travaux: travaux_a_ecrire,
        medias_deja_faits,
        medias_corriges,
        travaux_deja_faits,
        travaux_corriges,
    })
}

fn appliquer(depot: &Depot, plan: Plan) -> Result<(usize, usize), String> {
    let medias = plan.medias.len();
    let travaux = plan.travaux.len();
    for media in plan.medias {
        depot
            .remplacer_provenances_media(&media.empreinte, media.provenances)
            .map_err(|e| format!("écriture du média : {e}"))?;
    }
    for courant in plan.travaux {
        file::enregistrer(&depot.travaux(), &courant).map_err(|e| format!("écriture du travail {} : {e}", courant.id))?;
    }
    Ok((medias, travaux))
}

fn main() -> Result<(), String> {
    let mut arguments = std::env::args().skip(1);
    let racine = PathBuf::from(arguments.next().ok_or("Attendu : <bibliothèque> <manifest.json> [--appliquer]")?);
    let chemin_manifeste = PathBuf::from(arguments.next().ok_or("Attendu : <bibliothèque> <manifest.json> [--appliquer]")?);
    let appliquer_vraiment = match arguments.next().as_deref() {
        None => false,
        Some("--appliquer") => true,
        Some(autre) => return Err(format!("option inconnue : {autre}")),
    };
    if arguments.next().is_some() {
        return Err("Trop d'arguments".to_owned());
    }

    let manifeste: Manifeste = serde_json::from_slice(
        &fs::read(&chemin_manifeste).map_err(|e| format!("manifeste {} : {e}", chemin_manifeste.display()))?,
    )
    .map_err(|e| format!("manifeste JSON : {e}"))?;
    let depot = Depot::ouvrir(&racine).map_err(|e| format!("bibliothèque : {e}"))?;
    let plan = preparer(&depot, &manifeste)?;
    println!("Médias ciblés    : {}", manifeste.medias.len());
    println!("Documents ciblés : {}", manifeste.documents.len());
    println!(
        "Médias à écrire  : {} ({} déjà faits, {} anciennes provenances à corriger)",
        plan.medias.len(), plan.medias_deja_faits, plan.medias_corriges
    );
    println!(
        "Travaux à écrire : {} ({} déjà faits, {} anciennes provenances à corriger)",
        plan.travaux.len(), plan.travaux_deja_faits, plan.travaux_corriges
    );
    if !appliquer_vraiment {
        println!("Lecture seule : ajoutez --appliquer après vérification du rapport.");
        return Ok(());
    }
    let (medias, travaux) = appliquer(&depot, plan)?;
    println!("Écriture terminée : {medias} média(s), {travaux} travail/travaux.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lien(empreinte: char, provenance: char) -> Rattachement {
        Rattachement {
            empreinte: empreinte.to_string().repeat(64),
            provenance: format!("zip:{}", provenance.to_string().repeat(64)),
        }
    }

    #[test]
    fn le_prevol_necrit_rien_et_l_application_ne_change_que_les_provenances() {
        let bac = tempfile::tempdir().expect("bac");
        for dossier in ["sources", "derives", "base"] {
            fs::create_dir(bac.path().join(dossier)).expect("structure");
        }
        let depot = Depot::ouvrir(bac.path()).expect("dépôt");
        let media = MediaDepose {
            empreinte: "a".repeat(64),
            nom: "piste.mp3".to_owned(),
            contenu: "audio".to_owned(),
            extension: "mp3".to_owned(),
            provenances: vec!["zip:".to_owned() + &"d".repeat(64)],
        };
        let source_media = depot.source(&media.empreinte, &media.extension);
        fs::create_dir_all(source_media.parent().expect("palier")).expect("palier");
        fs::write(&source_media, b"audio").expect("source média");
        depot.enregistrer_media(media.clone()).expect("inventaire");

        let empreinte_document = "b".repeat(64);
        let mut courant = travail::Travail::neuf("travail", "traitement-de-lot", 0);
        courant.empreinte = Some(empreinte_document.clone());
        courant.sujet = Some(travail::Sujet {
            nom: "methode.pdf".to_owned(),
            contenu: "documents".to_owned(),
            medias_accompagnants: true,
            provenances_medias: vec!["zip:".to_owned() + &"d".repeat(64)],
        });
        file::enregistrer(&depot.travaux(), &courant).expect("travail");
        depot.ecrire_version("version", "{}").expect("version");
        depot.activer(&empreinte_document, "version", 1).expect("active");

        let sans_autorisation = Manifeste {
            remplacer_medias_existants: false,
            medias: vec![lien('a', 'c')],
            documents: vec![lien('b', 'c')],
        };
        assert!(
            preparer(&depot, &sans_autorisation)
                .expect_err("une ancienne provenance média exige une autorisation explicite")
                .contains("provenance différente")
        );

        let manifeste = Manifeste {
            remplacer_medias_existants: true,
            medias: vec![lien('a', 'c')],
            documents: vec![lien('b', 'c')],
        };
        let avant_media = depot.medias().expect("médias avant");
        let avant_travail = file::charger_tout(&depot.travaux(), &mut |_| {}).expect("travaux avant");
        let plan = preparer(&depot, &manifeste).expect("prévol");
        assert_eq!(depot.medias().expect("médias après prévol"), avant_media);
        assert_eq!(file::charger_tout(&depot.travaux(), &mut |_| {}).expect("travaux après prévol"), avant_travail);

        assert_eq!(appliquer(&depot, plan).expect("application"), (1, 1));
        let enrichi = depot.medias().expect("média enrichi").remove(0);
        assert_eq!(enrichi, MediaDepose { provenances: vec!["zip:".to_owned() + &"c".repeat(64)], ..media });
        let travail_enrichi = file::charger_tout(&depot.travaux(), &mut |_| {}).expect("travail enrichi").remove(0);
        assert_eq!(travail_enrichi.sujet.expect("sujet").provenances_medias, ["zip:".to_owned() + &"c".repeat(64)]);
    }
}
