//! Chaque commande appelée par la page existe du côté de l'hôte (PLT-02).
//!
//! ## Le défaut que ce fichier attrape
//!
//! Le pont appelle l'hôte par une **chaîne** : `invoke("doublons_de_bibliotheque", …)`. Rien,
//! dans les deux langages, ne confronte cette chaîne au nom de la fonction Rust. Une faute de
//! frappe compile des deux côtés, passe le typage, passe les tests de rendu — et ne se voit qu'au
//! clic, dans le paquet, sous la forme d'un message que personne ne relie à sa cause.
//!
//! C'est exactement la classe de défaut qu'on ne trouve qu'en ouvrant le paquet soi-même. Autant
//! la trouver une fois pour toutes.
//!
//! ## Pourquoi lire les fichiers plutôt que les interroger
//!
//! `tauri::generate_handler!` est une macro : elle ne laisse aucune liste consultable à
//! l'exécution. Les deux listes se lisent donc dans les sources, et c'est une lecture sans
//! finesse — elle n'a pas à comprendre du Rust ni du TypeScript, seulement à relever deux motifs
//! très simples. Si l'un des deux change de forme, ce test tombe en disant qu'il n'a rien trouvé,
//! ce qui est la bonne façon d'échouer.

use std::{collections::BTreeSet, fs, path::Path};

/// Les noms déclarés `#[tauri::command]` dans un fichier source.
fn commandes_de(source: &str) -> BTreeSet<String> {
    let mut noms = BTreeSet::new();
    let mut attend_la_fonction = false;
    for ligne in source.lines() {
        let taille = ligne.trim();
        if taille.starts_with("#[tauri::command") {
            attend_la_fonction = true;
            continue;
        }
        if !attend_la_fonction {
            continue;
        }
        // La déclaration peut suivre un attribut de plus, ou tenir sur la ligne d'après.
        if let Some(reste) = taille.strip_prefix("fn ").or_else(|| taille.strip_prefix("pub fn ")) {
            if let Some(nom) = reste.split('(').next() {
                noms.insert(nom.trim().to_owned());
            }
            attend_la_fonction = false;
        } else if !taille.starts_with('#') {
            attend_la_fonction = false;
        }
    }
    noms
}

/// Les noms passés à `invoke(…)` ou `invoquerSansTrace(…)` dans le pont.
fn appels_de(source: &str) -> BTreeSet<String> {
    let mut noms = BTreeSet::new();
    for appel in ["invoke<", "invoke(", "invoquerSansTrace<", "invoquerSansTrace("] {
        let mut reste = source;
        while let Some(position) = reste.find(appel) {
            reste = &reste[position + appel.len()..];
            // La chaîne du nom est le premier guillemet droit qui suive, sur la même ligne.
            let Some(ligne) = reste.lines().next() else { continue };
            let Some(debut) = ligne.find('"') else { continue };
            let apres = &ligne[debut + 1..];
            let Some(fin) = apres.find('"') else { continue };
            let nom = &apres[..fin];
            // Les noms de commandes sont en minuscules avec des tirets bas, et rien d'autre.
            if !nom.is_empty() && nom.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
                noms.insert(nom.to_owned());
            }
        }
    }
    noms
}

#[test]
fn chaque_commande_appelee_par_la_page_existe_chez_l_hote() {
    let ici = Path::new(env!("CARGO_MANIFEST_DIR"));
    let hote = fs::read_to_string(ici.join("src").join("lib.rs")).expect("lib.rs lisible");
    let pont = fs::read_to_string(ici.join("..").join("src").join("pont").join("bureau.ts")).expect("bureau.ts lisible");

    let commandes = commandes_de(&hote);
    let appels = appels_de(&pont);

    // Si l'une des deux lectures ne trouve rien, c'est elle qui est cassée, et le test doit le
    // dire plutôt que de passer en silence sur deux ensembles vides.
    assert!(commandes.len() > 20, "la lecture des commandes de l'hôte n'a trouvé que {}", commandes.len());
    assert!(appels.len() > 20, "la lecture des appels du pont n'a trouvé que {}", appels.len());

    let orphelins: Vec<&String> = appels.iter().filter(|nom| !commandes.contains(*nom)).collect();
    assert!(
        orphelins.is_empty(),
        "la page appelle des commandes que l'hôte n'a pas : {orphelins:?}\n\
         Une faute de frappe ici ne se voit qu'au clic, dans le paquet."
    );
}

