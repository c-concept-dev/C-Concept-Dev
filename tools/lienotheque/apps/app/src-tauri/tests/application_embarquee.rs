use lienotheque_bureau::application_embarquee::{
    comparer_marqueurs, etat_application, installer_application, produire_marqueur,
    ComparaisonMarqueurs,
};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

fn ecrire_fausse_application(racine: &Path, contenu: &str, version: &str) {
    let executable = racine.join("Contents/MacOS/lienotheque-bureau");
    fs::create_dir_all(executable.parent().expect("dossier MacOS")).expect("créer la fausse app");
    fs::write(executable, contenu).expect("écrire le faux exécutable");
    fs::write(
        racine.join("Contents/Info.plist"),
        format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleShortVersionString</key><string>{version}</string>
</dict></plist>"#),
    )
    .expect("écrire la version incluse dans l'application");
}

#[test]
fn compare_explicitement_la_version_et_le_contenu() {
    let temp = tempfile::tempdir().expect("dossier temporaire");
    let source = temp.path().join("source.app");
    let embarquee = temp.path().join("embarquee.app");
    ecrire_fausse_application(&source, "nouvelle application", "0.2.0");
    ecrire_fausse_application(&embarquee, "ancienne application", "0.1.0");

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
    let cible = bibliotheque.join("applications/Liénothèque.app");
    ecrire_fausse_application(&source, "nouvelle application", "0.2.0");
    ecrire_fausse_application(&cible, "ancienne application", "0.1.0");
    fs::create_dir_all(bibliotheque.join("applications/macOS")).expect("ancien sous-dossier");
    fs::write(bibliotheque.join("applications/version.json"), "ancien marqueur")
        .expect("ancien marqueur");
    fs::write(bibliotheque.join("applications/.DS_Store"), "métadonnée Finder")
        .expect("ancienne métadonnée Finder");

    for dossier in ["sources", "derives", "base"] {
        let sentinelle = bibliotheque.join(dossier).join("NE-PAS-TOUCHER.txt");
        fs::create_dir_all(sentinelle.parent().expect("parent sentinelle"))
            .expect("créer le dossier de données");
        fs::write(&sentinelle, format!("sentinelle {dossier}"))
            .expect("écrire la sentinelle");
    }

    let marqueur = produire_marqueur(&source, "0.2.0").expect("marqueur source");
    let installation =
        installer_application(&source, &bibliotheque, &marqueur).expect("mise à jour explicite");
    assert!(
        installation.residus.is_empty(),
        "rien ne devait résister au ménage : {:?}",
        installation.residus
    );

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
    let contenu_applications = fs::read_dir(bibliotheque.join("applications"))
        .expect("lire applications")
        .map(|entree| entree.expect("entrée lisible").file_name())
        .collect::<Vec<_>>();
    assert_eq!(contenu_applications, ["Liénothèque.app"]);
    let etat = etat_application(&source, &bibliotheque, "0.2.0")
        .expect("relire la version depuis le paquet seul");
    assert_eq!(etat.statut, "a_jour");
    assert_eq!(etat.version_embarquee.as_deref(), Some("0.2.0"));
}

/// Le ménage de l'ancienne disposition vient **après** la mise en place de l'application neuve.
/// S'il échoue, l'installation a pourtant réussi : la dire ratée ferait croire à l'utilisateur
/// qu'il n'a pas la nouvelle version, alors qu'il l'a. Le résidu se signale, il ne bloque pas.
#[test]
fn une_installation_reussie_ne_devient_pas_un_echec_quand_le_menage_resiste() {
    let temp = tempfile::tempdir().expect("dossier temporaire");
    let bibliotheque = temp.path().join("Bibliothèque");
    let source = temp.path().join("Liénothèque.app");
    let cible = bibliotheque.join("applications/Liénothèque.app");
    ecrire_fausse_application(&source, "nouvelle application", "0.2.0");
    ecrire_fausse_application(&cible, "ancienne application", "0.1.0");

    // Un dossier dont on ne peut pas retirer le contenu : le ménage y butera.
    let ancienne_disposition = bibliotheque.join("applications/macOS");
    fs::create_dir_all(&ancienne_disposition).expect("ancien sous-dossier");
    fs::write(ancienne_disposition.join("résidu.txt"), "reste").expect("écrire le résidu");
    fs::set_permissions(&ancienne_disposition, fs::Permissions::from_mode(0o500))
        .expect("rendre le dossier non balayable");

    let marqueur = produire_marqueur(&source, "0.2.0").expect("marqueur source");
    let installation = installer_application(&source, &bibliotheque, &marqueur)
        .expect("un ménage incomplet ne rate pas l'installation");

    assert_eq!(
        fs::read_to_string(cible.join("Contents/MacOS/lienotheque-bureau"))
            .expect("lire la nouvelle app"),
        "nouvelle application",
        "la nouvelle application doit bien être en place"
    );
    assert_eq!(installation.application, cible);
    assert_eq!(installation.residus.len(), 1, "{:?}", installation.residus);
    assert!(
        installation.residus[0].contains("macOS"),
        "le résidu doit nommer ce qui reste : {}",
        installation.residus[0]
    );
    let etat = etat_application(&source, &bibliotheque, "0.2.0").expect("relire l'état");
    assert_eq!(etat.statut, "a_jour", "la bibliothèque porte bien la nouvelle version");

    fs::set_permissions(&ancienne_disposition, fs::Permissions::from_mode(0o700))
        .expect("rendre le dossier temporaire supprimable");
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
        .expect("copier le vrai paquet")
        .application;
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

#[test]
#[ignore = "qualification locale du paquet macOS construit"]
fn le_node_du_paquet_garde_ses_droits_jit_et_demarre() {
    let paquet = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target/release/bundle/macos/Liénothèque.app");
    let node = paquet.join("Contents/MacOS/node");
    assert!(node.is_file(), "le paquet construit doit contenir le moteur Node");

    let droits = Command::new("codesign")
        .args(["-d", "--entitlements", ":-"])
        .arg(&node)
        .output()
        .expect("lire les droits du moteur empaqueté");
    let texte = format!(
        "{}{}",
        String::from_utf8_lossy(&droits.stdout),
        String::from_utf8_lossy(&droits.stderr),
    );
    assert!(
        texte.contains("com.apple.security.cs.allow-jit"),
        "le paquet a retiré allow-jit du moteur Node : {texte}"
    );

    let demarrage = Command::new(&node)
        .args(["--max-old-space-size=2048", "-e", "console.log('moteur du paquet vivant')"])
        .output()
        .expect("lancer le moteur du paquet");
    assert!(
        demarrage.status.success(),
        "le moteur du paquet ne démarre pas : statut {:?}\n{}",
        demarrage.status,
        String::from_utf8_lossy(&demarrage.stderr),
    );
}
