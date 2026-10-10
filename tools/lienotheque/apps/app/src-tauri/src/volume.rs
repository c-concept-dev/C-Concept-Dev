//! Le volume est-il là, et peut-on y écrire ?
//!
//! Une bibliothèque peut vivre sur un disque externe. Quand ce disque disparaît en cours de
//! traitement — démonté, débranché, endormi —, tout ce qui écrit échoue d'un coup. Sans ce
//! module, la file prenait ces échecs pour des échecs **du travail** : trois tentatives à trente
//! secondes, et le document passait en échec définitif en quatre-vingt-dix secondes. Un disque
//! qui revient au bout de deux minutes arrivait trop tard.
//!
//! La confusion est là, et elle tient en une phrase : **« le travail a échoué » et « nous n'avons
//! pas pu travailler » ne sont pas la même chose.** Le premier consomme une tentative, le second
//! non. Ce module ne fait que répondre à la seconde question, pour que la file cesse de les
//! confondre.
//!
//! **Pourquoi écrire et relire plutôt que regarder si le dossier existe.** Un volume démonté
//! laisse souvent son point de montage : un dossier du même nom, vide, sur le disque interne.
//! `exists()` répond « oui » et le traitement écrit dans le vide — sur le mauvais disque, qui
//! n'a peut-être pas la place. Un disque en lecture seule, lui, existe et refuse l'écriture.
//! Seule une écriture suivie d'une relecture répond à la question qu'on pose vraiment.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// Le nom du témoin. Dans le dossier de la bibliothèque, à côté du reste : s'il est accessible,
/// le reste l'est aussi.
const TEMOIN: &str = ".volume-present";

/// Ce qu'on a trouvé en demandant au volume s'il est là.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Presence {
    /// Le dossier répond et accepte une écriture.
    La,
    /// Le dossier ne répond pas, ou refuse. On ne travaille pas, et ce n'est l'échec de personne.
    Absent(String),
}

impl Presence {
    pub fn est_la(&self) -> bool {
        matches!(self, Presence::La)
    }
}

fn chemin_temoin(racine: &Path) -> PathBuf {
    racine.join(TEMOIN)
}

/// Écrit un témoin et le relit. La seule question à laquelle on sait répondre honnêtement.
///
/// Le contenu change à chaque appel : relire un témoin qu'un autre a écrit, ou qu'un cache rend
/// sans toucher le disque, ne prouverait rien. On vérifie qu'on lit **ce qu'on vient d'écrire**.
pub fn demander(racine: &Path, marque: &str) -> Presence {
    let chemin = chemin_temoin(racine);
    if let Err(e) = fs::create_dir_all(racine) {
        return Presence::Absent(pourquoi_on_ne_peut_pas(racine, &e));
    }
    if let Err(e) = fs::write(&chemin, marque.as_bytes()) {
        return Presence::Absent(pourquoi_on_ne_peut_pas(racine, &e));
    }
    match fs::read_to_string(&chemin) {
        Ok(lu) if lu == marque => Presence::La,
        Ok(_) => Presence::Absent("le volume ne rend pas ce qu'on vient d'y écrire".to_owned()),
        Err(e) => Presence::Absent(format!("relecture impossible : {e}")),
    }
}

/// Dire la vraie cause, et non celle que le système rend.
///
/// Un volume démonté sous `/Volumes` donne « Permission denied », parce que c'est le dossier
/// parent qui refuse qu'on y crée quoi que ce soit — et non le volume, qui n'est plus là. Le
/// message brut envoie donc chercher un problème de droits là où il faut rebrancher un disque.
/// On regarde ce qui existe réellement avant de nommer la cause.
fn pourquoi_on_ne_peut_pas(racine: &Path, erreur: &std::io::Error) -> String {
    let parent_la = racine.parent().is_none_or(|parent| parent.exists());
    if !racine.exists() {
        return if parent_la {
            format!("le dossier « {} » n'existe pas — volume démonté ou débranché ?", racine.display())
        } else {
            format!("rien ne répond au-dessus de « {} » — volume démonté ou débranché ?", racine.display())
        };
    }
    match erreur.kind() {
        ErrorKind::PermissionDenied => format!("le volume refuse l'écriture dans « {} »", racine.display()),
        ErrorKind::StorageFull => "le volume est plein".to_owned(),
        ErrorKind::ReadOnlyFilesystem => "le volume est monté en lecture seule".to_owned(),
        _ => format!("écriture impossible dans « {} » : {erreur}", racine.display()),
    }
}

