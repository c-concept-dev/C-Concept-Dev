//! La trace de mise au point : ce que la page fait, écrit là où on peut le lire sans inspecteur.
//!
//! ## Pourquoi un fichier, et pas la sortie d'erreur
//!
//! `journal_page` écrivait sur la sortie d'erreur, et seulement dans une construction de mise au
//! point. Deux conséquences, mesurées le 22 octobre 2026 : dans le **paquet signé**, qui est une
//! construction livrée, la ligne était purement et simplement jetée ; et même en mise au point,
//! une application lancée depuis le Finder n'a pas de terminal où cette sortie irait. Le traceur
//! de la page parlait donc à personne, exactement dans la situation où il devait servir.
//!
//! Un fichier n'a aucun de ces deux défauts : il survit au lancement, il se lit sans outil, et on
//! peut l'envoyer.
//!
//! ## Ce que la trace n'est pas
//!
//! Ce n'est pas le journal d'un traitement — celui-là vit par travail, dans la bibliothèque, et
//! c'est `journal.rs`. Celui-ci existe **avant** toute bibliothèque, puisque le défaut qu'on
//! cherche peut être précisément de ne pas arriver à en créer une.
//!
//! ## Ce qui la borne
//!
//! Elle est **remise à zéro à chaque démarrage** : on cherche ce qui vient de se passer, pas ce
//! qui s'est passé la semaine dernière, et un fichier qu'on n'efface jamais finit par peser plus
//! que ce qu'il raconte. Au-delà de [`TAILLE_MAX`], elle cesse d'écrire et le dit une fois —
//! plutôt que de remplir un disque en silence.

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

/// Deux mégaoctets : des dizaines de milliers de lignes, et rien qui pèse sur un disque.
pub const TAILLE_MAX: u64 = 2 * 1024 * 1024;

/// Le nom du fichier, cité tel quel à qui vient le lire.
pub const NOM: &str = "trace.log";

struct Ouverte {
    fichier: File,
    depuis: Instant,
    ecrits: u64,
    pleine: bool,
}

static TRACE: OnceLock<Mutex<Option<Ouverte>>> = OnceLock::new();
static CHEMIN: OnceLock<PathBuf> = OnceLock::new();

fn case_() -> &'static Mutex<Option<Ouverte>> {
    TRACE.get_or_init(|| Mutex::new(None))
}

/// Ouvre la trace dans ce dossier, en effaçant celle du lancement précédent.
///
/// Un échec n'est jamais une panne de l'application : on ne trace plus, c'est tout. Une trace qui
/// empêcherait de démarrer serait pire que pas de trace.
pub fn ouvrir(dossier: &Path) {
    if fs::create_dir_all(dossier).is_err() {
        return;
    }
    let chemin = dossier.join(NOM);
    let Ok(fichier) = OpenOptions::new().create(true).write(true).truncate(true).open(&chemin) else {
        return;
    };
    let _ = CHEMIN.set(chemin);
    if let Ok(mut case) = case_().lock() {
        *case = Some(Ouverte { fichier, depuis: Instant::now(), ecrits: 0, pleine: false });
    }
    let epoque = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    ecrire(&format!(
        "trace ouverte · {} · démarrage à {epoque} s depuis l'époque",
        env!("CARGO_PKG_VERSION")
    ));
}

/// Où la trace s'écrit, quand elle s'écrit.
pub fn chemin() -> Option<&'static PathBuf> {
    CHEMIN.get()
}

/// Une ligne de plus, horodatée depuis l'ouverture.
///
/// Le temps est compté **depuis le démarrage** et non sur l'horloge : c'est l'écart entre deux
/// lignes qui dit où ça bute, et il se lit sans soustraire deux heures à la main.
pub fn ecrire(texte: &str) {
    let Ok(mut case) = case_().lock() else { return };
    let Some(ouverte) = case.as_mut() else { return };
    if ouverte.pleine {
        return;
    }
    let ecoule = ouverte.depuis.elapsed().as_secs_f64();
    let ligne = format!("[{ecoule:9.3} s] {texte}\n");
    if ouverte.ecrits + ligne.len() as u64 > TAILLE_MAX {
        ouverte.pleine = true;
        let _ = ouverte.fichier.write_all(b"[   trace pleine : la suite n'est pas ecrite ]\n");
        let _ = ouverte.fichier.flush();
        return;
    }
    ouverte.ecrits += ligne.len() as u64;
    let _ = ouverte.fichier.write_all(ligne.as_bytes());
    // Vidée à chaque ligne : une trace qu'on lit pendant que l'application tourne doit être à
    // jour, et une application qui se fige garderait sinon pour elle la ligne qui l'explique.
    let _ = ouverte.fichier.flush();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_trace_ecrit_ce_qu_on_lui_donne() {
        let dossier = std::env::temp_dir().join(format!("lienotheque-trace-{}", std::process::id()));
        ouvrir(&dossier);
        ecrire("un essai");
        let lu = fs::read_to_string(dossier.join(NOM)).expect("la trace doit exister");
        assert!(lu.contains("trace ouverte"), "l'en-tête manque : {lu}");
        assert!(lu.contains("un essai"), "la ligne manque : {lu}");
        let _ = fs::remove_dir_all(&dossier);
    }

    #[test]
    fn une_trace_jamais_ouverte_ne_leve_pas() {
        // Aucune ouverture dans ce fil : écrire ne doit rien faire, et surtout rien casser.
        ecrire("dans le vide");
    }
}
