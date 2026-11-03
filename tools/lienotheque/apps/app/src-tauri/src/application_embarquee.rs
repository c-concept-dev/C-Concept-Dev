use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

const DOSSIER_APPLICATIONS: &str = "applications";
const APPLICATION_MACOS: &str = "Liénothèque.app";
const EXECUTABLE_MACOS: &str = "Contents/MacOS/lienotheque-bureau";

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

/** Ce qu'une installation réussie rapporte. Les résidus sont les restes de l'ancienne
 *  disposition que le ménage n'a pas pu retirer : l'application neuve est en place, donc
 *  l'installation a réussi, et un balayage incomplet ne doit jamais la faire passer pour un
 *  échec. Il se dit, il ne se tait pas. */
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installation {
    pub application: PathBuf,
    pub residus: Vec<String>,
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
    let version_incluse = lire_version_incluse(application)?;
    if version_incluse != version {
        return Err(format!(
            "La version annoncée ({version}) diffère de celle incluse dans l'application ({version_incluse})."
        ));
    }
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
    let application = racine_bibliotheque
        .join(DOSSIER_APPLICATIONS)
        .join(APPLICATION_MACOS);
    if !application.exists() {
        return Ok(None);
    }
    let version = lire_version_incluse(&application)?;
    produire_marqueur(&application, &version).map(Some)
}

/** La version voyage dans le paquet qu'elle décrit. Aucun fichier voisin ne peut donc se
 *  désynchroniser de l'application lors d'une copie de la bibliothèque. */
fn lire_version_incluse(application: &Path) -> Result<String, String> {
    let info = application.join("Contents/Info.plist");
    let contenu = fs::read_to_string(&info)
        .map_err(|erreur| format!("Impossible de lire {} : {erreur}", info.display()))?;
    let apres_cle = contenu
        .split_once("<key>CFBundleShortVersionString</key>")
        .map(|(_, apres)| apres)
        .ok_or_else(|| format!("Version absente de {}.", info.display()))?;
    let apres_debut = apres_cle
        .split_once("<string>")
        .map(|(_, apres)| apres)
        .ok_or_else(|| format!("Version illisible dans {}.", info.display()))?;
    apres_debut
        .split_once("</string>")
        .map(|(version, _)| version.trim().to_owned())
        .filter(|version| !version.is_empty())
        .ok_or_else(|| format!("Version vide dans {}.", info.display()))
}

pub fn installer_application(
    source: &Path,
    racine_bibliotheque: &Path,
    marqueur: &MarqueurApplication,
) -> Result<Installation, String> {
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

    fs::create_dir_all(&applications)
        .map_err(|erreur| format!("Impossible de préparer {} : {erreur}", cible.display()))?;

    let identifiant = Uuid::new_v4();
    let application_preparee = applications.join(format!(".mise-a-jour-{identifiant}.app"));
    copier_application(source, &application_preparee)?;

    let marqueur_prepare = produire_marqueur(&application_preparee, &marqueur.version)?;
    if &marqueur_prepare != marqueur {
        return Err("La copie préparée ne correspond pas au marqueur annoncé.".to_owned());
    }

    let sauvegarde = if cible.exists() {
        let sauvegarde = applications.join(format!(".precedente-{identifiant}.app"));
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

    // À partir d'ici l'application neuve est en place : tout ce qui suit n'est plus que du
    // balayage. Un balayage qui échoue laisse un résidu, pas une installation ratée.
    let mut residus = Vec::new();
    if let Some(sauvegarde) = sauvegarde {
        if let Err(erreur) = fs::remove_dir_all(&sauvegarde) {
            residus.push(format!(
                "L'ancienne application reste dans {} ({erreur}).",
                sauvegarde.display()
            ));
        }
    }
    residus.extend(nettoyer_ancienne_disposition(&applications));
    Ok(Installation {
        application: cible,
        residus,
    })
}

fn nettoyer_ancienne_disposition(applications: &Path) -> Vec<String> {
    let mut residus = Vec::new();
    for chemin in [applications.join("macOS"), applications.join(".precedentes")] {
        if chemin.exists() {
            if let Err(erreur) = fs::remove_dir_all(&chemin) {
                residus.push(format!("{} n'a pas pu être retiré ({erreur}).", chemin.display()));
            }
        }
    }
    for fichier in [
        applications.join("version.json"),
        applications.join(".DS_Store"),
    ] {
        if fichier.exists() {
            if let Err(erreur) = fs::remove_file(&fichier) {
                residus.push(format!("{} n'a pas pu être retiré ({erreur}).", fichier.display()));
            }
        }
    }
    residus
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
