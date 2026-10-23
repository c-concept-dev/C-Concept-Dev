//! Repérer les documents qui disent la même chose, et laisser décider (HER-08).
//!
//! ## Ce qu'un doublon est ici, et ce qu'il n'est pas
//!
//! Un même fichier déposé deux fois **ne peut pas** faire deux documents : les sources sont
//! rangées sous l'empreinte de leur contenu, et le second dépôt retrouve le travail du premier
//! (JOB-04). Le réimport du 21 octobre 2026 en a confondu quarante-trois de cette façon.
//!
//! Ce qui reste, et que l'empreinte ne voit pas, c'est **le même ouvrage en deux fichiers
//! différents** : deux numérisations, deux encodages, deux mises en page. Leurs octets diffèrent,
//! leur texte non.
//!
//! ## Le seuil, mesuré plutôt que choisi
//!
//! Relevé le 22 octobre 2026 sur une bibliothèque de 243 documents :
//!
//! | paire | ressemblance |
//! |---|---:|
//! | deux numérisations d'un même livre | **0,959** |
//! | un même ouvrage en EPUB et en PDF | **0,987** |
//! | un même diaporama à une et trois diapositives par feuille | **0,984** |
//! | deux livres sans rapport | **0,076** |
//!
//! L'écart est énorme, et le seuil se pose sans hésiter au milieu. Mais la mesure dit aussi
//! autre chose, et c'est elle qui commande la suite : **le texte ne distingue pas** un vrai
//! doublon d'un même ouvrage en deux formats. Les trois premières lignes sont au-dessus de 0,95.
//!
//! ## D'où il suit que ce module ne supprime rien
//!
//! Garder l'EPUB pour lire et le PDF pour citer est un choix légitime ; garder les deux mises en
//! page d'un diaporama aussi. Aucune mesure ne tranche cela — seul celui à qui la bibliothèque
//! appartient le peut.
//!
//! Ce module **trouve et décrit**. Il rend, pour chaque groupe, ce qui distingue ses membres :
//! leur nom, leur format, leurs pages, leurs passages, leurs mots, le poids de leur source. De
//! quoi choisir, et jamais choisir à la place.

use crate::depot::Depot;
use serde::Serialize;
use std::collections::HashMap;

/// En deçà, deux documents ne disent pas la même chose. Voir le tableau de mesures ci-dessus :
/// les copies sont à 0,96 et plus, les étrangers à 0,08. Le milieu est confortable.
pub const RESSEMBLANCE_MINIMALE: f64 = 0.90;

/// Les mots trop courts ne distinguent rien : « de », « la », « the » sont partout.
const LONGUEUR_MOT_MINIMALE: usize = 4;

/// En deçà, un document n'a pas assez de texte pour qu'on puisse dire qu'il en double un autre.
///
/// Mesuré le 22 octobre 2026 : sept documents de 136 à 168 mots — des PDF de huit mégaoctets
/// dont la lecture n'avait presque rien tiré — se sont retrouvés groupés entre eux. Ils ne se
/// ressemblaient pas : **ils n'avaient rien pour se distinguer**. Deux textes de cent mots se
/// ressemblent toujours, parce qu'il ne reste que les mots que tout le monde emploie.
///
/// Les vrais doublons de cette même bibliothèque portaient de 1 517 à 51 627 mots. Le plancher
/// se pose donc largement en dessous d'eux et largement au-dessus du bruit.
///
/// Ce qui passe sous ce plancher n'est pas jeté en silence : il est compté et dit. Un document
/// dont on n'a presque rien lu est un fait qui mérite d'être su pour lui-même.
pub const MOTS_MINIMUM: usize = 500;

/// Ce qu'on sait d'un document pour le comparer, et pour le décrire à qui choisira.
#[derive(Debug, Clone, Serialize)]
pub struct DocumentSuspect {
    pub empreinte: String,
    pub nom: String,
    pub pages: usize,
    pub passages: usize,
    pub mots: usize,
    /// Poids de la source sur le disque, en octets. Zéro si elle a disparu.
    pub octets: u64,
}

/// Ce qu'une recherche de doublons a trouvé, et ce qu'elle n'a pas pu regarder.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Trouvaille {
    pub groupes: Vec<GroupeDeDoublons>,
    /// Les documents dont trop peu de texte a été lu pour les comparer à quoi que ce soit.
    pub trop_peu_de_texte: Vec<DocumentSuspect>,
}

