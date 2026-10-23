//! Le dossier d'une bibliothèque, et qui a le droit d'y écrire (JOB-06, ANC-05).
//!
//! Une bibliothèque est un dossier, portable d'une machine à l'autre : on le copie sur un disque
//! externe et il s'ouvre ailleurs. Il porte trois choses — les sources, les dérivés, la base —
//! et c'est l'hôte seul qui écrit la base.
//!
//! ```text
//! <bibliothèque>/
//!   sources/                    les originaux, copiés une fois
//!   derives/<version>/          ce qu'un traitement a produit
//!   base/
//!     versions/<version>.json   le résultat d'une version
//!     actives.json              quelle version est active, par document
//! ```
//!
//! **L'hôte est seul écrivain de `base/`.** Le moteur ne touche jamais à ce dossier : il reçoit
//! un travail, rend un résultat, et c'est l'hôte qui le valide puis l'active. Le moteur écrit
//! bien dans `derives/<version>/`, mais une version qui n'est pas active ne regarde personne :
//! tant qu'elle n'est pas activée, ce qu'elle produit n'existe pour aucun lecteur.
//!
//! **L'activation est une seule opération** (JOB-06) : le pointeur est écrit dans un fichier
//! temporaire puis renommé. Un arrêt brutal laisse donc l'ancienne version active, jamais un
//! pointeur à moitié écrit. Pendant tout le traitement, la version active ne bouge pas.

use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Ce qu'un retrait de document a emporté — de quoi le dire, plutôt que de laisser deviner.
#[derive(Debug, Serialize)]
pub struct RetraitDeDocument {
    pub versions: usize,
    pub travaux: usize,
    /// Où la source a atterri dans la corbeille. **Omise** si le document n'en avait plus :
    /// un contrat qui attend une chaîne ou rien refuserait un nul, et il a raison de le faire.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<PathBuf>,
}

/// Agencement du dossier, le même que celui du noyau TypeScript.
pub const SOURCES: &str = "sources";
pub const DERIVES: &str = "derives";
pub const BASE: &str = "base";

const VERSIONS: &str = "versions";
/// L'ancien pointeur unique, gardé pour la migration et pour elle seule.
const ACTIVE: &str = "active.json";

/// Ce qui rend indivisible la **mise à jour** de la table des actives, et non sa seule écriture.
///
/// Un seul verrou pour toutes les bibliothèques du processus : il n'y en a qu'une d'ouverte à la
/// fois, et un verrou par racine coûterait une table de verrous pour un gain nul.
static VERROU_ACTIVES: std::sync::Mutex<()> = std::sync::Mutex::new(());
/// La table des versions actives, une entrée par document.
const ACTIVES: &str = "actives.json";
/// Le classement des documents, par empreinte. Même forme et mêmes raisons que la table
/// des actives : une table plutôt qu'un fichier par document, et une écriture indivisible.
const CLASSEMENTS: &str = "classements.json";

/// Le nom du fichier de description, le même que celui du contrat.
///
/// Trois endroits le nomment — l'assistant, l'hôte, la chaîne — et le contrat le fixe. Un
/// contrôle du noyau vérifie que l'hôte dit bien le même.
const DESCRIPTION: &str = "bibliotheque.json";
/// Les travaux de cette bibliothèque, un fichier par travail (JOB-01). Dans son dossier
/// portable : une bibliothèque qu'on déplace emporte sa file, et ce qui était à moitié fait
/// se reprend là où on la rouvre.
const TRAVAUX: &str = "travaux";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Pointeur {
    /// La version que les lecteurs voient.
    pub version: String,
    /// Quand elle a été activée. Pour le journal, et pour savoir laquelle est la plus récente si
    /// jamais deux pointeurs se disputaient.
    pub activee_le: u64,
}

pub struct Depot {
    racine: PathBuf,
}

impl Depot {
    /// Ouvre — ou crée — le dossier d'une bibliothèque.
    ///
    /// Créer les trois dossiers d'emblée plutôt qu'à la première écriture : un dossier vide se
    /// copie et s'inspecte, et son absence ne se découvre pas au pire moment.
    pub fn ouvrir(racine: impl Into<PathBuf>) -> io::Result<Self> {
        let racine = racine.into();
        for dossier in [SOURCES, DERIVES, BASE] {
            fs::create_dir_all(racine.join(dossier))?;
        }
        fs::create_dir_all(racine.join(BASE).join(VERSIONS))?;
        let depot = Self { racine };

        // La table des actives se rattrape à l'ouverture, depuis les travaux.
        //
        // Ici et pas ailleurs : une bibliothèque déjà traitée s'ouvre d'un double-clic, et
        // demander à qui que ce soit de lancer une migration à la main est le meilleur moyen
        // qu'elle ne le soit jamais. La migration est déterministe, se rejoue sans dégât, et ne
        // coûte rien quand il n'y a rien à rattraper.
        //
        // Un échec n'empêche pas d'ouvrir : une bibliothèque qu'on ne peut plus ouvrir est pire
        // qu'une bibliothèque dont la table attendra le prochain lancement.
        let _ = depot.migrer_les_actives();
        Ok(depot)
    }

    pub fn racine(&self) -> &Path {
        &self.racine
    }

    /// Où le moteur écrira les dérivés d'une version. Le dossier est créé ici : c'est l'hôte qui
    /// décide de l'emplacement, le moteur n'écrit que là où on le lui dit.
    pub fn derives_de(&self, version: &str) -> io::Result<PathBuf> {
        let chemin = self.racine.join(DERIVES).join(version);
        fs::create_dir_all(&chemin)?;
        Ok(chemin)
    }

    /// Copie un original dans la bibliothèque. C'est ce qui la rend portable : le document
    /// voyage avec elle, et rien ne dépend plus de l'endroit d'où il venait.
    pub fn deposer_source(&self, origine: &Path, empreinte: &str) -> io::Result<PathBuf> {
        let extension = origine.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_lowercase();
        let palier = self.racine.join(SOURCES).join(&empreinte[..2]);
        fs::create_dir_all(&palier)?;
        let destination = palier.join(format!("{empreinte}.{extension}"));
        // Déjà là, et au bit près puisque c'est son empreinte qui le nomme : recopier huit cents
        // mégaoctets pour obtenir le même fichier serait du temps et de la place pour rien.
        if destination.exists() {
            return Ok(destination);
        }
        fs::copy(origine, &destination)?;
        Ok(destination)
    }

    /// Où se trouve une source, d'après son empreinte.
    pub fn source(&self, empreinte: &str, extension: &str) -> PathBuf {
        self.racine.join(SOURCES).join(&empreinte[..2]).join(format!("{empreinte}.{extension}"))
    }