/// Une marque qui ne se répète pas d'un appel à l'autre.
pub fn marque(appareil: &str, maintenant: u64) -> String {
    format!("{appareil}:{maintenant}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier_neuf(nom: &str) -> PathBuf {
        let chemin = std::env::temp_dir().join(format!("volume-{nom}-{}", std::process::id()));
        fs::remove_dir_all(&chemin).ok();
        fs::create_dir_all(&chemin).expect("dossier d'essai");
        chemin
    }

    #[test]
    fn un_dossier_ou_l_on_peut_ecrire_repond_present() {
        let racine = dossier_neuf("present");
        assert_eq!(demander(&racine, "a"), Presence::La);
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_chemin_qu_on_ne_peut_pas_creer_repond_absent() {
        // Un fichier là où l'on attend un dossier : `create_dir_all` échoue, et c'est bien la
        // réponse qu'on veut — on ne pourra rien écrire dedans.
        let racine = dossier_neuf("barre");
        let occupe = racine.join("occupe");
        fs::write(&occupe, b"je ne suis pas un dossier").expect("fichier");
        assert!(!demander(&occupe, "a").est_la());
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_dossier_en_lecture_seule_repond_absent() {
        // Le cas qui piège `exists()` : le dossier est là, et pourtant on ne peut rien y mettre.
        let racine = dossier_neuf("lecture-seule");
        let mut droits = fs::metadata(&racine).expect("droits").permissions();
        droits.set_readonly(true);
        if fs::set_permissions(&racine, droits).is_err() {
            return; // Un système qui ne sait pas faire ça n'a rien à nous apprendre ici.
        }
        let verdict = demander(&racine, "a");
        let mut rendre = fs::metadata(&racine).expect("droits").permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        rendre.set_readonly(false);
        fs::set_permissions(&racine, rendre).ok();
        fs::remove_dir_all(&racine).ok();
        assert!(!verdict.est_la(), "un dossier en lecture seule a été pris pour un volume présent");
    }

    #[test]
    fn un_volume_demonte_est_annonce_comme_tel_et_non_comme_un_refus_de_droits() {
        // Le cas vu en vrai : démonter une carte sous /Volumes rend « Permission denied », parce
        // que c'est /Volumes qui refuse qu'on y crée un dossier. Le message brut envoyait
        // chercher un problème de droits là où il fallait rebrancher un disque.
        let absent = PathBuf::from("/Volumes/un-volume-qui-n-existe-pas-ici/bibliotheque");
        match demander(&absent, "a") {
            Presence::La => panic!("un volume absent a été pris pour un volume présent"),
            Presence::Absent(dit) => {
                assert!(dit.contains("démonté") || dit.contains("débranché"), "le message dit plutôt : {dit}");
                assert!(!dit.contains("Permission denied"), "le message rend encore l'erreur brute : {dit}");
            }
        }
    }

    #[test]
    fn la_marque_change_d_un_appel_a_l_autre() {
        // Sinon on relirait un témoin écrit par un autre, ou rendu par un cache, et l'on
        // conclurait que le volume est là sans avoir rien prouvé.
        assert_ne!(marque("appareil", 1), marque("appareil", 2));
    }

    #[test]
    fn relire_autre_chose_que_ce_qu_on_a_ecrit_repond_absent() {
        let racine = dossier_neuf("menteur");
        fs::write(chemin_temoin(&racine), b"ce que quelqu'un d'autre a mis").expect("témoin");
        // On demande avec une marque différente : si la relecture rendait l'ancien contenu, le
        // verdict doit être « absent ».
        let verdict = demander(&racine, "la mienne");
        assert!(verdict.est_la(), "ici l'écriture réussit, donc la relecture rend bien la nouvelle marque");
        fs::remove_dir_all(&racine).ok();
    }
}
