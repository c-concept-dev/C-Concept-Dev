use lienotheque_bureau::application_embarquee::{
    comparer_marqueurs, installer_application, produire_marqueur, ComparaisonMarqueurs,
};
use std::fs;
use std::path::Path;
use std::process::Command;

fn ecrire_fausse_application(racine: &Path, contenu: &str) {
    let executable = racine.join("Contents/MacOS/lienotheque-bureau");
    fs::create_dir_all(executable.parent().expect("dossier MacOS")).expect("créer la fausse app");
    fs::write(executable, contenu).expect("écrire le faux exécutable");
}

#[test]
fn compare_explicitement_la_version_et_le_contenu() {
    let temp = tempfile::tempdir().expect("dossier temporaire");
    let source = temp.path().join("source.app");
    let embarquee = temp.path().join("embarquee.app");
    ecrire_fausse_application(&source, "nouvelle application");
    ecrire_fausse_application(&embarquee, "ancienne application");

    let nouveau = produire_marqueur(&source, "0.2.0").expect("marqueur source");
    let ancien = produire_marqueur(&embarquee, "0.1.0").expect("marqueur embarqué");

    assert_eq!(
        comparer_marqueurs(&nouveau, Some(&ancien)),
        ComparaisonMarqueurs::MiseAJourDisponible
    );
    assert_eq!(
        comparer_marqueurs(&nouveau, Some(&nouveau)),
        ComparaisonMarqueurs::AJour
    );
}

#[test]
fn remplace_uniquement_application_et_preserve_toutes_les_donnees() {
    let temp = tempfile::tempdir().expect("dossier temporaire");
    let bibliotheque = temp.path().join("Bibliothèque");
    let source = temp.path().join("Liénothèque.app");
    let cible = bibliotheque.join("applications/macOS/Liénothèque.app");
    ecrire_fausse_application(&source, "nouvelle application");
    ecrire_fausse_application(&cible, "ancienne application");

    for dossier in ["sources", "derives", "base"] {
        let sentinelle = bibliotheque.join(dossier).join("NE-PAS-TOUCHER.txt");
        fs::create_dir_all(sentinelle.parent().expect("parent sentinelle"))
            .expect("créer le dossier de données");
        fs::write(&sentinelle, format!("sentinelle {dossier}"))
            .expect("écrire la sentinelle");
    }

    let marqueur = produire_marqueur(&source, "0.2.0").expect("marqueur source");
    installer_application(&source, &bibliotheque, &marqueur).expect("mise à jour explicite");

    assert_eq!(
        fs::read_to_string(cible.join("Contents/MacOS/lienotheque-bureau"))
            .expect("lire la nouvelle app"),
        "nouvelle application"
    );
    for dossier in ["sources", "derives", "base"] {
        assert_eq!(
            fs::read_to_string(bibliotheque.join(dossier).join("NE-PAS-TOUCHER.txt"))
                .expect("relire la sentinelle"),
            format!("sentinelle {dossier}")
        );
    }
    assert!(bibliotheque.join("applications/version.json").is_file());
}

#[test]
#[ignore = "qualification locale du vrai paquet macOS de 166 Mo"]
fn copie_le_vrai_paquet_sans_briser_sa_signature() {
    let source = Path::new("/Applications/Liénothèque.app");
    assert!(source.is_dir(), "le paquet installé doit être présent");
    let temp = tempfile::tempdir().expect("dossier temporaire");
    let bibliotheque = temp.path().join("Bibliothèque réelle");
    for dossier in ["sources", "derives", "base"] {
        let sentinelle = bibliotheque.join(dossier).join("NE-PAS-TOUCHER.txt");
        fs::create_dir_all(sentinelle.parent().expect("parent sentinelle"))
            .expect("créer le dossier de données");
        fs::write(&sentinelle, format!("sentinelle {dossier}"))
            .expect("écrire la sentinelle");
    }

    let marqueur = produire_marqueur(source, "0.1.0").expect("marqueur du vrai paquet");
    let cible = installer_application(source, &bibliotheque, &marqueur)
        .expect("copier le vrai paquet");
    let verification = Command::new("codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(&cible)
        .status()
        .expect("lancer codesign");
    assert!(verification.success(), "la signature ad hoc doit survivre à la copie");
    for dossier in ["sources", "derives", "base"] {
        assert_eq!(
            fs::read_to_string(bibliotheque.join(dossier).join("NE-PAS-TOUCHER.txt"))
                .expect("relire la sentinelle"),
            format!("sentinelle {dossier}")
        );
    }
}
