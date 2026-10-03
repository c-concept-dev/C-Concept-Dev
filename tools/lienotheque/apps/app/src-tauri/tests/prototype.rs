//! Mesures du prototype bureau (lot 0). Chaque test correspond à un critère d'acceptation
//! du CDC pour la décision « Tauri 2 ou autre » :
//!
//!   - ouvrir un PDF de 500 pages ;
//!   - lancer un sidecar (Tesseract) réellement embarqué ;
//!   - reprendre un travail après un arrêt forcé (JOB-02, JOB-03) ;
//!   - lire un MP3 par plages via un serveur local.
//!
//! Les fixtures sont locales et régénérables : `python3 fixtures/generer-locales.py`.
//! Les moteurs embarqués : `python3 src-tauri/outils/preparer-moteurs.py`.

use lienotheque_bureau::{media, mesures, ocr, pdf, travail, NOM_MOTEUR};
use std::{
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

fn racine_projet() -> PathBuf {
    // src-tauri → apps/app → apps → tools/lienotheque
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..").canonicalize().expect("racine du projet")
}

fn fixture(nom: &str) -> PathBuf {
    racine_projet().join("fixtures/fichiers").join(nom)
}

fn moteurs() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("moteurs")
}

/// Le français si son modèle est embarqué, sinon l'anglais : l'installateur Windows de
/// Tesseract ne livre pas toujours `fra.traineddata`.
fn langue_disponible(tessdata: &Path) -> &'static str {
    if tessdata.join("fra.traineddata").exists() {
        "fra"
    } else {
        "eng"
    }
}

/// Chemin de l'exemple `travail-long`, à côté du binaire de test : `target/<profil>/examples/`.
fn travail_long() -> PathBuf {
    let binaire = std::env::current_exe().expect("binaire de test"); // target/<profil>/deps/<test>
    let profil = binaire.parent().and_then(Path::parent).expect("dossier du profil");
    profil.join("examples").join(format!("travail-long{}", std::env::consts::EXE_SUFFIX))
}

fn exiger(chemin: &Path, remede: &str) {
    assert!(chemin.exists(), "{} manque — {remede}", chemin.display());
}

#[test]
fn ouvre_un_pdf_de_500_pages() {
    let chemin = fixture("500-pages.pdf");
    exiger(&chemin, "lancez `python3 fixtures/generer-locales.py`");

    let mesure = pdf::ouvrir(&chemin).expect("PDF lisible");

    assert_eq!(mesure.pages, 500, "le PDF de référence a 500 pages");
    assert!(mesure.extrait_premiere.contains("page 1 sur 500"), "page 1 : {}", mesure.extrait_premiere);
    assert!(mesure.extrait_derniere.contains("page 500 sur 500"), "page 500 : {}", mesure.extrait_derniere);

    println!(
        "PDF : {} pages, {:.2} Mo, ouverture {} ms, accès à la dernière page {} ms",
        mesure.pages,
        mesures::en_mo(mesure.octets),
        mesure.ms_ouverture,
        mesure.ms_page
    );
}

/// Le cas qui pèse vraiment : un livre numérisé, une image par page (fixture F2 du CDC).
#[test]
fn ouvre_un_livre_numerise_de_500_pages() {
    let chemin = fixture("500-pages-scan.pdf");
    exiger(&chemin, "lancez `python3 fixtures/generer-locales.py`");

    let avant = Instant::now();
    let mesure = pdf::ouvrir(&chemin).expect("PDF numérisé lisible");
    let total_ms = avant.elapsed().as_millis();

    assert_eq!(mesure.pages, 500);
    assert!(
        mesure.octets > 40_000_000,
        "un livre numérisé pèse des dizaines de Mo, pas {:.2} Mo : la fixture a-t-elle bien une image par page ?",
        mesures::en_mo(mesure.octets)
    );

    println!(
        "PDF numérisé : {} pages, {:.2} Mo, ouverture {} ms, accès à la dernière page {} ms (total {} ms)",
        mesure.pages,
        mesures::en_mo(mesure.octets),
        mesure.ms_ouverture,
        mesure.ms_page,
        total_ms
    );
}

