//! Un effacement récursif n'a le droit de viser qu'un **bac jetable**.
//!
//! ## D'où vient ce module
//!
//! Le 18 novembre 2026, un contrôle qui *éprouvait* un refus d'effacement a effacé la copie de
//! travail entière : 8 302 chemins suivis et tout ce que Git ignore. Il passait la racine du
//! dépôt à la fonction d'effacement, et la mutation qui retirait le refus faisait du contrôle
//! l'effacement lui-même. La décision du jour en a tiré deux règles, et celle-ci est leur
//! application côté hôte : une sécurité ne se pointe jamais sur un objet réel, et **ce qui
//! efface récursivement demande d'abord la permission au chemin visé**.
//!
//! ## Ce que ce module garde, concrètement
//!
//! Trois exemples de ce paquet commencent par effacer un dossier de travail, et **deux d'entre
//! eux prennent ce dossier d'un argument de la ligne de commande** — `parcours-complet` et
//! `file-sur-corpus`. Pointés sur une vraie bibliothèque, ils l'effaçaient sans un mot, avant
//! même de s'en servir. Ce sont eux que ce module garde : **ce qui vient du dehors se vérifie**.
//!
//! Le troisième, `epreuve-du-paquet`, ne passe **pas** par ici, et la raison est instructive. Son
//! bac est bâti dans le programme, de `temp_dir()` et de son numéro de processus : aucun argument
//! ne le désigne, donc rien du dehors ne peut le détourner. Et surtout, il efface son bac **une
//! seconde fois à la fin**, après s'en être servi comme bibliothèque : le second refus ci-dessous
//! le lui interdirait, puisque `base/` y est alors — à juste titre. Un garde-fou qui refuserait un
//! nettoyage légitime finirait désarmé, et c'est la règle de ce dépôt.
//!
//! ## Deux refus, et pourquoi deux
//!
//! - **Hors du dossier temporaire** : un effacement récursif qui sort du bac du système ne peut
//!   plus être rattrapé. C'est le refus qui compte, et il est premier.
//! - **Cela ressemble à une vraie bibliothèque** : `base/` ou `sources/` y sont. Le premier refus
//!   suffirait si personne ne rangeait jamais une bibliothèque dans le dossier temporaire — mais
//!   les mesures de ce dépôt en fabriquent précisément là, et l'une d'elles porte un vrai corpus.
//!   Un filet sous le filet, qui coûte deux `exists()`.
//!
//! **Conséquence assumée** : un deuxième passage sur le même bac est refusé, puisque le premier
//! y a laissé `base/`. Il faut donner un dossier neuf, ou l'effacer soi-même. Un exemple qu'on
//! relance est moins précieux qu'une bibliothèque qu'on ne récupère pas.

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

/// Les noms qui trahissent une bibliothèque, et non un bac d'essai.
///
/// `base/` porte la file et les versions, `sources/` les fichiers déposés : ni l'un ni l'autre
/// n'apparaît dans un dossier que l'on vient de créer pour mesurer.
pub const MARQUES_D_UNE_BIBLIOTHEQUE: [&str; 2] = ["base", "sources"];

/// Résout le chemin aussi loin que le disque le permet, puis recolle ce qui n'existe pas encore.
///
/// Nécessaire parce que le dossier visé **n'existe pas toujours** — c'est le cas au premier
/// passage — et que `canonicalize` échoue alors. Sans cette résolution, la comparaison se ferait
/// entre `/var/folders/…` et `/private/var/folders/…` sur macOS, et le refus tomberait sur un bac
/// parfaitement légitime : un garde-fou qui accuse à tort finit désarmé.
fn resoudre(chemin: &Path) -> PathBuf {
    let mut suffixe: Vec<OsString> = Vec::new();
    let mut courant = chemin.to_path_buf();
    loop {
        if let Ok(reel) = courant.canonicalize() {
            let mut sortie = reel;
            for morceau in suffixe.iter().rev() {
                sortie.push(morceau);
            }
            return sortie;
        }
        match courant.file_name() {
            Some(nom) => suffixe.push(nom.to_os_string()),
            None => return chemin.to_path_buf(),
        }
        if !courant.pop() {
            return chemin.to_path_buf();
        }
    }
}

