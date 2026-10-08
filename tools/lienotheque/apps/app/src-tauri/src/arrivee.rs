//! Ce qui arrive dans une bibliothèque (JOB-01, JOB-04, OUT-01).
//!
//! Déposer un fichier, c'est trois choses dans cet ordre : **copier l'original** dans le dossier
//! portable — jamais le déplacer, jamais le modifier —, **prendre son empreinte**, et **mettre un
//! travail en file avant que rien ne commence** (JOB-01). L'ordre compte : un travail écrit avant
//! la copie désignerait un fichier absent, et une copie sans travail laisserait un fichier que
//! personne ne viendra lire.
//!
//! L'empreinte sert à ne pas refaire ce qui est fait (JOB-04). Redéposer le même fichier retrouve
//! son travail au lieu d'en créer un second : c'est le même contenu, quel que soit le nom qu'il
//! portait sur le disque.

use crate::{
    depot::Depot,
    file,
    travail::{self, Sujet, Travail},
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

/// Ce qu'un fichier apporte, d'après son extension.
///
/// Un type de contenu, pas un type d'élément : « audio » dit qu'il y aura des enregistrements,
/// pas ce qu'ils représentent. Ce qu'ils sont vient du schéma de la bibliothèque (CLA-01).
///
/// La liste est close. Un fichier dont on ne sait rien n'entre pas : mieux vaut le dire que de
/// le ranger au hasard et le retrouver illisible trois écrans plus loin.
pub fn contenu_de(nom: &str) -> Option<&'static str> {
    let extension = Path::new(nom).extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "pdf" | "epub" | "txt" | "md" => "documents",
        "mp3" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aac" => "audio",
        "mp4" | "mov" | "mkv" | "webm" | "m4v" => "videos",
        "png" | "jpg" | "jpeg" | "webp" | "tif" | "tiff" | "gif" | "heic" => "images",
        _ => return None,
    })
}

/// Empreinte du contenu d'un fichier, en hexadécimal.
///
/// Lue par morceaux : un document de trois cents pages n'a pas à tenir en mémoire pour qu'on
/// sache lequel c'est.
pub fn empreinte_de(chemin: &Path) -> io::Result<String> {
    let mut fichier = fs::File::open(chemin)?;
    let mut hacheur = Sha256::new();
    let mut tampon = vec![0_u8; 1 << 16];
    loop {
        let lus = fichier.read(&mut tampon)?;
        if lus == 0 {
            break;
        }
        hacheur.update(&tampon[..lus]);
    }
    Ok(format!("{:x}", hacheur.finalize()))
}

/// Ce qu'un dépôt a donné : les travaux mis en file, et ce qui n'a pas pu entrer.
#[derive(Debug, Default)]
pub struct Arrivee {
    /// Les travaux en file après ce dépôt — y compris ceux qui y étaient déjà (JOB-04).
    pub travaux: Vec<Travail>,
    /// Les fichiers refusés, et pourquoi. Jamais avalés : on dit lesquels, et ce qui cloche.
    pub refuses: Vec<(String, String)>,
}