#[test]
fn lance_le_sidecar_tesseract_embarque() {
    let binaire = moteurs().join("bin").join(NOM_MOTEUR);
    let tessdata = moteurs().join("tessdata");
    exiger(&binaire, "lancez `python3 src-tauri/outils/preparer-moteurs.py`");

    let image = fixture("page-ocr.png");
    exiger(&image, "lancez `python3 fixtures/generer-locales.py`");

    let langue = langue_disponible(&tessdata);
    let mesure = ocr::reconnaitre(&binaire, &tessdata, &image, langue).expect("moteur embarqué utilisable");

    assert!(mesure.version.starts_with("tesseract"), "version : {}", mesure.version);
    // « piste 41 » se lit dans toutes les langues ; les accents demandent le modèle français.
    assert!(mesure.texte.contains("piste 41"), "texte reconnu : {}", mesure.texte);
    if langue == "fra" {
        assert!(mesure.texte.contains("Liénothèque"), "texte reconnu : {}", mesure.texte);
    }

    let poids = mesures::peser(&moteurs());
    println!(
        "Sidecar : {} ({}) — {} ms — moteurs embarqués {:.2} Mo en {} fichiers",
        mesure.version,
        langue,
        mesure.ms,
        mesures::en_mo(poids.octets),
        poids.fichiers
    );
}

/// Lit une réponse HTTP brute : pas de client HTTP en dépendance pour un prototype.
fn interroger(port: u16, plage: Option<&str>) -> (u16, String, Vec<u8>) {
    let mut flux = TcpStream::connect(("127.0.0.1", port)).expect("serveur local joignable");
    let mut requete = format!("GET /media HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n");
    if let Some(valeur) = plage {
        requete.push_str(&format!("Range: {valeur}\r\n"));
    }
    requete.push_str("\r\n");
    flux.write_all(requete.as_bytes()).expect("requête envoyée");

    let mut brut = Vec::new();
    flux.read_to_end(&mut brut).expect("réponse lue");
    let separation = brut.windows(4).position(|f| f == b"\r\n\r\n").expect("en-têtes terminés");
    let entetes = String::from_utf8_lossy(&brut[..separation]).to_string();
    let code: u16 = entetes
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse().ok())
        .expect("code de statut");
    (code, entetes, brut[separation + 4..].to_vec())
}

#[test]
fn sert_un_mp3_par_plages() {
    let chemin = fixture("piste.mp3");
    exiger(&chemin, "lancez `python3 fixtures/generer-locales.py`");
    let contenu = std::fs::read(&chemin).expect("MP3 lisible");

    let serveur = media::servir(chemin.clone(), "audio/mpeg").expect("serveur local démarré");
    let port = serveur.infos.port;

    let debut = Instant::now();
    let (code, entetes, corps) = interroger(port, Some("bytes=1000000-1065535"));
    let ms = debut.elapsed().as_millis();

    assert_eq!(code, 206, "une plage se répond en 206, jamais en 200");
    assert!(entetes.contains("Content-Range: bytes 1000000-1065535/"), "en-têtes : {entetes}");
    assert!(entetes.contains("Accept-Ranges: bytes"), "en-têtes : {entetes}");
    assert_eq!(corps.len(), 65_536, "la plage demandée fait exactement 64 Kio");
    assert_eq!(corps, &contenu[1_000_000..=1_065_535], "les octets servis sont ceux du fichier");

    // Les derniers octets, forme « suffixe », celle qu'emploient les lecteurs pour la fin de piste.
    let (code_fin, _, corps_fin) = interroger(port, Some("bytes=-4096"));
    assert_eq!(code_fin, 206);
    assert_eq!(corps_fin, &contenu[contenu.len() - 4096..]);

    assert_eq!(
        serveur.plages_servies.load(std::sync::atomic::Ordering::Relaxed),
        2,
        "les deux requêtes ont bien été servies par plage"
    );

    println!(
        "Lecture par plages : {:.2} Mo au total, 64 Kio servis en {} ms sur {}",
        mesures::en_mo(serveur.infos.octets),
        ms,
        serveur.infos.url
    );
}

