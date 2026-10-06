//! Lancer le moteur de traitement et lui parler (PLT-02, JOB-02, JOB-05, JOB-08, JOB-09).
//!
//! L'hôte lance un processus par travail, lui écrit une demande sur l'entrée standard, lit ses
//! messages sur la sortie standard, un par ligne. Le moteur ne décide de rien : il dit où il en
//! est, puis rend ce qu'il a produit.
//!
//! Trois choses s'obtiennent par l'isolation de processus, et c'est pourquoi elle a été choisie :
//! mettre en pause ou annuler, c'est tuer un processus plutôt qu'espérer qu'une boucle consulte un
//! drapeau (JOB-08) ; la marque haute du ramasse-miettes reste hors de l'interface ; et un moteur
//! qui plante ne cesse que de battre — son bail expire, son travail repart du dernier point de
//! reprise (JOB-02, JOB-03).

use crate::limites::LIMITES;
use serde::Deserialize;
use std::{
    io::{self, BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

/// Ce qu'un message du moteur nous apprend. Les champs qu'on n'exploite pas ici ne sont pas
/// décrits : l'hôte ne relit pas le contrat du moteur, il en prend ce dont il a besoin.
#[derive(Debug, Clone, PartialEq)]
pub enum Message {
    Salutation { protocole: u32, moteur: String, version: String },
    Progression { progression: f32, pas: Option<u32> },
    Journal { niveau: String, texte: String },
    Resultat { charge: String },
    Echec { cause: String, reprise_possible: bool },
}

#[derive(Deserialize)]
struct Enveloppe {
    #[serde(rename = "type")]
    genre: String,
    protocole: u32,
    #[serde(default)]
    moteur: Option<MoteurDit>,
    #[serde(default)]
    progression: Option<f32>,
    #[serde(default, rename = "pointReprise")]
    point_reprise: Option<PointDit>,
    #[serde(default)]
    niveau: Option<String>,
    #[serde(default)]
    texte: Option<String>,
    #[serde(default)]
    charge: Option<serde_json::Value>,
    #[serde(default)]
    cause: Option<String>,
    #[serde(default, rename = "reprisePossible")]
    reprise_possible: Option<bool>,
}

#[derive(Deserialize)]
struct MoteurDit {
    nom: String,
    version: String,
}

#[derive(Deserialize)]
struct PointDit {
    valeur: u32,
}

/// Pourquoi une ligne n'a pas donné de message. Un refus se dit, il ne se devine pas.
#[derive(Debug, PartialEq)]
pub enum Refus {
    /// La ligne n'est pas du JSON, ou pas la forme attendue.
    Illisible(String),
    /// Le moteur ne parle pas notre version. On ne devine jamais une forme qu'on ne connaît pas.
    Desaccord { attendu: u32, recu: u32 },
}

impl Refus {
    /// Le texte qu'on montre, en français et sans jargon : il finira sous les yeux de quelqu'un.
    pub fn message(&self) -> String {
        match self {
            Refus::Illisible(quoi) => format!("Le moteur de traitement a dit quelque chose d'incompréhensible : {quoi}"),
            Refus::Desaccord { attendu, recu } => format!(
                "Version d'échange {recu} reçue, {attendu} attendue : l'application et son moteur de traitement ne sont pas de la même version."
            ),
        }
    }
}

/// Lit une ligne du moteur et en tire un message, ou dit pourquoi elle n'en donne pas.
pub fn lire_message(ligne: &str) -> Result<Message, Refus> {
    let enveloppe: Enveloppe =
        serde_json::from_str(ligne).map_err(|_| Refus::Illisible(ligne.chars().take(80).collect()))?;

    if enveloppe.protocole != LIMITES.protocole {
        return Err(Refus::Desaccord { attendu: LIMITES.protocole, recu: enveloppe.protocole });
    }

    match enveloppe.genre.as_str() {
        "salutation" => {
            let dit = enveloppe.moteur.ok_or_else(|| Refus::Illisible("salutation sans moteur".to_owned()))?;
            Ok(Message::Salutation { protocole: enveloppe.protocole, moteur: dit.nom, version: dit.version })
        }
        "progression" => Ok(Message::Progression {
            progression: enveloppe.progression.unwrap_or(0.0),
            pas: enveloppe.point_reprise.map(|p| p.valeur),
        }),
        "journal" => Ok(Message::Journal {
            niveau: enveloppe.niveau.unwrap_or_else(|| "information".to_owned()),
            texte: enveloppe.texte.unwrap_or_default(),
        }),
        "resultat" => Ok(Message::Resultat {
            charge: enveloppe.charge.map(|c| c.to_string()).unwrap_or_default(),
        }),
        "echec" => Ok(Message::Echec {
            cause: enveloppe.cause.unwrap_or_else(|| "cause non dite".to_owned()),
            reprise_possible: enveloppe.reprise_possible.unwrap_or(false),
        }),
        autre => Err(Refus::Illisible(format!("message de type « {autre} »"))),
    }
}

/// Comment lancer le moteur. Rendue explicite pour que les contrôles puissent lancer autre chose
/// qu'un vrai moteur : ce qu'on éprouve ici, c'est le dialogue, pas la capacité de Node à démarrer.
#[derive(Clone, Debug)]
pub struct Lancement {
    pub programme: PathBuf,
    pub arguments: Vec<String>,
}

impl Lancement {
    /// Le moteur embarqué du paquet, avec le plafond de mémoire du contrat.
    ///
    /// Le plafond n'est pas un budget : c'est un garde-fou contre une boucle qui s'emballerait, et
    /// il vaut mieux un travail arrêté net qu'une machine qui se fige.
    pub fn embarque(node: PathBuf, script: PathBuf) -> Self {
        Self {
            programme: node,
            arguments: vec![
                format!("--max-old-space-size={}", LIMITES.memoire_max_mo),
                script.to_string_lossy().into_owned(),
            ],
        }
    }
}

/// Un moteur lancé, et le tuyau par lequel on lui parle.
pub struct Session {
    enfant: Child,
    sortie: BufReader<std::process::ChildStdout>,
}

impl Session {
    pub fn ouvrir(lancement: &Lancement) -> io::Result<Self> {
        let mut enfant = Command::new(&lancement.programme)
            .args(&lancement.arguments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let sortie = BufReader::new(enfant.stdout.take().expect("sortie demandée au lancement"));
        Ok(Self { enfant, sortie })
    }

    /// Écrit une ligne au moteur. Le saut final fait partie du message : c'est lui qui le termine.
    pub fn dire(&mut self, ligne: &str) -> io::Result<()> {
        let entree = self.enfant.stdin.as_mut().expect("entrée demandée au lancement");
        entree.write_all(ligne.as_bytes())?;
        if !ligne.ends_with('\n') {
            entree.write_all(b"\n")?;
        }
        entree.flush()
    }

    /// Le message suivant, ou rien quand le moteur a fini de parler.
    pub fn ecouter(&mut self) -> Option<Result<Message, Refus>> {
        let mut ligne = String::new();
        match self.sortie.read_line(&mut ligne) {
            Ok(0) => None,
            Ok(_) if ligne.trim().is_empty() => self.ecouter(),
            Ok(_) => Some(lire_message(ligne.trim())),
            Err(e) => Some(Err(Refus::Illisible(e.to_string()))),
        }
    }

    /// Demande l'arrêt, laisse au moteur le délai du contrat, puis le tue.
    ///
    /// Un arrêt propre écrit son dernier point de reprise ; un moteur tué ne le fait pas, et le
    /// travail repart du point précédent. Rien n'est perdu dans les deux cas (JOB-03), mais le
    /// premier évite de refaire ce qui était fait.
    pub fn arreter(&mut self, ligne_arret: &str) -> io::Result<bool> {
        let _ = self.dire(ligne_arret);
        drop(self.enfant.stdin.take());

        let limite = Instant::now() + Duration::from_secs(LIMITES.delai_arret_propre_s);
        while Instant::now() < limite {
            if self.enfant.try_wait()?.is_some() {
                return Ok(true);
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        self.enfant.kill()?;
        let _ = self.enfant.wait();
        Ok(false)
    }

    /// Tue le moteur sans rien demander : pour une annulation, où l'on ne veut pas de la suite.
    pub fn tuer(&mut self) -> io::Result<()> {
        self.enfant.kill()?;
        self.enfant.wait().map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un moteur de pacotille : il récite des lignes, puis se tait. C'est tout ce qu'il faut pour
    /// éprouver le dialogue.
    fn reciteur(lignes: &[&str]) -> Lancement {
        let script = lignes
            .iter()
            .map(|l| format!("printf '%s\\n' {}", shell_quote(l)))
            .collect::<Vec<_>>()
            .join("; ");
        Lancement { programme: PathBuf::from("/bin/sh"), arguments: vec!["-c".to_owned(), script] }
    }

    fn shell_quote(texte: &str) -> String {
        format!("'{}'", texte.replace('\'', "'\\''"))
    }

    fn salutation() -> String {
        format!(
            r#"{{"type":"salutation","protocole":{},"moteur":{{"nom":"node","version":"24.11.1"}}}}"#,
            LIMITES.protocole
        )
    }

    #[test]
    fn lit_la_salutation_du_moteur() {
        let message = lire_message(&salutation()).expect("salutation lisible");
        assert_eq!(
            message,
            Message::Salutation { protocole: LIMITES.protocole, moteur: "node".to_owned(), version: "24.11.1".to_owned() }
        );
    }

    #[test]
    fn refuse_un_moteur_d_une_autre_version() {
        let ligne = format!(
            r#"{{"type":"salutation","protocole":{},"moteur":{{"nom":"node","version":"24"}}}}"#,
            LIMITES.protocole + 1
        );
        let refus = lire_message(&ligne).expect_err("un désaccord se refuse");
        assert_eq!(refus, Refus::Desaccord { attendu: LIMITES.protocole, recu: LIMITES.protocole + 1 });
        assert!(refus.message().contains("pas de la même version"), "le refus se lit en français");
    }

    #[test]
    fn refuse_une_ligne_qui_n_est_pas_un_message() {
        assert!(matches!(lire_message("{ceci n'est pas du JSON"), Err(Refus::Illisible(_))));
        let inconnu = format!(r#"{{"type":"coucou","protocole":{}}}"#, LIMITES.protocole);
        assert!(matches!(lire_message(&inconnu), Err(Refus::Illisible(_))));
    }

    #[test]
    fn lit_l_avancement_et_son_point_de_reprise() {
        let ligne = format!(
            r#"{{"type":"progression","protocole":{},"travailId":"x","progression":0.5,"pointReprise":{{"unite":"page","valeur":120}}}}"#,
            LIMITES.protocole
        );
        assert_eq!(lire_message(&ligne), Ok(Message::Progression { progression: 0.5, pas: Some(120) }));
    }

    #[test]
    fn lit_un_echec_et_s_il_est_reprenable() {
        let ligne = format!(
            r#"{{"type":"echec","protocole":{},"travailId":"x","cause":"Moteur introuvable","reprisePossible":true}}"#,
            LIMITES.protocole
        );
        assert_eq!(
            lire_message(&ligne),
            Ok(Message::Echec { cause: "Moteur introuvable".to_owned(), reprise_possible: true })
        );
    }

    #[test]
    fn ecoute_un_moteur_jusqu_a_ce_qu_il_se_taise() {
        let journal = format!(
            r#"{{"type":"journal","protocole":{},"travailId":"x","niveau":"information","texte":"Lecture du document","le":"2026-10-06T00:00:00Z"}}"#,
            LIMITES.protocole
        );
        let mut session = Session::ouvrir(&reciteur(&[&salutation(), &journal])).expect("moteur lancé");

        assert!(matches!(session.ecouter(), Some(Ok(Message::Salutation { .. }))));
        assert_eq!(
            session.ecouter(),
            Some(Ok(Message::Journal { niveau: "information".to_owned(), texte: "Lecture du document".to_owned() }))
        );
        assert_eq!(session.ecouter(), None, "le moteur s'est tu");
    }

    #[test]
    fn un_moteur_qui_s_arrete_de_lui_meme_n_est_pas_tue() {
        let mut session = Session::ouvrir(&reciteur(&[&salutation()])).expect("moteur lancé");
        let propre = session.arreter("{}").expect("arrêt demandé");
        assert!(propre, "il a fini seul, dans le délai");
    }

    #[test]
    fn un_moteur_qui_ne_rend_pas_la_main_est_tue_apres_le_delai() {
        // Il salue, puis dort bien au-delà du délai d'arrêt propre.
        let script = format!("printf '%s\\n' '{}'; sleep 600", salutation());
        let lancement = Lancement { programme: PathBuf::from("/bin/sh"), arguments: vec!["-c".to_owned(), script] };
        let mut session = Session::ouvrir(&lancement).expect("moteur lancé");

        let debut = Instant::now();
        let propre = session.arreter("{}").expect("arrêt demandé");
        assert!(!propre, "il a fallu le tuer");
        assert!(
            debut.elapsed() >= Duration::from_secs(LIMITES.delai_arret_propre_s),
            "on lui a bien laissé son délai avant de le tuer"
        );
    }

    #[test]
    fn le_lancement_embarque_porte_le_plafond_de_memoire() {
        let lancement = Lancement::embarque(PathBuf::from("/usr/bin/node"), PathBuf::from("/moteur.js"));
        assert_eq!(lancement.arguments[0], format!("--max-old-space-size={}", LIMITES.memoire_max_mo));
        assert!(lancement.arguments[1].ends_with("moteur.js"));
    }
}
