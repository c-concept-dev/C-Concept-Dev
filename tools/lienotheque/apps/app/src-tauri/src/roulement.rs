//! Ce qui fait tourner la file (JOB-01 à JOB-09, PLT-02).
//!
//! Une boucle, dans son fil, qui regarde la file toutes les secondes : elle prend le prochain
//! travail reprenable, vérifie qu'il reste une place, pose le bail, et lance le moteur. Le
//! moteur lit, dit où il en est, et rend un résultat ; l'hôte écrit la version puis l'active en
//! une opération (JOB-06). Le moteur n'écrit jamais dans le dépôt : il propose, l'hôte dispose.
//!
//! **La fenêtre peut se fermer.** Le roulement ne tient à aucune fenêtre : il vit tant que
//! l'application vit, et ce qu'il a écrit se relit au prochain lancement. Un arrêt brutal laisse
//! un bail qui expire tout seul, et le travail redevient reprenable à son dernier point de
//! reprise (JOB-02, JOB-03).
//!
//! **La pause est une décision, pas une panne.** Elle s'écrit dans le fichier du travail ; le fil
//! qui le mène la voit au message suivant, arrête le moteur proprement et rend la place. Aucun
//! délai ne lève une pause : elle attend une reprise explicite (JOB-08).
//!
//! **Le volume absent n'est l'échec de personne.** Une bibliothèque peut vivre sur un disque
//! externe, et un disque s'absente. Avant chaque tour, le roulement demande au volume s'il est
//! là ; s'il ne l'est pas, il **suspend** : il ne prend aucun travail, n'en fait échouer aucun,
//! ne consomme aucune tentative, et retente au tour suivant. Dès que le volume répond, il repart
//! sans qu'on ait rien à relancer. Et un travail interrompu par cette absence revient
//! « en file », pas « en échec » — il n'a pas échoué, il n'a pas pu travailler.

use crate::{
    depot::Depot,
    file,
    journal::{Journal, Ligne},
    limites::LIMITES,
    moteur::{Lancement, Message, Session},
    traitement::Emplacements,
    travail::{self, Travail},
    volume::{self, Presence},
};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

/// À quelle cadence la boucle regarde la file. Assez souvent pour qu'un dépôt parte tout de
/// suite, assez rarement pour ne rien coûter quand il n'y a rien à faire.
const PAS: Duration = Duration::from_millis(1000);

/// Le nom du fichier qui porte la manière de lire d'une bibliothèque.
pub const RECETTE: &str = "recette.json";

pub struct Roulement {
    depot: Depot,
    emplacements: Emplacements,
    appareil: String,
    cache: PathBuf,
    /// Les travaux qu'un fil de ce roulement mène déjà. Le bail dit la même chose au reste du
    /// monde ; cet ensemble protège du cas où un bail n'a pas encore été relu.
    menes: Mutex<HashSet<String>>,
    arret: AtomicBool,
    /// Vrai tant que le volume de la bibliothèque ne répond pas. Ce n'est pas une panne et ce
    /// n'est pas une pause décidée : c'est une attente, et elle se lève d'elle-même.
    suspendu: AtomicBool,
}

impl Roulement {
    /// Ouvre un roulement et met sa boucle en route. Il tourne jusqu'à `arreter`.
    pub fn demarrer(depot: Depot, emplacements: Emplacements, appareil: String, cache: PathBuf) -> Arc<Self> {
        let roulement = Arc::new(Self {
            depot,
            emplacements,
            appareil,
            cache,
            menes: Mutex::new(HashSet::new()),
            arret: AtomicBool::new(false),
            suspendu: AtomicBool::new(false),
        });
        let fil = Arc::clone(&roulement);
        std::thread::spawn(move || fil.boucler());
        roulement
    }

    /// Demande l'arrêt. Les travaux en cours finissent leur message courant et lâchent leur bail ;
    /// ce qu'ils ont lu reste lu, et la reprise repart de là (JOB-03).
    pub fn arreter(&self) {
        self.arret.store(true, Ordering::Relaxed);
    }

    fn arrete(&self) -> bool {
        self.arret.load(Ordering::Relaxed)
    }

