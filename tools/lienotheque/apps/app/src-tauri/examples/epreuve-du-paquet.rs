//! Le moteur **embarqué** lit-il vraiment un document ? (épreuve de bout en bout)
//!
//!     cargo run --release --example epreuve-du-paquet -- <document> <recette.json> <description.json>
//!
//!  Cette épreuve existe parce qu'un trou de couverture s'est payé deux fois dans la même
//!  journée. Mille sept cents tests passaient, l'intégration continue construisait le paquet, et
//!  pourtant le moteur embarqué ne savait lire aucun document :
//!
//!    · `DOMMatrix is not defined` — pdfjs construit une matrice au chargement de son module de
//!      rendu ; dans le dépôt il la prend de `@napi-rs/canvas`, et un paquet n'a pas de
//!      `node_modules`.
//!    · `Setting up fake worker failed` — pdfjs cherche son module de travail par un chemin
//!      calculé à l'exécution, qu'un fichier unique n'a pas sur son disque.
//!
//!  Aucun des deux ne se voyait en développement : la chaîne y tourne depuis `node_modules`, et
//!  le paquet depuis un fichier rassemblé. **Construire le paquet ne prouve pas qu'il lit.**
//!  Seul le faire lire le prouve.
//!
//!  On ne pilote pas l'interface : on fait exactement ce qu'elle fait — déposer, laisser la file
//!  mener le travail, et vérifier que la version porte des passages.

use lienotheque_bureau::{arrivee, depot::Depot, file, roulement::Roulement, traitement::Emplacements};
use std::{
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{Duration, Instant},
};

/// Combien de temps on laisse à un document minimal. Au-delà, c'est une panne, pas une lenteur.
const PATIENCE: Duration = Duration::from_secs(900);

fn echec(pourquoi: &str) -> ExitCode {
    eprintln!("\n  ÉCHEC : {pourquoi}");
    ExitCode::from(1)
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let [document, recette, description] = match arguments.get(..3) {
        Some([a, b, c]) => [a.clone(), b.clone(), c.clone()],
        _ => {
            eprintln!("Attendu : <document> <recette.json> <description.json>");
            return ExitCode::from(2);
        }
    };

    let racine = std::env::temp_dir().join(format!("lienotheque-epreuve-{}", std::process::id()));
    fs::remove_dir_all(&racine).ok();

    let depot = match Depot::ouvrir(&racine) {
        Ok(d) => d,
        Err(e) => return echec(&format!("bibliothèque impossible à préparer : {e}")),
    };

    // La description et la manière de lire, là où l'hôte les attend.
    let base = racine.join("base");
    let pose = fs::create_dir_all(base.join(lienotheque_bureau::roulement::RECETTES))
        .and_then(|()| fs::copy(&description, base.join("bibliotheque.json")))
        .and_then(|_| fs::copy(&recette, base.join(lienotheque_bureau::roulement::RECETTE)));
    if let Err(e) = pose {
        return echec(&format!("préparation impossible : {e}"));
    }

    let documents = vec![PathBuf::from(&document)];
    let arrivee = match arrivee::deposer(&depot, &depot.travaux(), &documents, &mut |t| eprintln!("file : {t}")) {
        Ok(a) => a,
        Err(e) => return echec(&format!("dépôt impossible : {e}")),
    };
    if arrivee.travaux.len() != 1 {
        return echec(&format!("un seul travail attendu, {} déposé(s)", arrivee.travaux.len()));
    }
    println!("  déposé : {}", Path::new(&document).file_name().unwrap_or_default().to_string_lossy());

    // Les moteurs **embarqués**, trouvés comme l'application les trouve. C'est tout l'objet de
    // l'épreuve : sans eux, il n'y a rien à prouver ici.
    let emplacements = match std::env::current_exe().ok().and_then(|exe| Emplacements::depuis_executable(&exe)) {
        Some(e) => e,
        None => return echec("moteurs embarqués introuvables : lancez outils/preparer-moteur-node.py avant."),
    };
    println!("  moteur  : {}", emplacements.node.display());

    let roulement = Roulement::demarrer(
        Depot::ouvrir(&racine).expect("dépôt"),
        emplacements,
        "0190f0a0-0000-7000-8000-00000000fe01".to_owned(),
        racine.join("cache"),
    );

    let dossier = depot.travaux();
    let debut = Instant::now();
    let mut dernier = String::new();
    loop {
        std::thread::sleep(Duration::from_secs(5));
        let tous = file::charger_tout(&dossier, &mut |t| eprintln!("file : {t}")).unwrap_or_default();
        let Some(travail) = tous.first() else { break };
        if travail.etat != dernier {
            println!("  [{:>4.0} s] {}", debut.elapsed().as_secs_f32(), travail.etat);
            dernier = travail.etat.clone();
        }
        if ["termine", "annule", "en_echec_definitif"].contains(&travail.etat.as_str()) {
            break;
        }
        if debut.elapsed() > PATIENCE {
            roulement.arreter();
            return echec(&format!("rien de conclu en {} s", PATIENCE.as_secs()));
        }
    }
    roulement.arreter();

    let tous = file::charger_tout(&dossier, &mut |_| {}).unwrap_or_default();
    let Some(travail) = tous.first() else {
        return echec("le travail a disparu de la file");
    };
    if travail.etat != "termine" {
        return echec(&format!(
            "travail {} — {}",
            travail.etat,
            travail.cause.as_deref().unwrap_or("sans cause")
        ));
    }

    // Et surtout : la version porte-t-elle du texte ? Un « terminé » sur un résultat vide est
    // exactement ce qui a déjà traversé tous les contrôles une fois.
    let version = base.join("versions").join(format!("{}.json", travail.version_cible));
    let texte = match fs::read_to_string(&version) {
        Ok(t) => t,
        Err(e) => return echec(&format!("version illisible ({}) : {e}", version.display())),
    };
    let charge: serde_json::Value = match serde_json::from_str(&texte) {
        Ok(v) => v,
        Err(e) => return echec(&format!("version mal formée : {e}")),
    };

    let passages = charge.get("passages").and_then(|p| p.as_array()).map_or(0, Vec::len);
    let lecture = charge.get("lecture").cloned().unwrap_or(serde_json::Value::Null);
    println!("  passages : {passages}");
    println!("  lecture  : {lecture}");

    if passages == 0 {
        return echec("le moteur embarqué a conclu sans produire un seul passage : il ne lit pas le texte.");
    }

    // Un passage doit porter du texte, et pas une chaîne vide qui compte pour un.
    let vides = charge["passages"]
        .as_array()
        .map(|liste| liste.iter().filter(|p| p["texte"].as_str().unwrap_or("").trim().is_empty()).count())
        .unwrap_or(0);
    if vides > 0 {
        return echec(&format!("{vides} passage(s) sans texte"));
    }

    fs::remove_dir_all(&racine).ok();
    println!("\n  Le moteur embarqué lit : {passages} passage(s) tirés du document.");
    ExitCode::SUCCESS
}
