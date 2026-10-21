//! Le réimport d'un corpus entier, par la file de l'application (BAS-02)
//!
//! ```sh
//! cargo run --release --manifest-path apps/app/src-tauri/Cargo.toml \
//!   --bin reimport -- <dossier du corpus> <racine de la bibliothèque>
//! ```
//!
//! ## Ce qu'il est, et ce qu'il n'est pas
//!
//! Il **ne traite rien lui-même**. Il monte une bibliothèque, y range les documents sous leur
//! empreinte, met un travail par document en file, et laisse tourner le `Roulement` — celui de
//! l'application, avec ses baux, ses places limitées et ses reprises. Un outil qui prendrait un
//! raccourci cesserait de prouver ce que l'application fait.
//!
//! ## Il se reprend
//!
//! Huit heures de traitement ne se relancent pas de zéro parce qu'une machine s'est endormie. Un
//! document déjà rangé n'est pas recopié, un travail déjà en file n'est pas redéposé : relancer la
//! commande reprend là où elle en était. C'est la file qui garde l'état, comme en vrai (JOB-09).
//!
//! ## Les œuvres restent dehors
//!
//! Le corpus et la bibliothèque sont des arguments, jamais des chemins écrits ici (règle 5).

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use lienotheque_bureau::depot::Depot;
use lienotheque_bureau::roulement::{Roulement, MANIERES, RECETTE, RECETTES};
use lienotheque_bureau::traitement::Emplacements;
use lienotheque_bureau::{arrivee, file, travail};

/// Ce que la bibliothèque dit d'elle-même. Les mots du domaine viennent d'ici, jamais du code.
const DESCRIPTION: &str = r#"{
  "id": "bibliotheque-du-reimport",
  "nom": "Base de connaissance",
  "mots": {
    "element": { "un": "élément", "plusieurs": "éléments" },
    "piste": { "un": "piste", "plusieurs": "pistes" },
    "page": { "un": "page", "plusieurs": "pages" }
  },
  "schema": {
    "cle": "base-de-connaissance", "nom": "Base de connaissance", "langue": "fr", "version": 1,
    "axes": [{
      "cle": "un-axe", "nom": "Un axe", "nature": "referentiel", "cardinalite": "une",
      "structure": "plat", "obligatoire": false, "alias": [],
      "valeurs": [{ "cle": "une", "nom": "Une valeur", "alias": [], "synonymes": [], "retiree": false }]
    }]
  }
}"#;

/// La manière de lire de la bibliothèque. **Aucune déclaration de double page** : c'est au
/// document de répondre, feuille par feuille.
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

/// La même, mais qui **tranche** : une page par feuille, et le détecteur n'a pas voix au chapitre.
const MANIERE_SANS_DOUBLE: &str = r#"{
  "id": "sans-double-page", "version": 1, "derivee_de": null,
  "preparation": { "redressement": "aucun", "double_page": false },
  "lectures": [{ "ancre": "page_imprimee",
    "zone": { "type": "rectangle_rel", "x": 0.05, "y": 0.86, "l": 0.9, "h": 0.12 },
    "alphabet": "chiffres" }],
  "regles": { "elements": { "ordre": "strictement_croissant", "saut_max": 12 },
    "plusieurs_elements_par_piste": false },
  "validation": { "seuil_confiance": 0.6 }
}"#;

/// Les documents auxquels une manière nommée est affectée, et pourquoi.
///
/// *Sexualité positive* est une mise en page de diaporama — seize neuvièmes — que ses nombres en
/// marge font passer pour une double page. Vérifié le 21 octobre 2026 : la chaîne le coupe en deux
/// et range le texte de la feuille 19 au rang 38. Les passages déposés ne portent d'ailleurs aucun
/// numéro imprimé : les nombres qui ont convaincu le détecteur n'ont pas survécu au vote de folio.
/// Un `false` déclaré fait autorité contre lui.
const EXCEPTIONS: [(&str, &str); 1] = [(
    "4045b033dbb3257d75cf9993060a3eb7a82a2ba435b23300e3bf47b3d0f8fad1",
    "sans-double-page",
)];