/// Des documents qui disent la même chose, et à quel point.
#[derive(Debug, Serialize)]
pub struct GroupeDeDoublons {
    pub documents: Vec<DocumentSuspect>,
    /// La plus faible ressemblance du groupe : la plus prudente à annoncer.
    pub ressemblance: f64,
}


/// Les mots d'un texte, comptés. Minuscules, sans les trop courts.
fn compter(texte: &str) -> HashMap<String, usize> {
    let mut compte = HashMap::new();
    let mut mot = String::new();
    for caractere in texte.chars() {
        if caractere.is_alphabetic() || caractere == '\'' {
            mot.extend(caractere.to_lowercase());
        } else {
            if mot.chars().count() >= LONGUEUR_MOT_MINIMALE {
                *compte.entry(std::mem::take(&mut mot)).or_insert(0) += 1;
            }
            mot.clear();
        }
    }
    if mot.chars().count() >= LONGUEUR_MOT_MINIMALE {
        *compte.entry(mot).or_insert(0) += 1;
    }
    compte
}

/// Deux sacs de mots se ressemblent-ils ? Entre 0 et 1.
///
/// On compte ce que les deux ont en commun sur tout ce qu'ils ont ensemble, en tenant compte des
/// répétitions : deux textes qui emploient les mêmes mots mais pas autant de fois ne disent pas
/// la même chose. C'est la mesure qui a rendu 0,959 entre deux numérisations d'un livre et 0,076
/// entre deux livres étrangers.
pub fn ressemblance(un: &HashMap<String, usize>, autre: &HashMap<String, usize>) -> f64 {
    if un.is_empty() || autre.is_empty() {
        return 0.0;
    }
    let mut commun = 0_usize;
    let mut ensemble = 0_usize;
    for (mot, combien) in un {
        let la = autre.get(mot).copied().unwrap_or(0);
        commun += (*combien).min(la);
        ensemble += (*combien).max(la);
    }
    for (mot, combien) in autre {
        if !un.contains_key(mot) {
            ensemble += combien;
        }
    }
    if ensemble == 0 {
        0.0
    } else {
        commun as f64 / ensemble as f64
    }
}

