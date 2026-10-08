//! Le journal d'un traitement, fait pour être lu (JOB-05, UX-03).
//!
//! Une erreur n'est jamais avalée : elle est enregistrée avec sa cause, et elle doit arriver sous
//! les yeux de quelqu'un. Ce journal est donc celui de l'écran de traitement, pas celui d'un
//! développeur — chaque ligne est une phrase en français, et ce qui n'en est pas une n'y entre
//! pas.
//!
//! Il tient par travail, et il survit à la fermeture de l'application : un traitement lancé hier
//! soir doit pouvoir expliquer ce matin ce qu'il a fait. Une ligne par ligne de fichier, pour
//! qu'un journal de dix mille lignes s'écrive sans jamais être relu en entier.
//!
//! **Il est borné.** Un livre de cinq cents pages produit des milliers de lignes, et un journal
//! qu'on ne borne pas finit par peser plus que ce qu'il raconte. On garde les dernières, et on
//! dit combien ont été écartées plutôt que de faire comme si elles n'avaient jamais existé.

use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{self, BufRead, BufReader, Write},
    path::{Path, PathBuf},
};

/// Combien de lignes on garde par travail.
///
/// Assez pour couvrir un traitement entier à raison d'une ligne par étape, pas assez pour qu'un
/// journal devienne un problème à lui seul.
pub const LIGNES_GARDEES: usize = 2_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Ligne {
    /// « information », « avertissement » ou « erreur » — les mêmes qu'au contrat d'échange.
    pub niveau: String,
    pub texte: String,
    /// Secondes depuis l'époque. L'écran en fait une heure lisible ; le journal garde un nombre,
    /// qui ne dépend ni de la langue ni du fuseau de la machine qui l'a écrit.
    pub le: u64,
}

pub struct Journal {
    chemin: PathBuf,
}

impl Journal {
    /// Le journal d'un travail, dans le dossier qu'on lui donne.
    pub fn pour(dossier: &Path, travail: &str) -> io::Result<Self> {
        fs::create_dir_all(dossier)?;
        Ok(Self { chemin: dossier.join(format!("{travail}.jsonl")) })
    }

    /// Ajoute une ligne. Ouverte en ajout et refermée aussitôt : un journal qu'on garde ouvert se
    /// perd quand le processus meurt, et c'est précisément là qu'on en a besoin.
    pub fn ecrire(&self, ligne: &Ligne) -> io::Result<()> {
        let mut fichier = OpenOptions::new().create(true).append(true).open(&self.chemin)?;
        writeln!(fichier, "{}", serde_json::to_string(ligne)?)
    }

    /// Les dernières lignes, et combien ont été écartées avant elles.
    ///
    /// On lit tout le fichier pour n'en garder que la fin : sur deux mille lignes c'est sans
    /// conséquence, et cela évite de deviner où une ligne commence en lisant par la fin.
    pub fn dernieres(&self, combien: usize) -> io::Result<(Vec<Ligne>, usize)> {
        let fichier = match fs::File::open(&self.chemin) {
            Ok(f) => f,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok((Vec::new(), 0)),
            Err(e) => return Err(e),
        };

        let mut lignes = Vec::new();
        let mut illisibles = 0;
        for ligne in BufReader::new(fichier).lines() {
            let ligne = ligne?;
            if ligne.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<Ligne>(&ligne) {
                Ok(lue) => lignes.push(lue),
                // Une ligne abîmée — un arrêt brutal en plein milieu — ne fait pas perdre le reste.
                Err(_) => illisibles += 1,
            }
        }

        let ecartees = lignes.len().saturating_sub(combien) + illisibles;
        if lignes.len() > combien {
            lignes.drain(..lignes.len() - combien);
        }
        Ok((lignes, ecartees))
    }

    /// Resserre le journal sur les dernières lignes, quand il a trop grossi.
    ///
    /// Appelé de loin en loin, pas à chaque ligne : réécrire deux mille lignes à chaque page lue
    /// coûterait plus cher que le traitement lui-même.
    pub fn resserrer(&self) -> io::Result<usize> {
        let (gardees, ecartees) = self.dernieres(LIGNES_GARDEES)?;
        if ecartees == 0 {
            return Ok(0);
        }
        let mut contenu = String::new();
        for ligne in &gardees {
            contenu.push_str(&serde_json::to_string(ligne)?);
            contenu.push('\n');
        }
        let temporaire = self.chemin.with_extension("tmp");
        {
            let mut fichier = fs::File::create(&temporaire)?;
            fichier.write_all(contenu.as_bytes())?;
            fichier.sync_all()?;
        }
        fs::rename(&temporaire, &self.chemin)?;
        Ok(ecartees)
    }

    /// Les erreurs seules : ce que l'écran de traitement montre en premier (JOB-05).
    pub fn erreurs(&self) -> io::Result<Vec<Ligne>> {
        let (lignes, _) = self.dernieres(LIGNES_GARDEES)?;
        Ok(lignes.into_iter().filter(|l| l.niveau == "erreur").collect())
    }

