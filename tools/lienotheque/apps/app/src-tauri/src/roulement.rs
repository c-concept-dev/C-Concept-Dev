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
    collections::{HashMap, HashSet},
    fs,
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

/// Qui se lit comment, quand une bibliothèque a plusieurs manières de lire.
///
/// Une bibliothèque d'un seul tenant n'en a qu'une, et `recette.json` suffit. Un corpus
/// rassemblé au fil des ans n'a pas cette chance : des pages natives, des livres photographiés
/// une page ou deux par feuille, des feuillets sans pagination suivie. Leur appliquer une seule
/// manière de lire reviendrait à chercher un numéro là où il n'y en a pas, et à n'en lire qu'un
/// là où la feuille en porte deux.
///
/// L'affectation est une **donnée** — un objet qui associe le nom d'un document à l'identifiant
/// de sa manière de lire — et non une branche de code. Absente, rien ne change : `recette.json`
/// reprend son rôle, et une bibliothèque d'un seul tenant ignore que ceci existe.
pub const MANIERES: &str = "manieres.json";

/// Où vivent les manières de lire nommées.
pub const RECETTES: &str = "recettes";

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

    /// Le dossier de la bibliothèque répond-il ?
    ///
    /// Posée à chaque tour, et pas une fois au démarrage : un disque s'absente en cours de route,
    /// c'est tout l'objet. La réponse est gardée pour que l'écran puisse la montrer en mots.
    ///
    /// Depuis le lot E2 ce dossier porte la base et la file, et il vit sur le disque interne : son
    /// absence relève donc de `Role::Base`, qui ne se suspend pas. Les dérivés, eux, peuvent vivre
    /// ailleurs, et c'est `presence_des_derives` qui les regarde.
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

            // Prendre en charge passe par la porte commune : une reprise d'échec récupérable
            // consomme une tentative, qu'elle vienne de l'écran ou de la file.
            let parti = file::prendre(prochain, &self.appareil, maintenant);
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
    /// La manière de lire qui revient à ce document.
    ///
    /// Celle que l'affectation lui donne, quand elle en donne une **et** que le fichier existe ;
    /// sinon celle de la bibliothèque. On ne se rabat jamais en silence sur une manière nommée
    /// mais absente : ce serait en appliquer une autre, et le résultat aurait l'air juste. On se
    /// rabat sur celle de la bibliothèque, qui est un défaut assumé, et on le dit.
    fn maniere_de(&self, empreinte: &str) -> PathBuf {
        let base = self.depot.racine().join("base");
        let defaut = base.join(RECETTE);
        let Ok(texte) = fs::read_to_string(base.join(MANIERES)) else { return defaut };
        let Ok(affectation) = serde_json::from_str::<HashMap<String, String>>(&texte) else {
            eprintln!("roulement : {MANIERES} est illisible — on s'en tient à la manière de la bibliothèque");
            return defaut;
        };
        let Some(identifiant) = affectation.get(empreinte) else { return defaut };
        let nommee = base.join(RECETTES).join(format!("{identifiant}.json"));
        if nommee.exists() {
            return nommee;
        }
        eprintln!("roulement : « {identifiant} » est affectée à l'empreinte {empreinte} mais introuvable");
        defaut
    }

    fn charge_de(&self, travail: &Travail) -> Result<serde_json::Value, String> {
        let sujet = travail.sujet.as_ref().ok_or("Ce travail ne désigne aucun fichier.")?;
        let racine = self.depot.racine();
        // La source se retrouve par son **empreinte**, jamais par son nom.
        //
        // Deux documents peuvent porter le même nom dans deux dossiers et n'avoir rien à voir :
        // ce corpus en contient. Nommés par leur nom, le second écrasait le premier au dépôt, et
        // l'on traitait deux fois le même fichier en croyant en traiter deux.
        let empreinte = travail.empreinte.as_deref().ok_or("Ce travail ne porte pas l’empreinte de son fichier.")?;
        let extension = std::path::Path::new(&sujet.nom)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin")
            .to_lowercase();
        let document = self.depot.source(empreinte, &extension);
        if !document.exists() {
            return Err(format!("Le fichier « {} » n’est plus dans la bibliothèque.", sujet.nom));
        }
        let recette = self.maniere_de(empreinte);
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

    /// Chaque document reçoit **sa** manière de lire, et jamais celle du voisin.
    ///
    /// Les quatre cas tiennent ensemble, parce que c'est leur combinaison qui est dangereuse :
    /// se rabattre en silence sur une autre manière de lire donnerait un résultat d'apparence
    /// juste — des pages lues, des ancres posées — et faux. Mieux vaut le défaut assumé de la
    /// bibliothèque, qui se voit, qu'une manière voisine, qui ne se voit pas.
    #[test]
    fn chaque_document_recoit_sa_maniere_de_lire() {
        let bac = bac("manieres");
        let roul = roulement(bac.clone());
        let base = bac.join("bibliotheque").join("base");
        fs::create_dir_all(base.join(RECETTES)).expect("dossiers");
        fs::write(base.join(RECETTE), b"{}").expect("manière par défaut");
        fs::write(base.join(RECETTES).join("couchee.json"), b"{}").expect("manière nommée");
        fs::write(
            base.join(MANIERES),
            br#"{"couche.pdf": "couchee", "orpheline.pdf": "jamais-ecrite"}"#,
        )
        .expect("affectation");

        // Affectée et présente : c'est elle qu'on prend.
        assert!(roul.maniere_de("couche.pdf").ends_with("recettes/couchee.json"));
        // Pas affectée : la manière de la bibliothèque, qui est le défaut assumé.
        assert!(roul.maniere_de("inconnue.pdf").ends_with(RECETTE));
        // Affectée mais introuvable : surtout pas une autre. Le défaut, et un mot sur la sortie.
        assert!(roul.maniere_de("orpheline.pdf").ends_with(RECETTE));

        // Sans affectation du tout, une bibliothèque d'un seul tenant ne change pas de
        // comportement — c'est la condition pour que ceci n'abîme rien de ce qui marchait.
        fs::remove_file(base.join(MANIERES)).expect("retrait");
        assert!(roul.maniere_de("couche.pdf").ends_with(RECETTE));
        fs::remove_dir_all(&bac).ok();
    }

    fn bac(nom: &str) -> PathBuf {
        let chemin = std::env::temp_dir().join(format!("lienotheque-roulement-{nom}-{}", std::process::id()));
        fs::remove_dir_all(&chemin).ok();
        fs::create_dir_all(&chemin).expect("bac");
        chemin
    }

    /// Un travail **en vol** quand le volume disparaît revient en file, sans perdre de tentative.
    ///
    /// L'épreuve réelle ne montre que l'autre moitié : un travail qui *attendait* n'échoue pas.
    /// Celui-ci éprouve le chemin de l'échec, qui est le seul endroit où la confusion coûtait
    /// cher — c'est lui qui transformait une absence d'une minute et demie en document perdu.
    ///
    /// Le dépôt pointe un dossier absent ; le fichier du travail, lui, est bien là. C'est
    /// exactement la situation : la question posée au volume est celle du dépôt, pas celle du
    /// fichier qu'on est en train d'écrire.
    #[test]
    fn un_travail_en_vol_revient_en_file_quand_le_volume_s_absente() {
        let bac = bac("en-vol");
        let roul = roulement(bac.clone());

        // On fait disparaître le dossier du dépôt, et on met un fichier à sa place : c'est ce
        // qu'un point de montage laisse derrière lui quand le volume s'en va, et c'est ce qui
        // fait échouer la création comme l'écriture.
        let racine = bac.join("bibliotheque");
        std::fs::remove_dir_all(&racine).expect("dossier retiré");
        std::fs::write(&racine, b"un volume qui n'est plus la").expect("obstacle");
        assert!(!roul.presence().est_la(), "le dépôt devrait être injoignable : {}", racine.display());

        let mut en_cours = Travail::neuf("t-en-vol", "lecture-de-pages", 1);
        en_cours.etat = "en_cours".to_owned();
        en_cours.tentative = 2;
        let chemin = bac.join("t-en-vol.json");
        travail::enregistrer(&chemin, &en_cours).expect("travail posé");

        roul.conclure(&chemin, &en_cours, "echouerRecuperable", Some("le moteur s'est arrêté".to_owned()));

        let relu = travail::charger(&chemin).expect("lecture").expect("travail relu");
        assert_eq!(relu.etat, "en_file", "un volume absent a fait échouer un travail en vol");
        assert_eq!(relu.tentative, 2, "une absence de volume a consommé une tentative");
        assert!(relu.cause.unwrap_or_default().contains("volume absent"), "la cause ne dit pas pourquoi");
        assert!(roul.suspendu(), "le roulement devrait s'être suspendu");
        std::fs::remove_dir_all(&bac).ok();
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

    /// L'empreinte d'essai : c'est elle qui nomme la source depuis que deux documents peuvent
    /// porter le même nom sans être le même document.
    const EMPREINTE: &str = "1111111111111111111111111111111111111111111111111111111111111111";

    fn travail_de(nom: &str) -> Travail {
        let mut t = Travail::neuf("0190f0a0-0000-7000-8000-000000000001", "traitement-de-lot", 0);
        t.version_cible = "0190f0a0-0000-7000-8000-0000000000a1".to_owned();
        t.sujet = Some(crate::travail::Sujet { nom: nom.to_owned(), contenu: "documents".to_owned() });
        t.empreinte = Some(EMPREINTE.to_owned());
        t
    }

    /// Pose une source là où le dépôt la rangera : sous son empreinte, pas sous son nom.
    fn poser_source(r: &Roulement, extension: &str) {
        let chemin = r.depot.source(EMPREINTE, extension);
        fs::create_dir_all(chemin.parent().expect("palier")).expect("palier");
        fs::write(chemin, b"x").expect("document");
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
        poser_source(&r, "pdf");

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
        poser_source(&r, "pdf");
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
