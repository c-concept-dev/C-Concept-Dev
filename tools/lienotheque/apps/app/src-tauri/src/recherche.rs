//! Index plein texte dérivé de toute une bibliothèque (C10, RCH-07, RCH-09).
//!
//! Les versions JSON actives restent la vérité. `base/recherche.sqlite` est une projection
//! effaçable : à chaque recherche, sa petite table de versions est rapprochée d'`actives.json`.
//! Un arrêt ne laisse jamais un demi-document, chaque remplacement tenant dans une transaction.

use crate::{depot::{Depot, BASE}, titre_ou_empreinte, titres_de};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{collections::BTreeMap, fs, io, time::UNIX_EPOCH};

const SCHEMA: &str = include_str!("../../../../packages/depot-sqlite/sql/recherche-bureau.sql");
const PLAFOND: usize = 50;

#[derive(Debug, Serialize)]
pub struct PassageTrouve {
    rang: u64,
    page: u64,
    texte: String,
    source: String,
    lisible: bool,
    #[serde(rename = "pageImprimee", skip_serializing_if = "Option::is_none")]
    page_imprimee: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    confiance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    emplacement: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Correspondance {
    empreinte: String,
    version: String,
    titre: String,
    passage: PassageTrouve,
}

#[derive(Debug, Serialize)]
pub struct MesureIndex {
    pub documents: usize,
    pub passages: usize,
    #[serde(rename = "misAJour")]
    pub mis_a_jour: usize,
}

fn erreur(cause: impl std::fmt::Display) -> io::Error {
    io::Error::other(cause.to_string())
}

fn ouvrir(depot: &Depot) -> io::Result<Connection> {
    let base = Connection::open(depot.racine().join(BASE).join("recherche.sqlite")).map_err(erreur)?;
    base.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;").map_err(erreur)?;
    base.execute_batch(SCHEMA).map_err(erreur)?;
    Ok(base)
}

fn passages_de(charge: &serde_json::Value) -> &[serde_json::Value] {
    charge["passages"].as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn marque_source(chemin: &std::path::Path) -> String {
    let Ok(meta) = fs::metadata(chemin) else { return "absent".to_owned() };
    let change = meta.modified().ok().and_then(|date| date.duration_since(UNIX_EPOCH).ok());
    format!("{}:{}", meta.len(), change.map(|duree| duree.as_nanos()).unwrap_or(0))
}

fn marque_des_sources(depot: &Depot) -> String {
    let base = depot.racine().join(BASE);
    format!("{}|{}", marque_source(&base.join("actives.json")), marque_source(&base.join("travaux")))
}

fn mesure(base: &Connection, mis_a_jour: usize) -> io::Result<MesureIndex> {
    let documents = base.query_row("SELECT count(*) FROM document_recherche", [], |l| l.get::<_, usize>(0)).map_err(erreur)?;
    let passages = base.query_row("SELECT count(*) FROM passage_recherche", [], |l| l.get::<_, usize>(0)).map_err(erreur)?;
    Ok(MesureIndex { documents, passages, mis_a_jour })
}

/// Met l'index d'accord avec les seuls pointeurs actifs, sans retraiter aucun original.
pub fn synchroniser(depot: &Depot, base: &mut Connection) -> io::Result<MesureIndex> {
    let marque = marque_des_sources(depot);
    let precedente = base.query_row(
        "SELECT valeur FROM etat_recherche WHERE cle = 'sources'",
        [],
        |ligne| ligne.get::<_, String>(0),
    ).ok();
    if precedente.as_deref() == Some(&marque) {
        return mesure(base, 0);
    }
    let actives = depot.actives()?;
    let titres = titres_de(depot);
    let connus: BTreeMap<String, (String, String)> = {
        let mut requete = base.prepare("SELECT empreinte, version, titre FROM document_recherche").map_err(erreur)?;
        let lignes = requete.query_map([], |ligne| Ok((ligne.get(0)?, (ligne.get(1)?, ligne.get(2)?)))).map_err(erreur)?;
        lignes.collect::<Result<_, _>>().map_err(erreur)?
    };
    let transaction = base.transaction().map_err(erreur)?;
    let mut mis_a_jour = 0;

    for empreinte in connus.keys().filter(|empreinte| !actives.contains_key(*empreinte)) {
        transaction.execute("DELETE FROM document_recherche WHERE empreinte = ?", [empreinte]).map_err(erreur)?;
        mis_a_jour += 1;
    }

    for (empreinte, pointeur) in &actives {
        let titre = titre_ou_empreinte(&titres, empreinte);
        if connus.get(empreinte) == Some(&(pointeur.version.clone(), titre.clone())) {
            continue;
        }
        let Some(brut) = depot.lire_version(&pointeur.version)? else { continue };
        let charge: serde_json::Value = serde_json::from_str(&brut).map_err(erreur)?;
        transaction.execute("DELETE FROM document_recherche WHERE empreinte = ?", [empreinte]).map_err(erreur)?;
        transaction.execute(
            "INSERT INTO document_recherche(empreinte, version, titre, activee_le) VALUES (?, ?, ?, ?)",
            params![empreinte, pointeur.version, titre, pointeur.activee_le],
        ).map_err(erreur)?;
        let mut poser = transaction.prepare(
            "INSERT INTO passage_recherche(empreinte, rang, page, page_imprimee, texte, source, confiance, lisible, emplacement) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).map_err(erreur)?;
        for passage in passages_de(&charge) {
            let (Some(rang), Some(page), Some(texte)) =
                (passage["rang"].as_u64(), passage["page"].as_u64(), passage["texte"].as_str())
            else { continue };
            poser.execute(params![
                empreinte,
                rang,
                page,
                passage["pageImprimee"].as_u64(),
                texte,
                passage["source"].as_str().unwrap_or("couche_texte"),
                passage["confiance"].as_f64(),
                usize::from(passage["lisible"].as_bool().unwrap_or(true)),
                passage["emplacement"].as_str(),
            ]).map_err(erreur)?;
        }
        drop(poser);
        mis_a_jour += 1;
    }
    transaction.execute(
        "INSERT INTO etat_recherche(cle, valeur) VALUES ('sources', ?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur",
        [&marque],
    ).map_err(erreur)?;
    transaction.commit().map_err(erreur)?;
    mesure(base, mis_a_jour)
}

fn mots(phrase: &str) -> Option<String> {
    let mots: Vec<String> = phrase
        .split(|c: char| !c.is_alphanumeric())
        .filter(|mot| mot.chars().count() >= 2)
        .take(16)
        .map(|mot| format!("\"{}\"", mot.replace('"', "")))
        .collect();
    (!mots.is_empty()).then(|| mots.join(" OR "))
}

pub fn chercher(racine: &str, phrase: &str, combien: usize) -> io::Result<(Vec<Correspondance>, MesureIndex)> {
    let depot = Depot::ouvrir(racine)?;
    let mut base = ouvrir(&depot)?;
    let mesure = synchroniser(&depot, &mut base)?;
    let Some(requete) = mots(phrase) else { return Ok((Vec::new(), mesure)) };
    let limite = combien.clamp(1, PLAFOND);
    let mut demande = base.prepare(
        "SELECT d.empreinte, d.version, d.titre, p.rang, p.page, p.page_imprimee, p.texte, p.source, p.confiance, p.lisible, p.emplacement
           FROM passage_recherche_texte t
           JOIN passage_recherche p ON p.id = t.rowid
           JOIN document_recherche d ON d.empreinte = p.empreinte
          WHERE passage_recherche_texte MATCH ?
          ORDER BY bm25(passage_recherche_texte), d.titre, p.rang LIMIT ?",
    ).map_err(erreur)?;
    let trouves = demande.query_map(params![requete, limite], |ligne| Ok(Correspondance {
        empreinte: ligne.get(0)?,
        version: ligne.get(1)?,
        titre: ligne.get(2)?,
        passage: PassageTrouve {
            rang: ligne.get(3)?, page: ligne.get(4)?, page_imprimee: ligne.get(5)?, texte: ligne.get(6)?,
            source: ligne.get(7)?, confiance: ligne.get(8)?, lisible: ligne.get::<_, i64>(9)? != 0,
            emplacement: ligne.get(10)?,
        },
    })).map_err(erreur)?.collect::<Result<Vec<_>, _>>().map_err(erreur)?;
    Ok((trouves, mesure))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn version(texte: &str, page: u64) -> String {
        serde_json::json!({"passages":[{"rang":0,"page":page,"texte":texte,"source":"couche_texte","lisible":true}]}).to_string()
    }

    #[test]
    fn cherche_dans_245_documents_et_remplace_une_version_atomiquement() {
        let racine = tempdir().expect("dossier");
        let depot = Depot::ouvrir(racine.path()).expect("dépôt");
        for rang in 0..245 {
            let empreinte = format!("{rang:064x}");
            let version_id = format!("v-{rang}");
            let texte = if rang < 3 { format!("Une mémoire commune au document {rang}") } else { format!("Texte distinct {rang}") };
            depot.ecrire_version(&version_id, &version(&texte, rang as u64 + 1)).expect("version");
            depot.activer(&empreinte, &version_id, rang as u64).expect("activation");
        }
        let (trouves, mesure) = chercher(racine.path().to_str().unwrap(), "memoire commune", 20).expect("recherche");
        assert_eq!(mesure.documents, 245);
        assert_eq!(trouves.len(), 3);
        assert_eq!(trouves.iter().map(|r| &r.empreinte).collect::<std::collections::BTreeSet<_>>().len(), 3);

        let empreinte = format!("{:064x}", 0);
        depot.ecrire_version("v-neuve", &version("Plus aucun terme ancien", 9)).expect("nouvelle");
        depot.activer(&empreinte, "v-neuve", 999).expect("activation");
        let (apres, _) = chercher(racine.path().to_str().unwrap(), "memoire commune", 20).expect("recherche");
        assert_eq!(apres.len(), 2);
    }
}
