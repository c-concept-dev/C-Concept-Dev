//! Montrer les écrans tels que l'application les rend, et non tels qu'un navigateur les rendrait.
//!
//! Un navigateur de test suffit pour éprouver un comportement ; il ne suffit pas pour montrer un
//! écran. La fenêtre, ses polices, son rendu de texte et ses coins viennent du système, et c'est
//! cela qu'on veut sur l'image. D'où ce mode : l'application s'ouvre, se place sur un écran et un
//! thème, dit où elle est, et attend qu'on l'ait photographiée avant de passer au suivant.
//!
//! La photographie elle-même reste dehors, à `outils/capturer-ecrans.py` : prendre l'image de
//! l'écran demande une permission du système, qui s'accorde au programme qu'on lance soi-même,
//! pas à une application qui la réclamerait au passage.

use std::io::{BufRead, Write};
use std::time::Duration;
use tauri::{LogicalSize, Manager, WebviewWindow};

/// Un écran à montrer : son adresse dans l'application, son thème, le nom de son image.
pub struct Pose {
    pub adresse: &'static str,
    pub theme: &'static str,
    pub nom: &'static str,
    /// Ce que l'adresse demande en plus, quand l'écran ne s'atteint pas par son seul fragment —
    /// la recherche, qu'il faut ouvrir et remplir, et que personne ne peut taper ici.
    pub en_plus: &'static str,
}

/// Les écrans de l'étape 2, en clair et en hybride.
pub const POSES: &[Pose] = &[
    Pose { adresse: "#creer", theme: "light", nom: "1-creer-clair", en_plus: "" },
    Pose { adresse: "#creer", theme: "hybrid", nom: "1-creer-hybride", en_plus: "" },
    Pose { adresse: "#organisation", theme: "light", nom: "2-organisation-clair", en_plus: "" },
    Pose { adresse: "#organisation", theme: "hybrid", nom: "2-organisation-hybride", en_plus: "" },
    Pose { adresse: "#depot", theme: "light", nom: "3-depot-et-traitement-clair", en_plus: "" },
    Pose { adresse: "#depot", theme: "hybrid", nom: "3-depot-et-traitement-hybride", en_plus: "" },
    Pose { adresse: "", theme: "light", nom: "5-recherche-clair", en_plus: "&chercher=articulation" },
    Pose { adresse: "", theme: "hybrid", nom: "5-recherche-hybride", en_plus: "&chercher=articulation" },
];

/// Le temps laissé à la page pour se charger, poser ses polices et finir ses transitions.
const REPOS: Duration = Duration::from_millis(2500);

/// Place la fenêtre sur une pose, et rend sa position en points une fois la page reposée.
fn poser(fenetre: &WebviewWindow, pose: &Pose, rang: usize) -> Result<(f64, f64, f64, f64), tauri::Error> {
    // Le thème se mémorise avant le rechargement : c'est au chargement que la page le lit.
    // `?demonstration` n'existe qu'en développement — c'est la même porte que le jeu d'accueil.
    // Le rang rend chaque adresse différente de la précédente : deux poses du même écran ne
    // diffèrent que par le thème, et une adresse identique ne recharge rien.
    fenetre.eval(&format!(
        "localStorage.setItem('lienotheque.theme', '{}'); location.href = '?demonstration&pose={rang}{}{}';",
        pose.theme, pose.en_plus, pose.adresse
    ))?;
    std::thread::sleep(REPOS);

    let echelle = fenetre.scale_factor()?;
    let position = fenetre.outer_position()?.to_logical::<f64>(echelle);
    let taille = fenetre.outer_size()?.to_logical::<f64>(echelle);
    Ok((position.x, position.y, taille.width, taille.height))
}

/// Greffe le parcours des poses sur l'application déjà construite.
///
/// Le même assemblage que d'habitude — mêmes greffons, mêmes commandes : on montre l'application,
/// pas une maquette d'elle. Le dialogue est volontairement minuscule : une ligne
/// `pose <nom> <x> <y> <largeur> <hauteur>` sur la sortie, une ligne quelconque en retour quand
/// l'image est prise.
pub fn brancher(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let fenetre = app
        .get_webview_window("main")
        .ok_or("fenêtre principale introuvable")?;
    let hote = app.handle().clone();

    // La taille est posée ici et non dans la configuration : les images doivent toutes avoir le
    // même cadre, quelle que soit la fenêtre que l'on avait laissée ouverte.
    fenetre.set_size(LogicalSize::new(1320.0, 900.0))?;
    fenetre.set_focus()?;

    std::thread::spawn(move || {
        let mut lignes = std::io::stdin().lock().lines();
        for (rang, pose) in POSES.iter().enumerate() {
            match poser(&fenetre, pose, rang) {
                Ok((x, y, largeur, hauteur)) => println!("pose {} {x} {y} {largeur} {hauteur}", pose.nom),
                Err(e) => {
                    eprintln!("pose {} impossible : {e}", pose.nom);
                    hote.exit(1);
                    return;
                }
            }
            let _ = std::io::stdout().flush();
            // Sans réponse, on s'arrête : mieux vaut pas d'image qu'une image de l'écran suivant
            // portant le nom du précédent.
            if lignes.next().is_none() {
                eprintln!("plus personne pour photographier : arrêt");
                hote.exit(1);
                return;
            }
        }
        println!("fini");
        let _ = std::io::stdout().flush();
        hote.exit(0);
    });
    Ok(())
}
