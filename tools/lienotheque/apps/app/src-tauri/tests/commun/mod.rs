//! Ce que les contrôles d'intégration partagent — et rien de plus.
//!
//! Un seul besoin pour l'instant : **trouver un exemple compilé sans supposer où cargo le range**.
//! Deux fichiers en avaient besoin, `dialogue.rs` et `prototype.rs`, et c'est à deux usages réels
//! que ce dépôt autorise une abstraction. Le premier a été corrigé seul le 13 novembre 2026, et le
//! second est tombé à la course suivante avec exactement la même panne : la leçon est que ce genre
//! de défaut se corrige par classe, jamais par occurrence.

use std::path::PathBuf;

/// Chemin d'un exemple compilé, **cherché en remontant** depuis le binaire de contrôle.
///
/// ## Pourquoi on ne compte pas les niveaux
///
/// Ces contrôles faisaient `current_exe().parent().parent()`, en supposant que le binaire vit
/// dans `target/<profil>/deps/` — deux niveaux exactement sous le profil. **Rust 1.100.0 a déplacé
/// les binaires de contrôle** sous `target/<profil>/build/<paquet>/<empreinte>/out/`. Deux niveaux
/// y mènent à `…/<empreinte>`, et le chemin composé ne désigne aucun fichier. Les exemples, eux,
/// n'ont pas bougé : `target/<profil>/examples/` dans les deux dispositions.
///
/// Mesuré des deux côtés le 13 novembre 2026 : course **43252972457** verte sous rustc 1.99.1,
/// course **43422731892** rouge sous rustc 1.100.0, panne reproduite sur la machine de
/// développement avec `cargo +1.100.0`, puis **vert sous les deux versions** une fois corrigée.
///
/// Remonter jusqu'à trouver ne suppose aucune profondeur, donc aucune disposition de cargo.
pub fn exemple(nom: &str) -> PathBuf {
    let binaire = std::env::current_exe().expect("binaire de contrôle");
    let cherche = PathBuf::from("examples").join(format!("{nom}{}", std::env::consts::EXE_SUFFIX));
    binaire
        .ancestors()
        .map(|dossier| dossier.join(&cherche))
        .find(|candidat| candidat.is_file())
        // Sans trouvaille, on rend le chemin de la disposition d'origine : l'assertion de
        // l'appelant dira quel fichier manque, ce qui est plus utile qu'une panique anonyme ici.
        .unwrap_or_else(|| {
            binaire
                .parent()
                .and_then(std::path::Path::parent)
                .unwrap_or(&binaire)
                .join(cherche)
        })
}
