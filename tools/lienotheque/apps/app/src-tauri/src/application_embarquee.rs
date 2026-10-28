use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

const DOSSIER_APPLICATIONS: &str = "applications";
const APPLICATION_MACOS: &str = "macOS/Liénothèque.app";
const EXECUTABLE_MACOS: &str = "Contents/MacOS/lienotheque-bureau";
const MARQUEUR: &str = "version.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarqueurApplication {
    pub schema: u8,
    pub version: String,
    pub plateforme: String,
    pub architecture: String,
    pub empreinte_sha256: String,
    pub application: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComparaisonMarqueurs {
    Absente,
    AJour,
    MiseAJourDisponible,
    SourcePlusAncienne,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EtatApplicationEmbarquee {
    pub statut: String,
    pub version_courante: String,
    pub version_embarquee: Option<String>,
    pub message: String,
    pub action_disponible: bool,
}

pub fn etat_application(
    source: &Path,
    racine_bibliotheque: &Path,
    version: &str,
) -> Result<EtatApplicationEmbarquee, String> {
    let source_marqueur = produire_marqueur(source, version)?;
    let cible = racine_bibliotheque
        .join(DOSSIER_APPLICATIONS)
        .join(APPLICATION_MACOS);
    let meme_application =
        fs::canonicalize(source).ok() == fs::canonicalize(&cible).ok() && cible.exists();
    let embarquee = lire_marqueur(racine_bibliotheque)?;
    let comparaison = comparer_marqueurs(&source_marqueur, embarquee.as_ref());
    let version_embarquee = embarquee.as_ref().map(|marqueur| marqueur.version.clone());

    let (statut, message, action_disponible) = match comparaison {
        ComparaisonMarqueurs::Absente if cible.exists() => (
            "non_referencee",
            "L'application embarquée existe, mais son marqueur de version manque.",
            !meme_application,
        ),
        ComparaisonMarqueurs::Absente => (
            "absente",
            "Cette bibliothèque ne contient pas encore l'application macOS.",
            true,
        ),
        ComparaisonMarqueurs::AJour => (
            "a_jour",
            "L'application embarquée correspond exactement à celle qui est ouverte.",
            false,
        ),
        ComparaisonMarqueurs::MiseAJourDisponible => (
            "mise_a_jour_disponible",
            "Une autre version de l'application peut être embarquée explicitement.",
            !meme_application,
        ),
        ComparaisonMarqueurs::SourcePlusAncienne => (
            "source_plus_ancienne",
            "L'application ouverte est plus ancienne que celle de la bibliothèque.",
            false,
        ),
    };

    Ok(EtatApplicationEmbarquee {
        statut: statut.to_owned(),
        version_courante: version.to_owned(),
        version_embarquee,
        message: message.to_owned(),
        action_disponible,
    })
}

pub fn produire_marqueur(
    application: &Path,
    version: &str,
) -> Result<MarqueurApplication, String> {
    let executable = application.join(EXECUTABLE_MACOS);
    let contenu = fs::read(&executable)
        .map_err(|erreur| format!("Impossible de lire {} : {erreur}", executable.display()))?;
    let empreinte_sha256 = format!("{:x}", Sha256::digest(contenu));

    Ok(MarqueurApplication {
        schema: 1,
        version: version.to_owned(),
        plateforme: "macOS".to_owned(),
        architecture: match std::env::consts::ARCH {
            "aarch64" => "arm64".to_owned(),
            autre => autre.to_owned(),
        },
        empreinte_sha256,
        application: APPLICATION_MACOS.to_owned(),
    })
}

pub fn comparer_marqueurs(
    source: &MarqueurApplication,
    embarquee: Option<&MarqueurApplication>,
) -> ComparaisonMarqueurs {
    let Some(embarquee) = embarquee else {
        return ComparaisonMarqueurs::Absente;
    };
    if source == embarquee {
        return ComparaisonMarqueurs::AJour;
    }
    match comparer_versions(&source.version, &embarquee.version) {
        Ordering::Less => ComparaisonMarqueurs::SourcePlusAncienne,
        Ordering::Equal | Ordering::Greater => ComparaisonMarqueurs::MiseAJourDisponible,
    }
}

fn comparer_versions(gauche: &str, droite: &str) -> Ordering {
    let nombres = |version: &str| {
        version
            .split('.')
            .map(|partie| partie.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    let mut gauche = nombres(gauche);
    let mut droite = nombres(droite);
    let longueur = gauche.len().max(droite.len());
    gauche.resize(longueur, 0);
    droite.resize(longueur, 0);
    gauche.cmp(&droite)
}

pub fn lire_marqueur(racine_bibliotheque: &Path) -> Result<Option<MarqueurApplication>, String> {
    let chemin = racine_bibliotheque.join(DOSSIER_APPLICATIONS).join(MARQUEUR);
    if !chemin.exists() {
        return Ok(None);
    }
    let contenu = fs::read_to_string(&chemin)
        .map_err(|erreur| format!("Impossible de lire {} : {erreur}", chemin.display()))?;
    serde_json::from_str(&contenu)
        .map(Some)
        .map_err(|erreur| format!("Marqueur invalide {} : {erreur}", chemin.display()))
}

pub fn installer_application(
    source: &Path,
    racine_bibliotheque: &Path,
    marqueur: &MarqueurApplication,
) -> Result<PathBuf, String> {
    if marqueur.application != APPLICATION_MACOS {
        return Err("Le marqueur ne désigne pas l'application macOS attendue.".to_owned());
    }
    let applications = racine_bibliotheque.join(DOSSIER_APPLICATIONS);
    let cible = applications.join(APPLICATION_MACOS);
    if fs::canonicalize(source).ok() == fs::canonicalize(&cible).ok() && cible.exists() {
        return Err(
            "L'application embarquée ne peut pas se remplacer pendant qu'elle est ouverte. Ouvrez la version installée pour la mettre à jour."
                .to_owned(),
        );
    }

    fs::create_dir_all(cible.parent().expect("la cible macOS a un parent"))
        .map_err(|erreur| format!("Impossible de préparer {} : {erreur}", cible.display()))?;

    let identifiant = Uuid::new_v4();
    let preparation = applications.join(format!(".mise-a-jour-{identifiant}"));
    let application_preparee = preparation.join("Liénothèque.app");
    copier_application(source, &application_preparee)?;

    let marqueur_prepare = produire_marqueur(&application_preparee, &marqueur.version)?;
    if &marqueur_prepare != marqueur {
        return Err("La copie préparée ne correspond pas au marqueur annoncé.".to_owned());
    }

    let marqueur_temporaire = applications.join(format!(".version-{identifiant}.json"));
    let json = serde_json::to_string_pretty(marqueur)
        .map_err(|erreur| format!("Impossible de sérialiser le marqueur : {erreur}"))?;
    fs::write(&marqueur_temporaire, format!("{json}\n")).map_err(|erreur| {
        format!(
            "Impossible de préparer {} : {erreur}",
            marqueur_temporaire.display()
        )
    })?;

    let sauvegarde = if cible.exists() {
        let precedentes = applications.join(".precedentes");
        fs::create_dir_all(&precedentes).map_err(|erreur| {
            format!("Impossible de préparer {} : {erreur}", precedentes.display())
        })?;
        let sauvegarde = precedentes.join(format!("Liénothèque-{identifiant}.app"));
        fs::rename(&cible, &sauvegarde).map_err(|erreur| {
            format!("Impossible de sauvegarder {} : {erreur}", cible.display())
        })?;
        Some(sauvegarde)
    } else {
        None
    };

    if let Err(erreur) = fs::rename(&application_preparee, &cible) {
        if let Some(sauvegarde) = &sauvegarde {
            let _ = fs::rename(sauvegarde, &cible);
        }
        return Err(format!("Impossible d'installer {} : {erreur}", cible.display()));
    }

    let chemin_marqueur = applications.join(MARQUEUR);
    if let Err(erreur) = fs::rename(&marqueur_temporaire, &chemin_marqueur) {
        let _ = fs::rename(&cible, &application_preparee);
        if let Some(sauvegarde) = &sauvegarde {
            let _ = fs::rename(sauvegarde, &cible);
        }
        return Err(format!(
            "Impossible d'activer {} : {erreur}",
            chemin_marqueur.display()
        ));
    }

    let _ = fs::remove_dir(&preparation);
    Ok(cible)
}

fn copier_application(source: &Path, destination: &Path) -> Result<(), String> {
    let resultat = Command::new("ditto")
        .arg(source)
        .arg(destination)
        .status()
        .map_err(|erreur| format!("Impossible de lancer ditto : {erreur}"))?;
    if resultat.success() {
        Ok(())
    } else {
        Err(format!("ditto a échoué avec le statut {resultat}."))
    }
}