/// Les groupes de documents qui disent la même chose, dans cette bibliothèque.
///
/// `titre_de` rend le nom déposé d'un document — il vit dans son travail, pas dans sa version.
pub fn chercher(depot: &Depot, titre_de: &dyn Fn(&str) -> String) -> std::io::Result<Trouvaille> {
    let actives = depot.actives()?;
    let mut sacs: Vec<(DocumentSuspect, HashMap<String, usize>)> = Vec::with_capacity(actives.len());
    let mut maigres: Vec<DocumentSuspect> = Vec::new();

    for (empreinte, pointeur) in &actives {
        let Some(charge) = depot.lire_version(&pointeur.version)? else { continue };
        let Ok(lu) = serde_json::from_str::<serde_json::Value>(&charge) else { continue };
        let vides = Vec::new();
        let passages = lu["passages"].as_array().unwrap_or(&vides);
        let texte: String = passages.iter().filter_map(|p| p["texte"].as_str()).collect::<Vec<_>>().join(" ");
        let sac = compter(&texte);
        let mots: usize = sac.values().sum();
        let nom = titre_de(empreinte);
        let extension = std::path::Path::new(&nom).extension().and_then(|e| e.to_str()).unwrap_or("bin").to_lowercase();
        let octets = std::fs::metadata(depot.source(empreinte, &extension)).map(|m| m.len()).unwrap_or(0);
        let suspect = DocumentSuspect {
            empreinte: empreinte.clone(),
            nom,
            pages: lu["vue"]["pages"].as_array().map(Vec::len).unwrap_or(0),
            passages: passages.len(),
            mots,
            octets,
        };
        // Trop peu de texte pour se comparer : on le met de côté, et on le dira.
        if mots < MOTS_MINIMUM {
            maigres.push(suspect);
            continue;
        }
        sacs.push((suspect, sac));
    }

    // Les groupes se forment par proche en proche : si A ressemble à B et B à C, les trois vont
    // ensemble. Deux numérisations et un EPUB du même livre forment un seul groupe, et non trois
    // paires qu'il faudrait recouper à la main.
    let mut groupe_de: Vec<Option<usize>> = vec![None; sacs.len()];
    let mut groupes: Vec<Vec<usize>> = Vec::new();
    let mut plus_faible: Vec<f64> = Vec::new();

    for un in 0..sacs.len() {
        for autre in (un + 1)..sacs.len() {
            let score = ressemblance(&sacs[un].1, &sacs[autre].1);
            if score < RESSEMBLANCE_MINIMALE {
                continue;
            }
            match (groupe_de[un], groupe_de[autre]) {
                (None, None) => {
                    groupes.push(vec![un, autre]);
                    plus_faible.push(score);
                    groupe_de[un] = Some(groupes.len() - 1);
                    groupe_de[autre] = Some(groupes.len() - 1);
                }
                (Some(g), None) => {
                    groupes[g].push(autre);
                    plus_faible[g] = plus_faible[g].min(score);
                    groupe_de[autre] = Some(g);
                }
                (None, Some(g)) => {
                    groupes[g].push(un);
                    plus_faible[g] = plus_faible[g].min(score);
                    groupe_de[un] = Some(g);
                }
                (Some(g), Some(h)) if g != h => {
                    let absorbe = std::mem::take(&mut groupes[h]);
                    for membre in &absorbe {
                        groupe_de[*membre] = Some(g);
                    }
                    groupes[g].extend(absorbe);
                    plus_faible[g] = plus_faible[g].min(plus_faible[h]).min(score);
                }
                _ => plus_faible[groupe_de[un].expect("groupe")] =
                    plus_faible[groupe_de[un].expect("groupe")].min(score),
            }
        }
    }

    let mut rendu: Vec<GroupeDeDoublons> = groupes
        .into_iter()
        .enumerate()
        .filter(|(_, membres)| membres.len() > 1)
        .map(|(rang, membres)| GroupeDeDoublons {
            documents: membres.iter().map(|m| sacs[*m].0.clone()).collect(),
            ressemblance: plus_faible[rang],
        })
        .collect();
    // Les plus ressemblants d'abord : ce sont ceux dont la décision est la plus simple.
    rendu.sort_by(|un, autre| autre.ressemblance.total_cmp(&un.ressemblance));
    maigres.sort_by_key(|document| document.mots);
    Ok(Trouvaille { groupes: rendu, trop_peu_de_texte: maigres })
}