    /// Le volume de la bibliothèque répond-il ?
    ///
    /// Posée à chaque tour, et pas une fois au démarrage : un disque s'absente en cours de route,
    /// c'est tout l'objet. La réponse est gardée pour que l'écran puisse la montrer en mots.
    pub fn presence(&self) -> Presence {
        volume::demander(self.depot.racine(), &volume::marque(&self.appareil, travail::maintenant()))
    }

    /// Vrai tant que le volume manque. L'écran s'en sert pour dire « le traitement reprendra ».
    pub fn suspendu(&self) -> bool {
        self.suspendu.load(Ordering::Relaxed)
    }

    fn boucler(self: Arc<Self>) {
        while !self.arrete() {
            match self.presence() {
                Presence::La => {
                    // Le volume était-il parti ? On le dit, parce qu'une reprise silencieuse
                    // laisse croire qu'il ne s'est rien passé.
                    if self.suspendu.swap(false, Ordering::Relaxed) {
                        eprintln!("roulement : le volume est revenu, le traitement reprend");
                    }
                    if let Err(e) = self.un_tour() {
                        eprintln!("roulement : {e}");
                    }
                }
                Presence::Absent(pourquoi) => {
                    if !self.suspendu.swap(true, Ordering::Relaxed) {
                        eprintln!("roulement : volume absent ({pourquoi}) — suspension, aucun travail n'échoue");
                    }
                }
            }
            std::thread::sleep(PAS);
        }
    }

    /// Un tour : tant qu'il reste une place et un travail qui peut partir, on le lance.
    fn un_tour(self: &Arc<Self>) -> std::io::Result<()> {
        let dossier = self.depot.travaux();
        let maintenant = travail::maintenant();
        let tous = file::charger_tout(&dossier, &mut |texte| eprintln!("file : {texte}"))?;

        loop {
            let menes = self.menes.lock().expect("ensemble des travaux menés").clone();
            let candidats: Vec<Travail> = tous.iter().filter(|t| !menes.contains(&t.id)).cloned().collect();
            let occupees = file::en_cours(&tous, maintenant) + menes.len();

            let Some(prochain) = file::prochain(&candidats, maintenant) else { return Ok(()) };
            if !file::peut_partir(prochain, occupees) {
                return Ok(());
            }

            let mut parti = prochain.clone();
            parti.battre(&self.appareil, maintenant, travail::expiration_secondes());
            parti.etat = "en_cours".to_owned();
            parti.maj_le = maintenant;
            travail::enregistrer(&dossier.join(format!("{}.json", parti.id)), &parti)?;
            self.menes.lock().expect("ensemble des travaux menés").insert(parti.id.clone());

            let fil = Arc::clone(self);
            std::thread::spawn(move || {
                fil.mener(parti.clone());
                fil.menes.lock().expect("ensemble des travaux menés").remove(&parti.id);
            });
        }
    }