/// Refuse l'effacement récursif de `racine` quand ce n'est pas un bac jetable.
///
/// Rend `Ok(())` quand l'effacement est permis, et sinon le refus **en disant lequel des deux
/// motifs a parlé** : un refus muet ne s'apprend pas.
pub fn refuser_un_effacement_dangereux(racine: &Path) -> Result<(), String> {
    let vise = resoudre(racine);
    let bac = resoudre(&std::env::temp_dir());

    if !vise.starts_with(&bac) {
        return Err(format!(
            "refus d'effacer {} : hors du dossier temporaire {}. Donnez un dossier de travail \
             sous ce dossier.",
            vise.display(),
            bac.display()
        ));
    }

    for marque in MARQUES_D_UNE_BIBLIOTHEQUE {
        if vise.join(marque).exists() {
            return Err(format!(
                "refus d'effacer {} : {marque}/ y est, cela ressemble à une vraie bibliothèque. \
                 Donnez un dossier neuf.",
                vise.display()
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod essais {
    use super::*;
    use std::fs;

    /// Un bac neuf, jamais utilisé, dans le dossier temporaire.
    fn bac(nom: &str) -> PathBuf {
        let chemin = std::env::temp_dir().join(format!("bac-jetable-{nom}-{}", std::process::id()));
        fs::remove_dir_all(&chemin).ok();
        fs::create_dir_all(&chemin).expect("bac");
        chemin
    }

    /// L'ancre, celle qui ne se saute jamais : si le dossier temporaire n'était pas là, tout ce
    /// qui suit mesurerait du vide, et les refus tomberaient pour la mauvaise raison.
    #[test]
    fn le_dossier_temporaire_existe_vraiment(/* lot 0z bis, § 4.7 */) {
        let bac = resoudre(&std::env::temp_dir());
        assert!(bac.is_dir(), "{} n'est pas un dossier", bac.display());
    }

    #[test]
    fn accepte_un_bac_neuf_du_dossier_temporaire(/* lot 0z bis, § 4.7 */) {
        let racine = bac("neuf");
        assert_eq!(refuser_un_effacement_dangereux(&racine), Ok(()));
        fs::remove_dir_all(&racine).ok();
    }

    /// Le dossier visé **n'existe pas encore** au premier passage : il doit être accepté quand
    /// même, sans quoi l'exemple refuserait de démarrer.
    #[test]
    fn accepte_un_bac_du_dossier_temporaire_qui_n_existe_pas_encore(/* lot 0z bis, § 4.7 */) {
        let racine = bac("a-venir").join("bibliotheque");
        assert!(!racine.exists());
        assert_eq!(refuser_un_effacement_dangereux(&racine), Ok(()));
        fs::remove_dir_all(racine.parent().expect("parent")).ok();
    }

    /// Le même bac, **donné par son chemin réel**, est accepté lui aussi — et c'est la seule
    /// preuve que la résolution serve à quelque chose.
    ///
    /// Sur macOS, `temp_dir()` rend `/var/folders/…` quand le chemin réel est
    /// `/private/var/folders/…`. Un script, un argument, ou un `canonicalize` en amont donnent la
    /// seconde forme : sans la résolution, le refus accuserait un bac parfaitement légitime, et un
    /// garde-fou qui accuse à tort finit désarmé.
    ///
    /// **Ce contrôle est né d'une mutation qui n'avait tué personne** : retirer la résolution ne
    /// faisait alors rougir aucun des cinq autres, parce qu'ils comparent tous deux chemins venus
    /// du même `temp_dir()`. Du code que nul contrôle ne tient.
    #[test]
    fn accepte_un_bac_donne_par_son_chemin_reel(/* lot 0z bis, § 4.7 */) {
        let racine = bac("chemin-reel");
        let reel = racine.canonicalize().expect("chemin réel");

        assert_eq!(refuser_un_effacement_dangereux(&reel), Ok(()));
        assert_eq!(
            resoudre(&racine),
            resoudre(&reel),
            "les deux formes du même bac doivent se ramener au même chemin"
        );

        fs::remove_dir_all(&racine).ok();
    }

    /// **Le chemin visé n'existe pas, et c'est la règle du 18 novembre 2026** : une mutation qui
    /// désarme ce refus ne doit rien pouvoir détruire en passant par ce contrôle.
    #[test]
    fn refuse_un_chemin_hors_du_dossier_temporaire(/* lot 0z bis, § 4.7 */) {
        let hors = PathBuf::from(format!("/jamais-cree-{}-bac-jetable", std::process::id()));
        assert!(!hors.exists(), "ce contrôle ne vise qu'un chemin inexistant");

        let refus = refuser_un_effacement_dangereux(&hors).expect_err("doit refuser");
        assert!(refus.contains("hors du dossier temporaire"), "{refus}");
        assert!(!hors.exists(), "rien n'a été créé ni détruit");
    }

    /// Et le second filet, éprouvé marque par marque : une bibliothèque rangée dans le dossier
    /// temporaire est protégée elle aussi.
    #[test]
    fn refuse_ce_qui_ressemble_a_une_bibliotheque(/* lot 0z bis, § 4.7 */) {
        for marque in MARQUES_D_UNE_BIBLIOTHEQUE {
            let racine = bac(&format!("ressemble-{marque}"));
            fs::create_dir_all(racine.join(marque)).expect("marque");

            let refus = refuser_un_effacement_dangereux(&racine).expect_err("doit refuser");
            assert!(refus.contains(marque), "le refus doit nommer {marque} : {refus}");
            assert!(
                racine.join(marque).is_dir(),
                "le refus ne doit rien effacer"
            );
            fs::remove_dir_all(&racine).ok();
        }
    }

    /// L'ordre des deux refus compte : hors du bac **et** porteur de `base/`, c'est le premier
    /// motif qui doit parler, celui qui dit la vraie raison.
    #[test]
    fn hors_du_bac_parle_avant_la_ressemblance(/* lot 0z bis, § 4.7 */) {
        let hors = PathBuf::from(format!("/jamais-cree-{}-avec-base", std::process::id()));
        assert!(!hors.exists());
        let refus = refuser_un_effacement_dangereux(&hors).expect_err("doit refuser");
        assert!(refus.contains("hors du dossier temporaire"), "{refus}");
    }
}
