//! Garde-fous d'une reconstruction complète de bibliothèque.
//!
//! Le corpus d'entrée reste une preuve immuable. La reconstruction écrit dans un dossier neuf,
//! produit un rapport à comparer et ne retient jamais elle-même la nouvelle bibliothèque dans
//! les réglages de l'application. Une source qui est déjà une bibliothèque active est d'abord
//! photographiée, base entière comprise.

use crate::depot::{Depot, BASE, SOURCES};
use serde::Serialize;
use std::{
    fs,
    io,
    path::{Path, PathBuf},
};

const MARQUEUR: &str = "reconstruction-en-attente.json";
const RAPPORT: &str = "rapport-reconstruction.json";

#[derive(Debug)]
pub struct PlanReconstruction {
    corpus: PathBuf,
    destination: PathBuf,
    photographie: PathBuf,
}

#[derive(Serialize)]
struct EtatReconstruction<'a> {
    schema: u8,
    etat: &'a str,
    corpus: &'a Path,
    destination: &'a Path,
    photographie_source: Option<&'a Path>,
    fichiers_du_corpus: usize,
    sources_copiees: usize,
    versions_produites: usize,
    documents_actifs: usize,
}

impl PlanReconstruction {
    /// Vérifie les chemins avant la première écriture.
    ///
    /// La destination doit être absente et extérieure au corpus. Refuser aussi l'imbrication
    /// évite que le parcours récursif finisse par réimporter ce qu'il est en train de produire.
    pub fn verifier(corpus: impl AsRef<Path>, destination: impl AsRef<Path>) -> Result<Self, String> {
        let corpus = corpus
            .as_ref()
            .canonicalize()
            .map_err(|e| format!("Corpus introuvable : {e}"))?;
        if !corpus.is_dir() {
            return Err(format!("Le corpus n'est pas un dossier : {}", corpus.display()));
        }

        let destination_demandee = destination.as_ref();
        if destination_demandee.exists() {
            return Err(format!(
                "La destination doit être nouvelle et absente : {}",
                destination_demandee.display()
            ));
        }
        let nom = destination_demandee
            .file_name()
            .ok_or_else(|| "La destination doit porter un nom de dossier".to_owned())?;
        let parent = destination_demandee
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .canonicalize()
            .map_err(|e| format!("Parent de la destination introuvable : {e}"))?;
        let destination = parent.join(nom);

        if destination == corpus || destination.starts_with(&corpus) || corpus.starts_with(&destination) {
            return Err("Le corpus et la bibliothèque reconstruite doivent être deux dossiers distincts et non imbriqués".to_owned());
        }

        let photographie = parent.join(format!("{}.photographie-source", nom.to_string_lossy()));
        if photographie.exists() {
            return Err(format!("La photographie préalable existe déjà : {}", photographie.display()));
        }
        Ok(Self { corpus, destination, photographie })
    }

    pub fn corpus(&self) -> &Path {
        &self.corpus
    }

    pub fn destination(&self) -> &Path {
        &self.destination
    }

    /// Photographie une éventuelle bibliothèque active, puis seulement crée la destination.
    pub fn preparer_destination(&self) -> Result<(Depot, Option<PathBuf>), String> {
        if self.destination.exists() {
            return Err("La destination est apparue depuis la vérification ; reconstruction refusée".to_owned());
        }

        let actives = self.corpus.join(BASE).join("actives.json");
        let photographie = if actives.is_file() {
            fs::create_dir(&self.photographie).map_err(|e| format!("Photographie impossible : {e}"))?;
            copier_dossier(&self.corpus.join(BASE), &self.photographie.join(BASE)).map_err(|e| {
                let _ = fs::remove_dir_all(&self.photographie);
                format!("Photographie incomplète, reconstruction refusée : {e}")
            })?;
            if !self.photographie.join(BASE).join("actives.json").is_file() {
                let _ = fs::remove_dir_all(&self.photographie);
                return Err("La photographie ne contient pas actives.json ; reconstruction refusée".to_owned());
            }
            Some(self.photographie.clone())
        } else {
            None
        };

        let depot = Depot::creer(&self.destination).map_err(|e| format!("Destination impossible à créer : {e}"))?;
        self.ecrire_etat(&depot, "construction", photographie.as_deref())?;
        Ok((depot, photographie))
    }

    /// Fige les nombres à confronter avant que quelqu'un ouvre explicitement la candidate.
    pub fn ecrire_rapport(&self, depot: &Depot, photographie: Option<&Path>) -> Result<PathBuf, String> {
        self.ecrire_etat(depot, "a_comparer_avant_activation", photographie)?;
        let rapport = depot.racine().join(BASE).join(RAPPORT);
        fs::copy(depot.racine().join(BASE).join(MARQUEUR), &rapport)
            .map_err(|e| format!("Rapport de comparaison impossible à figer : {e}"))?;
        Ok(rapport)
    }