    /// Mène un travail de bout en bout : le moteur, le journal, la version, l'activation.
    fn mener(&self, depart: Travail) {
        let dossier = self.depot.travaux();
        let chemin = dossier.join(format!("{}.json", depart.id));
        let journal = match Journal::pour(&self.depot.racine().join("base").join("journal"), &depart.id) {
            Ok(j) => j,
            Err(e) => {
                eprintln!("journal impossible pour {} : {e}", depart.id);
                return;
            }
        };
        let noter = |niveau: &str, texte: &str| {
            let _ = journal.ecrire(&Ligne { niveau: niveau.to_owned(), texte: texte.to_owned(), le: travail::maintenant() });
        };

        let charge = match self.charge_de(&depart) {
            Ok(charge) => charge,
            Err(raison) => {
                noter("erreur", &raison);
                self.conclure(&chemin, &depart, "echouerDefinitif", Some(raison));
                return;
            }
        };

        let lancement = Lancement::embarque(self.emplacements.node.clone(), self.emplacements.chaine.clone());
        let mut session = match Session::ouvrir(&lancement) {
            Ok(s) => s,
            Err(e) => {
                let raison = format!("Le moteur n’a pas démarré : {e}");
                noter("erreur", &raison);
                self.conclure(&chemin, &depart, "echouerRecuperable", Some(raison));
                return;
            }
        };

        let demande = serde_json::json!({
            "type": "demande",
            "protocole": LIMITES.protocole,
            "travailId": depart.id,
            "outil": { "nom": depart.outil, "version": "1.0.0" },
            "versionCible": depart.version_cible,
            "charge": charge,
        });
        if let Err(e) = session.dire(&demande.to_string()) {
            let raison = format!("Le moteur n’a pas reçu la demande : {e}");
            noter("erreur", &raison);
            self.conclure(&chemin, &depart, "echouerRecuperable", Some(raison));
            return;
        }

        let arret = serde_json::json!({
            "type": "arret",
            "protocole": LIMITES.protocole,
            "travailId": depart.id,
            "raison": "fermeture",
        })
        .to_string();

        let mut courant = depart.clone();
        let mut recu: Option<String> = None;
        let mut rate: Option<(String, bool)> = None;

        while let Some(message) = session.ecouter() {
            // Une pause demandée depuis l'écran, ou l'application qui ferme : on arrête le moteur
            // proprement et on garde ce qui a été lu.
            if self.arrete() || Self::mis_en_pause(&chemin) {
                noter("information", "Arrêt demandé : le moteur s’arrête, ce qui a été lu reste lu.");
                let _ = session.arreter(&arret);
                self.poser_point(&chemin, &courant, self.arrete());
                return;
            }

            match message {
                Ok(Message::Salutation { moteur, version, .. }) => noter("information", &format!("Moteur {moteur} {version}")),
                Ok(Message::Journal { niveau, texte }) => noter(&niveau, &texte),
                Ok(Message::Progression { progression, point, total }) => {
                    if let Some(total) = total {
                        courant.total = total;
                    }
                    if let Some(point) = point {
                        courant.avancer(point.valeur, &point.unite);
                        // `avancer` conclut le travail quand il atteint le total ; ici le moteur
                        // parle encore, donc on garde l'état en cours jusqu'à son résultat.
                        courant.etat = "en_cours".to_owned();
                    }
                    let _ = progression;
                    courant.battre_si_du(
                        &self.appareil,
                        travail::maintenant(),
                        travail::battement_secondes(),
                        travail::expiration_secondes(),
                    );
                    courant.maj_le = travail::maintenant();
                    let _ = travail::enregistrer(&chemin, &courant);
                }
                Ok(Message::Resultat { charge }) => {
                    recu = Some(charge);
                    let _ = session.arreter(&arret);
                    break;
                }
                Ok(Message::Echec { cause, reprise_possible }) => {
                    noter("erreur", &cause);
                    rate = Some((cause, reprise_possible));
                    let _ = session.arreter(&arret);
                    break;
                }
                Err(refus) => noter("erreur", &refus.message()),
            }
        }

        if let Some((cause, reprise_possible)) = rate {
            let action = if reprise_possible { "echouerRecuperable" } else { "echouerDefinitif" };
            self.conclure(&chemin, &courant, action, Some(cause));
            return;
        }

        let Some(charge) = recu else {
            let fin = session.sortie().unwrap_or_else(|| "encore en vie".to_owned());
            let raison = format!("Aucun résultat reçu — moteur {fin}. La version précédente reste active.");
            noter("erreur", &raison);
            self.conclure(&chemin, &courant, "echouerRecuperable", Some(raison));
            return;
        };

        // L'hôte seul écrit, et il n'écrit que ce qu'il a reçu en entier. Écrire puis activer :
        // un traitement interrompu laisse la version précédente intacte (JOB-06).
        let pose = self
            .depot
            .ecrire_version(&courant.version_cible, &charge)
            .and_then(|_| self.depot.activer(&courant.version_cible, travail::maintenant()));
        match pose {
            Ok(()) => {
                noter("information", "Version écrite et activée");
                let mut fini = courant.clone();
                fini.etat = "termine".to_owned();
                fini.verrou = None;
                fini.maj_le = travail::maintenant();
                let _ = travail::enregistrer(&chemin, &fini);
            }
            Err(e) => {
                let raison = format!("Résultat impossible à écrire : {e}");
                noter("erreur", &raison);
                self.conclure(&chemin, &courant, "echouerRecuperable", Some(raison));
            }
        }
    }

    /// Le travail a-t-il été mis en pause pendant qu'on le menait ?
    fn mis_en_pause(chemin: &std::path::Path) -> bool {
        travail::charger(chemin).ok().flatten().is_some_and(|t| t.etat == "en_pause")
    }

