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
    archive,
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
        "zip" => "archive",
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

/// Ce qu'un dépôt a donné.
#[derive(Debug, Default)]
pub struct Arrivee {
    /// Les travaux en file après ce dépôt — y compris ceux qui y étaient déjà (JOB-04).
    pub travaux: Vec<Travail>,
    /// Ce qui est déposé mais ne se lit pas seul : les enregistrements, les vidéos, les images.
    ///
    /// Le moteur lit un document **et les médias qui l'accompagnent**, ensemble : c'est ainsi
    /// qu'un élément de la page 127 se relie au bon moment de sa piste. Un travail par fichier
    /// audio ne partirait donc jamais — il n'y aurait rien à lire. Ils sont copiés dans la
    /// bibliothèque et attendent le document qui les nommera.
    pub accompagnements: Vec<(String, String)>,
    /// Les fichiers refusés, et pourquoi. Jamais avalés : on dit lesquels, et ce qui cloche.
    pub refuses: Vec<(String, String)>,
}

/// Dépose des fichiers et met un travail en file par document (JOB-01, JOB-04).
///
/// Un travail par **document**, et non par fichier : le moteur lit un document et les médias qui
/// l'accompagnent ensemble, et un travail qui ne porterait qu'un fichier audio n'aurait rien à
/// lire. Les médias sont copiés et attendent le document qui les nommera.
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
    let mut deja = file::charger_tout(dossier_file, avertir)?;
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

        if contenu == "archive" {
            match archive::extraire(origine) {
                Ok(extraite) => {
                    let fichiers = extraite
                        .fichiers
                        .iter()
                        .map(|fichier| FichierPret {
                            chemin: &fichier.chemin,
                            nom: fichier.nom.as_str(),
                            medias_accompagnants: !est_supplement(&fichier.nom),
                        })
                        .collect::<Vec<_>>();
                    deposer_prepares(depot, dossier_file, &fichiers, &mut deja, &mut arrivee);
                }
                Err(raison) => arrivee.refuses.push((nom, raison)),
            }
            continue;
        }

        deposer_prepares(
            depot,
            dossier_file,
            &[FichierPret { chemin: origine, nom: &nom, medias_accompagnants: true }],
            &mut deja,
            &mut arrivee,
        );
    }

    Ok(arrivee)
}

struct FichierPret<'a> {
    chemin: &'a Path,
    nom: &'a str,
    medias_accompagnants: bool,
}

fn est_supplement(nom: &str) -> bool {
    Path::new(nom)
        .components()
        .any(|partie| partie.as_os_str().to_str().is_some_and(|texte| texte.eq_ignore_ascii_case("supplements")))
}