/// Les deux gestes de tenue de bibliothèque ont bien une porte de bout en bout (HER-07, HER-08).
///
/// Nommément, et non par un compte : c'est leur absence qui a coûté une journée — le dépôt savait
/// retirer un document, le module savait trouver les doublons, et rien dans l'application ne
/// pouvait les appeler.
#[test]
fn les_gestes_de_tenue_de_bibliotheque_ont_une_porte() {
    let ici = Path::new(env!("CARGO_MANIFEST_DIR"));
    let hote = fs::read_to_string(ici.join("src").join("lib.rs")).expect("lib.rs lisible");
    let pont = fs::read_to_string(ici.join("..").join("src").join("pont").join("bureau.ts")).expect("bureau.ts lisible");

    let commandes = commandes_de(&hote);
    let appels = appels_de(&pont);

    for nom in ["doublons_de_bibliotheque", "retirer_document"] {
        assert!(commandes.contains(nom), "l'hôte n'expose pas « {nom} »");
        assert!(appels.contains(nom), "le pont n'appelle jamais « {nom} » : la porte est peinte");
        // Et la commande doit être inscrite au registre, sans quoi elle n'est pas joignable.
        assert!(
            hote.contains(&format!("            {nom},")),
            "« {nom} » n'est pas dans generate_handler! : elle ne répondra pas"
        );
    }
}

/// Le JSON que l'hôte écrit porte **exactement** les clefs que le contrat attend (HER-07, HER-08).
///
/// Le contrat `Doublons` est `.strict()` : une clef de trop le fait refuser, une clef renommée
/// aussi. Et comme Rust nomme ses champs en `trop_peu_de_texte` là où le contrat lit
/// `tropPeuDeTexte`, c'est un `rename_all` qui tient la correspondance — un attribut qu'on peut
/// retirer sans qu'aucun compilateur s'en plaigne, et dont la perte ne se verrait qu'au clic.
#[test]
fn le_rendu_des_doublons_porte_les_clefs_du_contrat() {
    use lienotheque_bureau::doublons::{DocumentSuspect, GroupeDeDoublons, Trouvaille};

    let suspect = DocumentSuspect {
        empreinte: "a".repeat(64),
        nom: "Un récit.pdf".to_owned(),
        pages: 40,
        passages: 40,
        mots: 2_729,
        octets: 2_200_000,
    };
    let rendu = serde_json::to_value(Trouvaille {
        groupes: vec![GroupeDeDoublons { documents: vec![suspect.clone(), suspect.clone()], ressemblance: 0.984 }],
        trop_peu_de_texte: vec![suspect],
    })
    .expect("sérialisé");

    let objet = rendu.as_object().expect("un objet");
    let mut clefs: Vec<&String> = objet.keys().collect();
    clefs.sort();
    assert_eq!(clefs, vec!["groupes", "tropPeuDeTexte"], "le contrat est strict : ces deux clefs, et rien d'autre");

    let document = &rendu["groupes"][0]["documents"][0];
    let mut champs: Vec<&String> = document.as_object().expect("un objet").keys().collect();
    champs.sort();
    assert_eq!(champs, vec!["empreinte", "mots", "nom", "octets", "pages", "passages"]);

    let mut groupe: Vec<&String> = rendu["groupes"][0].as_object().expect("un objet").keys().collect();
    groupe.sort();
    assert_eq!(groupe, vec!["documents", "ressemblance"]);
}

/// Un retrait sans source à jeter **omet** la clef plutôt que d'écrire un nul.
///
/// Le contrat la déclare facultative, et `.optional()` de Zod refuse un nul : sans l'omission,
/// retirer un document dont la source avait déjà disparu ferait échouer la lecture du compte
/// rendu — après que le retrait a eu lieu, donc sans moyen de le redire.
#[test]
fn un_retrait_sans_source_omet_la_clef_plutot_que_de_la_mettre_nulle() {
    use lienotheque_bureau::depot::RetraitDeDocument;

    let rendu = serde_json::to_value(RetraitDeDocument { versions: 1, travaux: 2, source: None }).expect("sérialisé");
    assert!(rendu.get("source").is_none(), "une source absente ne doit pas voyager comme un nul");

    let avec = serde_json::to_value(RetraitDeDocument {
        versions: 1,
        travaux: 1,
        source: Some(std::path::PathBuf::from("/Users/quelqu-un/.Trash/un-recit.pdf")),
    })
    .expect("sérialisé");
    assert_eq!(avec["source"].as_str(), Some("/Users/quelqu-un/.Trash/un-recit.pdf"));
}
