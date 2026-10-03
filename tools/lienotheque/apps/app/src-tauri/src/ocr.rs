//! Sidecar Tesseract : moteur embarqué lancé comme processus annexe par l'hôte Rust.

use serde::Serialize;
use std::{path::Path, process::Command, time::Instant};

#[derive(Serialize, Clone, Debug)]
pub struct MesureOcr {
    pub version: String,
    pub texte: String,
    pub ms: u128,
    pub moteur: String,
}

fn premiere_ligne(sortie: &[u8]) -> String {
    String::from_utf8_lossy(sortie).lines().next().unwrap_or("").trim().to_owned()
}

/// Lance le moteur sur une image et rend le texte reconnu.
/// `tessdata` est le dossier des modèles embarqués (TESSDATA_PREFIX).
pub fn reconnaitre(moteur: &Path, tessdata: &Path, image: &Path, langue: &str) -> Result<MesureOcr, String> {
    if !moteur.exists() {
        return Err(format!("moteur absent : {}", moteur.display()));
    }

    let version = Command::new(moteur)
        .arg("--version")
        .env("TESSDATA_PREFIX", tessdata)
        .output()
        .map_err(|e| format!("lancement impossible : {e}"))?;
    if !version.status.success() {
        return Err(format!("--version a échoué : {}", premiere_ligne(&version.stderr)));
    }

    let debut = Instant::now();
    let sortie = Command::new(moteur)
        .arg(image)
        .arg("stdout")
        .arg("-l")
        .arg(langue)
        .env("TESSDATA_PREFIX", tessdata)
        .output()
        .map_err(|e| format!("lancement impossible : {e}"))?;
    let ms = debut.elapsed().as_millis();

    if !sortie.status.success() {
        return Err(format!("reconnaissance en échec : {}", premiere_ligne(&sortie.stderr)));
    }

    Ok(MesureOcr {
        version: premiere_ligne(&version.stdout),
        texte: String::from_utf8_lossy(&sortie.stdout).trim().to_owned(),
        ms,
        moteur: moteur.display().to_string(),
    })
}