    /// Écrit la description de la bibliothèque : son identifiant, son nom, ses mots, son schéma.
    ///
    /// L'hôte ne la relit pas pour la juger — il ne connaît aucun domaine et n'a pas de contrat à
    /// lui opposer. C'est l'assistant qui la valide avant de l'envoyer, là où le contrat vit.
    /// L'hôte garantit ce qu'il sait garantir : qu'elle s'écrit entière ou pas du tout.
    /// Le dossier de la file de cette bibliothèque.
    pub fn travaux(&self) -> PathBuf {
        self.racine.join(BASE).join(TRAVAUX)
    }

    pub fn ecrire_description(&self, description: &str) -> io::Result<PathBuf> {
        let chemin = self.racine.join(BASE).join(DESCRIPTION);
        ecrire_atomique(&chemin, description.as_bytes())?;
        Ok(chemin)
    }

    pub fn lire_description(&self) -> io::Result<Option<String>> {
        match fs::read_to_string(self.racine.join(BASE).join(DESCRIPTION)) {
            Ok(texte) => Ok(Some(texte)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Y a-t-il déjà une bibliothèque ici ?
    ///
    /// L'assistant le demande avant de créer : écraser la description d'une bibliothèque
    /// existante lui ferait perdre son schéma, donc son classement, donc le sens de tout ce
    /// qu'elle contient.
    pub fn deja_une_bibliotheque(&self) -> bool {
        self.racine.join(BASE).join(DESCRIPTION).exists()
    }

    /// Écrit le résultat d'une version, sans toucher à celle qui est active (JOB-06).
    ///
    /// L'écriture est atomique : un arrêt brutal laisse le fichier absent ou complet, jamais
    /// tronqué — et une version tronquée qu'on activerait serait pire qu'une version manquante.
    pub fn ecrire_version(&self, version: &str, charge: &str) -> io::Result<PathBuf> {
        let chemin = self.racine.join(BASE).join(VERSIONS).join(format!("{version}.json"));
        ecrire_atomique(&chemin, charge.as_bytes())?;
        Ok(chemin)
    }

    pub fn lire_version(&self, version: &str) -> io::Result<Option<String>> {
        match fs::read_to_string(self.racine.join(BASE).join(VERSIONS).join(format!("{version}.json"))) {
            Ok(texte) => Ok(Some(texte)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Active une version **pour son document**, en une seule opération (JOB-06).
    ///
    /// Le document est désigné par l'empreinte de sa source : c'est déjà par elle que la charge
    /// d'un travail retrouve son fichier, et deux documents homonymes dans deux dossiers n'ont
    /// rien à voir. Aucune notion nouvelle.
    ///
    /// On refuse d'activer une version qu'on n'a pas écrite : activer un pointeur vers rien
    /// rendrait le document illisible, et c'est exactement le genre de panne qu'une vérification
    /// d'une ligne évite.
    pub fn activer(&self, empreinte: &str, version: &str, maintenant: u64) -> io::Result<()> {
        // **Écriture atomique n'est pas mise à jour atomique.** Lire la table, y insérer, la
        // réécrire : entre la lecture et l'écriture, un autre travail peut avoir inscrit la
        // sienne, et elle disparaît. Le réimport du 21 octobre 2026 a ainsi écrit 243 versions et
        // posé 239 pointeurs — quatre documents traités avec succès, invisibles, sans un mot.
        //
        // Un verrou de processus suffit ici : la file est un seul processus, et c'est elle qui
        // mène deux travaux de front. Deux **processus** qui activeraient dans la même
        // bibliothèque se marcheraient encore dessus ; cela ne se produit pas aujourd'hui, et le
        // jour où cela se produirait, il faudrait un verrou sur le disque.
        let _tenu = VERROU_ACTIVES.lock().unwrap_or_else(|empoisonne| empoisonne.into_inner());
        if self.lire_version(version)?.is_none() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Version « {version} » jamais écrite : rien à activer."),
            ));
        }
        let mut table = self.actives()?;
        table.insert(empreinte.to_owned(), Pointeur { version: version.to_owned(), activee_le: maintenant });
        self.ecrire_actives(&table)
    }


    /// Retire un document de la bibliothèque : sa source, ses versions, ses dérivés, ses travaux.
    ///
    /// ## Ce qu'un document possède, et qu'il faut tout emporter
    ///
    /// | | où |
    /// |---|---|
    /// | sa source | `sources/ab/abcdef….pdf` |
    /// | son pointeur actif | une entrée de `base/actives.json` |
    /// | ses versions | `base/versions/<version>.json`, une par traitement |
    /// | ses dérivés | `derives/<version>/`, les images de page |
    /// | ses travaux | `base/travaux/<id>.json`, un par dépôt ou reprise |
    /// | son classement | une entrée de la table des classements |
    ///
    /// En oublier un laisse une bibliothèque qui se contredit : un pointeur vers une version
    /// effacée, ou une source que plus rien ne nomme.
    ///
    /// ## L'ordre, et pourquoi celui-là
    ///
    /// Le **pointeur d'abord**. Tant qu'il existe, les écrans lisent ce document ; le retirer en
    /// premier fait qu'ils cessent de le voir avant que quoi que ce soit ne disparaisse sous eux.
    /// Puis les dérivés, les versions, les travaux, et la source en dernier — c'est elle qui,
    /// seule, permettrait de tout refaire.
    ///
    /// ## À la corbeille, comme une bibliothèque
    ///
    /// La source part à la corbeille plutôt qu'au néant : c'est l'original de quelqu'un, et se
    /// tromper de document ne doit pas coûter un livre. Les dérivés et les versions, eux, sont
    /// effacés — ils se reconstruisent depuis la source, et les garder encombrerait la corbeille
    /// de mégaoctets que personne ne ressortira.
    pub fn retirer_document(&self, empreinte: &str) -> io::Result<RetraitDeDocument> {
        if empreinte.len() < 2 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Empreinte trop courte pour désigner un document."));
        }
        let _tenu = VERROU_ACTIVES.lock().unwrap_or_else(|empoisonne| empoisonne.into_inner());

        // 1. Le pointeur, d'abord : les écrans cessent de voir ce document.
        let mut table = self.actives()?;
        let pointeur = table.remove(empreinte);
        if pointeur.is_some() {
            self.ecrire_actives(&table)?;
        }

        // 2. Ses versions, reconnues par les travaux qui les visaient — une version n'inscrit pas
        //    l'empreinte de sa source, c'est le travail qui fait le lien.
        let mut versions: BTreeSet<String> = BTreeSet::new();
        if let Some(pointeur) = &pointeur {
            versions.insert(pointeur.version.clone());
        }
        let mut travaux_retires = 0_usize;
        if let Ok(entrees) = fs::read_dir(self.travaux()) {
            for entree in entrees.flatten() {
                let chemin = entree.path();
                if chemin.extension().is_none_or(|e| e != "json") {
                    continue;
                }
                let Ok(texte) = fs::read_to_string(&chemin) else { continue };
                let Ok(lu) = serde_json::from_str::<serde_json::Value>(&texte) else { continue };
                if lu["empreinte"].as_str() != Some(empreinte) {
                    continue;
                }
                if let Some(cible) = lu["version_cible"].as_str() {
                    versions.insert(cible.to_owned());
                }
                let _ = fs::remove_file(&chemin);
                travaux_retires += 1;
            }
        }

        for version in &versions {
            let _ = fs::remove_dir_all(self.racine.join(DERIVES).join(version));
            let _ = fs::remove_file(self.racine.join(BASE).join(VERSIONS).join(format!("{version}.json")));
        }

        // 3. Son classement, s'il en avait un.
        let mut rangs = self.classements()?;
        if rangs.remove(empreinte).is_some() {
            ecrire_atomique(
                &self.racine.join(BASE).join(CLASSEMENTS),
                serde_json::to_string_pretty(&rangs)?.as_bytes(),
            )?;
        }

        // 4. La source, en dernier, et à la corbeille.
        let mut jetee = None;
        let palier = self.racine.join(SOURCES).join(&empreinte[..2]);
        if let Ok(entrees) = fs::read_dir(&palier) {
            for entree in entrees.flatten() {
                let chemin = entree.path();
                if chemin.file_stem().and_then(|s| s.to_str()) != Some(empreinte) {
                    continue;
                }
                let corbeille = dossier_personnel()?.join(".Trash");
                fs::create_dir_all(&corbeille)?;
                let nom = chemin.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| empreinte.to_owned());
                let mut vise = corbeille.join(&nom);
                let mut rang = 2;
                while vise.exists() {
                    vise = corbeille.join(format!("{rang} {nom}"));
                    rang += 1;
                }
                fs::rename(&chemin, &vise)?;
                jetee = Some(vise);
            }
        }

        Ok(RetraitDeDocument { versions: versions.len(), travaux: travaux_retires, source: jetee })
    }

    /// Met le dossier de la bibliothèque **à la corbeille**, et rend où il a atterri.
    ///
    /// ## Pourquoi la corbeille et non l'effacement
    ///
    /// Une action destructrice qui se défait vaut mieux que toutes les confirmations du monde.
    /// Une bibliothèque porte les documents de quelqu'un ; se tromper de bouton ne doit pas
    /// coûter une collection. Le dossier reste donc entier, là où macOS laisse ce qu'on jette, et
    /// se ressort d'un glisser.
    ///
    /// ## Elle refuse ce qui n'est pas une bibliothèque
    ///
    /// Un chemin devenu faux — un disque remonté ailleurs, un dossier renommé — ne doit emporter
    /// ni les photos ni le bureau de personne. On vérifie donc que le dossier porte bien une
    /// description avant d'y toucher, et on refuse franchement sinon.
    ///
    /// ## Un nom libre dans la corbeille
    ///
    /// Deux bibliothèques du même nom jetées le même jour ne doivent pas s'écraser l'une
    /// l'autre : on cherche un nom disponible plutôt que d'écrire par-dessus.
    pub fn a_la_corbeille(&self) -> io::Result<PathBuf> {
        if !self.deja_une_bibliotheque() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Ce dossier ne porte pas de bibliothèque : rien n'a été touché.",
            ));
        }

        let corbeille = dossier_personnel()?.join(".Trash");
        fs::create_dir_all(&corbeille)?;
        let nom = self
            .racine
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Bibliothèque".to_owned());

        let mut vise = corbeille.join(&nom);
        let mut rang = 2;
        while vise.exists() {
            vise = corbeille.join(format!("{nom} {rang}"));
            rang += 1;
        }

        fs::rename(&self.racine, &vise)?;
        Ok(vise)
    }

    /// La table entière, en une lecture.
    ///
    /// Une table plutôt qu'un fichier par document : la vue d'ensemble la consulte d'un coup, là
    /// où deux cent cinquante fichiers demanderaient deux cent cinquante lectures. Et l'écriture
    /// reste indivisible, ce que JOB-06 réclame — quelques kilo-octets réécrits à chaque
    /// activation ne coûtent rien de mesurable.
    ///
    /// Une table abîmée rend une table vide plutôt qu'une erreur : on n'empêche pas d'ouvrir une
    /// bibliothèque parce qu'un fichier de pointeurs est illisible. Le même choix que pour les
    /// réglages et le journal.
    pub fn actives(&self) -> io::Result<BTreeMap<String, Pointeur>> {
        match fs::read_to_string(self.racine.join(BASE).join(ACTIVES)) {
            Ok(texte) => Ok(serde_json::from_str(&texte).unwrap_or_default()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(e),
        }
    }

    fn ecrire_actives(&self, table: &BTreeMap<String, Pointeur>) -> io::Result<()> {
        ecrire_atomique(&self.racine.join(BASE).join(ACTIVES), serde_json::to_string_pretty(table)?.as_bytes())
    }

    /// Range un document sur les axes de sa bibliothèque (CLA-01).
    ///
    /// Le classement arrive déjà vérifié contre le schéma : c'est le noyau qui sait lire un
    /// schéma, et le dépôt n'a pas à le réapprendre. Ici on écrit, et c'est tout — le contenu
    /// reste opaque, comme la vue et les passages le sont déjà.
    ///
    /// Reclasser **remplace** : un document a un classement, pas une pile de classements
    /// successifs. L'historique d'un changement de rangement, s'il en faut un, est une autre
    /// question que celle-ci.
    pub fn classer(&self, empreinte: &str, classement: &serde_json::Value) -> io::Result<()> {
        let mut table = self.classements()?;
        table.insert(empreinte.to_owned(), classement.clone());
        ecrire_atomique(
            &self.racine.join(BASE).join(CLASSEMENTS),
            serde_json::to_string_pretty(&table)?.as_bytes(),
        )
    }

    /// Tous les classements, en une lecture — ce que le Catalogue et les filtres consultent.
    ///
    /// Une table abîmée rend une table vide, pour la même raison que les actives : on n'empêche
    /// pas d'ouvrir une bibliothèque parce qu'un fichier d'index est illisible.
    pub fn classements(&self) -> io::Result<BTreeMap<String, serde_json::Value>> {
        match fs::read_to_string(self.racine.join(BASE).join(CLASSEMENTS)) {
            Ok(texte) => Ok(serde_json::from_str(&texte).unwrap_or_default()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(e),
        }
    }

    /// Le classement d'un document, ou rien. **Rien est une réponse** : un document non rangé
    /// n'est pas une panne, et c'est même ce qu'il faut pouvoir dire.
    pub fn classement(&self, empreinte: &str) -> io::Result<Option<serde_json::Value>> {
        Ok(self.classements()?.remove(empreinte))
    }

    /// Inscrit dans la table ce qu'une bibliothèque déjà traitée porte dans ses travaux.
    ///
    /// **Déterministe, et sans rien retraiter.** Chaque travail terminé porte déjà l'empreinte de
    /// sa source et sa version cible : la table s'en déduit entièrement. Aucun document n'est
    /// relu, aucune page n'est reconnue à nouveau — c'est une table à écrire, pas un travail à
    /// refaire. Mesuré sur la bibliothèque d'essai : sept versions, huit travaux, quelques
    /// millisecondes.
    ///
    /// Elle se rejoue sans dégât, et n'écrase jamais une activation déjà inscrite : une migration
    /// qu'on ne peut pas relancer deux fois est une migration qu'on n'ose pas lancer une fois.
    ///
    /// L'ancien `active.json` n'est pas supprimé : tant qu'il est là, le pas est réversible. Il
    /// n'est pas lu non plus — ce qu'il désigne, les travaux le disent mieux, et par document.
    ///
    /// Rend le nombre d'entrées inscrites.
    pub fn migrer_les_actives(&self) -> io::Result<usize> {
        // La même table, la même lecture-modification-écriture, donc le même verrou.
        let _tenu = VERROU_ACTIVES.lock().unwrap_or_else(|empoisonne| empoisonne.into_inner());
        let dossier = self.racine.join(BASE).join(TRAVAUX);
        let entrees = match fs::read_dir(&dossier) {
            Ok(entrees) => entrees,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(0),
            Err(e) => return Err(e),
        };

        let mut table = self.actives()?;
        let mut inscrites = 0;

        for entree in entrees.filter_map(Result::ok) {
            let chemin = entree.path();
            if chemin.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Ok(texte) = fs::read_to_string(&chemin) else { continue };
            let Ok(travail) = serde_json::from_str::<serde_json::Value>(&texte) else { continue };
            if travail["etat"].as_str() != Some("termine") {
                continue;
            }
            let (Some(empreinte), Some(version)) = (travail["empreinte"].as_str(), travail["version_cible"].as_str()) else {
                continue;
            };
            // Déjà activé par document : on ne recouvre pas. L'ancien monde ne sait rien que
            // celui-ci ne sache mieux.
            if table.contains_key(empreinte) {
                continue;
            }
            // Et la même règle qu'`activer` : on n'inscrit pas un pointeur vers rien.
            if self.lire_version(version)?.is_none() {
                continue;
            }
            let activee_le = travail["maj_le"].as_u64().unwrap_or(0);
            table.insert(empreinte.to_owned(), Pointeur { version: version.to_owned(), activee_le });
            inscrites += 1;
        }

        if inscrites > 0 {
            self.ecrire_actives(&table)?;
        }
        Ok(inscrites)
    }

    /// La version qu'un lecteur voit de ce document, s'il y en a une.
    pub fn version_active(&self, empreinte: &str) -> io::Result<Option<Pointeur>> {
        Ok(self.actives()?.get(empreinte).cloned())
    }

    /// Ce qu'un lecteur lit aujourd'hui de ce document.
    pub fn charge_active(&self, empreinte: &str) -> io::Result<Option<String>> {
        match self.version_active(empreinte)? {
            None => Ok(None),
            Some(pointeur) => self.lire_version(&pointeur.version),
        }
    }
}

/// Écrit un fichier en une fois : temporaire, synchronisé, puis renommé.
///
/// Le renommage est l'opération que le système garantit indivisible. Sans lui, un arrêt au mauvais
/// moment laisse un fichier à moitié écrit — et un pointeur à moitié écrit ne désigne rien.
/// De quoi donner un nom différent à chaque temporaire, sans se soucier de qui écrit.
static COMPTEUR_TEMPORAIRE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Le dossier personnel, d'où l'on atteint la corbeille de l'utilisateur.
fn dossier_personnel() -> io::Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Dossier personnel introuvable."))
}