    /// Garde ce qui a été lu et lâche le bail, sans conclure : la reprise repartira de là.
    fn poser_point(&self, chemin: &std::path::Path, courant: &Travail, par_fermeture: bool) {
        let mut pose = courant.clone();
        // Une fermeture de l'application remet en file ; une pause demandée reste en pause.
        pose.etat = if par_fermeture { "en_file".to_owned() } else { "en_pause".to_owned() };
        pose.verrou = None;
        pose.maj_le = travail::maintenant();
        let _ = travail::enregistrer(chemin, &pose);
    }

    /// Applique une transition d'échec et enregistre, en passant par la seule porte qui les tient.
    /// Conclut un travail — sauf si ce qui l'a arrêté est l'absence du volume.
    ///
    /// Dans ce cas, le travail n'a pas échoué : **nous n'avons pas pu travailler**. Il revient
    /// « en file », sans consommer de tentative, et repartira dès que le disque répondra. Sans
    /// cette distinction, trois tentatives à trente secondes suffisaient à déclarer un document
    /// définitivement perdu parce qu'un disque s'était absenté une minute et demie.
    ///
    /// La question n'est posée que sur le chemin de l'échec : un travail qui s'est terminé l'a
    /// fait pour de bon, et l'on n'a pas à interroger le disque pour l'écrire.
    fn conclure(&self, chemin: &std::path::Path, courant: &Travail, action: &str, cause: Option<String>) {
        let echoue = action == "echouerRecuperable" || action == "echouerDefinitif";
        if echoue {
            if let Presence::Absent(pourquoi) = self.presence() {
                self.suspendu.store(true, Ordering::Relaxed);
                eprintln!("roulement : volume absent ({pourquoi}) — « {} » revient en file, aucune tentative consommée", courant.id);
                // « reprendre » depuis « en_cours » rend le travail à la file sans toucher au
                // compteur de tentatives : c'est exactement ce qu'on veut dire.
                if let Some(mut rendu) = file::appliquer(courant, "reprendre", travail::maintenant()) {
                    rendu.reprise_possible = true;
                    rendu.cause = Some(format!("volume absent : {pourquoi}"));
                    let _ = travail::enregistrer(chemin, &rendu);
                }
                return;
            }
        }
        let Some(mut apres) = file::appliquer(courant, action, travail::maintenant()) else { return };
        apres.reprise_possible = apres.etat == "en_echec_recuperable";
        apres.cause = cause;
        let _ = travail::enregistrer(chemin, &apres);
    }