    pub fn chemin(&self) -> &Path {
        &self.chemin
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn journal_neuf(nom: &str) -> (Journal, PathBuf) {
        let dossier = std::env::temp_dir().join(format!("lienotheque-journal-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dossier);
        (Journal::pour(&dossier, "travail-1").expect("journal ouvert"), dossier)
    }

    fn ligne(niveau: &str, texte: &str, le: u64) -> Ligne {
        Ligne { niveau: niveau.to_owned(), texte: texte.to_owned(), le }
    }

    #[test]
    fn un_journal_vide_ne_dit_rien_et_ne_se_plaint_pas() {
        let (journal, dossier) = journal_neuf("vide");
        let (lignes, ecartees) = journal.dernieres(10).expect("lecture");
        assert!(lignes.is_empty());
        assert_eq!(ecartees, 0);
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn garde_les_lignes_dans_l_ordre_ou_elles_ont_ete_dites() {
        let (journal, dossier) = journal_neuf("ordre");
        journal.ecrire(&ligne("information", "Lecture du document", 100)).expect("écrit");
        journal.ecrire(&ligne("avertissement", "Deux pages illisibles", 200)).expect("écrit");

        let (lignes, _) = journal.dernieres(10).expect("lecture");
        assert_eq!(lignes.len(), 2);
        assert_eq!(lignes[0].texte, "Lecture du document");
        assert_eq!(lignes[1].niveau, "avertissement");
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn survit_a_la_fermeture_de_l_application() {
        let (journal, dossier) = journal_neuf("persistant");
        journal.ecrire(&ligne("information", "Lecture du document", 100)).expect("écrit");

        // Un autre journal, ouvert plus tard sur le même dossier : c'est ce que fait l'hôte au
        // redémarrage.
        let rouvert = Journal::pour(&dossier, "travail-1").expect("rouvert");
        let (lignes, _) = rouvert.dernieres(10).expect("lecture");
        assert_eq!(lignes.len(), 1, "un traitement d'hier soir s'explique encore ce matin");
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn ne_rend_que_les_dernieres_et_dit_combien_il_en_a_ecarte() {
        let (journal, dossier) = journal_neuf("borne");
        for rang in 0..10 {
            journal.ecrire(&ligne("information", &format!("page {rang}"), rang)).expect("écrit");
        }
        let (lignes, ecartees) = journal.dernieres(3).expect("lecture");
        assert_eq!(lignes.len(), 3);
        assert_eq!(lignes[0].texte, "page 7", "ce sont bien les dernières");
        assert_eq!(ecartees, 7, "et on dit combien manquent, plutôt que de faire comme si");
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn une_ligne_abimee_ne_fait_pas_perdre_le_journal() {
        let (journal, dossier) = journal_neuf("abime");
        journal.ecrire(&ligne("information", "avant", 100)).expect("écrit");
        // Un arrêt brutal en pleine écriture laisse une ligne tronquée.
        let mut fichier = OpenOptions::new().append(true).open(journal.chemin()).expect("ouvert");
        writeln!(fichier, "{{\"niveau\":\"infor").expect("tronquée");
        drop(fichier);
        journal.ecrire(&ligne("information", "après", 300)).expect("écrit");

        let (lignes, ecartees) = journal.dernieres(10).expect("lecture");
        assert_eq!(lignes.len(), 2, "ce qui est lisible reste lisible");
        assert_eq!(ecartees, 1, "et l'abîmée est comptée, jamais tue");
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn les_erreurs_se_retrouvent_seules() {
        let (journal, dossier) = journal_neuf("erreurs");
        journal.ecrire(&ligne("information", "Lecture du document", 100)).expect("écrit");
        journal.ecrire(&ligne("erreur", "Moteur introuvable", 200)).expect("écrit");
        journal.ecrire(&ligne("avertissement", "Deux pages illisibles", 300)).expect("écrit");

        let erreurs = journal.erreurs().expect("lecture");
        assert_eq!(erreurs.len(), 1);
        assert_eq!(erreurs[0].texte, "Moteur introuvable");
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn se_resserre_quand_il_a_trop_grossi_et_ne_laisse_aucun_temporaire() {
        let (journal, dossier) = journal_neuf("resserre");
        for rang in 0..(LIGNES_GARDEES + 50) {
            journal.ecrire(&ligne("information", &format!("page {rang}"), rang as u64)).expect("écrit");
        }
        let ecartees = journal.resserrer().expect("resserré");
        assert_eq!(ecartees, 50);

        let (lignes, encore) = journal.dernieres(LIGNES_GARDEES).expect("lecture");
        assert_eq!(lignes.len(), LIGNES_GARDEES);
        assert_eq!(encore, 0, "une fois resserré, il n'y a plus rien à écarter");
        assert!(!journal.chemin().with_extension("tmp").exists());
        fs::remove_dir_all(&dossier).ok();
    }

    #[test]
    fn resserrer_un_journal_court_ne_le_reecrit_pas() {
        let (journal, dossier) = journal_neuf("court");
        journal.ecrire(&ligne("information", "une ligne", 100)).expect("écrit");
        assert_eq!(journal.resserrer().expect("resserré"), 0, "rien à faire, donc rien d'écrit");
        fs::remove_dir_all(&dossier).ok();
    }
}