#[test]
fn reprend_un_travail_apres_un_arret_force() {
    let exemple = travail_long();
    exiger(&exemple, "lancez `cargo test --release` (il construit les exemples)");

    let dossier = std::env::temp_dir().join(format!("lienotheque-job-{}", std::process::id()));
    std::fs::create_dir_all(&dossier).expect("dossier de travail");
    let etat = dossier.join("travail.json");
    let _ = std::fs::remove_file(&etat);

    // Assez long pour que le bail soit renouvelé au moins une fois avant l'arrêt forcé.
    let total = 2_000_u32;
    let pris_le = travail::maintenant();

    let mut enfant = Command::new(&exemple)
        .args([etat.to_str().unwrap(), &total.to_string(), "5"])
        .stdout(Stdio::null())
        .spawn()
        .expect("travail lancé");

    // On attend un battement, pas un nombre de pas : c'est lui qui prolonge le bail.
    let limite = Instant::now();
    loop {
        if let Ok(Some(t)) = travail::charger(&etat) {
            let battu = t.verrou.as_ref().is_some_and(|v| v.battu_le >= pris_le + travail::BATTEMENT_SECONDES);
            if battu && t.reprise_a() > 0 {
                break;
            }
        }
        assert!(limite.elapsed() < Duration::from_secs(60), "aucun battement observé");
        thread::sleep(Duration::from_millis(50));
    }

    enfant.kill().expect("arrêt forcé"); // SIGKILL : aucune chance de ranger quoi que ce soit
    let _ = enfant.wait();

    let interrompu = travail::charger(&etat).expect("état lisible").expect("état présent");
    let reprise = interrompu.reprise_a();
    let bail = interrompu.verrou.clone().expect("le bail survit à l'arrêt : c'est lui qui expire");
    assert!(reprise > 0 && reprise < total, "arrêté en cours de route : {reprise}/{total}");
    assert!(bail.battu_le > pris_le, "le bail avait bien été renouvelé avant l'arrêt");
    assert_eq!(bail.expire_le, bail.battu_le + travail::EXPIRATION_SECONDES);
    assert!(!interrompu.reprenable(travail::maintenant()), "bail encore valide : pas de reprise immédiate");

    // Plus personne ne bat : le bail expire de lui-même.
    let reste = bail.expire_le.saturating_sub(travail::maintenant());
    thread::sleep(Duration::from_secs(reste) + Duration::from_millis(500));
    assert!(interrompu.reprenable(travail::maintenant()), "bail expiré : le travail est reprenable");

    let sortie = Command::new(&exemple)
        .args([etat.to_str().unwrap(), &total.to_string(), "0"])
        .output()
        .expect("reprise lancée");
    assert!(sortie.status.success(), "reprise en échec : {}", String::from_utf8_lossy(&sortie.stderr));

    let journal = String::from_utf8_lossy(&sortie.stdout);
    assert!(
        journal.contains(&format!("reprise au pas {reprise} sur {total}")),
        "le journal doit dire d'où il repart :\n{}",
        journal.lines().take(3).collect::<Vec<_>>().join("\n")
    );
    assert!(!journal.contains(&format!("pas {reprise}/{total}")), "aucun pas déjà fait n'est refait");

    let fini = travail::charger(&etat).expect("état lisible").expect("état présent");
    assert_eq!(fini.etat, "termine");
    assert_eq!(fini.tentative, 2, "la reprise compte une seconde tentative");
    assert_eq!(fini.progression(), 1.0);
    assert!(fini.verrou.is_none(), "un travail terminé ne garde pas son bail");

    println!(
        "Reprise : bail battu toutes les {} s, arrêt forcé au pas {reprise}/{total}, bail expiré {} s plus tard, reprise au pas suivant",
        travail::BATTEMENT_SECONDES,
        travail::EXPIRATION_SECONDES
    );
    let _ = std::fs::remove_dir_all(&dossier);
}
