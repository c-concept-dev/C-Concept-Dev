//! L'essai de la file sur dix documents réels (JOB-01 à JOB-09, BAS-02)
//!
//! ```sh
//! LIENOTHEQUE_CORPUS="/chemin/du/corpus" \
//!   cargo test --manifest-path apps/app/src-tauri/Cargo.toml \
//!   --test essai-de-la-file -- --ignored --nocapture
//! ```
//!
//! ## Pourquoi cet essai, et pourquoi il ne pouvait pas être un banc de plus
//!
//! Le coût d'un réimport a été mesuré à une dizaine d'heures — **sur la chaîne seule**, document
//! par document, en appelant `executerTravail` depuis Node. Or l'application ne traite pas ainsi :
//! elle met les travaux en file, et l'hôte lance **un processus par travail**, écrit un instantané
//! par version, pose un pointeur d'activation. Rien de tout cela n'était mesuré, et la file n'avait
//! jamais porté plus d'une poignée de documents.
//!
//! Cet essai fait tourner **la vraie file** — `Roulement`, son fil, son bail, ses reprises — sur
//! les dix documents qui ont servi à mesurer la chaîne. Il rend le surcoût réel.
//!
//! ## Ce qu'il n'est pas
//!
//! Il n'éprouve pas la justesse de ce qui est lu : d'autres épreuves s'en chargent, et le critère
//! des citations a été vérifié ailleurs. Il mesure **le temps et les blocages**.
//!
//! ## Les œuvres restent dehors
//!
//! Le corpus est un argument, jamais un chemin écrit ici (règle 5). Sans lui, l'essai se dit
//! impossible et s'arrête : il ne réussit pas en silence.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use lienotheque_bureau::depot::Depot;
use lienotheque_bureau::roulement::{Roulement, MANIERES, RECETTE};
use lienotheque_bureau::traitement::Emplacements;
use lienotheque_bureau::{arrivee, file, travail};

/// Les dix documents de la mesure de coût, pour que les deux chiffres se comparent.
const DIX: [&str; 10] = [
    "PSYCHO/DSM-5 2.pdf",
    "Therapie Manuelle/Therapeutique manuelle.pdf",
    "COUPLE/Biologie du couple - Jean-Didier Vincent.pdf",
    "COUPLE/L' Intelligence du coeur -  Isabelle Filliozat.epub",
    "SEXO/Je jouis comme je suis. Guide pour une sexualité féminine épanouie (Emily Nagoski) (Z-Library).epub",
    "Hypnose/Philippe Aïm - L’hypnose en situation durgence.epub",
    "Tabac/Protocole_tabac.pdf",
    "IRIS SCAN/dossier 3/SCHEMAS/1. Schémas 2021 - Introduction.pdf",
    "SCHEMAS et TCC/La therapie d'acceptation et d'engagement F Midal.pdf",
    "IRIS SCAN/Theorie ACT Que sais-je.pdf",
];

/// Une bibliothèque d'essai : les mots, le schéma, et rien du domaine dans ce fichier (CLA-01).
const DESCRIPTION: &str = r#"{
  "id": "essai-de-la-file",
  "nom": "Essai",
  "mots": {
    "element": { "un": "élément", "plusieurs": "éléments" },
    "piste": { "un": "piste", "plusieurs": "pistes" },
    "page": { "un": "page", "plusieurs": "pages" }
  },
  "schema": {
    "cle": "essai", "nom": "Essai", "langue": "fr", "version": 1,
    "axes": [{
      "cle": "un-axe", "nom": "Un axe", "nature": "referentiel", "cardinalite": "une",
      "structure": "plat", "obligatoire": false, "alias": [],
      "valeurs": [{ "cle": "une", "nom": "Une valeur", "alias": [], "synonymes": [], "retiree": false }]
    }]
  }
}"#;

/// La manière de lire par défaut. **Aucune déclaration de double page** : c'est au document de
/// répondre, comme pour une bibliothèque qu'un administrateur n'a pas réglée.
const MANIERE: &str = r#"{
  "id": "livre-ordinaire", "version": 1, "derivee_de": null,
  "preparation": { "redressement": "aucun" },
  "lectures": [{ "ancre": "page_imprimee",
    "zone": { "type": "rectangle_rel", "x": 0.05, "y": 0.86, "l": 0.9, "h": 0.12 },
    "alphabet": "chiffres" }],
  "regles": { "elements": { "ordre": "strictement_croissant", "saut_max": 12 },
    "plusieurs_elements_par_piste": false },
  "validation": { "seuil_confiance": 0.6 }
}"#;

/// Le moteur rassemblé par `preparer-moteur-node.py`. Absent, l'essai ne peut rien lancer.
fn moteur() -> Option<PathBuf> {
    let chaine = Path::new(env!("CARGO_MANIFEST_DIR")).join("moteurs/chaine/moteur.js");
    chaine.exists().then_some(chaine)
}

fn uuid(n: usize) -> String {
    format!("0190f0a0-0000-7000-8000-{:012}", n)
}

