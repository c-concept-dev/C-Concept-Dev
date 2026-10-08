//! Traiter un lot depuis l'application : la file, le moteur, le dépôt et le journal ensemble.
//!
//! C'est ici que la décision du lot D2 prend corps. L'hôte lance le moteur embarqué, l'écoute,
//! tient le journal, écrit le résultat dans la version cible, puis l'active en une opération
//! (JOB-06). Le moteur n'écrit rien dans la base : il propose, l'hôte dispose.

use crate::{
    depot::Depot,
    journal::{Journal, Ligne},
    limites::LIMITES,
    moteur::{Lancement, Message, Session},
};
use std::{
    io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Où le paquet range son moteur.
///
/// Les binaires annexes voyagent à côté de l'exécutable, les ressources dans leur dossier. En
/// développement, rien de tout cela n'existe : on retombe alors sur l'arborescence du dépôt, pour
/// que l'hôte se lance aussi hors paquet.
pub struct Emplacements {
    pub node: PathBuf,
    pub chaine: PathBuf,
}

impl Emplacements {
    pub fn depuis_executable(executable: &Path) -> Option<Self> {
        let macos = executable.parent()?;
        let empaquete = Self {
            node: macos.join(format!("node{}", std::env::consts::EXE_SUFFIX)),
            chaine: macos.parent()?.join("Resources").join("moteurs").join("chaine").join("moteur.js"),
        };
        if empaquete.node.exists() && empaquete.chaine.exists() {
            return Some(empaquete);
        }

        // Hors paquet : les moteurs préparés dans le dossier du projet.
        let moteurs = racine_du_projet(executable)?.join("moteurs");
        let brut = Self {
            node: moteurs.join("bin").join(format!("node{}", std::env::consts::EXE_SUFFIX)),
            chaine: moteurs.join("chaine").join("moteur.js"),
        };
        (brut.node.exists() && brut.chaine.exists()).then_some(brut)
    }
}

/// Remonte jusqu'au dossier `src-tauri`, quel que soit le profil de compilation.
fn racine_du_projet(executable: &Path) -> Option<PathBuf> {
    executable.ancestors().find(|a| a.join("tauri.conf.json").exists()).map(Path::to_path_buf)
}

fn maintenant() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Ce qu'un traitement a donné, pour l'écran et pour le rapport.
#[derive(Debug)]
pub struct Bilan {
    pub version: String,
    pub octets: usize,
    pub lignes_de_journal: usize,
    pub erreurs: usize,
    pub active: bool,
}

/// Traite un lot et active le résultat.
///
/// `charge` est la charge du travail, telle que le contrat de l'outil la décrit — l'hôte ne la lit
/// pas : il la transmet. Ce qu'il lit, ce sont les messages qui reviennent.
pub fn traiter(
    depot: &Depot,
    emplacements: &Emplacements,
    travail_id: &str,
    version: &str,
    charge: &serde_json::Value,
) -> io::Result<Bilan> {
    let journal = Journal::pour(&depot.racine().join("base").join("journal"), travail_id)?;
    let noter = |niveau: &str, texte: &str| {
        let _ = journal.ecrire(&Ligne { niveau: niveau.to_owned(), texte: texte.to_owned(), le: maintenant() });
    };

    let lancement = Lancement::embarque(emplacements.node.clone(), emplacements.chaine.clone());
    let mut session = Session::ouvrir(&lancement)?;

    let demande = serde_json::json!({
        "type": "demande",
        "protocole": LIMITES.protocole,
        "travailId": travail_id,
        "outil": { "nom": "traitement-de-lot", "version": "1.0.0" },
        "versionCible": version,
        "charge": charge,
    });
    session.dire(&demande.to_string())?;

    let arret = serde_json::json!({
        "type": "arret",
        "protocole": LIMITES.protocole,
        "travailId": travail_id,
        "raison": "fermeture",
    })
    .to_string();

    let mut octets = 0;
    let mut erreurs = 0;
    let mut recu = None;

    while let Some(message) = session.ecouter() {
        match message {
            Ok(Message::Salutation { moteur, version: v, .. }) => noter("information", &format!("Moteur {moteur} {v}")),
            Ok(Message::Journal { niveau, texte }) => {
                if niveau == "erreur" {
                    erreurs += 1;
                }
                noter(&niveau, &texte);
            }
            Ok(Message::Progression { .. }) => {}
            Ok(Message::Resultat { charge }) => {
                octets = charge.len();
                recu = Some(charge);
                let _ = session.arreter(&arret);
                break;
            }
            Ok(Message::Echec { cause, reprise_possible }) => {
                erreurs += 1;
                noter("erreur", &format!("{cause} (reprise possible : {reprise_possible})"));
                let _ = session.arreter(&arret);
                break;
            }
            Err(refus) => {
                erreurs += 1;
                noter("erreur", &refus.message());
            }
        }
    }

    // L'hôte seul écrit, et il n'écrit que ce qu'il a reçu en entier. Un traitement qui s'est
    // interrompu laisse la version active intacte — c'est tout l'intérêt de n'activer qu'après.
    let active = match recu {
        Some(charge) => {
            depot.ecrire_version(version, &charge)?;
            depot.activer(version, maintenant())?;
            noter("information", "Version écrite et activée");
            true
        }
        None => {
            let fin = session.sortie().unwrap_or_else(|| "encore en vie".to_owned());
            noter("erreur", &format!("Aucun résultat reçu — moteur {fin}. La version précédente reste active."));
            false
        }
    };

    let (lignes, _) = journal.dernieres(crate::journal::LIGNES_GARDEES)?;
    Ok(Bilan { version: version.to_owned(), octets, lignes_de_journal: lignes.len(), erreurs, active })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trouve_les_moteurs_d_un_paquet_macos() {
        // Un paquet ressemble à ceci, et c'est là qu'on cherche d'abord.
        let dossier = std::env::temp_dir().join(format!("lienotheque-paquet-{}", std::process::id()));
        let macos = dossier.join("Contents").join("MacOS");
        let ressources = dossier.join("Contents").join("Resources").join("moteurs").join("chaine");
        std::fs::create_dir_all(&macos).expect("MacOS");
        std::fs::create_dir_all(&ressources).expect("Resources");
        std::fs::write(macos.join(format!("node{}", std::env::consts::EXE_SUFFIX)), b"").expect("node");
        std::fs::write(ressources.join("moteur.js"), b"").expect("chaîne");

        let trouves = Emplacements::depuis_executable(&macos.join("Lienotheque")).expect("moteurs trouvés");
        assert_eq!(trouves.node, macos.join(format!("node{}", std::env::consts::EXE_SUFFIX)));
        assert!(trouves.chaine.ends_with("moteurs/chaine/moteur.js"));
        std::fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn ne_trouve_rien_quand_il_n_y_a_rien() {
        let nulle_part = std::env::temp_dir().join("lienotheque-vide").join("Lienotheque");
        assert!(Emplacements::depuis_executable(&nulle_part).is_none());
    }
}