    /// La charge du travail, montée depuis l'agencement de la bibliothèque.
    ///
    /// L'hôte la monte mais ne la lit pas : ce qu'elle décrit appartient à l'outil. Il vérifie
    /// seulement que ce qu'elle désigne existe — une demande qui pointe un fichier absent échoue
    /// trois minutes plus tard, et pour une raison qu'on ne comprend plus.
    fn charge_de(&self, travail: &Travail) -> Result<serde_json::Value, String> {
        let sujet = travail.sujet.as_ref().ok_or("Ce travail ne désigne aucun fichier.")?;
        let racine = self.depot.racine();
        let document = racine.join(crate::depot::SOURCES).join(&sujet.nom);
        if !document.exists() {
            return Err(format!("Le fichier « {} » n’est plus dans la bibliothèque.", sujet.nom));
        }
        let recette = racine.join("base").join(RECETTE);
        if !recette.exists() {
            return Err(
                "Cette bibliothèque n’a pas encore de manière de lire. Apprenez-en une, puis reprenez ce travail."
                    .to_owned(),
            );
        }
        let description = racine.join("base").join("bibliotheque.json");
        if !description.exists() {
            return Err("Cette bibliothèque n’a pas de description.".to_owned());
        }

        Ok(serde_json::json!({
            "document": document,
            "medias": racine.join(crate::depot::SOURCES),
            "recette": recette,
            "description": description,
            "cache": self.cache,
            "images": racine.join(crate::depot::DERIVES).join(&travail.version_cible).join("pages"),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn bac(nom: &str) -> PathBuf {
        let chemin = std::env::temp_dir().join(format!("lienotheque-roulement-{nom}-{}", std::process::id()));
        fs::remove_dir_all(&chemin).ok();
        fs::create_dir_all(&chemin).expect("bac");
        chemin
    }

    fn roulement(racine: PathBuf) -> Roulement {
        Roulement {
            depot: Depot::ouvrir(racine.join("bibliotheque")).expect("dépôt"),
            emplacements: Emplacements { node: PathBuf::from("node"), chaine: PathBuf::from("moteur.js") },
            appareil: "0190f0a0-0000-7000-8000-00000000ff01".to_owned(),
            cache: racine.join("cache"),
            menes: Mutex::new(HashSet::new()),
            arret: AtomicBool::new(false),
            suspendu: AtomicBool::new(false),
        }
    }

    fn travail_de(nom: &str) -> Travail {
        let mut t = Travail::neuf("0190f0a0-0000-7000-8000-000000000001", "traitement-de-lot", 0);
        t.version_cible = "0190f0a0-0000-7000-8000-0000000000a1".to_owned();
        t.sujet = Some(crate::travail::Sujet { nom: nom.to_owned(), contenu: "documents".to_owned() });
        t
    }

    #[test]
    fn refuse_de_lancer_un_travail_dont_le_fichier_a_disparu() {
        let racine = bac("absent");
        let r = roulement(racine.clone());
        let erreur = r.charge_de(&travail_de("parti.pdf")).expect_err("doit refuser");
        assert!(erreur.contains("n’est plus dans la bibliothèque"), "{erreur}");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn dit_qu_il_manque_une_maniere_de_lire_plutot_que_d_echouer_trois_minutes_plus_tard() {
        let racine = bac("sans-recette");
        let r = roulement(racine.clone());
        fs::create_dir_all(r.depot.racine().join(crate::depot::SOURCES)).expect("sources");
        fs::write(r.depot.racine().join(crate::depot::SOURCES).join("un.pdf"), b"x").expect("document");

        let erreur = r.charge_de(&travail_de("un.pdf")).expect_err("doit refuser");
        assert!(erreur.contains("manière de lire"), "{erreur}");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn monte_une_charge_complete_quand_tout_est_la() {
        let racine = bac("complete");
        let r = roulement(racine.clone());
        let base = r.depot.racine().join("base");
        fs::create_dir_all(r.depot.racine().join(crate::depot::SOURCES)).expect("sources");
        fs::create_dir_all(&base).expect("base");
        fs::write(r.depot.racine().join(crate::depot::SOURCES).join("un.pdf"), b"x").expect("document");
        fs::write(base.join(RECETTE), b"{}").expect("recette");
        fs::write(base.join("bibliotheque.json"), b"{}").expect("description");

        let charge = r.charge_de(&travail_de("un.pdf")).expect("charge");
        for champ in ["document", "medias", "recette", "description", "cache", "images"] {
            assert!(charge.get(champ).is_some(), "{champ} manque");
        }
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn une_pause_ecrite_dans_le_fichier_se_voit_depuis_le_fil_qui_mene() {
        let racine = bac("pause");
        let chemin = racine.join("un-travail.json");
        let mut t = travail_de("un.pdf");
        t.etat = "en_cours".to_owned();
        travail::enregistrer(&chemin, &t).expect("écriture");
        assert!(!Roulement::mis_en_pause(&chemin));

        let en_pause = file::appliquer(&t, "pause", travail::maintenant()).expect("pause");
        travail::enregistrer(&chemin, &en_pause).expect("écriture");
        assert!(Roulement::mis_en_pause(&chemin));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn une_fermeture_remet_en_file_la_ou_une_pause_reste_en_pause() {
        let racine = bac("point");
        let chemin = racine.join("un-travail.json");
        let r = roulement(racine.clone());
        let mut courant = travail_de("un.pdf");
        courant.total = 286;
        courant.avancer(194, "page");
        courant.etat = "en_cours".to_owned();

        r.poser_point(&chemin, &courant, true);
        let apres_fermeture = travail::charger(&chemin).expect("lecture").expect("travail");
        assert_eq!(apres_fermeture.etat, "en_file");
        assert_eq!(apres_fermeture.reprise_a(), 194, "ce qui a été lu reste lu (JOB-03)");
        assert!(apres_fermeture.verrou.is_none(), "le bail est lâché");

        r.poser_point(&chemin, &courant, false);
        assert_eq!(travail::charger(&chemin).expect("lecture").expect("travail").etat, "en_pause");
        fs::remove_dir_all(&racine).ok();
    }
}