/// Dépose des fichiers et met un travail en file par fichier (JOB-01, JOB-04).
///
/// Un fichier déjà déposé — même contenu, même bibliothèque — ne crée pas un second travail : le
/// sien est rendu tel quel. Un fichier dont on ne sait pas lire le type est refusé avec sa raison,
/// et n'empêche pas les autres d'entrer.
pub fn deposer(
    depot: &Depot,
    dossier_file: &Path,
    origines: &[PathBuf],
    avertir: &mut dyn FnMut(String),
) -> io::Result<Arrivee> {
    let deja = file::charger_tout(dossier_file, avertir)?;
    let mut arrivee = Arrivee::default();

    for origine in origines {
        let nom = origine.file_name().and_then(|n| n.to_str()).unwrap_or("").to_owned();
        if nom.is_empty() {
            arrivee.refuses.push((origine.display().to_string(), "Ce chemin ne désigne pas un fichier.".to_owned()));
            continue;
        }
        let Some(contenu) = contenu_de(&nom) else {
            arrivee
                .refuses
                .push((nom, "Liénothèque ne sait pas encore lire ce type de fichier.".to_owned()));
            continue;
        };

        let empreinte = match empreinte_de(origine) {
            Ok(empreinte) => empreinte,
            Err(e) => {
                arrivee.refuses.push((nom, format!("Fichier illisible : {e}")));
                continue;
            }
        };

        // Déjà là : on rend le travail existant plutôt que d'en créer un second (JOB-04).
        if let Some(connu) = deja.iter().find(|t| t.empreinte.as_deref() == Some(empreinte.as_str())) {
            arrivee.travaux.push(connu.clone());
            continue;
        }

        // La copie d'abord : un travail qui désignerait un fichier absent ne se reprendrait pas.
        // L'original n'est jamais déplacé ni modifié.
        if let Err(e) = depot.deposer_source(origine) {
            arrivee.refuses.push((nom, format!("Copie impossible : {e}")));
            continue;
        }

        let mut neuf = Travail::neuf(&uuid::Uuid::new_v4().to_string(), "traitement-de-lot", 0);
        neuf.version_cible = uuid::Uuid::new_v4().to_string();
        neuf.empreinte = Some(empreinte);
        neuf.sujet = Some(Sujet { nom: nom.clone(), contenu: contenu.to_owned() });

        // Écrit avant que rien ne commence (JOB-01) : l'application peut être tuée à l'instant
        // d'après, le travail se retrouve au redémarrage.
        travail::enregistrer(&dossier_file.join(format!("{}.json", neuf.id)), &neuf)?;
        arrivee.travaux.push(neuf);
    }

    Ok(arrivee)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bac(nom: &str) -> PathBuf {
        let chemin = std::env::temp_dir().join(format!("lienotheque-arrivee-{nom}-{}", std::process::id()));
        fs::remove_dir_all(&chemin).ok();
        fs::create_dir_all(&chemin).expect("bac");
        chemin
    }

    fn fichier(dossier: &Path, nom: &str, contenu: &[u8]) -> PathBuf {
        let chemin = dossier.join(nom);
        fs::write(&chemin, contenu).expect("fichier");
        chemin
    }

    #[test]
    fn reconnait_ce_qu_un_fichier_apporte_sans_regarder_son_nom() {
        assert_eq!(contenu_de("UN DOCUMENT.PDF"), Some("documents"));
        assert_eq!(contenu_de("piste.mp3"), Some("audio"));
        assert_eq!(contenu_de("seance.mov"), Some("videos"));
        assert_eq!(contenu_de("planche.webp"), Some("images"));
    }

    #[test]
    fn ne_range_pas_au_hasard_ce_dont_il_ne_sait_rien() {
        assert_eq!(contenu_de("archive.zip"), None);
        assert_eq!(contenu_de("sans-extension"), None);
    }

    #[test]
    fn copie_l_original_sans_le_toucher_et_met_un_travail_en_file() {
        let racine = bac("depot");
        let source = bac("source");
        let origine = fichier(&source, "un-document.pdf", b"des octets");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");
        let dossier_file = racine.join("file");

        let arrivee = deposer(&depot, &dossier_file, &[origine.clone()], &mut |_| {}).expect("dépôt");

        assert_eq!(arrivee.travaux.len(), 1);
        assert_eq!(arrivee.refuses.len(), 0);
        assert!(origine.exists(), "l'original n'est jamais déplacé");
        assert_eq!(fs::read(&origine).expect("original"), b"des octets", "ni modifié");
        assert!(depot.racine().join(crate::depot::SOURCES).join("un-document.pdf").exists());

        // Écrit avant que rien ne commence (JOB-01) : il se relit au redémarrage.
        let relus = file::charger_tout(&dossier_file, &mut |_| {}).expect("file");
        assert_eq!(relus.len(), 1);
        assert_eq!(relus[0].etat, "en_file");
        assert_eq!(relus[0].sujet.as_ref().map(|s| s.contenu.as_str()), Some("documents"));
        assert_eq!(relus[0].total, 0, "le total s'apprend en ouvrant le fichier");

        fs::remove_dir_all(&racine).ok();
        fs::remove_dir_all(&source).ok();
    }

    #[test]
    fn redeposer_le_meme_contenu_ne_cree_pas_un_second_travail() {
        let racine = bac("idempotence");
        let source = bac("idempotence-source");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");
        let dossier_file = racine.join("file");

        let premier = fichier(&source, "un-document.pdf", b"les memes octets");
        let premiere = deposer(&depot, &dossier_file, &[premier], &mut |_| {}).expect("premier dépôt");

        // Le même contenu, sous un autre nom : c'est le contenu qui décide (JOB-04).
        let second = fichier(&source, "copie.pdf", b"les memes octets");
        let seconde = deposer(&depot, &dossier_file, &[second], &mut |_| {}).expect("second dépôt");

        assert_eq!(seconde.travaux[0].id, premiere.travaux[0].id);
        assert_eq!(file::charger_tout(&dossier_file, &mut |_| {}).expect("file").len(), 1);

        fs::remove_dir_all(&racine).ok();
        fs::remove_dir_all(&source).ok();
    }

    #[test]
    fn un_fichier_refuse_n_empeche_pas_les_autres_d_entrer() {
        let racine = bac("refus");
        let source = bac("refus-source");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");
        let dossier_file = racine.join("file");

        let bon = fichier(&source, "un-document.pdf", b"des octets");
        let inconnu = fichier(&source, "archive.zip", b"des octets");
        let arrivee = deposer(&depot, &dossier_file, &[inconnu, bon], &mut |_| {}).expect("dépôt");

        assert_eq!(arrivee.travaux.len(), 1);
        assert_eq!(arrivee.refuses.len(), 1);
        assert_eq!(arrivee.refuses[0].0, "archive.zip");
        assert!(arrivee.refuses[0].1.contains("ne sait pas encore lire"));

        fs::remove_dir_all(&racine).ok();
        fs::remove_dir_all(&source).ok();
    }

    #[test]
    fn deux_fichiers_differents_font_deux_travaux() {
        let racine = bac("deux");
        let source = bac("deux-source");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");
        let dossier_file = racine.join("file");

        let un = fichier(&source, "un-document.pdf", b"premiers octets");
        let autre = fichier(&source, "une-piste.mp3", b"autres octets");
        let arrivee = deposer(&depot, &dossier_file, &[un, autre], &mut |_| {}).expect("dépôt");

        assert_eq!(arrivee.travaux.len(), 2);
        let contenus: Vec<&str> = arrivee
            .travaux
            .iter()
            .filter_map(|t| t.sujet.as_ref().map(|s| s.contenu.as_str()))
            .collect();
        assert!(contenus.contains(&"documents") && contenus.contains(&"audio"));

        fs::remove_dir_all(&racine).ok();
        fs::remove_dir_all(&source).ok();
    }
}