#[cfg(test)]
mod epreuves {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// Une bibliothèque avec des documents dont on fixe le texte : c'est le texte qui décide.
    fn bibliotheque(nom: &str, textes: &[(&str, &str)]) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-doublons-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        let depot = Depot::ouvrir(&racine).expect("dépôt ouvert");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        for (rang, (empreinte_courte, texte)) in textes.iter().enumerate() {
            let empreinte = format!("{empreinte_courte}{}", "0".repeat(64 - empreinte_courte.len()));
            let version = format!("v-{rang}");
            let charge = serde_json::json!({
                "vue": { "pages": [] },
                "passages": [{ "texte": texte }],
            });
            depot.ecrire_version(&version, &charge.to_string()).expect("version");
            depot.activer(&empreinte, &version, 1).expect("activée");
        }
        (depot, racine)
    }

    /// Un texte long, fait de mots distinctifs, pour franchir le plancher sans ressembler à rien.
    fn beaucoup_de_mots(graine: &str, combien: usize) -> String {
        (0..combien).map(|rang| format!("{graine}mot{rang} ")).collect()
    }

    /// Deux fois le même texte se trouvent, deux textes étrangers non (HER-08).
    #[test]
    fn deux_documents_identiques_forment_un_groupe_et_deux_etrangers_non() {
        let copie = beaucoup_de_mots("alpha", 600);
        let etranger = beaucoup_de_mots("omega", 600);
        let (depot, racine) = bibliotheque(
            "groupe",
            &[("aa", &copie), ("bb", &copie), ("cc", &etranger)],
        );

        let trouvaille = chercher(&depot, &|empreinte: &str| format!("Document {}", &empreinte[..2])).expect("cherché");

        assert_eq!(trouvaille.groupes.len(), 1, "les deux copies, et elles seules, font un groupe");
        assert_eq!(trouvaille.groupes[0].documents.len(), 2);
        assert!(
            trouvaille.groupes[0].ressemblance > 0.99,
            "deux fois le même texte se ressemblent presque exactement, et non {}",
            trouvaille.groupes[0].ressemblance
        );
        assert!(trouvaille.trop_peu_de_texte.is_empty(), "ces textes-là sont assez longs pour être comparés");

        fs::remove_dir_all(&racine).ok();
    }

    /// Les documents dont trop peu de texte a été lu sont **mis de côté et dits**, jamais comparés.
    ///
    /// Mesuré le 22 octobre 2026 : sept documents de 136 à 168 mots s'étaient groupés entre eux.
    /// Ils ne se ressemblaient pas — ils n'avaient rien pour se distinguer. Les laisser entrer
    /// faisait annoncer un doublon là où il n'y avait qu'une lecture ratée ; les jeter en silence
    /// les aurait fait passer pour comparés.
    #[test]
    fn les_documents_sans_texte_sont_mis_de_cote_et_non_compares() {
        let maigre_un = beaucoup_de_mots("page", 40);
        let maigre_deux = beaucoup_de_mots("page", 45);
        let (depot, racine) = bibliotheque("maigres", &[("aa", &maigre_un), ("bb", &maigre_deux)]);

        let trouvaille = chercher(&depot, &|empreinte: &str| format!("Document {}", &empreinte[..2])).expect("cherché");

        assert!(
            trouvaille.groupes.is_empty(),
            "deux textes de quarante mots ne prouvent rien, et ne doivent pas s'annoncer comme doublons"
        );
        assert_eq!(trouvaille.trop_peu_de_texte.len(), 2, "mais ils doivent être dits");
        assert!(trouvaille.trop_peu_de_texte[0].mots < MOTS_MINIMUM);

        fs::remove_dir_all(&racine).ok();
    }

    /// Trois documents dont A ressemble à B et B à C font **un** groupe, pas deux paires.
    ///
    /// Autrement, deux numérisations et un EPUB du même livre se présenteraient en trois paires
    /// qu'il faudrait recouper à la main.
    #[test]
    fn les_groupes_se_forment_de_proche_en_proche() {
        let base = beaucoup_de_mots("alpha", 600);
        let presque = format!("{base} {}", beaucoup_de_mots("bis", 10));
        let (depot, racine) = bibliotheque("transitif", &[("aa", &base), ("bb", &presque), ("cc", &base)]);

        let trouvaille = chercher(&depot, &|empreinte: &str| format!("Document {}", &empreinte[..2])).expect("cherché");

        assert_eq!(trouvaille.groupes.len(), 1, "un seul groupe, et non trois paires");
        assert_eq!(trouvaille.groupes[0].documents.len(), 3);

        fs::remove_dir_all(&racine).ok();
    }

    /// La ressemblance annoncée est **la plus faible** du groupe : la plus prudente.
    #[test]
    fn un_groupe_annonce_sa_ressemblance_la_plus_faible() {
        let base = beaucoup_de_mots("alpha", 600);
        let un_peu_moins = format!("{base} {}", beaucoup_de_mots("bis", 40));
        let (depot, racine) = bibliotheque("prudence", &[("aa", &base), ("bb", &base), ("cc", &un_peu_moins)]);

        let trouvaille = chercher(&depot, &|empreinte: &str| format!("Document {}", &empreinte[..2])).expect("cherché");

        let groupe = &trouvaille.groupes[0];
        assert_eq!(groupe.documents.len(), 3);
        assert!(
            groupe.ressemblance < 0.99,
            "le groupe ne doit pas paraître plus sûr que son membre le moins ressemblant ({})",
            groupe.ressemblance
        );

        fs::remove_dir_all(&racine).ok();
    }

    /// Les mots trop courts ne comptent pas : « de », « la », « the » sont partout.
    #[test]
    fn le_compte_des_mots_ignore_les_mots_trop_courts() {
        let compte = compter("de la mémoire et des mémoires");
        assert_eq!(compte.get("mémoire").copied(), Some(1));
        assert_eq!(compte.get("mémoires").copied(), Some(1));
        assert!(compte.get("de").is_none(), "« de » ne distingue aucun document");
        assert!(compte.get("et").is_none());
    }

    /// Deux sacs vides ne se ressemblent pas : ils n'ont rien pour cela.
    #[test]
    fn deux_textes_vides_ne_se_ressemblent_pas() {
        assert_eq!(ressemblance(&compter(""), &compter("")), 0.0);
    }
}
