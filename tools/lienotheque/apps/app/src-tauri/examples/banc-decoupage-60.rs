//! BANC JETABLE — 4 novembre 2026. Non commité tant que Christophe ne l'a pas validé.
//!
//! Donne à l'EXPRESSION EXACTE de `roulement.rs:285` le texte réel que le moteur a émis
//! juste après la dernière ligne journalisée de l'import du 4 novembre 15:22.
//!
//!     Ok(Message::Journal { texte, .. }) => format!("« {} »", &texte[..texte.len().min(60)]),
//!
//! Aucun code de production n'est modifié : le banc recopie l'expression et l'applique.

fn main() {
    // Rang 102 : la DERNIÈRE ligne que l'import réel ait journalisée (15:26:16).
    let avant = "28 page(s) à marque confrontée(s) au texte déjà lu par la chaîne.";
    // Rang 103 : la suivante, jamais journalisée.
    let apres = "0 page(s) où le nom d'un enregistrement se retrouve imprimé, dont 0 qui n'en désigne(nt) qu'un seul : 0 confirme(nt) la marque, 0 la contredise(nt).";

    for (nom, texte) in [("rang 102 (journalisé)", avant), ("rang 103 (jamais journalisé)", apres)] {
        println!("── {nom} : {} octets", texte.len());
        let r = std::panic::catch_unwind(|| format!("« {} »", &texte[..texte.len().min(60)]));
        match r {
            Ok(s) => println!("   PASSE : {s}"),
            Err(_) => println!("   *** PANIQUE *** sur &texte[..60]"),
        }
    }
}