/// Les formats que la chaîne sait lire. Le reste n'entre pas en file : un échec annoncé n'apprend
/// rien et encombre le rapport.
const LUS: [&str; 2] = ["pdf", "epub"];

fn documents(racine: &Path, trouves: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entree in fs::read_dir(racine)? {
        let chemin = entree?.path();
        if chemin.is_dir() {
            documents(&chemin, trouves)?;
        } else if chemin
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| LUS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
        {
            trouves.push(chemin);
        }
    }
    Ok(())
}

fn which_node() -> Option<PathBuf> {
    let chemin = std::env::var_os("PATH")?;
    std::env::split_paths(&chemin).map(|d| d.join("node")).find(|c| c.exists())
}

fn main() -> Result<(), String> {
    let mut arguments = std::env::args().skip(1);
    let corpus = PathBuf::from(arguments.next().ok_or("Attendu : <corpus> <bibliothèque>")?);
    let racine = PathBuf::from(arguments.next().ok_or("Attendu : <corpus> <bibliothèque>")?);

    let chaine = Path::new(env!("CARGO_MANIFEST_DIR")).join("moteurs/chaine/moteur.js");
    if !chaine.exists() {
        return Err("moteur introuvable : lancez preparer-moteur-node.py.".to_owned());
    }
    let node = which_node().ok_or("node absent du chemin")?;

    // 1. La bibliothèque, et ses manières de lire.
    let depot = Depot::ouvrir(&racine).map_err(|e| format!("bibliothèque : {e}"))?;
    let base = racine.join("base");
    fs::create_dir_all(base.join(RECETTES)).map_err(|e| format!("dossiers : {e}"))?;
    fs::create_dir_all(depot.travaux()).map_err(|e| format!("travaux : {e}"))?;
    fs::write(base.join("bibliotheque.json"), DESCRIPTION).map_err(|e| format!("description : {e}"))?;
    fs::write(base.join(RECETTE), MANIERE).map_err(|e| format!("manière : {e}"))?;
    fs::write(base.join(RECETTES).join("sans-double-page.json"), MANIERE_SANS_DOUBLE)
        .map_err(|e| format!("manière nommée : {e}"))?;
    let affectations: BTreeMap<&str, &str> = EXCEPTIONS.iter().copied().collect();
    fs::write(
        base.join(MANIERES),
        serde_json::to_vec_pretty(&affectations).map_err(|e| format!("affectations : {e}"))?,
    )
    .map_err(|e| format!("affectations : {e}"))?;
    println!("Bibliothèque : {}", racine.display());
    println!("Exceptions   : {} manière(s) nommée(s) affectée(s)", affectations.len());

    // 2. Les documents, rangés sous leur empreinte. Les doublons exacts se confondent d'eux-mêmes.
    let mut trouves = Vec::new();
    documents(&corpus, &mut trouves).map_err(|e| format!("parcours du corpus : {e}"))?;
    trouves.sort();
    println!("Corpus       : {} fichier(s) lisibles", trouves.len());

    let deja: HashSet<String> = file::charger_tout(&depot.travaux(), &mut |t| eprintln!("file : {t}"))
        .map_err(|e| format!("file : {e}"))?
        .into_iter()
        .filter_map(|t| t.empreinte)
        .collect();

    let mut vus: HashSet<String> = HashSet::new();
    let mut mis = 0usize;
    let mut doublons = 0usize;
    for (rang, source) in trouves.iter().enumerate() {
        let empreinte = arrivee::empreinte_de(source).map_err(|e| format!("empreinte : {e}"))?;
        if !vus.insert(empreinte.clone()) {
            doublons += 1;
            continue;
        }
        let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_lowercase();
        let rangee = depot.source(&empreinte, &extension);
        if !rangee.exists() {
            fs::create_dir_all(rangee.parent().ok_or("palier")?).map_err(|e| format!("palier : {e}"))?;
            fs::copy(source, &rangee).map_err(|e| format!("copie de {} : {e}", source.display()))?;
        }
        if deja.contains(&empreinte) {
            continue;
        }
        let mut t = travail::Travail::neuf(&uuid(rang + 1), "traitement-de-lot", 0);
        t.version_cible = uuid(100_000 + rang);
        t.sujet = Some(travail::Sujet {
            nom: source.file_name().ok_or("nom")?.to_string_lossy().into_owned(),
            contenu: "documents".to_owned(),
        });
        t.empreinte = Some(empreinte);
        file::enregistrer(&depot.travaux(), &t).map_err(|e| format!("mise en file : {e}"))?;
        mis += 1;
    }
    println!("Doublons     : {doublons} fichier(s) confondus avec un autre");
    println!("Mis en file  : {mis} nouveau(x) travail(aux), {} déjà présent(s)\n", deja.len());

    // 3. La file tourne.
    let depart = Instant::now();
    let roulement = Roulement::demarrer(
        Depot::ouvrir(&racine).map_err(|e| format!("dépôt : {e}"))?,
        Emplacements { node, chaine },
        uuid(999_999),
        racine.join("cache"),
    );

    let mut conclus: HashSet<String> = HashSet::new();
    let mut echecs: Vec<(String, String)> = Vec::new();
    // Ce qu'on attend : ce qui était déjà en file, plus ce qu'on vient d'y mettre. La file le
    // redira à chaque tour, mais une reprise doit savoir compter avant même le premier tour.
    let mut attendus = deja.len() + mis;
    let mut dernier_point = Instant::now();
    println!("La file tourne : {attendus} travaux à mener.\n");

    loop {
        std::thread::sleep(Duration::from_secs(5));
        let tous = file::charger_tout(&depot.travaux(), &mut |t| eprintln!("file : {t}"))
            .map_err(|e| format!("file : {e}"))?;
        attendus = tous.len();

        for t in &tous {
            let fini = matches!(t.etat.as_str(), "termine" | "en_echec_definitif" | "annule");
            if fini && conclus.insert(t.id.clone()) {
                let nom = t.sujet.as_ref().map(|s| s.nom.clone()).unwrap_or_default();
                if t.etat != "termine" {
                    echecs.push((nom.clone(), t.cause.clone().unwrap_or_default()));
                }
                println!(
                    "[{:>7.0} s] {:>5}/{} {} — {}{}",
                    depart.elapsed().as_secs_f64(),
                    conclus.len(),
                    attendus,
                    if t.etat == "termine" { "ok  " } else { "ÉCHEC" },
                    nom,
                    t.cause.as_deref().map(|c| format!(" · {c}")).unwrap_or_default()
                );
            }
        }

        if conclus.len() >= attendus {
            break;
        }
        // Un point régulier : huit heures sans une ligne laissent croire à un blocage.
        if dernier_point.elapsed() >= Duration::from_secs(600) {
            dernier_point = Instant::now();
            println!(
                "   … {}/{} après {:.0} min",
                conclus.len(),
                attendus,
                depart.elapsed().as_secs_f64() / 60.0
            );
        }
    }

    roulement.arreter();
    let total = depart.elapsed().as_secs_f64();
    println!("\n=== Réimport terminé ===");
    println!("Documents   : {attendus}");
    println!("Réussis     : {}", attendus - echecs.len());
    println!("Échecs      : {}", echecs.len());
    println!("Temps total : {:.0} s ({:.2} h)", total, total / 3600.0);
    for (nom, cause) in &echecs {
        println!("  ÉCHEC {nom} · {cause}");
    }
    Ok(())
}

fn uuid(n: usize) -> String {
    format!("0190f0a0-0000-7000-8000-{:012}", n)
}