/// Dépose des fichiers déjà validés. Pour un ZIP, cette fonction n'est appelée qu'après que
/// toutes ses entrées ont été inspectées et ouvertes avec succès dans l'espace temporaire.
fn deposer_prepares(
    depot: &Depot,
    dossier_file: &Path,
    fichiers: &[FichierPret<'_>],
    deja: &mut Vec<Travail>,
    arrivee: &mut Arrivee,
) {
    for fichier in fichiers {
        let nom_complet = fichier.nom.to_owned();
        let nom_fichier = Path::new(fichier.nom)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(fichier.nom)
            .to_owned();
        let Some(contenu) = contenu_de(&nom_fichier) else {
            arrivee.refuses.push((nom_complet, "Liénothèque ne sait pas encore lire ce type de fichier.".to_owned()));
            continue;
        };

        let empreinte = match empreinte_de(fichier.chemin) {
            Ok(empreinte) => empreinte,
            Err(e) => {
                arrivee.refuses.push((nom_complet, format!("Fichier illisible : {e}")));
                continue;
            }
        };

        // Déjà là : on rend le travail existant plutôt que d'en créer un second (JOB-04).
        if let Some(index) = deja.iter().position(|t| t.empreinte.as_deref() == Some(empreinte.as_str())) {
            let mut connu = deja[index].clone();
            if connu.sujet.as_ref().is_some_and(|sujet| sujet.medias_accompagnants != fichier.medias_accompagnants) {
                if let Some(sujet) = connu.sujet.as_mut() {
                    sujet.medias_accompagnants = fichier.medias_accompagnants;
                }
                if let Err(e) = travail::enregistrer(&dossier_file.join(format!("{}.json", connu.id)), &connu) {
                    arrivee.refuses.push((nom_complet, format!("Rôle du document impossible à écrire : {e}")));
                    continue;
                }
                deja[index] = connu.clone();
            }
            arrivee.travaux.push(connu);
            continue;
        }

        // La copie d'abord : un travail qui désignerait un fichier absent ne se reprendrait pas.
        // L'original n'est jamais déplacé ni modifié.
        if let Err(e) = depot.deposer_source(fichier.chemin, &empreinte) {
            arrivee.refuses.push((nom_complet, format!("Copie impossible : {e}")));
            continue;
        }

        if contenu != "documents" {
            let extension = fichier.chemin.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_ascii_lowercase();
            if let Err(e) = depot.enregistrer_media(crate::depot::MediaDepose {
                empreinte: empreinte.clone(),
                nom: nom_complet.clone(),
                contenu: contenu.to_owned(),
                extension,
            }) {
                arrivee.refuses.push((nom_complet, format!("Inventaire impossible à écrire : {e}")));
                continue;
            }
            arrivee.accompagnements.push((nom_complet, contenu.to_owned()));
            continue;
        }

        let mut neuf = Travail::neuf(&uuid::Uuid::new_v4().to_string(), "traitement-de-lot", 0);
        neuf.version_cible = uuid::Uuid::new_v4().to_string();
        neuf.empreinte = Some(empreinte);
        neuf.sujet = Some(Sujet {
            nom: nom_fichier,
            contenu: contenu.to_owned(),
            medias_accompagnants: fichier.medias_accompagnants,
        });

        // Écrit avant que rien ne commence (JOB-01) : l'application peut être tuée à l'instant
        // d'après, le travail se retrouve au redémarrage.
        match travail::enregistrer(&dossier_file.join(format!("{}.json", neuf.id)), &neuf) {
            Ok(()) => {
                deja.push(neuf.clone());
                arrivee.travaux.push(neuf);
            }
            Err(e) => arrivee.refuses.push((nom_complet, format!("Mise en file impossible : {e}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};

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

    fn archive(dossier: &Path, nom: &str, entrees: &[(&str, &[u8])]) -> PathBuf {
        let chemin = dossier.join(nom);
        let fichier = fs::File::create(&chemin).expect("archive");
        let mut zip = ZipWriter::new(fichier);
        for (nom, contenu) in entrees {
            zip.start_file(*nom, SimpleFileOptions::default()).expect("entrée");
            zip.write_all(contenu).expect("contenu");
        }
        zip.finish().expect("fin d'archive");
        chemin
    }

    fn sources(dossier: &Path) -> usize {
        fs::read_dir(dossier.join("sources"))
            .into_iter()
            .flatten()
            .flatten()
            .flat_map(|palier| fs::read_dir(palier.path()).into_iter().flatten().flatten())
            .count()
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
        assert_eq!(contenu_de("archive.zip"), Some("archive"));
        assert_eq!(contenu_de("sans-extension"), None);
    }

    #[test]
    fn c9_1_depose_un_pdf_et_ses_mp3_en_un_seul_zip_sans_modifier_l_original() {
        let racine = bac("zip-valide");
        let source = bac("zip-valide-source");
        let origine = archive(
            &source,
            "methode.zip",
            &[("Méthode.pdf", b"pdf"), ("CD1/Piste 01.mp3", b"un"), ("CD2/Piste 01.mp3", b"deux")],
        );
        let avant = fs::read(&origine).expect("original");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine.clone()], &mut |_| {}).expect("dépôt ZIP");

        assert_eq!(arrivee.refuses, Vec::<(String, String)>::new());
        assert_eq!(arrivee.travaux.len(), 1);
        assert_eq!(arrivee.travaux[0].sujet.as_ref().map(|s| s.nom.as_str()), Some("Méthode.pdf"));
        assert_eq!(
            arrivee.accompagnements,
            vec![
                ("CD1/Piste 01.mp3".to_owned(), "audio".to_owned()),
                ("CD2/Piste 01.mp3".to_owned(), "audio".to_owned()),
            ]
        );
        assert_eq!(depot.medias().expect("inventaire").iter().map(|m| m.nom.as_str()).collect::<Vec<_>>(), vec![
            "CD1/Piste 01.mp3",
            "CD2/Piste 01.mp3",
        ]);
        assert_eq!(fs::read(&origine).expect("original"), avant, "l'archive d'origine reste intacte");
        assert_eq!(sources(depot.racine()), 3, "le ZIP lui-même n'est pas copié");
    }

    #[test]
    fn c9_1_refuse_une_archive_incomplete_avec_une_action_a_faire() {
        let racine = bac("zip-incomplet");
        let source = bac("zip-incomplet-source");
        let origine = archive(&source, "sans-audio.zip", &[("Méthode.pdf", b"pdf")]);
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("refus expliqué");

        assert_eq!(arrivee.refuses.len(), 1);
        assert!(arrivee.refuses[0].1.contains("MP3"));
        assert!(arrivee.refuses[0].1.contains("Ajoutez"));
        assert_eq!(sources(depot.racine()), 0);
    }

    #[test]
    fn c9_1_depose_plusieurs_pdf_et_leurs_mp3_dans_un_meme_zip() {
        let racine = bac("zip-deux-pdf");
        let source = bac("zip-deux-pdf-source");
        let origine = archive(
            &source,
            "Methode.zip",
            &[("Methode/Methode.pdf", b"un"), ("Methode/Supplements/Methode - Supplement.pdf", b"deux"), ("Methode/Piste 01.mp3", b"audio")],
        );
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("dépôt ZIP");

        assert!(arrivee.refuses.is_empty());
        assert_eq!(
            arrivee
                .travaux
                .iter()
                .filter_map(|travail| travail.sujet.as_ref().map(|sujet| sujet.nom.as_str()))
                .collect::<Vec<_>>(),
            vec!["Methode.pdf", "Methode - Supplement.pdf"]
        );
        assert!(arrivee.travaux[0].sujet.as_ref().expect("méthode").medias_accompagnants);
        assert!(!arrivee.travaux[1].sujet.as_ref().expect("supplément").medias_accompagnants);
        assert_eq!(arrivee.accompagnements, vec![("Methode/Piste 01.mp3".to_owned(), "audio".to_owned())]);
        assert_eq!(sources(depot.racine()), 3);
        assert_eq!(file::charger_tout(&depot.travaux(), &mut |_| {}).expect("file").len(), 2);
    }

    #[test]
    fn c9_1_refuse_un_chemin_dangereux_et_n_ecrit_rien_hors_du_bac() {
        let racine = bac("zip-traversee");
        let source = bac("zip-traversee-source");
        let origine = archive(
            &source,
            "dangereux.zip",
            &[("Méthode.pdf", b"pdf"), ("../hors.mp3", b"audio")],
        );
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("refus expliqué");

        assert!(arrivee.refuses[0].1.contains("chemin dangereux"));
        assert_eq!(sources(depot.racine()), 0);
        assert!(!source.parent().expect("parent").join("hors.mp3").exists());
    }

    #[test]
    fn c9_1_une_entree_inconnue_annule_tout_le_zip() {
        let racine = bac("zip-entree-inconnue");
        let source = bac("zip-entree-inconnue-source");
        let origine = archive(
            &source,
            "avec-inconnu.zip",
            &[("Méthode.pdf", b"pdf"), ("Piste 01.mp3", b"audio"), ("lisez-moi.exe", b"non")],
        );
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("refus expliqué");

        assert!(arrivee.refuses[0].1.contains("lisez-moi.exe"));
        assert!(arrivee.refuses[0].1.contains("Retirez"));
        assert_eq!(sources(depot.racine()), 0, "aucune entrée valide ne fuit d'un ZIP refusé");
        assert!(depot.medias().expect("inventaire").is_empty());
    }

    #[test]
    fn c9_1_redeposer_le_meme_zip_ne_duplique_ni_travail_ni_media() {
        let racine = bac("zip-idempotent");
        let source = bac("zip-idempotent-source");
        let origine = archive(&source, "methode.zip", &[("Méthode.pdf", b"pdf"), ("Piste 01.mp3", b"audio")]);
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let premier = deposer(&depot, &depot.travaux(), &[origine.clone()], &mut |_| {}).expect("premier");
        let second = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("second");

        assert_eq!(second.travaux[0].id, premier.travaux[0].id);
        assert_eq!(file::charger_tout(&depot.travaux(), &mut |_| {}).expect("file").len(), 1);
        assert_eq!(depot.medias().expect("inventaire").len(), 1);
    }

    #[test]
    fn c9_1_refuse_un_zip_corrompu_avec_une_explication() {
        let racine = bac("zip-corrompu");
        let source = bac("zip-corrompu-source");
        let origine = fichier(&source, "corrompu.zip", b"ceci n'est pas un zip");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("refus expliqué");

        assert!(arrivee.refuses[0].1.contains("endommagé ou incomplet"));
        assert!(arrivee.refuses[0].1.contains("Recréez"));
        assert_eq!(sources(depot.racine()), 0);
    }

    #[test]
    fn c9_1_refuse_un_zip_sans_pdf_avec_une_action_a_faire() {
        let racine = bac("zip-sans-pdf");
        let source = bac("zip-sans-pdf-source");
        let origine = archive(&source, "sans-pdf.zip", &[("Piste 01.mp3", b"audio")]);
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("refus expliqué");

        assert!(arrivee.refuses[0].1.contains("aucun PDF"));
        assert!(arrivee.refuses[0].1.contains("Ajoutez"));
        assert_eq!(sources(depot.racine()), 0);
    }

    #[test]
    fn c9_1_refuse_une_compression_anormale_avant_toute_ecriture() {
        let racine = bac("zip-compression");
        let source = bac("zip-compression-source");
        let chemin = source.join("compression-extreme.zip");
        let mut zip = ZipWriter::new(fs::File::create(&chemin).expect("archive"));
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("Méthode.pdf", options).expect("pdf");
        zip.write_all(&vec![0_u8; 2 * 1_048_576]).expect("contenu très compressible");
        zip.start_file("Piste 01.mp3", options).expect("mp3");
        zip.write_all(b"audio").expect("audio");
        zip.finish().expect("fin");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[chemin], &mut |_| {}).expect("refus expliqué");

        assert!(arrivee.refuses[0].1.contains("décompresse anormalement"));
        assert_eq!(sources(depot.racine()), 0);
    }

    #[test]
    fn c9_1_borne_le_nombre_d_entrees_avant_de_les_ouvrir() {
        let racine = bac("zip-entrees");
        let source = bac("zip-entrees-source");
        let chemin = source.join("trop-d-entrees.zip");
        let mut zip = ZipWriter::new(fs::File::create(&chemin).expect("archive"));
        for rang in 0..=crate::limites::LIMITES.archive_entrees_max {
            zip.start_file(format!("Piste {rang}.mp3"), SimpleFileOptions::default()).expect("entrée");
        }
        zip.finish().expect("fin");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[chemin], &mut |_| {}).expect("refus expliqué");

        assert!(arrivee.refuses[0].1.contains("maximum"));
        assert!(arrivee.refuses[0].1.contains("plusieurs ZIP"));
        assert_eq!(sources(depot.racine()), 0);
    }

    #[test]
    #[ignore = "preuve manuelle sur le corpus privé : définir LIENOTHEQUE_C9_ZIP"]
    fn c9_1_preuve_reelle_un_pdf_et_quatre_vingt_dix_neuf_mp3() {
        let origine = PathBuf::from(std::env::var("LIENOTHEQUE_C9_ZIP").expect("LIENOTHEQUE_C9_ZIP"));
        let racine = bac("zip-reel");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &[origine], &mut |_| {}).expect("dépôt réel");

        assert!(arrivee.refuses.is_empty());
        assert_eq!(arrivee.travaux.len(), 1);
        assert_eq!(arrivee.accompagnements.len(), 99);
        assert_eq!(depot.medias().expect("inventaire").len(), 99);
        assert_eq!(sources(depot.racine()), 100);
    }

    #[test]
    #[ignore = "preuve manuelle sur la bibliothèque musicale privée"]
    fn c9_1_preuve_reelle_depose_deux_archives_multi_pdf() {
        let racine = PathBuf::from(std::env::var("LIENOTHEQUE_C9_BIBLIOTHEQUE").expect("bibliothèque"));
        let origines = [
            PathBuf::from(std::env::var("LIENOTHEQUE_C9_ZIP_021").expect("ZIP 021")),
            PathBuf::from(std::env::var("LIENOTHEQUE_C9_ZIP_041").expect("ZIP 041")),
        ];
        let depot = Depot::ouvrir(racine).expect("dépôt");

        let arrivee = deposer(&depot, &depot.travaux(), &origines, &mut |_| {}).expect("dépôt réel");

        assert!(arrivee.refuses.is_empty(), "refus inattendus : {:?}", arrivee.refuses);
        assert_eq!(arrivee.travaux.len(), 4, "deux documents par archive");
        assert_eq!(arrivee.accompagnements.len(), 50, "33 + 17 MP3");
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
        // Rangée sous son empreinte : c'est ce qui empêche deux documents de même nom de
        // s'écraser l'un l'autre.
        let posee = arrivee.travaux[0].empreinte.as_deref().expect("empreinte");
        assert!(depot.source(posee, "pdf").exists());

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
        let inconnu = fichier(&source, "inconnu.xyz", b"des octets");
        let arrivee = deposer(&depot, &dossier_file, &[inconnu, bon], &mut |_| {}).expect("dépôt");

        assert_eq!(arrivee.travaux.len(), 1);
        assert_eq!(arrivee.refuses.len(), 1);
        assert_eq!(arrivee.refuses[0].0, "inconnu.xyz");
        assert!(arrivee.refuses[0].1.contains("ne sait pas encore lire"));

        fs::remove_dir_all(&racine).ok();
        fs::remove_dir_all(&source).ok();
    }

    #[test]
    fn un_media_est_copie_mais_ne_fait_pas_un_travail_a_lui_seul() {
        let racine = bac("deux");
        let source = bac("deux-source");
        let depot = Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt");
        let dossier_file = racine.join("file");

        let un = fichier(&source, "un-document.pdf", b"premiers octets");
        let autre = fichier(&source, "une-piste.mp3", b"autres octets");
        let arrivee = deposer(&depot, &dossier_file, &[un, autre], &mut |_| {}).expect("dépôt");

        // Un travail par document : le moteur lit un document et ses médias ensemble, et un
        // travail qui ne porterait qu'une piste n'aurait rien à lire.
        assert_eq!(arrivee.travaux.len(), 1);
        assert_eq!(arrivee.travaux[0].sujet.as_ref().map(|s| s.contenu.as_str()), Some("documents"));
        assert_eq!(arrivee.accompagnements, vec![("une-piste.mp3".to_owned(), "audio".to_owned())]);

        // Copiée tout de même : elle attend le document qui la nommera.
        let empreinte_piste = crate::arrivee::empreinte_de(&source.join("une-piste.mp3")).expect("empreinte");
        assert!(depot.source(&empreinte_piste, "mp3").exists());
        assert_eq!(
            depot.medias().expect("inventaire"),
            vec![crate::depot::MediaDepose {
                empreinte: empreinte_piste,
                nom: "une-piste.mp3".to_owned(),
                contenu: "audio".to_owned(),
                extension: "mp3".to_owned(),
            }],
            "le nom d'origine voyage avec la source rangée par empreinte (REC-05, ANC-05)"
        );

        fs::remove_dir_all(&racine).ok();
        fs::remove_dir_all(&source).ok();
    }
}