#[test]
#[ignore = "demande le corpus réel et le moteur rassemblé ; se lance à la main"]
fn dix_documents_par_la_file() {
    let Ok(corpus) = std::env::var("LIENOTHEQUE_CORPUS") else {
        panic!("LIENOTHEQUE_CORPUS manquant : cet essai ne réussit pas en silence.");
    };
    let corpus = PathBuf::from(corpus);
    let Some(chaine) = moteur() else {
        panic!("moteur introuvable : lancez d'abord `python apps/app/src-tauri/outils/preparer-moteur-node.py`.");
    };
    let node = which_node().expect("node absent du chemin");

    // La bibliothèque, dans un bac temporaire.
    let bac = std::env::temp_dir().join(format!("lienotheque-essai-file-{}", std::process::id()));
    fs::remove_dir_all(&bac).ok();
    let racine = bac.join("bibliotheque");
    let depot = Depot::ouvrir(&racine).expect("bibliothèque");
    let base = racine.join("base");
    fs::create_dir_all(&base).expect("base");
    fs::write(base.join("bibliotheque.json"), DESCRIPTION).expect("description");
    fs::write(base.join(RECETTE), MANIERE).expect("manière de lire");
    fs::write(base.join(MANIERES), b"{}").expect("affectations");
    fs::create_dir_all(depot.travaux()).expect("dossier des travaux");

    // Les sources, rangées sous leur empreinte comme l'application les range.
    let mut attendus = Vec::new();
    for (rang, relatif) in DIX.iter().enumerate() {
        let source = corpus.join(relatif);
        assert!(source.exists(), "document introuvable : {}", source.display());
        let empreinte = arrivee::empreinte_de(&source).expect("empreinte");
        let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_lowercase();
        let rangee = depot.source(&empreinte, &extension);
        fs::create_dir_all(rangee.parent().expect("palier")).expect("palier");
        fs::copy(&source, &rangee).expect("copie de la source");

        let mut t = travail::Travail::neuf(&uuid(rang + 1), "traitement-de-lot", 0);
        t.version_cible = uuid(100 + rang);
        t.sujet = Some(travail::Sujet {
            nom: source.file_name().expect("nom").to_string_lossy().into_owned(),
            contenu: "documents".to_owned(),
            medias_accompagnants: true,
            provenances_medias: Vec::new(),
        });
        t.empreinte = Some(empreinte);
        file::enregistrer(&depot.travaux(), &t).expect("mise en file");
        attendus.push((t.id.clone(), relatif.to_string()));
    }

    eprintln!("\n  {} travaux en file, le roulement démarre…\n", attendus.len());

    let depart = Instant::now();
    let roulement = Roulement::demarrer(
        Depot::ouvrir(&racine).expect("dépôt du roulement"),
        Emplacements { node, chaine },
        uuid(999),
        bac.join("cache"),
    );

    // On regarde la file jusqu'à ce que plus rien n'y bouge. Le plafond est large : l'essai doit
    // pouvoir dire « bloqué » plutôt que tourner jusqu'à la fin des temps.
    let plafond = Duration::from_secs(3 * 3600);
    let mut finis: Vec<(String, f64, String)> = Vec::new();
    let mut vus = std::collections::HashSet::new();

    while finis.len() < attendus.len() && depart.elapsed() < plafond {
        std::thread::sleep(Duration::from_secs(2));
        let tous = file::charger_tout(&depot.travaux(), &mut |texte| eprintln!("file : {texte}")).expect("file");
        for t in &tous {
            // Les états de la file, pris **chez elle** et non devinés : `file::appliquer` écrit
            // `en_echec_definitif` et `en_echec_recuperable`, jamais « echoue ». Cet essai a
            // d'abord cherché un nom qui n'existe pas, et a donc tourné une demi-heure de plus en
            // croyant attendre un travail que la file avait conclu en une seconde. Le défaut
            // était dans l'épreuve, pas dans la file.
            let termine = matches!(t.etat.as_str(), "termine" | "en_echec_definitif" | "annule");
            if termine && vus.insert(t.id.clone()) {
                let quoi = attendus.iter().find(|(id, _)| id == &t.id).map(|(_, n)| n.clone()).unwrap_or_default();
                let secondes = depart.elapsed().as_secs_f64();
                eprintln!(
                    "  [{:>6.1} s] {} — {}{}",
                    secondes,
                    t.etat,
                    quoi,
                    t.cause.as_deref().map(|c| format!(" · {c}")).unwrap_or_default()
                );
                finis.push((quoi, secondes, t.etat.clone()));
            }
        }
    }

    roulement.arreter();
    let total = depart.elapsed().as_secs_f64();

    eprintln!("\n  === L'essai de la file ===");
    eprintln!("  {} travaux sur {} menés à terme", finis.len(), attendus.len());
    eprintln!("  temps total : {:.1} s", total);
    let echoues = finis.iter().filter(|(_, _, etat)| etat != "termine").count();
    eprintln!("  échecs : {echoues}");
    if finis.len() < attendus.len() {
        let restants: Vec<&str> = attendus
            .iter()
            .filter(|(id, _)| !vus.contains(id))
            .map(|(_, nom)| nom.as_str())
            .collect();
        eprintln!("  BLOQUÉS : {}", restants.join(", "));
    }

    // Le bac est gardé quand quelque chose a cloché : un essai qui efface ses preuves oblige à
    // tout relancer pour comprendre, et trente minutes se paient deux fois.
    if finis.len() == attendus.len() && echoues == 0 {
        fs::remove_dir_all(&bac).ok();
    } else {
        eprintln!("  le bac est gardé pour examen : {}", bac.display());
    }
    assert_eq!(finis.len(), attendus.len(), "la file n'a pas mené tous ses travaux à terme");
}

/// `node` du chemin, sans dépendre d'un shell.
fn which_node() -> Option<PathBuf> {
    let chemin = std::env::var_os("PATH")?;
    std::env::split_paths(&chemin)
        .map(|dossier| dossier.join("node"))
        .find(|candidat| candidat.exists())
}
