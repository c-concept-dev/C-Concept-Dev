//! Le dialogue de l'hôte avec un moteur, éprouvé sur un vrai processus (PLT-02, JOB-08).
//!
//! Les règles de lecture d'un message se tiennent dans les contrôles unitaires de `moteur.rs` :
//! elles ne demandent aucun processus. Ce qui en demande un — écouter jusqu'au silence, laisser
//! son délai à un moteur qui s'arrête, tuer celui qui ne rend pas la main — est ici, parce qu'un
//! contrôle d'intégration a le droit de dépendre d'un binaire que `cargo test` construit.
//!
//! Le moteur de pacotille est l'exemple `reciteur`, écrit en Rust : il est le même sur les deux
//! systèmes. Les montages à base de shell qui l'ont précédé ne l'étaient pas.

use lienotheque_bureau::{
    limites::LIMITES,
    moteur::{Lancement, Message, Session},
};
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant},
};

/// Chemin de l'exemple `reciteur`, à côté du binaire de test : `target/<profil>/examples/`.
fn reciteur_binaire() -> PathBuf {
    let binaire = std::env::current_exe().expect("binaire de test");
    let profil = binaire.parent().and_then(Path::parent).expect("dossier du profil");
    profil.join("examples").join(format!("reciteur{}", std::env::consts::EXE_SUFFIX))
}

fn lancement(lignes: &[&str], dort: bool) -> Lancement {
    static RANG: AtomicUsize = AtomicUsize::new(0);
    let fichier = std::env::temp_dir().join(format!(
        "lienotheque-reciteur-{}-{}.jsonl",
        std::process::id(),
        RANG.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::write(&fichier, lignes.join("\n") + "\n").expect("lignes du réciteur");

    let binaire = reciteur_binaire();
    assert!(binaire.exists(), "{} manque — lancez `cargo test` (il construit les exemples)", binaire.display());

    let mut arguments = vec![fichier.to_string_lossy().into_owned()];
    if dort {
        arguments.push("--dormir".to_owned());
    }
    Lancement { programme: binaire, arguments, environnement: Vec::new() }
}

fn salutation() -> String {
    format!(
        r#"{{"type":"salutation","protocole":{},"moteur":{{"nom":"node","version":"24.11.1"}}}}"#,
        LIMITES.protocole
    )
}

#[test]
fn ecoute_un_moteur_jusqu_a_ce_qu_il_se_taise() {
    let journal = format!(
        r#"{{"type":"journal","protocole":{},"travailId":"x","niveau":"information","texte":"Lecture du document","le":"2026-10-06T00:00:00Z"}}"#,
        LIMITES.protocole
    );
    let mut session = Session::ouvrir(&lancement(&[&salutation(), &journal], false)).expect("moteur lancé");

    assert!(matches!(session.ecouter(), Some(Ok(Message::Salutation { .. }))));
    assert_eq!(
        session.ecouter(),
        Some(Ok(Message::Journal { niveau: "information".to_owned(), texte: "Lecture du document".to_owned() }))
    );
    assert_eq!(session.ecouter(), None, "le moteur s'est tu");
}

#[test]
fn un_moteur_qui_s_arrete_de_lui_meme_n_est_pas_tue() {
    let mut session = Session::ouvrir(&lancement(&[&salutation()], false)).expect("moteur lancé");
    assert!(session.arreter("{}").expect("arrêt demandé"), "il a fini seul, dans le délai");
}

#[test]
fn un_moteur_qui_ne_rend_pas_la_main_est_tue_apres_le_delai() {
    let mut session = Session::ouvrir(&lancement(&[&salutation()], true)).expect("moteur lancé");

    let debut = Instant::now();
    assert!(!session.arreter("{}").expect("arrêt demandé"), "il a fallu le tuer");
    assert!(
        debut.elapsed() >= Duration::from_secs(LIMITES.delai_arret_propre_s),
        "on lui a bien laissé son délai avant de le tuer"
    );
}
