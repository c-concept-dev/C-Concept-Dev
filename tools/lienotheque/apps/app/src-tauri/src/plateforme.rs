//! Cohérence des versions minimales entre l'application et ses moteurs embarqués.
//!
//! Un moteur qui exige un macOS plus récent que l'application ne se chargera pas là où
//! l'application s'installe : la reconnaissance de texte échouerait sans que rien ne l'annonce.

use std::path::Path;

/// « 26.0 », « 13 », « 26.3.1 » → (majeur, mineur). Les composantes suivantes sont ignorées.
pub fn version(texte: &str) -> Option<(u32, u32)> {
    let mut parties = texte.trim().split('.');
    let majeur = parties.next()?.trim().parse().ok()?;
    let mineur = parties.next().and_then(|m| m.trim().parse().ok()).unwrap_or(0);
    Some((majeur, mineur))
}

/// Minimum déclaré par la configuration Tauri (`bundle.macOS.minimumSystemVersion`).
pub fn minimum_declare(configuration: &Path) -> Option<(u32, u32)> {
    let texte = std::fs::read_to_string(configuration).ok()?;
    let valeur: serde_json::Value = serde_json::from_str(&texte).ok()?;
    let declare = valeur.get("bundle")?.get("macOS")?.get("minimumSystemVersion")?.as_str()?;
    version(declare)
}

/// Minimum exigé par un binaire Mach-O, lu dans ses commandes de chargement.
/// `None` si le fichier n'est pas un Mach-O (une ressource, un modèle de langue…).
#[cfg(target_os = "macos")]
pub fn minimum_binaire(fichier: &Path) -> Option<(u32, u32)> {
    let sortie = std::process::Command::new("otool").arg("-l").arg(fichier).output().ok()?;
    if !sortie.status.success() {
        return None;
    }
    minimum_dans_otool(&String::from_utf8_lossy(&sortie.stdout))
}

/// `LC_BUILD_VERSION` donne `minos` ; les binaires plus anciens donnent `LC_VERSION_MIN_MACOSX`.
pub fn minimum_dans_otool(sortie: &str) -> Option<(u32, u32)> {
    let lignes: Vec<&str> = sortie.lines().map(str::trim).collect();
    if let Some(valeur) = lignes.iter().find_map(|l| l.strip_prefix("minos ")) {
        return version(valeur);
    }
    let rang = lignes.iter().position(|l| l.ends_with("LC_VERSION_MIN_MACOSX"))?;
    lignes[rang..].iter().find_map(|l| l.strip_prefix("version ")).and_then(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_une_version_quelle_que_soit_sa_precision() {
        assert_eq!(version("26.0"), Some((26, 0)));
        assert_eq!(version("13"), Some((13, 0)));
        assert_eq!(version("26.3.1"), Some((26, 3)));
        assert_eq!(version(" 11.0 "), Some((11, 0)));
        assert_eq!(version("inconnue"), None);
    }

    #[test]
    fn compare_les_versions_dans_le_bon_ordre() {
        assert!(version("13.0") < version("26.0"));
        assert!(version("26.0") <= version("26.0"));
        assert!(version("26.3") > version("26.0"));
    }

    #[test]
    fn lit_le_minimum_des_deux_formes_de_commande() {
        let recente = "      cmd LC_BUILD_VERSION\n  cmdsize 32\n platform 1\n    minos 13.0\n      sdk 26.5";
        assert_eq!(minimum_dans_otool(recente), Some((13, 0)));

        let ancienne = "      cmd LC_VERSION_MIN_MACOSX\n  cmdsize 16\n  version 10.13\n      sdk 10.15";
        assert_eq!(minimum_dans_otool(ancienne), Some((10, 13)));

        assert_eq!(minimum_dans_otool("ceci n'est pas un Mach-O"), None);
    }
}
