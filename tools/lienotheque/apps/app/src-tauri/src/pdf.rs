//! Ouverture d'un PDF natif et accès à une page précise (ANC-01 : la vraie page).

use serde::Serialize;
use std::{path::Path, time::Instant};

#[derive(Serialize, Clone, Debug)]
pub struct MesurePdf {
    pub pages: usize,
    pub octets: u64,
    pub ms_ouverture: u128,
    pub ms_page: u128,
    pub extrait_premiere: String,
    pub extrait_derniere: String,
}

fn abreger(texte: &str) -> String {
    texte.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(80).collect()
}

pub fn ouvrir(chemin: &Path) -> Result<MesurePdf, String> {
    let octets = std::fs::metadata(chemin).map_err(|e| e.to_string())?.len();

    let debut = Instant::now();
    let document = lopdf::Document::load(chemin).map_err(|e| e.to_string())?;
    let pages = document.get_pages();
    let ms_ouverture = debut.elapsed().as_millis();

    let numeros: Vec<u32> = pages.keys().copied().collect();
    let premiere = *numeros.first().ok_or("PDF sans page")?;
    let derniere = *numeros.last().ok_or("PDF sans page")?;

    let debut_page = Instant::now();
    let extrait_derniere = document.extract_text(&[derniere]).map_err(|e| e.to_string())?;
    let ms_page = debut_page.elapsed().as_millis();
    let extrait_premiere = document.extract_text(&[premiere]).map_err(|e| e.to_string())?;

    Ok(MesurePdf {
        pages: numeros.len(),
        octets,
        ms_ouverture,
        ms_page,
        extrait_premiere: abreger(&extrait_premiere),
        extrait_derniere: abreger(&extrait_derniere),
    })
}