    fn ecrire_etat(&self, depot: &Depot, etat: &str, photographie: Option<&Path>) -> Result<(), String> {
        let versions = compter_fichiers(&depot.racine().join(BASE).join("versions"));
        let actifs = depot.actives().map_err(|e| format!("Versions actives illisibles : {e}"))?.len();
        let mesure = EtatReconstruction {
            schema: 1,
            etat,
            corpus: &self.corpus,
            destination: &self.destination,
            photographie_source: photographie,
            fichiers_du_corpus: compter_fichiers(&self.corpus),
            sources_copiees: compter_fichiers(&depot.racine().join(SOURCES)),
            versions_produites: versions,
            documents_actifs: actifs,
        };
        let octets = serde_json::to_vec_pretty(&mesure).map_err(|e| format!("Rapport impossible à sérialiser : {e}"))?;
        fs::write(depot.racine().join(BASE).join(MARQUEUR), octets)
            .map_err(|e| format!("Marqueur de reconstruction impossible à écrire : {e}"))
    }
}

fn compter_fichiers(racine: &Path) -> usize {
    let Ok(entrees) = fs::read_dir(racine) else { return 0 };
    entrees
        .flatten()
        .map(|e| if e.path().is_dir() { compter_fichiers(&e.path()) } else { 1 })
        .sum()
}

fn copier_dossier(source: &Path, destination: &Path) -> io::Result<()> {
    fs::create_dir(destination)?;
    for entree in fs::read_dir(source)? {
        let entree = entree?;
        let cible = destination.join(entree.file_name());
        if entree.file_type()?.is_dir() {
            copier_dossier(&entree.path(), &cible)?;
        } else {
            fs::copy(entree.path(), cible)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn corpus(dans: &TempDir) -> PathBuf {
        let corpus = dans.path().join("corpus");
        fs::create_dir(&corpus).expect("corpus");
        fs::write(corpus.join("temoin.pdf"), b"preuve").expect("source");
        corpus
    }

    #[test]
    fn reconstruction_refuse_le_corpus_comme_destination_sans_rien_effacer() {
        let temporaire = TempDir::new().expect("temporaire");
        let corpus = corpus(&temporaire);

        let erreur = PlanReconstruction::verifier(&corpus, &corpus).expect_err("même dossier refusé");
        assert!(erreur.contains("nouvelle") || erreur.contains("distincts"));
        assert_eq!(fs::read(corpus.join("temoin.pdf")).expect("preuve intacte"), b"preuve");
    }

    #[test]
    fn reconstruction_refuse_une_destination_dans_le_corpus() {
        let temporaire = TempDir::new().expect("temporaire");
        let corpus = corpus(&temporaire);
        let erreur = PlanReconstruction::verifier(&corpus, corpus.join("sortie")).expect_err("imbrication refusée");
        assert!(erreur.contains("non imbriqués"));
        assert!(!corpus.join("sortie").exists());
    }

    #[test]
    fn reconstruction_refuse_une_destination_existante_et_garde_son_contenu() {
        let temporaire = TempDir::new().expect("temporaire");
        let corpus = corpus(&temporaire);
        let destination = temporaire.path().join("candidate");
        fs::create_dir(&destination).expect("candidate");
        fs::write(destination.join("a-garder"), b"intact").expect("témoin");

        assert!(PlanReconstruction::verifier(&corpus, &destination).is_err());
        assert_eq!(fs::read(destination.join("a-garder")).expect("témoin intact"), b"intact");
    }

    #[test]
    fn une_bibliotheque_active_est_photographiee_avant_la_destination() {
        let temporaire = TempDir::new().expect("temporaire");
        let corpus = corpus(&temporaire);
        fs::create_dir(corpus.join(BASE)).expect("base");
        fs::write(corpus.join(BASE).join("actives.json"), b"{}").expect("actives");
        fs::write(corpus.join(BASE).join("preuve.json"), b"avant").expect("preuve");
        let destination = temporaire.path().join("candidate");

        let plan = PlanReconstruction::verifier(&corpus, &destination).expect("plan");
        let (depot, photographie) = plan.preparer_destination().expect("préparée");
        let photographie = photographie.expect("photographie obligatoire");

        assert_eq!(fs::read(photographie.join(BASE).join("preuve.json")).expect("copie"), b"avant");
        assert!(depot.racine().join(SOURCES).is_dir());
        assert!(depot.racine().join(crate::depot::DERIVES).is_dir());
        let marqueur = fs::read_to_string(depot.racine().join(BASE).join(MARQUEUR)).expect("marqueur");
        assert!(marqueur.contains("construction"));
    }
}