fn ecrire_atomique(chemin: &Path, contenu: &[u8]) -> io::Result<()> {
    if let Some(parent) = chemin.parent() {
        fs::create_dir_all(parent)?;
    }
    // Un temporaire **propre à cet appel**. Il portait l'extension `.tmp` du fichier visé, donc
    // le même nom pour tout le monde : deux fils qui écrivent le même fichier écrivaient dans le
    // même temporaire, et le second `rename` ne trouvait plus rien — ou pire, renommait un
    // fichier à moitié écrit par l'un et à moitié par l'autre. Une table d'actives abîmée se lit
    // comme une table vide, par choix assumé ailleurs dans ce fichier : toute la bibliothèque
    // aurait disparu d'un coup, sans un mot.
    let temporaire = chemin.with_extension(format!(
        "{}.{}.tmp",
        std::process::id(),
        COMPTEUR_TEMPORAIRE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    {
        let mut fichier = fs::File::create(&temporaire)?;
        fichier.write_all(contenu)?;
        fichier.sync_all()?;
    }
    fs::rename(&temporaire, chemin)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-depot-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        (Depot::ouvrir(&racine).expect("dépôt ouvert"), racine)
    }


    /// Retirer un document n'en laisse rien derrière (HER-07).
    ///
    /// Un document possède six choses : sa source, son pointeur, ses versions, ses dérivés, ses
    /// travaux et son classement. En oublier une laisse une bibliothèque qui se contredit — un
    /// pointeur vers une version effacée, ou une source que plus rien ne nomme.
    #[test]
    fn retirer_un_document_emporte_tout_ce_qui_lui_appartient() {
        let (depot, racine) = depot_neuf("retrait");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");

        let empreinte = "ab".to_owned() + &"c".repeat(62);
        let autre = "de".to_owned() + &"f".repeat(62);

        // Deux documents, pour vérifier que le second ne bouge pas.
        for (emp, version) in [(&empreinte, "v-un"), (&autre, "v-deux")] {
            let palier = depot.racine().join(SOURCES).join(&emp[..2]);
            fs::create_dir_all(&palier).expect("palier");
            fs::write(palier.join(format!("{emp}.pdf")), b"x").expect("source");
            depot.ecrire_version(version, r#"{"vue":{"pages":[]}}"#).expect("version");
            depot.activer(emp, version, 1).expect("activée");
            fs::create_dir_all(depot.racine().join(DERIVES).join(version).join("pages")).expect("dérivés");
            fs::write(depot.racine().join(DERIVES).join(version).join("pages").join("page-0000.webp"), b"i")
                .expect("image");
            depot.classer(emp, &serde_json::json!({ "axe": "une valeur" })).expect("classé");
            fs::create_dir_all(depot.travaux()).expect("travaux");
            fs::write(
                depot.travaux().join(format!("{version}.json")),
                format!(r#"{{"id":"{version}","empreinte":"{emp}","version_cible":"{version}"}}"#),
            )
            .expect("travail");
        }

        let retrait = depot.retirer_document(&empreinte).expect("retiré");

        // Ce qui appartenait au document est parti.
        assert!(!depot.actives().expect("actives").contains_key(&empreinte), "le pointeur devrait être retiré");
        assert!(!depot.racine().join(DERIVES).join("v-un").exists(), "les dérivés devraient être effacés");
        assert!(
            !depot.racine().join(BASE).join(VERSIONS).join("v-un.json").exists(),
            "la version devrait être effacée"
        );
        assert!(!depot.travaux().join("v-un.json").exists(), "le travail devrait être retiré");
        assert!(
            depot.classement(&empreinte).expect("classements").is_none(),
            "le classement devrait être retiré"
        );
        assert!(
            !depot.racine().join(SOURCES).join("ab").join(format!("{empreinte}.pdf")).exists(),
            "la source devrait avoir quitté la bibliothèque"
        );

        // **Et la source est à la corbeille**, pas au néant : se tromper de document ne doit pas
        // coûter un livre.
        let jetee = retrait.source.expect("la source doit avoir atterri quelque part");
        assert!(jetee.exists(), "la source devrait être dans la corbeille");
        assert_eq!(retrait.travaux, 1);
        assert_eq!(retrait.versions, 1);

        // Le voisin n'a pas bougé d'un pouce.
        assert!(depot.actives().expect("actives").contains_key(&autre), "l'autre document reste actif");
        assert!(depot.racine().join(DERIVES).join("v-deux").exists(), "ses dérivés restent");
        assert!(depot.racine().join(SOURCES).join("de").join(format!("{autre}.pdf")).exists(), "sa source reste");
        assert!(depot.classement(&autre).expect("classements").is_some(), "son classement reste");

        let _ = fs::remove_file(&jetee);
        fs::remove_dir_all(&racine).ok();
    }

    /// Retirer un document qui n'existe pas ne casse rien et ne ment pas.
    #[test]
    fn retirer_un_document_absent_ne_fait_rien() {
        let (depot, racine) = depot_neuf("retrait-absent");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        let retrait = depot.retirer_document(&("00".to_owned() + &"0".repeat(62))).expect("rien à retirer");
        assert_eq!(retrait.versions, 0);
        assert_eq!(retrait.travaux, 0);
        assert!(retrait.source.is_none(), "rien n'avait à partir à la corbeille");
        fs::remove_dir_all(&racine).ok();
    }

    /// Une bibliothèque jetée part à la corbeille, entière.
    #[test]
    fn une_bibliotheque_jetee_se_retrouve_dans_la_corbeille() {
        let (depot, racine) = depot_neuf("corbeille");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        fs::write(depot.racine().join(SOURCES).join("un-document.pdf"), b"x").expect("document");

        let jetee = depot.a_la_corbeille().expect("jetée");
        assert!(!racine.exists(), "le dossier d'origine devrait avoir bougé");
        assert!(jetee.join(BASE).join(DESCRIPTION).exists(), "la description devrait avoir suivi");
        assert!(jetee.join(SOURCES).join("un-document.pdf").exists(), "les documents aussi");
        fs::remove_dir_all(&jetee).ok();
    }

    /// Et elle refuse un dossier qui n'en porte pas : un chemin devenu faux n'emporte rien.
    #[test]
    fn un_dossier_sans_bibliotheque_ne_part_pas_a_la_corbeille() {
        let (depot, racine) = depot_neuf("corbeille-refus");
        fs::write(racine.join("une-photo.jpg"), b"x").expect("photo");

        let refus = depot.a_la_corbeille().expect_err("doit refuser");
        assert!(refus.to_string().contains("ne porte pas de bibliothèque"), "{refus}");
        assert!(racine.join("une-photo.jpg").exists(), "rien ne devait être touché");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_dossier_de_bibliotheque_porte_ses_trois_parties() {
        let (depot, racine) = depot_neuf("agencement");
        for dossier in [SOURCES, DERIVES, BASE] {
            assert!(racine.join(dossier).is_dir(), "{dossier} manque");
        }
        assert!(racine.join(BASE).join(VERSIONS).is_dir());
        assert_eq!(depot.racine(), racine);
        fs::remove_dir_all(&racine).ok();
    }

    /// Deux documents différents portant le même nom ne se marchent pas dessus.
    ///
    /// Le corpus du lot E en contient : « Le corps n'oublie rien.pdf » existe dans deux dossiers,
    /// avec deux contenus. Nommées par leur nom, les copies s'écrasaient — et l'on croyait avoir
    /// déposé deux documents en n'en ayant qu'un, sans qu'aucune erreur ne le dise.
    #[test]
    fn deux_fichiers_de_meme_nom_restent_deux_fichiers() {
        let (depot, racine) = depot_neuf("homonymes");
        let dossier_un = racine.join("un");
        let dossier_deux = racine.join("deux");
        fs::create_dir_all(&dossier_un).expect("dossier");
        fs::create_dir_all(&dossier_deux).expect("dossier");
        let un = dossier_un.join("meme-nom.pdf");
        let deux = dossier_deux.join("meme-nom.pdf");
        fs::write(&un, b"le premier").expect("premier");
        fs::write(&deux, b"le second, qui n'a rien a voir").expect("second");

        let copie_un = depot.deposer_source(&un, &"1".repeat(64)).expect("premier déposé");
        let copie_deux = depot.deposer_source(&deux, &"2".repeat(64)).expect("second déposé");

        assert_ne!(copie_un, copie_deux, "deux documents distincts partagent une destination");
        assert_eq!(fs::read(&copie_un).expect("premier lisible"), b"le premier");
        assert_eq!(fs::read(&copie_deux).expect("second lisible"), b"le second, qui n'a rien a voir");
        fs::remove_dir_all(&racine).ok();
    }

    /// Le même fichier déposé deux fois ne se recopie pas : son empreinte le nomme.
    #[test]
    fn un_fichier_depose_deux_fois_ne_se_recopie_pas() {
        let (depot, racine) = depot_neuf("deux-fois");
        let origine = racine.join("une-fois.pdf");
        fs::write(&origine, b"des octets").expect("original");
        let empreinte = "c".repeat(64);
        let premier = depot.deposer_source(&origine, &empreinte).expect("premier dépôt");
        let second = depot.deposer_source(&origine, &empreinte).expect("second dépôt");
        assert_eq!(premier, second);
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_original_depose_voyage_avec_la_bibliotheque() {
        let (depot, racine) = depot_neuf("source");
        let origine = std::env::temp_dir().join(format!("original-{}.txt", std::process::id()));
        fs::write(&origine, b"des octets").expect("original écrit");

        let empreinte = "a".repeat(64);
        let copie = depot.deposer_source(&origine, &empreinte).expect("source déposée");
        assert!(copie.starts_with(racine.join(SOURCES)));
        assert_eq!(fs::read(&copie).expect("copie lisible"), b"des octets");
        // Nommée par son empreinte, et rangée sous un palier : deux documents de même nom ne se
        // marchent plus dessus, et un listing ne rend pas des milliers d'entrées d'un coup.
        assert_eq!(copie, depot.source(&empreinte, "txt"));

        // L'original peut disparaître : la bibliothèque n'en dépend plus.
        fs::remove_file(&origine).ok();
        assert_eq!(fs::read(&copie).expect("la copie survit"), b"des octets");
        fs::remove_dir_all(&racine).ok();
    }
    #[test]
    fn une_description_ecrite_se_relit_telle_quelle() {
        let (depot, racine) = depot_neuf("description");
        assert!(!depot.deja_une_bibliotheque(), "un dossier neuf n'en porte aucune");
        assert!(depot.lire_description().expect("lecture").is_none());

        let texte = r#"{"id":"une-bibliotheque","nom":"Une bibliothèque"}"#;
        depot.ecrire_description(texte).expect("description écrite");

        assert!(depot.deja_une_bibliotheque());
        assert_eq!(depot.lire_description().expect("lecture"), Some(texte.to_owned()));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn une_description_ne_laisse_aucun_temporaire_derriere_elle() {
        let (depot, racine) = depot_neuf("description-propre");
        depot.ecrire_description("{}").expect("écrite");
        let restes: Vec<_> = fs::read_dir(racine.join(BASE))
            .expect("base lisible")
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "tmp"))
            .collect();
        assert!(restes.is_empty(), "un temporaire oublié finit par être pris pour une donnée");
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn les_derives_d_une_version_ont_leur_propre_dossier() {
        let (depot, racine) = depot_neuf("derives");
        let un = depot.derives_de("v1").expect("dossier créé");
        let deux = depot.derives_de("v2").expect("dossier créé");
        assert_ne!(un, deux, "deux versions n'écrivent pas au même endroit");
        assert!(un.is_dir() && deux.is_dir());
        // Le moteur écrit là, et nulle part ailleurs : une version non activée ne regarde personne.
        assert!(un.starts_with(racine.join(DERIVES)));
        fs::remove_dir_all(&racine).ok();
    }
}

#[cfg(test)]
mod actives {
    use super::*;
    use std::fs;

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-actives-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        (Depot::ouvrir(&racine).expect("dépôt ouvert"), racine)
    }

    const A: &str = "aaaa000000000000000000000000000000000000000000000000000000000000";
    const B: &str = "bbbb000000000000000000000000000000000000000000000000000000000000";

    /// Une bibliothèque tient **une version active par document** (JOB-06).
    ///
    /// Le dépôt SQLite le modélise ainsi depuis le début, et sa contrainte vit en base :
    /// « une seule version active par document ». L'hôte, lui, tenait un pointeur unique pour
    /// toute la bibliothèque : une bibliothèque de deux cent cinquante livres n'en montrait
    /// qu'un, et les deux dépôts censés porter le même schéma n'en portaient pas le même.
    /// Deux documents activés **en même temps** gardent tous les deux leur pointeur.
    ///
    /// Le réimport des deux cent cinquante, le 21 octobre 2026, a écrit 243 versions et n'a posé
    /// que **239 pointeurs**. Quatre documents traités avec succès, leur instantané complet sur le
    /// disque, et rien pour les désigner : invisibles, sans un mot.
    ///
    /// `activer` lit la table entière, y insère son pointeur, puis la réécrit. L'écriture est
    /// atomique — `ecrire_atomique` s'en assure — mais **la lecture-modification-écriture ne l'est
    /// pas**, et deux travaux lourds tournent de front. Deux qui finissent ensemble lisent la même
    /// table, chacun y ajoute son pointeur, et le second efface celui du premier. Deux des quatre
    /// perdus se sont conclus dans la même seconde du journal.
    ///
    /// **Écriture atomique n'est pas mise à jour atomique.** Aucune épreuve ne pouvait le voir
    /// tant qu'aucune n'activait deux documents à la fois ; celle-ci le fait, vingt fois, et
    /// échoue sans le verrou.
    #[test]
    fn deux_activations_simultanees_gardent_leurs_deux_pointeurs() {
        let (depot, racine) = depot_neuf("course");
        const COMBIEN: usize = 20;

        let depot = std::sync::Arc::new(depot);
        for rang in 0..COMBIEN {
            depot.ecrire_version(&format!("v-{rang}"), r#"{"doc":"x"}"#).expect("écrite");
        }

        let mut fils = Vec::new();
        for rang in 0..COMBIEN {
            let sien = std::sync::Arc::clone(&depot);
            fils.push(std::thread::spawn(move || {
                sien.activer(&format!("{rang:064}"), &format!("v-{rang}"), 1_000 + rang as u64)
            }));
        }
        for fil in fils {
            fil.join().expect("fil").expect("activation");
        }

        let table = depot.actives().expect("table");
        let manquants: Vec<usize> = (0..COMBIEN).filter(|rang| !table.contains_key(&format!("{rang:064}"))).collect();
        assert!(
            manquants.is_empty(),
            "{} pointeur(s) perdu(s) sur {COMBIEN} : un document traité qu'aucun pointeur ne désigne est invisible",
            manquants.len()
        );
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn chaque_document_a_sa_version_active() {
        let (depot, racine) = depot_neuf("deux-documents");

        depot.ecrire_version("v-a", r#"{"doc":"a"}"#).expect("écrite");
        depot.ecrire_version("v-b", r#"{"doc":"b"}"#).expect("écrite");
        depot.activer(A, "v-a", 1_000).expect("a activée");
        depot.activer(B, "v-b", 1_001).expect("b activée");

        assert_eq!(depot.version_active(A).expect("lecture").map(|p| p.version), Some("v-a".to_owned()));
        assert_eq!(depot.version_active(B).expect("lecture").map(|p| p.version), Some("v-b".to_owned()));
        assert_eq!(depot.charge_active(A).expect("lecture"), Some(r#"{"doc":"a"}"#.to_owned()));
        assert_eq!(depot.charge_active(B).expect("lecture"), Some(r#"{"doc":"b"}"#.to_owned()));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn activer_un_document_ne_touche_pas_l_autre() {
        let (depot, racine) = depot_neuf("sans-effet-de-bord");
        depot.ecrire_version("v-a1", r#"{"a":1}"#).expect("écrite");
        depot.ecrire_version("v-a2", r#"{"a":2}"#).expect("écrite");
        depot.ecrire_version("v-b1", r#"{"b":1}"#).expect("écrite");
        depot.activer(A, "v-a1", 1_000).expect("activée");
        depot.activer(B, "v-b1", 1_001).expect("activée");

        depot.activer(A, "v-a2", 2_000).expect("activée");

        assert_eq!(depot.charge_active(A).expect("lecture"), Some(r#"{"a":2}"#.to_owned()));
        assert_eq!(
            depot.charge_active(B).expect("lecture"),
            Some(r#"{"b":1}"#.to_owned()),
            "l'autre document a changé de version active"
        );
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn un_document_jamais_active_n_a_pas_de_version() {
        let (depot, racine) = depot_neuf("inconnu");
        assert!(depot.version_active(A).expect("lecture").is_none());
        assert!(depot.charge_active(A).expect("lecture").is_none());
        assert!(depot.actives().expect("lecture").is_empty());
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn on_refuse_toujours_d_activer_une_version_jamais_ecrite() {
        let (depot, racine) = depot_neuf("fantome");
        let erreur = depot.activer(A, "jamais-vue", 1_000).expect_err("activer du vide se refuse");
        assert_eq!(erreur.kind(), io::ErrorKind::NotFound);
        assert!(erreur.to_string().contains("jamais écrite"), "le refus dit pourquoi");
        assert!(depot.actives().expect("lecture").is_empty(), "rien n'a été inscrit");
        fs::remove_dir_all(&racine).ok();
    }

    /// La table entière en une lecture : c'est elle que la vue d'ensemble consulte.
    #[test]
    fn la_table_rend_tous_les_actifs_d_un_coup() {
        let (depot, racine) = depot_neuf("table");
        depot.ecrire_version("v-a", "{}").expect("écrite");
        depot.ecrire_version("v-b", "{}").expect("écrite");
        depot.activer(A, "v-a", 1_000).expect("activée");
        depot.activer(B, "v-b", 1_001).expect("activée");

        let table = depot.actives().expect("lecture");
        assert_eq!(table.len(), 2);
        assert_eq!(table.get(A).map(|p| p.version.as_str()), Some("v-a"));
        assert_eq!(table.get(B).map(|p| p.version.as_str()), Some("v-b"));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn ecrire_une_version_ne_touche_aucun_actif() {
        let (depot, racine) = depot_neuf("job06");
        depot.ecrire_version("v1", r#"{"quoi":"premier"}"#).expect("écrite");
        depot.activer(A, "v1", 1_000).expect("activée");

        depot.ecrire_version("v2", r#"{"quoi":"second"}"#).expect("écrite");
        assert_eq!(
            depot.version_active(A).expect("lecture").map(|p| p.version),
            Some("v1".to_owned()),
            "la version active a bougé pendant le traitement"
        );

        depot.activer(A, "v2", 2_000).expect("activée");
        assert_eq!(depot.charge_active(A).expect("lecture"), Some(r#"{"quoi":"second"}"#.to_owned()));
        // L'ancienne reste lisible : une activation ne détruit rien.
        assert_eq!(depot.lire_version("v1").expect("lecture"), Some(r#"{"quoi":"premier"}"#.to_owned()));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn l_ecriture_de_la_table_ne_laisse_aucun_temporaire() {
        let (depot, racine) = depot_neuf("propre");
        depot.ecrire_version("v1", "{}").expect("écrite");
        depot.activer(A, "v1", 1_000).expect("activée");

        let restes: Vec<_> = fs::read_dir(racine.join(BASE))
            .expect("base lisible")
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "tmp"))
            .collect();
        assert!(restes.is_empty(), "un temporaire oublié finit par être pris pour une donnée");
        fs::remove_dir_all(&racine).ok();
    }

    /// Une table abîmée ne rend pas la bibliothèque illisible : on repart de rien plutôt que de
    /// refuser de l'ouvrir. Le même choix que pour les réglages et le journal.
    #[test]
    fn une_table_abimee_ne_bloque_pas_l_ouverture() {
        let (depot, racine) = depot_neuf("abimee");
        fs::create_dir_all(racine.join(BASE)).expect("base");
        fs::write(racine.join(BASE).join(ACTIVES), b"{ ceci n'est pas du JSON").expect("écrit");
        assert!(depot.actives().expect("lecture").is_empty());
        assert!(depot.version_active(A).expect("lecture").is_none());
        fs::remove_dir_all(&racine).ok();
    }
}

#[cfg(test)]
mod classement {
    use super::*;
    use std::fs;

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-classement-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        (Depot::ouvrir(&racine).expect("dépôt ouvert"), racine)
    }

    const A: &str = "aaaa000000000000000000000000000000000000000000000000000000000000";
    const B: &str = "bbbb000000000000000000000000000000000000000000000000000000000000";

    fn range(valeur: &str) -> serde_json::Value {
        serde_json::json!({ "axes": { "a": { "type": "reference", "valeurs": [valeur] } }, "origine": "import" })
    }

    /// Ce qu'on range se relit, et chaque document garde le sien (CLA-01).
    #[test]
    fn un_classement_ecrit_se_relit_document_par_document() {
        let (depot, _) = depot_neuf("relit");
        depot.classer(A, &range("v1")).expect("A rangé");
        depot.classer(B, &range("v2")).expect("B rangé");

        assert_eq!(depot.classement(A).expect("lu"), Some(range("v1")));
        assert_eq!(depot.classement(B).expect("lu"), Some(range("v2")));
        assert_eq!(depot.classements().expect("table").len(), 2);
    }

    /// Un document a **un** classement, et non une pile.
    #[test]
    fn reclasser_remplace_au_lieu_de_s_ajouter() {
        let (depot, _) = depot_neuf("remplace");
        depot.classer(A, &range("v1")).expect("rangé");
        depot.classer(A, &range("v2")).expect("rangé de nouveau");

        assert_eq!(depot.classement(A).expect("lu"), Some(range("v2")));
        assert_eq!(depot.classements().expect("table").len(), 1, "un document, un classement");
    }

    /// Un document jamais rangé ne rend rien — et rien est une réponse, pas une panne.
    #[test]
    fn un_document_non_range_ne_rend_rien_et_ne_se_plaint_pas() {
        let (depot, _) = depot_neuf("absent");
        assert_eq!(depot.classement(A).expect("lu"), None);
        assert!(depot.classements().expect("table").is_empty());
    }

    /// Une table abîmée n'empêche pas d'ouvrir la bibliothèque.
    #[test]
    fn une_table_abimee_rend_une_table_vide_plutot_qu_une_erreur() {
        let (depot, racine) = depot_neuf("abimee");
        depot.classer(A, &range("v1")).expect("rangé");
        fs::write(racine.join(BASE).join(CLASSEMENTS), b"{ ceci n'est pas du JSON").expect("abîmé");

        assert!(depot.classements().expect("table lue malgré tout").is_empty());
        assert_eq!(depot.classement(A).expect("lu"), None);
    }
}

#[cfg(test)]
mod migration {
    use super::*;
    use std::fs;

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-migration-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        (Depot::ouvrir(&racine).expect("dépôt ouvert"), racine)
    }

    const A: &str = "aaaa000000000000000000000000000000000000000000000000000000000000";
    const B: &str = "bbbb000000000000000000000000000000000000000000000000000000000000";

    /// Pose un travail terminé, comme la file en écrit un.
    fn travail_termine(racine: &Path, id: &str, empreinte: &str, version: &str) {
        let dossier = racine.join(BASE).join(TRAVAUX);
        fs::create_dir_all(&dossier).expect("dossier des travaux");
        let travail = serde_json::json!({
            "id": id,
            "outil": "traitement-de-lot",
            "etat": "termine",
            "poids": "lourd",
            "tentative": 1,
            "total": 1,
            "empreinte": empreinte,
            "version_cible": version,
            "cree_le": 1_000,
            "maj_le": 2_000,
            "verrou": null,
            "point_reprise": null,
        });
        fs::write(dossier.join(format!("{id}.json")), travail.to_string()).expect("travail posé");
    }

    /// La migration est **déterministe** : elle se lit dans les travaux, qui portent déjà
    /// l'empreinte du document et sa version cible. Aucun document n'est relu, aucune page
    /// retraitée — c'est une table à écrire, pas un travail à refaire.
    #[test]
    fn la_migration_se_lit_dans_les_travaux_sans_rien_retraiter() {
        let (depot, racine) = depot_neuf("deterministe");
        depot.ecrire_version("v-a", r#"{"doc":"a"}"#).expect("écrite");
        depot.ecrire_version("v-b", r#"{"doc":"b"}"#).expect("écrite");
        travail_termine(&racine, "t-a", A, "v-a");
        travail_termine(&racine, "t-b", B, "v-b");

        // L'ancien pointeur unique, tel qu'une bibliothèque déjà traitée le porte.
        fs::write(
            racine.join(BASE).join(ACTIVE),
            serde_json::json!({ "version": "v-b", "activee_le": 2_000 }).to_string(),
        )
        .expect("ancien pointeur");

        let combien = depot.migrer_les_actives().expect("migration");

        assert_eq!(combien, 2, "les deux documents doivent être inscrits");
        assert_eq!(depot.charge_active(A).expect("lecture"), Some(r#"{"doc":"a"}"#.to_owned()));
        assert_eq!(depot.charge_active(B).expect("lecture"), Some(r#"{"doc":"b"}"#.to_owned()));
        fs::remove_dir_all(&racine).ok();
    }

    /// Un seul document : le cas de F3, F4 et F5. Après migration, ce qu'ils lisent est
    /// exactement ce qu'ils lisaient — une entrée dans la table au lieu d'un pointeur.
    #[test]
    fn une_bibliotheque_d_un_seul_document_lit_la_meme_chose_qu_avant() {
        let (depot, racine) = depot_neuf("un-seul");
        depot.ecrire_version("v1", r#"{"quoi":"la methode"}"#).expect("écrite");
        travail_termine(&racine, "t1", A, "v1");
        fs::write(
            racine.join(BASE).join(ACTIVE),
            serde_json::json!({ "version": "v1", "activee_le": 1_000 }).to_string(),
        )
        .expect("ancien pointeur");

        assert_eq!(depot.migrer_les_actives().expect("migration"), 1);
        assert_eq!(depot.charge_active(A).expect("lecture"), Some(r#"{"quoi":"la methode"}"#.to_owned()));
        assert_eq!(depot.actives().expect("lecture").len(), 1);
        fs::remove_dir_all(&racine).ok();
    }

    /// Elle se rejoue sans dégât : une migration qu'on ne peut pas relancer deux fois est une
    /// migration qu'on n'ose pas lancer une fois.
    #[test]
    fn la_migration_se_rejoue_sans_rien_changer() {
        let (depot, racine) = depot_neuf("idempotente");
        depot.ecrire_version("v-a", "{}").expect("écrite");
        travail_termine(&racine, "t-a", A, "v-a");

        let premiere = depot.migrer_les_actives().expect("migration");
        let table = depot.actives().expect("lecture");
        let seconde = depot.migrer_les_actives().expect("migration");

        assert_eq!(premiere, 1);
        assert_eq!(seconde, 0, "la seconde passe ne doit rien avoir à inscrire");
        assert_eq!(depot.actives().expect("lecture"), table, "la table a bougé sans raison");
        fs::remove_dir_all(&racine).ok();
    }

    /// Elle n'écrase jamais ce qui a déjà été activé par document : l'ancien pointeur n'est
    /// qu'un défaut pour ce dont on n'a pas la trace.
    #[test]
    fn elle_ne_recouvre_pas_un_actif_deja_inscrit() {
        let (depot, racine) = depot_neuf("sans-ecraser");
        depot.ecrire_version("v-vieille", "{}").expect("écrite");
        depot.ecrire_version("v-neuve", "{}").expect("écrite");
        travail_termine(&racine, "t-a", A, "v-vieille");
        depot.activer(A, "v-neuve", 3_000).expect("activée");

        depot.migrer_les_actives().expect("migration");

        assert_eq!(
            depot.version_active(A).expect("lecture").map(|p| p.version),
            Some("v-neuve".to_owned()),
            "la migration a recouvert une activation plus récente"
        );
        fs::remove_dir_all(&racine).ok();
    }

    /// Un travail dont la version n'a jamais été écrite n'entre pas dans la table : la règle
    /// « on n'active pas un pointeur vers rien » vaut aussi pour la migration.
    #[test]
    fn elle_saute_un_travail_dont_la_version_manque() {
        let (depot, racine) = depot_neuf("version-manquante");
        travail_termine(&racine, "t-a", A, "v-jamais-ecrite");
        assert_eq!(depot.migrer_les_actives().expect("migration"), 0);
        assert!(depot.actives().expect("lecture").is_empty());
        fs::remove_dir_all(&racine).ok();
    }

    /// Une bibliothèque neuve n'a rien à migrer, et le dit sans se plaindre.
    #[test]
    fn une_bibliotheque_neuve_n_a_rien_a_migrer() {
        let (depot, racine) = depot_neuf("neuve");
        assert_eq!(depot.migrer_les_actives().expect("migration"), 0);
        assert!(depot.actives().expect("lecture").is_empty());
        fs::remove_dir_all(&racine).ok();
    }
}
