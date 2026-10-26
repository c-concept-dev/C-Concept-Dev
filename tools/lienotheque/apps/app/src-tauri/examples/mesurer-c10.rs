//! Mesure reproductible de C10 sur une vraie bibliothèque.
//!
//! Premier appel : construction/réconciliation puis requête. Second appel : requête sur l'index
//! déjà chaud. Aucun original ni aucune version n'est modifié ; seul l'index dérivé est créé.

use lienotheque_bureau::recherche;
use std::{collections::BTreeSet, env, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let racine = env::args().nth(1).ok_or("usage: mesurer-c10 <bibliothèque> [requête]")?;
    let requete = env::args().nth(2).unwrap_or_else(|| "couple".to_owned());

    let debut = Instant::now();
    let (froids, mesure) = recherche::chercher(&racine, &requete, 50)?;
    let froid_ms = debut.elapsed().as_secs_f64() * 1_000.0;

    let debut = Instant::now();
    let (chauds, _) = recherche::chercher(&racine, &requete, 50)?;
    let chaud_ms = debut.elapsed().as_secs_f64() * 1_000.0;
    let documents: BTreeSet<_> = chauds.iter().map(|r| serde_json::to_value(r).unwrap()["empreinte"].as_str().unwrap().to_owned()).collect();

    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "requete": requete,
        "index": mesure,
        "froidMs": froid_ms,
        "chaudMs": chaud_ms,
        "resultatsFroids": froids.len(),
        "resultatsChauds": chauds.len(),
        "documentsDistincts": documents.len(),
        "echantillon": chauds.iter().take(10).map(|r| serde_json::to_value(r).unwrap()).collect::<Vec<_>>(),
    }))?);
    Ok(())
}
