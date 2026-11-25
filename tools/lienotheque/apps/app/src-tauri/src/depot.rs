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
    ffi::OsStr,
    fs,
    io::{self, Write},
    path::{Component, Path, PathBuf},
};

/// Ce qu'un retrait de document a emporté, **et ce qui est resté**.
///
/// Les comptes disent ce qui est **parti**, jamais ce qui était visé (lot `0z decies`).
/// `travaux` valait autrefois la taille de la liste à retirer, lue AVANT le premier effacement,
/// et `versions` celle de l'ensemble des versions trouvées : les six effacements d'une version
/// pouvaient donc tous échouer sans changer un chiffre. Une version ne compte désormais que si
/// ses **deux** fichiers sont partis — ses images de page et son enregistrement —, parce que
/// l'un sans l'autre laisse une bibliothèque qui se contredit.
#[derive(Debug, Serialize)]
pub struct RetraitDeDocument {
    pub versions: usize,
    pub travaux: usize,
    /// Où la source a atterri dans la corbeille. **Omise** si le document n'en avait plus :
    /// un contrat qui attend une chaîne ou rien refuserait un nul, et il a raison de le faire.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<PathBuf>,
    /// Les fichiers de travail illisibles ou abîmés. C'est une **mesure**, pas un reste : chacun
    /// a pu désigner une version de ce document, donc une version qu'on n'a pas su chercher. Le
    /// taire ferait passer le retrait pour complet.
    #[serde(rename = "travauxIllisibles")]
    pub travaux_illisibles: usize,
    /// Ce que le retrait n'a pas pu emporter, nommé un par un. Vide quand tout est parti.
    pub restes: Vec<ResteDeRetrait>,
}

/// Un élément qu'un retrait n'a pas pu emporter : ce qu'il est, où il est, et pourquoi.
///
/// `quoi` porte le **texte de l'écran**, et non un code à traduire : il n'y a pas deux
/// vocabulaires à tenir d'accord, et le contrat `ResteDeRetrait` en ferme la liste.
#[derive(Debug, Serialize)]
pub struct ResteDeRetrait {
    pub quoi: &'static str,
    pub chemin: PathBuf,
    pub cause: String,
}

impl ResteDeRetrait {
    fn neuf(quoi: &'static str, chemin: PathBuf, cause: &io::Error) -> Self {
        Self { quoi, chemin, cause: cause.to_string() }
    }
}

/// Les cinq choses qu'un retrait touche, telles que le contrat les énumère. Un contrôle compare
/// ces cinq textes à ceux du contrat : deux vocabulaires qui dérivent ne se comparent plus.
const RESTE_IMAGES: &str = "les images de page";
const RESTE_VERSION: &str = "l'enregistrement de version";
const RESTE_TRAVAIL: &str = "un fichier de travail";
const RESTE_CLASSEMENT: &str = "le classement";
const RESTE_SOURCE: &str = "la source";

/// La phrase affichée quand l’empreinte demandée n’est connue de rien : ni pointeur, ni travail,
/// ni classement, ni source.
///
/// Elle est **publique** pour deux raisons. L’hôte la reconnaît afin de ne pas la préfixer d’un
/// « Retrait impossible : » qui ferait croire à une panne de la bibliothèque. Et un contrôle la
/// compare au texte de l’écran : une phrase écrite deux fois finit toujours par différer.
pub const ABSENT_DE_LA_BIBLIOTHEQUE: &str = "Ce document n’est pas dans la bibliothèque.";

/// « Ce qui n'est plus là est parti. »
///
/// Un effacement qui ne trouve rien a **obtenu** ce qu'on voulait : un document composé en texte
/// n'a aucune image de page, et son `derives/<version>/` n'a jamais existé. Confondre l'absence
/// et l'échec ferait nommer un reste qui n'existe pas — et un compte rendu qui accuse à tort ne
/// se lit plus, comme un garde-fou qui accuse à tort finit désarmé.
fn parti(resultat: io::Result<()>) -> io::Result<()> {
    match resultat {
        Err(souci) if souci.kind() == io::ErrorKind::NotFound => Ok(()),
        autre => autre,
    }
}

/// Agencement du dossier, le même que celui du noyau TypeScript.
pub const SOURCES: &str = "sources";
pub const DERIVES: &str = "derives";
pub const BASE: &str = "base";

/// **Public** depuis le lot `0z decies` : le relevé d'orphelins d'`examples/retrait.rs` doit
/// atteindre le même dossier que le dépôt, et la seule autre façon était d'en recopier le nom.
/// Un agencement écrit deux fois finit par différer.
pub const VERSIONS: &str = "versions";
/// L'ancien pointeur unique, gardé pour les contrôles de la migration : eux seuls le nomment, et
/// c'est voulu. `migrer_les_actives` ne le lit pas — elle déduit la table des travaux terminés —,
/// et les contrôles fabriquent ce fichier pour prouver qu'elle l'ignore. D'où le `cfg(test)` :
/// hors contrôles, personne ne doit nommer ce chemin, et un avertissement de construction le
/// disait sans que rien ne le corrige.
#[cfg(test)]
const ACTIVE: &str = "active.json";

/// Ce qui rend indivisible la **mise à jour** de la table des actives, et non sa seule écriture.
///
/// Un seul verrou pour toutes les bibliothèques du processus : il n'y en a qu'une d'ouverte à la
/// fois, et un verrou par racine coûterait une table de verrous pour un gain nul.
static VERROU_ACTIVES: std::sync::Mutex<()> = std::sync::Mutex::new(());
static VERROU_DECISIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());
static VERROU_ROTATIONS: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Déplace une entrée à la corbeille. La fonction de renommage est injectée pour pouvoir éprouver
/// le cas EXDEV sans dépendre de la façon dont la machine de test monte ses volumes.
fn deplacer_avec_repli<F>(source: &Path, destination: &Path, renommer: F) -> io::Result<()>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    match renommer(source, destination) {
        Ok(()) => Ok(()),
        Err(erreur) if erreur.kind() == io::ErrorKind::CrossesDevices || erreur.raw_os_error() == Some(18) => {
            if let Err(cause) = copier_entree(source, destination) {
                retirer_entree(destination).ok();
                return Err(cause);
            }
            // La copie est entière avant le premier geste sur l'original. Si le retrait échoue,
            // on garde la copie : mieux vaut un doublon récupérable qu'une moitié perdue.
            retirer_entree(source)
        }
        Err(erreur) => Err(erreur),
    }
}

fn copier_entree(source: &Path, destination: &Path) -> io::Result<()> {
    let nature = fs::symlink_metadata(source)?;
    if nature.is_dir() {
        fs::create_dir(destination)?;
        for entree in fs::read_dir(source)? {
            let entree = entree?;
            copier_entree(&entree.path(), &destination.join(entree.file_name()))?;
        }
        fs::set_permissions(destination, nature.permissions())?;
        return Ok(());
    }
    if nature.is_file() {
        fs::copy(source, destination)?;
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        format!("Entrée impossible à copier vers la corbeille : {}", source.display()),
    ))
}

fn retirer_entree(chemin: &Path) -> io::Result<()> {
    match fs::symlink_metadata(chemin) {
        Ok(nature) if nature.is_dir() => fs::remove_dir_all(chemin),
        Ok(_) => fs::remove_file(chemin),
        Err(erreur) if erreur.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(erreur) => Err(erreur),
    }
}
/// La table des versions actives, une entrée par document.
const ACTIVES: &str = "actives.json";
/// Le classement des documents, par empreinte. Même forme et mêmes raisons que la table
/// des actives : une table plutôt qu'un fichier par document, et une écriture indivisible.
const CLASSEMENTS: &str = "classements.json";
/// Décisions humaines prises sur les cas douteux, par document puis par identifiant de cas.
const DECISIONS: &str = "decisions.json";
/// Corrections d'affichage choisies dans le Lecteur, par document puis rang de page.
const ROTATIONS_MANUELLES: &str = "rotations-pages.json";
/// Inventaire des fichiers qui accompagnent les documents.
///
/// Leur source est rangée par empreinte, comme tout original. Le nom d'origine reste toutefois
/// indispensable pour interpréter ce que le fichier porte ; le perdre ferait lire les chiffres
/// du SHA-256 comme des numéros. Cet inventaire relie les deux sans dupliquer le média.
const MEDIAS: &str = "medias.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MediaDepose {
    pub empreinte: String,
    pub nom: String,
    pub contenu: String,
    pub extension: String,
    /// Groupes de dépôt auxquels ce média appartient. Plusieurs groupes sont possibles quand le
    /// même fichier, reconnu par son empreinte, accompagne plusieurs documents.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub provenances: Vec<String>,
}

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

/// Valide un nom de version avant qu’il serve à construire un chemin (HER-07).
///
/// ## Pourquoi un nom de version se valide
///
/// Un nom de version désigne **un dossier de `derives/` et un fichier de `base/versions/`**, rien
/// de plus : c’est donc un seul nom, sans séparateur. Sans cette vérification, un nom relu dans un
/// fichier abîmé devient un chemin. Mesuré le 21 novembre 2026 avec `rustc 1.100.0` : un composant
/// vide fait viser **tout `derives/`**, et un composant absolu **remplace le chemin entier**, donc
/// `"/"` vise la racine du disque. C’est la dette D28, et le lot `0z septies` la lève.
///
/// ## Pourquoi cette forme, et pas une liste de caractères interdits
///
/// Elle suit celle de `nom_image_page` et de `preparer_destination` : on ne demande pas si le nom
/// « a l’air » correct, on vérifie qu’il est **exactement** le seul composant ordinaire que `Path`
/// y voit. Un seul geste refuse ainsi la chaîne vide, `/`, `..`, `.`, `/etc` et `a/b` — et aussi
/// `a/`, parce qu’un `Path` le réduit à `a` : un nom qui ne se relit pas tel quel n’est pas le nom
/// qu’on croyait lire. Une liste de caractères interdits, elle, se laisse toujours contourner par
/// celui qu’on a oublié.
///
/// `provenance` nomme **où le nom a été lu**, pour que le refus dise quel fichier réparer.
pub fn nom_de_version<'a>(nom: &'a str, provenance: &str) -> io::Result<&'a str> {
    let mut composants = Path::new(nom).components();
    if let (Some(Component::Normal(seul)), None) = (composants.next(), composants.next()) {
        if seul == OsStr::new(nom) {
            return Ok(nom);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        format!(
            "Nom de version invalide dans {provenance} : « {nom} ». Un nom de version est un seul \
             nom de dossier, sans séparateur."
        ),
    ))
}

/// ## Pourquoi une empreinte se valide, elle aussi
///
/// Une empreinte **range** une source : `sources/ab/abcdef….pdf`, où le palier est ses deux
/// premiers caractères. Elle arrive de l'interface dans **douze** commandes, et elle était relue
/// sans que rien ne la vérifie.
///
/// Mesuré le 25 novembre 2026 avec `rustc 1.100.0`, le compilateur qu'épingle
/// `tools/lienotheque/rust-toolchain.toml` : sur `"€a9f"`, `len()` rend **6** — six octets pour
/// quatre caractères, puisqu'un `€` en pèse trois —, l'ancienne garde `len() < 2` laisse donc
/// passer, et `&empreinte[..2]` **panique** : l'indice 2 tombe à l'intérieur du `€`. Ce n'était pas
/// une erreur refusée, c'était l'hôte qui s'arrêtait. C'est la dette D31.
///
/// ## Pourquoi cette forme
///
/// Elle reprend **mot pour mot** le contrat qui dit déjà la règle de l'autre côté de la frontière,
/// `packages/contrats/src/commun.ts` : `z.string().regex(/^[0-9a-f]{64}$/)`. Exactement 64
/// caractères, chacun un chiffre hexadécimal **minuscule** — une empreinte SHA-256 et rien
/// d'autre. Les majuscules sont refusées comme le reste : deux écritures du même contenu feraient
/// deux rangements, et le contrat n'en connaît qu'une.
///
/// Après ce passage, `&empreinte[..2]` ne peut plus paniquer : 64 caractères ASCII sont 64 octets,
/// et l'indice 2 est une frontière.
///
/// `provenance` nomme **où l'empreinte a été lue**, pour que le refus dise quoi réparer.
pub fn empreinte_de_document<'a>(empreinte: &'a str, provenance: &str) -> io::Result<&'a str> {
    if empreinte.len() == 64 && empreinte.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c)) {
        return Ok(empreinte);
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        format!(
            "Empreinte invalide dans {provenance} : « {empreinte} ». Une empreinte est faite de \
             64 chiffres hexadécimaux minuscules."
        ),
    ))
}

pub struct Depot {
    racine: PathBuf,
    /// Où partent les originaux qu'on retire. **Vide dans le produit** : c'est alors `~/.Trash`,
    /// la corbeille du système, et rien d'autre ne doit la changer.
    ///
    /// Ce champ existe pour les **contrôles**, et c'est un champ plutôt qu'une variable
    /// d'environnement pour une raison mesurée : `HOME` est global au processus, et des contrôles
    /// qui tournent de front se le disputeraient — l'un verrait le bac de l'autre, et la mesure
    /// ne vaudrait rien. Un champ appartient à son dépôt.
    ///
    /// **Pourquoi il a fallu l'ajouter.** Le 25 novembre 2026, les contrôles du retrait écrivaient
    /// dans la vraie corbeille de Christophe et l'en retiraient ensuite. Un fichier qu'une course
    /// précédente y avait laissé a ainsi été effacé sans accord, contrairement à la règle du
    /// 18 novembre 2026. Un contrôle n'écrit jamais hors du dossier temporaire.
    corbeille: Option<PathBuf>,
}

impl Depot {
    /// Ouvre une bibliothèque existante, sans jamais transformer le dossier qu'on examine.
    ///
    /// La création est un geste distinct, explicite, porté par [`Self::creer`]. Cette séparation
    /// est indispensable au sélecteur « ouvrir une bibliothèque » : lire un dossier arbitraire
    /// ne doit y semer ni `sources/`, ni `derives/`, ni `base/versions/`.
    pub fn ouvrir(racine: impl Into<PathBuf>) -> io::Result<Self> {
        let racine = racine.into();
        if !racine.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Dossier de bibliothèque introuvable : {}", racine.display()),
            ));
        }
        for dossier in [SOURCES, DERIVES, BASE] {
            let chemin = racine.join(dossier);
            if !chemin.is_dir() {
                return Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("Structure de bibliothèque incomplète : {} manque", chemin.display()),
                ));
            }
        }
        let depot = Self { racine, corbeille: None };

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

    /// Crée la structure d'une nouvelle bibliothèque.
    ///
    /// Cette fonction seule a le droit de préparer les quatre dossiers structurels. Les autres
    /// chemins commencent par [`Self::ouvrir`] et refusent donc un dossier qui n'est pas déjà une
    /// bibliothèque.
    pub fn creer(racine: impl Into<PathBuf>) -> io::Result<Self> {
        let racine = racine.into();
        for dossier in [SOURCES, DERIVES, BASE] {
            fs::create_dir_all(racine.join(dossier))?;
        }
        fs::create_dir_all(racine.join(BASE).join(VERSIONS))?;
        Ok(Self { racine, corbeille: None })
    }

    pub fn racine(&self) -> &Path {
        &self.racine
    }

    /// Où le moteur écrira les dérivés d'une version. Le dossier est créé ici : c'est l'hôte qui
    /// décide de l'emplacement, le moteur n'écrit que là où on le lui dit.
    pub fn derives_de(&self, version: &str) -> io::Result<PathBuf> {
        let chemin = self.racine.join(DERIVES).join(nom_de_version(version, "la version de ce travail")?);
        fs::create_dir_all(&chemin)?;
        Ok(chemin)
    }

    /// Copie un original dans la bibliothèque. C'est ce qui la rend portable : le document
    /// voyage avec elle, et rien ne dépend plus de l'endroit d'où il venait.
    pub fn deposer_source(&self, origine: &Path, empreinte: &str) -> io::Result<PathBuf> {
        // Le palier est les deux premiers caractères : il ne se découpe qu'après validation
        // (dette D31). Ici l'empreinte est calculée par la maison, mais la porte se tient fermée
        // de toute façon — une porte qui ne se garde que lorsqu'on la croit menacée ne garde rien.
        let empreinte = empreinte_de_document(empreinte, "le dépôt d'une source")?;
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
    ///
    /// **Elle ne refuse rien, parce qu'elle rend un chemin et non un `Result`.** Le refus vit en
    /// amont, à l'entrée des douze commandes qui reçoivent une empreinte de l'interface
    /// (`empreinte_de_document`, dette D31). Ici le palier se prend par **caractères** et non par
    /// octets : ainsi une empreinte abîmée qui arriverait par un chemin qu'on n'a pas prévu rend un
    /// chemin qui n'existe pas — ce que l'appelant sait lire — au lieu de faire paniquer l'hôte.
    pub fn source(&self, empreinte: &str, extension: &str) -> PathBuf {
        let palier: String = empreinte.chars().take(2).collect();
        self.racine.join(SOURCES).join(palier).join(format!("{empreinte}.{extension}"))
    }

    /// Retient le nom d'origine d'un média rangé par empreinte.
    ///
    /// Un même contenu redéposé sous un autre nom reste le même média (ID-01) : la première
    /// désignation conservée gagne, comme le premier travail d'un document déjà connu.
    pub fn enregistrer_media(&self, media: MediaDepose) -> io::Result<()> {
        let chemin = self.racine.join(BASE).join(MEDIAS);
        let mut inventaire = self.medias()?;
        if let Some(connu) = inventaire.iter_mut().find(|connu| connu.empreinte == media.empreinte) {
            let mut change = false;
            for provenance in media.provenances {
                if !connu.provenances.contains(&provenance) {
                    connu.provenances.push(provenance);
                    change = true;
                }
            }
            if !change {
                return Ok(());
            }
            connu.provenances.sort();
        } else {
            inventaire.push(media);
        }
        inventaire.sort_by(|a, b| a.nom.cmp(&b.nom).then_with(|| a.empreinte.cmp(&b.empreinte)));
        let brut = serde_json::to_vec_pretty(&inventaire).map_err(io::Error::other)?;
        ecrire_atomique(&chemin, &brut)
    }

    /// Remplace les seuls groupes d'un média déjà inventorié.
    ///
    /// Cette opération est volontairement distincte du dépôt ordinaire, qui fusionne les groupes :
    /// elle sert à réparer une provenance historique démontrée fausse par l'empreinte des octets
    /// dans l'archive d'origine. Elle ne peut ni créer un média ni modifier son nom ou son type.
    pub fn remplacer_provenances_media(&self, empreinte: &str, mut provenances: Vec<String>) -> io::Result<()> {
        let chemin = self.racine.join(BASE).join(MEDIAS);
        let mut inventaire = self.medias()?;
        let media = inventaire
            .iter_mut()
            .find(|connu| connu.empreinte == empreinte)
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("Média absent : {empreinte}")))?;
        provenances.sort();
        provenances.dedup();
        media.provenances = provenances;
        let brut = serde_json::to_vec_pretty(&inventaire).map_err(io::Error::other)?;
        ecrire_atomique(&chemin, &brut)
    }

    /// Les médias déposés, avec leur nom d'origine. Une bibliothèque plus ancienne n'en porte
    /// pas encore : elle rend simplement un inventaire vide.
    pub fn medias(&self) -> io::Result<Vec<MediaDepose>> {
        let chemin = self.racine.join(BASE).join(MEDIAS);
        match fs::read(&chemin) {
            Ok(brut) => serde_json::from_slice(&brut).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(e) => Err(e),
        }
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
        let nom = nom_de_version(version, "la version à écrire")?;
        let chemin = self.racine.join(BASE).join(VERSIONS).join(format!("{nom}.json"));
        ecrire_atomique(&chemin, charge.as_bytes())?;
        Ok(chemin)
    }

    pub fn lire_version(&self, version: &str) -> io::Result<Option<String>> {
        let nom = nom_de_version(version, "la version à relire")?;
        match fs::read_to_string(self.racine.join(BASE).join(VERSIONS).join(format!("{nom}.json"))) {
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
    /// **Ce que ce retrait ne touche pas, et ce n'est pas le même cas pour les deux.** Les
    /// décisions prises sur un document — `base/decisions.json` — lui **survivent à dessein**
    /// (UX-03, SYN-07) : ce sont des jugements humains, et un document redéposé retrouve les
    /// siens au lieu de les redemander. Les rotations manuelles (`base/rotations-pages.json`) et
    /// l'inventaire des médias (`base/medias.json`), eux, restent sans que personne l'ait
    /// décidé : c'est une dette nommée, non un choix.
    ///
    /// ## L'ordre, et pourquoi celui-là — mesuré, non supposé
    ///
    /// Le **pointeur d'abord**, et trois mesures le justifient plutôt qu'une intuition.
    ///
    /// Le catalogue, l'écran des doublons, le Lecteur et l'index de recherche lisent **tous** la
    /// table des versions actives. Comme `ecrire_actives` passe par un temporaire puis un
    /// renommage, le document quitte les quatre d'un seul geste indivisible, ou d'aucun.
    ///
    /// **L'index de recherche ne se répare que dans cet ordre.** `recherche::synchroniser`
    /// supprime de l'index toute empreinte absente de cette table, et les passages suivent en
    /// cascade. Dans l'ordre inverse, le pointeur survit à l'échec, le couple version-titre de
    /// l'index correspond encore, la boucle passe — et le document **reste trouvable**, avec
    /// tous ses passages, pour ouvrir ensuite une version qui n'existe plus.
    ///
    /// Enfin, cet ordre a un **filet** que l'autre n'a pas : tant qu'un fichier de travail et
    /// son fichier de version survivent, `migrer_les_actives` ramène le document entier au
    /// prochain lancement. Le pire moment de cet ordre-ci se répare tout seul.
    ///
    /// Puis les travaux, les dérivés, les versions, le classement, et la source en dernier —
    /// c'est elle qui, seule, permettrait de tout refaire.
    ///
    /// ## La frontière : la première écriture
    ///
    /// Tout ce qui peut **refuser** se fait avant elle — lecture de la table, validation de
    /// chaque nom de version, lecture et recomposition des classements, résolution du chemin de
    /// la source, préparation de la corbeille. Un refus laisse alors la bibliothèque **intacte**,
    /// et nomme le fichier à réparer (HER-07, dettes D28 et D32).
    ///
    /// **Au-delà, plus rien ne rend d'erreur — et ce n'est pas dire que plus rien n'échoue.**
    /// Les trois effacements, l'écriture des classements et le déplacement vers la corbeille
    /// restent faillibles ; leurs échecs sont **collectés** avec leur chemin et leur cause, et
    /// rapportés dans `restes`. La raison est que, passé ce point, le retrait a commencé :
    /// rendre une erreur ferait écrire « retrait impossible » à l'écran d'un document qui a déjà
    /// quitté le catalogue — ce qui est exactement ce que l'ancienne forme faisait.
    ///
    /// ## À la corbeille, comme une bibliothèque
    ///
    /// La source part à la corbeille plutôt qu'au néant : c'est l'original de quelqu'un, et se
    /// tromper de document ne doit pas coûter un livre. Les dérivés et les versions, eux, sont
    /// effacés — ils se reconstruisent depuis la source, et les garder encombrerait la corbeille
    /// de mégaoctets que personne ne ressortira.
    pub fn retirer_document(&self, empreinte: &str) -> io::Result<RetraitDeDocument> {
        // L'ancienne garde comptait des OCTETS — « trop courte » — et laissait donc passer une
        // empreinte de six octets pour quatre caractères, que le découpage faisait paniquer
        // (dette D31). Le valideur compte des caractères et dit lesquels.
        let empreinte = empreinte_de_document(empreinte, "la demande de retrait")?;
        let _tenu = VERROU_ACTIVES.lock().unwrap_or_else(|empoisonne| empoisonne.into_inner());

        // 1. **Lire d'abord, écrire ensuite.** Les deux étapes étaient autrefois mêlées : le
        //    pointeur partait avant que les noms de version soient connus, et les fichiers de
        //    travail s'effaçaient pendant qu'on les lisait. Un seul nom invalide laissait donc une
        //    bibliothèque à moitié retirée. Désormais, tout ce qu'il faut est **rassemblé et
        //    validé** avant la première écriture, et un nom invalide refuse l'opération entière en
        //    nommant le fichier à réparer (HER-07, dette D28).
        let mut table = self.actives()?;
        let pointeur = table.remove(empreinte);

        // Ses versions, reconnues par les travaux qui les visaient — une version n'inscrit pas
        // l'empreinte de sa source, c'est le travail qui fait le lien.
        let mut versions: BTreeSet<String> = BTreeSet::new();
        if let Some(pointeur) = &pointeur {
            nom_de_version(&pointeur.version, "le fichier base/actives.json")?;
            versions.insert(pointeur.version.clone());
        }
        let mut travaux_a_retirer: Vec<PathBuf> = Vec::new();
        let mut travaux_illisibles = 0;
        match fs::read_dir(self.travaux()) {
            // Une bibliothèque sans file n'a pas de dossier de travaux : l'absence est une
            // réponse, pas une panne.
            Err(souci) if souci.kind() == io::ErrorKind::NotFound => {}
            // Toute autre panne de lecture **refuse**, et il en est encore temps. Avalée, elle
            // faisait trouver ZÉRO travail : le pointeur partait en laissant derrière lui les
            // fichiers qui le ressuscitent, et le compte rendu annonçait « 0 travail » comme si
            // c'était vrai (dette D32).
            Err(souci) => {
                return Err(io::Error::new(
                    souci.kind(),
                    format!("Le dossier {} est illisible : {souci}", self.travaux().display()),
                ));
            }
            Ok(entrees) => {
                for entree in entrees {
                    // Un travail qu'on ne sait pas lire est **compté**, et il l'est même quand
                    // rien ne dit qu'il appartient à ce document : c'est précisément ce qu'on ne
                    // peut pas savoir, et la version qu'il visait serait restée invisible.
                    let Ok(entree) = entree else {
                        travaux_illisibles += 1;
                        continue;
                    };
                    let chemin = entree.path();
                    if chemin.extension().is_none_or(|e| e != "json") {
                        continue;
                    }
                    let Ok(texte) = fs::read_to_string(&chemin) else {
                        travaux_illisibles += 1;
                        continue;
                    };
                    let Ok(lu) = serde_json::from_str::<serde_json::Value>(&texte) else {
                        travaux_illisibles += 1;
                        continue;
                    };
                    if lu["empreinte"].as_str() != Some(empreinte) {
                        continue;
                    }
                    if let Some(cible) = lu["version_cible"].as_str() {
                        nom_de_version(cible, &format!("le fichier {}", chemin.display()))?;
                        versions.insert(cible.to_owned());
                    }
                    travaux_a_retirer.push(chemin);
                }
            }
        }

        // Le classement est lu **et recomposé** ici : sérialiser peut refuser, et plus rien n'a
        // le droit de refuser passé la frontière. Ne reste à faire que l'écriture.
        let mut rangs = self.classements()?;
        let classement = match rangs.remove(empreinte) {
            None => None,
            Some(_) => Some(serde_json::to_string_pretty(&rangs)?),
        };

        // La source est **cherchée, pas touchée**. Deux fichiers peuvent porter la même empreinte
        // sous deux extensions : chacun partira, et le compte rendu nommera le dernier.
        let mut a_jeter: Vec<PathBuf> = Vec::new();
        let palier = self.racine.join(SOURCES).join(&empreinte[..2]);
        match fs::read_dir(&palier) {
            Err(souci) if souci.kind() == io::ErrorKind::NotFound => {}
            // Avalée, cette panne faisait dire « sa source n'y était plus » d'une source bien
            // présente dans un dossier devenu illisible (dette D32).
            Err(souci) => {
                return Err(io::Error::new(
                    souci.kind(),
                    format!("Le dossier {} est illisible : {souci}", palier.display()),
                ));
            }
            Ok(entrees) => {
                for entree in entrees.flatten() {
                    let chemin = entree.path();
                    if chemin.file_stem().and_then(|s| s.to_str()) != Some(empreinte) {
                        continue;
                    }
                    a_jeter.push(chemin);
                }
            }
        }

        // **Rien à retirer n'est pas un retrait.** L'écran annonçait « Document retiré » d'une
        // empreinte que la bibliothèque n'avait jamais connue, et le compte rendu tout à zéro
        // n'y changeait rien : c'est la phrase que la personne lit.
        if pointeur.is_none() && travaux_a_retirer.is_empty() && a_jeter.is_empty() && classement.is_none() {
            return Err(io::Error::new(io::ErrorKind::NotFound, ABSENT_DE_LA_BIBLIOTHEQUE));
        }

        // La corbeille, préparée **avant** d'écrire : un dossier personnel introuvable ou un
        // `~/.Trash` impossible à créer sont des refus, pas des restes. On ne la touche que s'il
        // y a quelque chose à y mettre.
        let corbeille = if a_jeter.is_empty() {
            None
        } else {
            let corbeille = self.corbeille()?;
            fs::create_dir_all(&corbeille)?;
            Some(corbeille)
        };

        // 2. **La frontière.** Ce qui suit n'a plus le droit de rendre une erreur. Cette écriture
        //    la porte : si elle échoue, rien n'a encore été effacé et le refus dit vrai.
        let mut restes: Vec<ResteDeRetrait> = Vec::new();
        if pointeur.is_some() {
            self.ecrire_actives(&table)?;
        }

        // 3. Les travaux, et le compte ne monte **qu'après** le geste.
        let mut travaux_retires = 0;
        for chemin in &travaux_a_retirer {
            if let Err(souci) = parti(fs::remove_file(chemin)) {
                restes.push(ResteDeRetrait::neuf(RESTE_TRAVAIL, chemin.clone(), &souci));
                continue;
            }
            travaux_retires += 1;
        }

        // 4. Les dérivés et l'enregistrement de chaque version. Les deux effacements sont
        //    indépendants : une version ne compte que si les deux ont abouti, parce que l'un sans
        //    l'autre laisse soit des images que plus aucun écran n'atteint, soit un enregistrement
        //    qui désigne des dérivés absents.
        let mut versions_retirees = 0;
        for version in &versions {
            let derives = self.racine.join(DERIVES).join(version);
            let enregistrement = self.racine.join(BASE).join(VERSIONS).join(format!("{version}.json"));
            let mut entiere = true;
            // La cible est écrite **en entier à l'appel**, et non confiée à la variable ci-dessus :
            // c'est par le texte de son argument que l'exception du garde-fou des effacements
            // reconnaît ce site, et un chemin destructeur se lit mieux là où il efface.
            if let Err(souci) = parti(fs::remove_dir_all(self.racine.join(DERIVES).join(version))) {
                restes.push(ResteDeRetrait::neuf(RESTE_IMAGES, derives, &souci));
                entiere = false;
            }
            if let Err(souci) = parti(fs::remove_file(&enregistrement)) {
                restes.push(ResteDeRetrait::neuf(RESTE_VERSION, enregistrement, &souci));
                entiere = false;
            }
            if entiere {
                versions_retirees += 1;
            }
        }

        // 5. Son classement, s'il en avait un. Le texte est déjà composé : il ne reste qu'à
        //    l'écrire, et cette écriture-là peut encore échouer.
        if let Some(texte) = classement {
            let chemin = self.racine.join(BASE).join(CLASSEMENTS);
            if let Err(souci) = ecrire_atomique(&chemin, texte.as_bytes()) {
                restes.push(ResteDeRetrait::neuf(RESTE_CLASSEMENT, chemin, &souci));
            }
        }

        // 6. La source, en dernier, et à la corbeille.
        let mut jetee = None;
        if let Some(corbeille) = corbeille {
            for chemin in &a_jeter {
                let nom = chemin
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| empreinte.to_owned());
                let mut vise = corbeille.join(&nom);
                let mut rang = 2;
                while vise.exists() {
                    vise = corbeille.join(format!("{rang} {nom}"));
                    rang += 1;
                }
                match deplacer_avec_repli(chemin, &vise, |de, vers| fs::rename(de, vers)) {
                    Ok(()) => jetee = Some(vise),
                    Err(souci) => restes.push(ResteDeRetrait::neuf(RESTE_SOURCE, chemin.clone(), &souci)),
                }
            }
        }

        Ok(RetraitDeDocument {
            versions: versions_retirees,
            travaux: travaux_retires,
            source: jetee,
            travaux_illisibles,
            restes,
        })
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
    /// Déplace la corbeille de ce dépôt, le temps d'une épreuve. **Réservé aux contrôles.**
    ///
    /// Le produit ne l'appelle jamais : `ouvrir` et `creer` laissent le champ vide, et les deux
    /// gestes qui jettent — le retrait d'un document et la mise à la corbeille d'une bibliothèque —
    /// visent alors `~/.Trash`. Un contrôle, lui, passe un dossier de son bac jetable, et
    /// n'écrit donc jamais hors du dossier temporaire.
    #[must_use]
    pub fn avec_corbeille(mut self, corbeille: impl Into<PathBuf>) -> Self {
        self.corbeille = Some(corbeille.into());
        self
    }

    /// La corbeille de ce dépôt : celle qu'on lui a posée, sinon celle du système.
    ///
    /// **Le seul endroit du dépôt qui nomme `.Trash`**, et un contrôle de structure vérifie qu'il
    /// le reste : deux endroits, et l'un des deux finirait par échapper au réglage.
    fn corbeille(&self) -> io::Result<PathBuf> {
        match &self.corbeille {
            Some(posee) => Ok(posee.clone()),
            None => Ok(dossier_personnel()?.join(".Trash")),
        }
    }

    pub fn a_la_corbeille(&self) -> io::Result<PathBuf> {
        if !self.deja_une_bibliotheque() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Ce dossier ne porte pas de bibliothèque : rien n'a été touché.",
            ));
        }

        let corbeille = self.corbeille()?;
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

        deplacer_avec_repli(&self.racine, &vise, |de, vers| fs::rename(de, vers))?;
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

    /// Les décisions déjà prises sur un document (UX-03, SYN-07).
    pub fn decisions(&self, empreinte: &str) -> io::Result<BTreeMap<String, String>> {
        let table: BTreeMap<String, BTreeMap<String, String>> =
            match fs::read_to_string(self.racine.join(BASE).join(DECISIONS)) {
                Ok(texte) => serde_json::from_str(&texte).unwrap_or_default(),
                Err(e) if e.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
                Err(e) => return Err(e),
            };
        Ok(table.get(empreinte).cloned().unwrap_or_default())
    }

    /// Enregistre une décision sans perdre celles prises juste avant.
    pub fn decider(&self, empreinte: &str, cas: &str, decision: &str) -> io::Result<()> {
        let _garde = VERROU_DECISIONS.lock().map_err(|e| io::Error::other(e.to_string()))?;
        let chemin = self.racine.join(BASE).join(DECISIONS);
        let mut table: BTreeMap<String, BTreeMap<String, String>> = match fs::read_to_string(&chemin) {
            Ok(texte) => serde_json::from_str(&texte).unwrap_or_default(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => return Err(e),
        };
        table.entry(empreinte.to_owned()).or_default().insert(cas.to_owned(), decision.to_owned());
        ecrire_atomique(&chemin, serde_json::to_string_pretty(&table)?.as_bytes())
    }

    /// Défais exactement la dernière décision demandée par l'écran.
    pub fn annuler_decision(&self, empreinte: &str, cas: &str) -> io::Result<()> {
        let _garde = VERROU_DECISIONS.lock().map_err(|e| io::Error::other(e.to_string()))?;
        let chemin = self.racine.join(BASE).join(DECISIONS);
        let mut table: BTreeMap<String, BTreeMap<String, String>> = match fs::read_to_string(&chemin) {
            Ok(texte) => serde_json::from_str(&texte).unwrap_or_default(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e),
        };
        if let Some(decisions) = table.get_mut(empreinte) {
            decisions.remove(cas);
            if decisions.is_empty() {
                table.remove(empreinte);
            }
        }
        ecrire_atomique(&chemin, serde_json::to_string_pretty(&table)?.as_bytes())
    }

    /// Les corrections visuelles d'un document. Elles vivent à côté des décisions humaines,
    /// jamais dans les dérivés : une nouvelle reconnaissance automatique ne les écrase pas.
    pub fn rotations_manuelles(&self, empreinte: &str) -> io::Result<BTreeMap<u32, u16>> {
        let table: BTreeMap<String, BTreeMap<u32, u16>> =
            match fs::read_to_string(self.racine.join(BASE).join(ROTATIONS_MANUELLES)) {
                Ok(texte) => serde_json::from_str(&texte).unwrap_or_default(),
                Err(e) if e.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
                Err(e) => return Err(e),
            };
        Ok(table.get(empreinte).cloned().unwrap_or_default())
    }

    /// Mémorise un quart de tour pour une page. Revenir à zéro retire la correction : zéro est
    /// déjà l'état par défaut, et ne doit pas gonfler la table au fil des consultations.
    pub fn tourner_page(&self, empreinte: &str, page: u32, rotation: u16) -> io::Result<()> {
        if page == 0 || !matches!(rotation, 0 | 90 | 180 | 270) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Page ou rotation manuelle invalide"));
        }
        let _garde = VERROU_ROTATIONS.lock().map_err(|e| io::Error::other(e.to_string()))?;
        let chemin = self.racine.join(BASE).join(ROTATIONS_MANUELLES);
        let mut table: BTreeMap<String, BTreeMap<u32, u16>> = match fs::read_to_string(&chemin) {
            Ok(texte) => serde_json::from_str(&texte).unwrap_or_default(),
            Err(e) if e.kind() == io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => return Err(e),
        };
        if rotation == 0 {
            if let Some(pages) = table.get_mut(empreinte) {
                pages.remove(&page);
                if pages.is_empty() {
                    table.remove(empreinte);
                }
            }
        } else {
            table.entry(empreinte.to_owned()).or_default().insert(page, rotation);
        }
        ecrire_atomique(&chemin, serde_json::to_string_pretty(&table)?.as_bytes())
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

    #[test]
    fn ouvrir_un_dossier_quelconque_ne_le_transforme_pas_en_bibliotheque() {
        let racine = std::env::temp_dir().join(format!(
            "lienotheque-depot-lecture-sans-effet-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&racine);
        fs::create_dir_all(&racine).expect("dossier témoin");

        assert!(Depot::ouvrir(&racine).is_err(), "un dossier vide n'est pas une bibliothèque");
        assert_eq!(
            fs::read_dir(&racine).expect("dossier relu").count(),
            0,
            "lire un dossier arbitraire ne doit y créer aucune entrée",
        );

        fs::remove_dir_all(&racine).ok();
    }

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-depot-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        // **La corbeille vit dans le bac, à côté de la racine, et jamais chez la personne.**
        // Elle est posée ICI plutôt que par chaque contrôle : un réglage qu'on peut oublier
        // se perd, et c'est exactement ce qui est arrivé le 25 novembre 2026.
        let corbeille = racine.with_extension("corbeille");
        let _ = fs::remove_dir_all(&corbeille);
        (Depot::creer(&racine).expect("dépôt créé").avec_corbeille(corbeille), racine)
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
        // **Et le compte rendu dit qu'il ne reste rien** (lot `0z decies`). Sans cette paire
        // d'assertions, un retrait qui laisserait tout derrière lui passerait pour complet : les
        // deux comptes disaient autrefois l'intention, et les restes n'existaient pas.
        assert_eq!(retrait.restes.len(), 0, "rien ne devait résister");
        assert_eq!(retrait.travaux_illisibles, 0, "aucun travail n'était abîmé");

        // Le voisin n'a pas bougé d'un pouce.
        assert!(depot.actives().expect("actives").contains_key(&autre), "l'autre document reste actif");
        assert!(depot.racine().join(DERIVES).join("v-deux").exists(), "ses dérivés restent");
        assert!(depot.racine().join(SOURCES).join("de").join(format!("{autre}.pdf")).exists(), "sa source reste");
        assert!(depot.classement(&autre).expect("classements").is_some(), "son classement reste");

        // Le bac emporte sa corbeille : elle vit à côté de la racine, dans le dossier
        // temporaire, et rien ici n'a jamais touché celle de la personne.
        let corbeille = racine.with_extension("corbeille");
        fs::remove_dir_all(&corbeille).ok();
        fs::remove_dir_all(&racine).ok();
    }

    /// Retirer un document qui n'existe pas **refuse**, et la phrase affichée le dit (lot `0z decies`).
    ///
    /// Elle rendait autrefois un compte rendu tout à zéro, et c'était vrai du `struct` : rien
    /// n'avait bougé, et le contrôle s'appelait « ne fait rien ». Mais l'écran, lui, lisait ce
    /// compte rendu sans source et affichait « Document retiré de la bibliothèque. Sa source n'y
    /// était plus » — d'une empreinte que la bibliothèque n'avait jamais connue. Un compte rendu
    /// exact qui produit une phrase fausse n'est pas exact : c'est la phrase qui se lit.
    ///
    /// On vérifie donc les deux : le refus, et **le texte même** que l'écran affichera.
    #[test]
    fn retirer_un_document_absent_refuse_et_la_phrase_affichee_le_dit() {
        let (depot, racine) = depot_neuf("retrait-absent");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");

        let refus = depot
            .retirer_document(&("00".to_owned() + &"0".repeat(62)))
            .expect_err("une empreinte inconnue doit refuser, non rendre un retrait vide");

        assert_eq!(refus.kind(), io::ErrorKind::NotFound);
        assert_eq!(refus.to_string(), ABSENT_DE_LA_BIBLIOTHEQUE);
        assert_eq!(ABSENT_DE_LA_BIBLIOTHEQUE, "Ce document n’est pas dans la bibliothèque.");
        assert!(
            !ABSENT_DE_LA_BIBLIOTHEQUE.contains("retiré"),
            "la phrase ne doit pas annoncer un retrait qui n'a pas eu lieu",
        );
        fs::remove_dir_all(&racine).ok();
    }

    /// Un classement orphelin **suffit** à retirer, et c'est voulu.
    ///
    /// Le refus ci-dessus demande que rien ne soit connu : ni pointeur, ni travail, ni source,
    /// ni classement. Un classement seul est la trace d'un retrait precedent qui s'est arrêté
    /// en route — exactement l'état que ce lot cherche à rendre réparable. Refuser là
    /// condamnerait la personne à vivre avec une entrée que plus rien ne nomme.
    #[test]
    fn un_classement_orphelin_suffit_a_retirer() {
        let (depot, racine) = depot_neuf("retrait-classement-seul");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        let empreinte = "ab".to_owned() + &"1".repeat(62);
        depot.classer(&empreinte, &serde_json::json!({ "axe": "une valeur" })).expect("classé");

        let retrait = depot.retirer_document(&empreinte).expect("un classement seul se retire");

        assert_eq!(retrait.versions, 0);
        assert_eq!(retrait.travaux, 0);
        assert!(retrait.source.is_none());
        assert_eq!(retrait.restes.len(), 0);
        assert!(depot.classement(&empreinte).expect("classements").is_none(), "le classement devait partir");
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
        // La bibliothèque entière a été DÉPLACÉE dans la corbeille du bac : c'est elle qu'on
        // retire, et la racine n'existe plus.
        let corbeille = racine.with_extension("corbeille");
        fs::remove_dir_all(&corbeille).ok();
    }

    /// Un renommage ne traverse pas deux volumes (EXDEV). La corbeille du compte est sur le
    /// disque système, alors qu'une bibliothèque peut vivre sur un disque externe : elle doit
    /// être copiée entièrement avant que l'original disparaisse.
    #[test]
    fn une_bibliotheque_sur_un_autre_volume_est_copiee_puis_retiree() {
        let source = std::env::temp_dir().join(format!("lienotheque-exdev-source-{}", std::process::id()));
        let destination = std::env::temp_dir().join(format!("lienotheque-exdev-destination-{}", std::process::id()));
        fs::remove_dir_all(&source).ok();
        fs::remove_dir_all(&destination).ok();
        fs::create_dir_all(source.join("base")).expect("source");
        fs::write(source.join("base").join("bibliotheque.json"), b"description").expect("fichier");

        deplacer_avec_repli(&source, &destination, |_de, _vers| Err(io::Error::from_raw_os_error(18)))
            .expect("le repli copie puis retire");

        assert!(!source.exists(), "l'original ne part qu'après la copie complète");
        assert_eq!(
            fs::read(destination.join("base").join("bibliotheque.json")).expect("copie"),
            b"description"
        );
        fs::remove_dir_all(&destination).ok();
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
    /// Un nom de version est un seul nom de dossier, et rien d’autre (HER-07, dette D28).
    ///
    /// ## Pourquoi « / » et « /etc » s’éprouvent ICI, et jamais à travers un effacement
    ///
    /// Un composant absolu **remplace** le chemin entier. Pousser « / » par la porte qui efface
    /// voudrait dire qu’une mutation retirant la validation ferait effacer la racine du disque :
    /// un contrôle ne doit pas pouvoir détruire la machine qui le lit. Les noms absolus sont donc
    /// refusés ici, sur la fonction, et aux portes qui ne font que **lire** (`relire_page`,
    /// `image_de_page`). Aux portes qui effacent, on n’éprouve que des noms dont l’effacement, si
    /// la validation disparaissait, resterait dans le dossier temporaire.
    #[test]
    fn un_nom_de_version_est_un_seul_nom_de_dossier() {
        assert_eq!(nom_de_version("v1", "l’épreuve").expect("« v1 » est un nom de version"), "v1");
        for refuse in ["", "/", "..", "/etc", "a/b", ".", "a/", "a/../b", "//", "~/ailleurs"] {
            assert!(
                nom_de_version(refuse, "l’épreuve").is_err(),
                "« {refuse} » ne devrait pas être accepté comme nom de version",
            );
        }
        let refus = nom_de_version("..", "le fichier base/actives.json").expect_err("un refus");
        assert!(
            refus.to_string().contains("base/actives.json"),
            "le refus doit nommer le fichier à réparer : {refus}",
        );
        assert!(refus.to_string().contains("« .. »"), "le refus doit citer la valeur lue : {refus}");
    }

    /// Les noms dont l’effacement resterait dans le dossier temporaire, si la validation tombait.
    const NOMS_SANS_DANGER: [(&str, &str); 5] =
        [("vide", ""), ("point", "."), ("parent", ".."), ("deux-noms", "a/b"), ("barre-finale", "a/")];

    /// Une bibliothèque d’épreuve, avec deux témoins qui doivent survivre à tout refus.
    ///
    /// Le premier est **hors de `derives/`** : un nom vide ferait viser tout `derives/`. Le second
    /// est une **autre version**, dans `derives/` : un `..` ferait viser la bibliothèque entière.
    fn bibliotheque_a_retirer(nom: &str) -> (Depot, PathBuf, String) {
        let (depot, racine) = depot_neuf(nom);
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        let empreinte = "ab".to_owned() + &"c".repeat(62);
        let palier = depot.racine().join(SOURCES).join(&empreinte[..2]);
        fs::create_dir_all(&palier).expect("palier");
        fs::write(palier.join(format!("{empreinte}.pdf")), b"x").expect("source");
        depot.ecrire_version("v-saine", r#"{"vue":{"pages":[]}}"#).expect("version");
        depot.activer(&empreinte, "v-saine", 1).expect("activée");
        fs::create_dir_all(depot.racine().join(DERIVES).join("v-saine")).expect("dérivés");
        fs::write(depot.racine().join(DERIVES).join("v-saine").join("page.webp"), b"i").expect("image");
        fs::create_dir_all(depot.travaux()).expect("travaux");
        fs::create_dir_all(racine.join("temoin")).expect("témoin");
        fs::write(racine.join("temoin").join("a-garder.txt"), b"temoin").expect("témoin écrit");
        fs::create_dir_all(depot.racine().join(DERIVES).join("v-voisine")).expect("voisine");
        fs::write(depot.racine().join(DERIVES).join("v-voisine").join("page.webp"), b"j").expect("voisine");
        (depot, racine, empreinte)
    }

    /// Ce qu’un refus doit avoir laissé intact : les deux témoins, la version saine, la source.
    fn rien_n_a_bouge(depot: &Depot, racine: &Path, empreinte: &str, cas: &str) {
        assert!(
            racine.join("temoin").join("a-garder.txt").exists(),
            "{cas} : le témoin hors de derives doit survivre",
        );
        assert!(
            depot.racine().join(DERIVES).join("v-saine").join("page.webp").exists(),
            "{cas} : les dérivés de la version saine doivent survivre",
        );
        assert!(
            depot.racine().join(DERIVES).join("v-voisine").join("page.webp").exists(),
            "{cas} : les dérivés de la version voisine doivent survivre",
        );
        assert!(
            depot.racine().join(BASE).join(VERSIONS).join("v-saine.json").exists(),
            "{cas} : le fichier de la version saine doit survivre",
        );
        assert!(
            depot.racine().join(SOURCES).join("ab").join(format!("{empreinte}.pdf")).exists(),
            "{cas} : la source doit rester dans la bibliothèque",
        );
    }

    /// Un nom de version abîmé dans `base/actives.json` refuse le retrait **entier**, et rien n’est
    /// écrit ni effacé (HER-07, dette D28).
    ///
    /// C’est la porte du disque. Le refus arrive **avant la première écriture** : `actives.json` et
    /// le fichier de travail sont relus et comparés **au bit près**.
    #[test]
    fn un_nom_abime_dans_actives_refuse_le_retrait_sans_rien_ecrire() {
        for (etiquette, abime) in NOMS_SANS_DANGER {
            let (depot, racine, empreinte) = bibliotheque_a_retirer(&format!("actives-{etiquette}"));
            let travail = depot.travaux().join("t-un.json");
            fs::write(
                &travail,
                format!(r#"{{"id":"t-un","empreinte":"{empreinte}","version_cible":"v-saine"}}"#),
            )
            .expect("travail");

            let mut table = depot.actives().expect("actives");
            table.insert(empreinte.clone(), Pointeur { version: abime.to_owned(), activee_le: 1 });
            depot.ecrire_actives(&table).expect("actives abîmées");

            let avant_actives = fs::read(racine.join(BASE).join(ACTIVES)).expect("actives lues");
            let avant_travail = fs::read(&travail).expect("travail lu");

            let refus = depot.retirer_document(&empreinte).expect_err(&format!(
                "« {abime} » dans actives.json doit refuser le retrait"
            ));
            assert!(
                refus.to_string().contains("actives.json"),
                "{etiquette} : le refus doit nommer le fichier à réparer : {refus}",
            );
            assert_eq!(
                fs::read(racine.join(BASE).join(ACTIVES)).expect("actives relues"),
                avant_actives,
                "{etiquette} : actives.json doit être intact au bit près",
            );
            assert_eq!(
                fs::read(&travail).expect("travail relu"),
                avant_travail,
                "{etiquette} : le fichier de travail doit être intact au bit près",
            );
            rien_n_a_bouge(&depot, &racine, &empreinte, etiquette);
            fs::remove_dir_all(&racine).ok();
        }
    }

    /// Un `version_cible` abîmé dans un fichier de travail refuse le retrait **entier** (HER-07,
    /// dette D28).
    ///
    /// La seconde porte du disque, et la plus traîtresse : l’ancien code effaçait les fichiers de
    /// travail **pendant** qu’il les lisait, donc un nom invalide trouvé au troisième laissait les
    /// deux premiers déjà partis.
    #[test]
    fn un_nom_abime_dans_un_travail_refuse_le_retrait_sans_rien_ecrire() {
        for (etiquette, abime) in NOMS_SANS_DANGER {
            let (depot, racine, empreinte) = bibliotheque_a_retirer(&format!("travail-{etiquette}"));
            let sain = depot.travaux().join("t-sain.json");
            fs::write(
                &sain,
                format!(r#"{{"id":"t-sain","empreinte":"{empreinte}","version_cible":"v-saine"}}"#),
            )
            .expect("travail sain");
            let abime_chemin = depot.travaux().join("t-abime.json");
            fs::write(
                &abime_chemin,
                format!(r#"{{"id":"t-abime","empreinte":"{empreinte}","version_cible":"{abime}"}}"#),
            )
            .expect("travail abîmé");

            let avant_actives = fs::read(racine.join(BASE).join(ACTIVES)).expect("actives lues");
            let avant_sain = fs::read(&sain).expect("travail sain lu");

            let refus = depot.retirer_document(&empreinte).expect_err(&format!(
                "« {abime} » dans un fichier de travail doit refuser le retrait"
            ));
            assert!(
                refus.to_string().contains("t-abime.json"),
                "{etiquette} : le refus doit nommer le fichier de travail à réparer : {refus}",
            );
            assert_eq!(
                fs::read(racine.join(BASE).join(ACTIVES)).expect("actives relues"),
                avant_actives,
                "{etiquette} : actives.json doit être intact au bit près",
            );
            assert_eq!(
                fs::read(&sain).expect("travail sain relu"),
                avant_sain,
                "{etiquette} : le fichier de travail sain doit être intact au bit près",
            );
            assert!(abime_chemin.exists(), "{etiquette} : le fichier abîmé reste, à réparer");
            rien_n_a_bouge(&depot, &racine, &empreinte, etiquette);
            fs::remove_dir_all(&racine).ok();
        }
    }
}


#[cfg(test)]
mod actives {
    use super::*;
    use std::fs;

    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-actives-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        // **La corbeille vit dans le bac, à côté de la racine, et jamais chez la personne.**
        // Elle est posée ICI plutôt que par chaque contrôle : un réglage qu'on peut oublier
        // se perd, et c'est exactement ce qui est arrivé le 25 novembre 2026.
        let corbeille = racine.with_extension("corbeille");
        let _ = fs::remove_dir_all(&corbeille);
        (Depot::creer(&racine).expect("dépôt créé").avec_corbeille(corbeille), racine)
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
        // **La corbeille vit dans le bac, à côté de la racine, et jamais chez la personne.**
        // Elle est posée ICI plutôt que par chaque contrôle : un réglage qu'on peut oublier
        // se perd, et c'est exactement ce qui est arrivé le 25 novembre 2026.
        let corbeille = racine.with_extension("corbeille");
        let _ = fs::remove_dir_all(&corbeille);
        (Depot::creer(&racine).expect("dépôt créé").avec_corbeille(corbeille), racine)
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
        // **La corbeille vit dans le bac, à côté de la racine, et jamais chez la personne.**
        // Elle est posée ICI plutôt que par chaque contrôle : un réglage qu'on peut oublier
        // se perd, et c'est exactement ce qui est arrivé le 25 novembre 2026.
        let corbeille = racine.with_extension("corbeille");
        let _ = fs::remove_dir_all(&corbeille);
        (Depot::creer(&racine).expect("dépôt créé").avec_corbeille(corbeille), racine)
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

    #[test]
    fn les_decisions_survivent_a_la_reouverture_et_s_annulent_ux_03_syn_07() {
        let (depot, racine) = depot_neuf("decisions");
        depot.decider(A, "cas-1", "confirme").expect("première décision");
        depot.decider(A, "cas-2", "ignore").expect("seconde décision");

        let rouvert = Depot::ouvrir(&racine).expect("bibliothèque rouverte");
        assert_eq!(rouvert.decisions(A).expect("décisions").len(), 2);
        rouvert.annuler_decision(A, "cas-2").expect("annulation");
        assert_eq!(rouvert.decisions(A).expect("décisions").get("cas-1").map(String::as_str), Some("confirme"));
        assert!(!rouvert.decisions(A).expect("décisions").contains_key("cas-2"));
        fs::remove_dir_all(&racine).ok();
    }

    #[test]
    fn les_rotations_manuelles_survivent_par_document_et_par_page() {
        let (depot, racine) = depot_neuf("rotations-manuelles");
        depot.tourner_page(A, 12, 90).expect("premier quart de tour");
        depot.tourner_page(A, 13, 270).expect("second quart de tour");

        let rouvert = Depot::ouvrir(&racine).expect("bibliothèque rouverte");
        let rotations = rouvert.rotations_manuelles(A).expect("rotations relues");
        assert_eq!(rotations.get(&12), Some(&90));
        assert_eq!(rotations.get(&13), Some(&270));
        assert_eq!(rotations.len(), 2, "les pages d'un autre document ne doivent pas entrer ici");
        fs::remove_dir_all(&racine).ok();
    }
}

/// L'empreinte se valide, et un refus n'est pas une panique (dette D31, lot `0z nonies`).
#[cfg(test)]
mod empreinte {
    use super::empreinte_de_document;

    const BONNE: &str = "3b1f8d0c5a7e2946bd04f83c6e1a7520d9c48b36ef50172a8d6c3b9f04e7a128";

    #[test]
    fn une_empreinte_de_64_chiffres_hexadecimaux_minuscules_passe() {
        assert_eq!(BONNE.len(), 64, "la fixture elle-même doit faire 64 caractères");
        assert_eq!(empreinte_de_document(BONNE, "l'épreuve").expect("acceptée"), BONNE);
    }

    /// Chacun de ces noms REFUSE, et aucun ne panique.
    ///
    /// `"€a9f"` est le cas qui a nommé la dette : six octets pour quatre caractères, donc
    /// l'ancienne garde `len() < 2` le laissait passer et `&empreinte[..2]` paniquait à
    /// l'intérieur du `€`. `"€€€"` est celui de l'affichage, neuf octets. Les majuscules sont
    /// refusées parce que le contrat n'en connaît pas : deux écritures feraient deux rangements.
    #[test]
    fn tout_le_reste_refuse_proprement_et_ne_panique_jamais() {
        let majuscules = BONNE.to_uppercase();
        let soixante_trois = &BONNE[..63];
        let soixante_cinq = format!("{BONNE}a");
        for abime in [
            "€a9f",
            "€€€",
            soixante_trois,
            soixante_cinq.as_str(),
            majuscules.as_str(),
            "",
            "../..",
            "/etc",
            "3b1f8d0c5a7e2946bd04f83c6e1a7520d9c48b36ef50172a8d6c3b9f04e7a12g",
        ] {
            let refus = empreinte_de_document(abime, "l'épreuve")
                .expect_err(&format!("« {abime} » doit être refusée, et non acceptée"));
            assert!(
                refus.to_string().contains("Empreinte invalide"),
                "« {abime} » : le refus doit se nommer — {refus}"
            );
        }
    }

    /// Le palier d'une source se prend sur une empreinte validée, donc il ne peut plus paniquer.
    #[test]
    fn le_chemin_d_une_source_ne_panique_sur_aucune_entree() {
        let racine = std::env::temp_dir().join(format!("lienotheque-palier-{}", std::process::id()));
        std::fs::remove_dir_all(&racine).ok();
        let depot = super::Depot::creer(&racine).expect("bibliothèque d'épreuve");
        for abime in ["€a9f", "€", "", "a", BONNE] {
            let chemin = depot.source(abime, "pdf");
            assert!(chemin.starts_with(&racine), "« {abime} » sort de la bibliothèque : {chemin:?}");
        }
        std::fs::remove_dir_all(&racine).ok();
    }
}

/// **Ce qu'un retrait n'a pas pu emporter est nommé, et ne rend pas d'erreur** (HER-07, dette D32).
///
/// Ce module éprouve la seule chose que l'ancienne forme ne savait pas faire : échouer **en le
/// disant**. Trois `let _ =` avalaient les effacements, et deux comptes étaient établis avant le
/// geste ; une bibliothèque pouvait donc rester entière derrière un « Document retiré ».
///
/// ## Comment on provoque un échec sans casser la machine
///
/// En retirant les droits d'écriture sur un dossier du **dossier temporaire**, puis en les
/// rendant avant le nettoyage. Rien d'autre ne tombe sous ces contrôles, et c'est pourquoi la
/// racine vient d'ici et de nulle part ailleurs : `std::env::temp_dir()`.
///
/// ## Pourquoi `#[cfg(unix)]`, et ce qui est prévu pour Windows
///
/// Un dossier en lecture seule n'empêche pas d'y supprimer un fichier sous Windows : l'équivalent
/// y est une **poignée ouverte** sur le fichier, qui rend la suppression impossible le temps
/// qu'elle vit. Windows est suspendu — non abandonné — par la décision du 5 novembre 2026, et ces
/// contrôles-là s'écriront au retour de `windows-latest` dans les matrices. Le reste du module,
/// qui n'a pas besoin de droits, ne porte aucune garde.
#[cfg(test)]
mod restes {
    use super::*;

    /// La racine est **ici** liée au dossier temporaire, et non dans un module voisin : un
    /// garde-fou qui lit les liaisons d'un autre module acquitterait ce code pour la mauvaise
    /// raison, et c'est exactement le défaut A du 21 novembre 2026.
    fn depot_neuf(nom: &str) -> (Depot, PathBuf) {
        let racine = std::env::temp_dir().join(format!("lienotheque-restes-{nom}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&racine);
        // **La corbeille vit dans le bac, à côté de la racine, et jamais chez la personne.**
        // Elle est posée ICI plutôt que par chaque contrôle : un réglage qu'on peut oublier
        // se perd, et c'est exactement ce qui est arrivé le 25 novembre 2026.
        let corbeille = racine.with_extension("corbeille");
        let _ = fs::remove_dir_all(&corbeille);
        (Depot::creer(&racine).expect("dépôt créé").avec_corbeille(corbeille), racine)
    }

    const EMPREINTE: &str = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const VERSION: &str = "v-une";

    /// Un document complet : source, pointeur, version, dérivés, travail, classement.
    fn un_document_entier(nom: &str) -> (Depot, PathBuf) {
        let (depot, racine) = depot_neuf(nom);
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        let palier = depot.racine().join(SOURCES).join(&EMPREINTE[..2]);
        fs::create_dir_all(&palier).expect("palier");
        fs::write(palier.join(format!("{EMPREINTE}.pdf")), b"x").expect("source");
        depot.ecrire_version(VERSION, r#"{"vue":{"pages":[]}}"#).expect("version");
        depot.activer(EMPREINTE, VERSION, 1).expect("activée");
        let pages = depot.racine().join(DERIVES).join(VERSION).join("pages");
        fs::create_dir_all(&pages).expect("dérivés");
        fs::write(pages.join("page-0001.webp"), b"i").expect("image");
        fs::create_dir_all(depot.travaux()).expect("travaux");
        fs::write(
            depot.travaux().join("t-un.json"),
            format!(r#"{{"id":"t-un","empreinte":"{EMPREINTE}","version_cible":"{VERSION}"}}"#),
        )
        .expect("travail");
        depot.classer(EMPREINTE, &serde_json::json!({ "axe": "une valeur" })).expect("classé");
        (depot, racine)
    }

    #[cfg(unix)]
    fn droits(chemin: &Path, mode: u32) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(chemin, fs::Permissions::from_mode(mode)).expect("droits posés");
    }

    /// Les images de page qui résistent : **pas d'erreur**, un reste nommé, et la version ne
    /// compte pas.
    ///
    /// C'est le cœur du lot. L'ancienne forme avalait cet échec et annonçait « 1 version » : des
    /// centaines de mégaoctets restaient sur le disque, qu'aucun écran ne peut atteindre puisque
    /// les écrans lisent la table des versions actives, et le compte rendu disait le contraire.
    #[cfg(unix)]
    #[test]
    fn des_images_de_page_qui_resistent_ne_rendent_pas_d_erreur_et_se_nomment() {
        let (depot, racine) = un_document_entier("images");
        let derives = depot.racine().join(DERIVES).join(VERSION);
        // Lecture et parcours permis, écriture refusée : le `remove_dir_all` échoue au premier
        // fichier à délier.
        droits(&derives, 0o555);

        let retrait = depot.retirer_document(EMPREINTE).expect("un échec d'effacement ne rend pas d'erreur");

        droits(&derives, 0o755);

        assert_eq!(retrait.restes.len(), 1, "un reste, et un seul : {:?}", retrait.restes);
        let reste = &retrait.restes[0];
        assert_eq!(reste.quoi, RESTE_IMAGES);
        assert_eq!(reste.chemin, derives, "le reste doit nommer le dossier qui est resté");
        assert!(!reste.cause.is_empty(), "un reste sans cause ne se répare pas");

        // **Le compte ne compte que ce qui est parti.** L'enregistrement de version est bien
        // effacé, mais les images restent : la version n'est pas retirée, et le dire serait faux.
        assert_eq!(retrait.versions, 0, "une version dont les images restent n'est pas retirée");
        assert!(
            !depot.racine().join(BASE).join(VERSIONS).join(format!("{VERSION}.json")).exists(),
            "l'enregistrement de version, lui, devait partir : les deux effacements sont indépendants",
        );
        // **`remove_dir_all` n'est pas indivisible, et c'est une raison de plus de nommer le
        // chemin** : mesuré ici, il a bien délié l'image — le dossier `pages` qui la portait avait
        // ses droits — puis il a échoué à retirer `pages` du dossier verrouillé. Ce qui reste est
        // donc un arbre **partiel**, que ni un compte ni un booléen ne décriraient. Dire « il
        // reste ceci, à cet endroit » est la seule forme qui se répare.
        assert!(derives.exists(), "le dossier des dérivés est resté, et c'est le sujet");
        assert!(derives.join("pages").exists(), "l'effacement s'est arrêté en route, sans tout emporter");

        // Et tout le reste du retrait a bien eu lieu : un échec n'arrête pas les autres gestes.
        assert_eq!(retrait.travaux, 1);
        assert!(!depot.actives().expect("actives").contains_key(EMPREINTE));
        assert!(depot.classement(EMPREINTE).expect("classements").is_none());
        let jetee = retrait.source.clone().expect("la source devait partir à la corbeille");
        assert!(jetee.exists());

        // Le bac emporte sa corbeille : elle vit à côté de la racine, dans le dossier
        // temporaire, et rien ici n'a jamais touché celle de la personne.
        let corbeille = racine.with_extension("corbeille");
        fs::remove_dir_all(&corbeille).ok();
        fs::remove_dir_all(&racine).ok();
    }

    /// Un fichier de travail qui résiste : il ne se compte pas comme retiré.
    ///
    /// `travaux` valait la **taille de la liste**, lue avant le premier effacement. Ce contrôle
    /// est celui qu'aucune mesure ne passait : un travail resté sur place peut ressusciter le
    /// pointeur au prochain lancement, par `migrer_les_actives`.
    #[cfg(unix)]
    #[test]
    fn un_fichier_de_travail_qui_resiste_ne_se_compte_pas_comme_retire() {
        let (depot, racine) = un_document_entier("travail");
        let dossier = depot.travaux();
        droits(&dossier, 0o555);

        let retrait = depot.retirer_document(EMPREINTE).expect("un échec d'effacement ne rend pas d'erreur");

        droits(&dossier, 0o755);

        assert_eq!(retrait.travaux, 0, "rien n'est parti : le compte doit le dire");
        assert!(dossier.join("t-un.json").exists(), "le travail est resté, et c'est le sujet");
        assert_eq!(retrait.restes.len(), 1, "{:?}", retrait.restes);
        assert_eq!(retrait.restes[0].quoi, RESTE_TRAVAIL);
        assert_eq!(retrait.restes[0].chemin, dossier.join("t-un.json"));
        // La version, elle, est partie entière : les deux fichiers ont cédé.
        assert_eq!(retrait.versions, 1);

        assert!(retrait.source.is_some(), "la source devait partir à la corbeille du bac");
        fs::remove_dir_all(&racine).ok();
    }

    /// Une source qui ne peut pas partir : le compte rendu ne la dit **pas** jetée.
    ///
    /// C'est le mensonge le plus direct de l'ancienne forme : `jetee` restait vide et l'écran
    /// écrivait « Sa source n'y était plus » d'une source intacte.
    #[cfg(unix)]
    #[test]
    fn une_source_qui_ne_peut_pas_partir_est_nommee_et_jamais_dite_jetee() {
        let (depot, racine) = un_document_entier("source");
        let palier = depot.racine().join(SOURCES).join(&EMPREINTE[..2]);
        droits(&palier, 0o555);

        let retrait = depot.retirer_document(EMPREINTE).expect("un échec d'effacement ne rend pas d'erreur");

        droits(&palier, 0o755);

        assert!(retrait.source.is_none(), "rien n'est allé à la corbeille : ne pas le dire");
        assert!(palier.join(format!("{EMPREINTE}.pdf")).exists(), "la source est restée, et c'est le sujet");
        assert_eq!(retrait.restes.len(), 1, "{:?}", retrait.restes);
        assert_eq!(retrait.restes[0].quoi, RESTE_SOURCE);
        assert_eq!(retrait.restes[0].chemin, palier.join(format!("{EMPREINTE}.pdf")));

        fs::remove_dir_all(&racine).ok();
    }

    /// Un dossier de travaux illisible **refuse**, et avant d'avoir rien écrit.
    ///
    /// Avalée, cette panne faisait trouver zéro travail : le pointeur partait en laissant derrière
    /// lui le fichier qui le ressuscite, et le compte rendu annonçait « 0 travail ».
    #[cfg(unix)]
    #[test]
    fn un_dossier_de_travaux_illisible_refuse_avant_d_ecrire() {
        let (depot, racine) = un_document_entier("travaux-illisibles");
        let dossier = depot.travaux();
        droits(&dossier, 0o000);

        let refus = depot.retirer_document(EMPREINTE).expect_err("un dossier illisible doit refuser");

        droits(&dossier, 0o755);

        assert!(refus.to_string().contains("illisible"), "« {refus} » devrait nommer la panne");
        assert!(refus.to_string().contains("travaux"), "« {refus} » devrait nommer le dossier");
        // **Rien n'a bougé.** C'est la promesse de la phase de lecture.
        assert!(depot.actives().expect("actives").contains_key(EMPREINTE), "le pointeur devait rester");
        assert!(depot.racine().join(DERIVES).join(VERSION).exists(), "les dérivés devaient rester");
        assert!(depot.classement(EMPREINTE).expect("classements").is_some(), "le classement devait rester");
        assert!(
            depot.racine().join(SOURCES).join(&EMPREINTE[..2]).join(format!("{EMPREINTE}.pdf")).exists(),
            "la source devait rester",
        );

        fs::remove_dir_all(&racine).ok();
    }

    /// Un palier de sources illisible refuse lui aussi, et pour la même raison.
    #[cfg(unix)]
    #[test]
    fn un_palier_de_sources_illisible_refuse_avant_d_ecrire() {
        let (depot, racine) = un_document_entier("palier-illisible");
        let palier = depot.racine().join(SOURCES).join(&EMPREINTE[..2]);
        droits(&palier, 0o000);

        let refus = depot.retirer_document(EMPREINTE).expect_err("un palier illisible doit refuser");

        droits(&palier, 0o755);

        assert!(refus.to_string().contains("illisible"), "« {refus} » devrait nommer la panne");
        assert!(depot.actives().expect("actives").contains_key(EMPREINTE), "le pointeur devait rester");
        assert!(depot.racine().join(DERIVES).join(VERSION).exists(), "les dérivés devaient rester");

        fs::remove_dir_all(&racine).ok();
    }

    /// Un travail abîmé est **compté**, et sa version n'est pas réputée cherchée.
    ///
    /// Sans droits à manipuler : il suffit d'un fichier que `serde_json` refuse. Un travail
    /// illisible a pu désigner une version de ce document, et c'est précisément ce qu'on ne peut
    /// pas savoir — le taire ferait passer le retrait pour complet.
    #[test]
    fn un_travail_abime_est_compte_et_dit() {
        let (depot, racine) = un_document_entier("travail-abime");
        fs::write(depot.travaux().join("casse.json"), b"{ ceci n'est pas du JSON").expect("travail abîmé");

        let retrait = depot.retirer_document(EMPREINTE).expect("un travail abîmé n'empêche pas le retrait");

        assert_eq!(retrait.travaux_illisibles, 1, "le travail abîmé devait être compté");
        assert_eq!(retrait.travaux, 1, "le travail sain, lui, est bien parti");
        assert_eq!(retrait.versions, 1);
        assert_eq!(retrait.restes.len(), 0, "un travail abîmé n'est pas un reste : c'est une mesure");
        assert!(depot.travaux().join("casse.json").exists(), "on ne retire pas un fichier qu'on n'a pas su lire");

        assert!(retrait.source.is_some(), "la source devait partir à la corbeille du bac");
        fs::remove_dir_all(&racine).ok();
    }

    /// La source du produit, relue sur le disque : un contrôle de structure doit lire le fichier
    /// **tel qu'il est**, sinon une mutation ne le ferait pas tomber.
    fn source_du_depot() -> String {
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src").join("depot.rs"))
            .expect("la source du dépôt doit être lisible")
    }

    /// Le corps de `retirer_document`, de son `{` à l'accolade qui le ferme.
    fn corps_du_retrait(source: &str) -> String {
        let debut = source
            .find("pub fn retirer_document(")
            .expect("la signature de retirer_document doit être là");
        let reste = &source[debut..];
        let ouverture = reste.find('{').expect("une fonction a une accolade");
        let mut profondeur = 0_i32;
        for (place, caractere) in reste[ouverture..].char_indices() {
            if caractere == '{' {
                profondeur += 1;
            } else if caractere == '}' {
                profondeur -= 1;
                if profondeur == 0 {
                    return reste[ouverture..ouverture + place].to_owned();
                }
            }
        }
        panic!("corps non fermé")
    }

    /// Les lignes de code seules : un `?` dans un commentaire n'est pas un `?` de Rust.
    fn sans_les_commentaires(corps: &str) -> String {
        corps
            .lines()
            .filter(|ligne| !ligne.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    const FRONTIERE: &str = "self.ecrire_actives(&table)?;";

    /// **L'ordre est tenu par le code, et une mutation qui l'inverse fait tomber ce contrôle.**
    ///
    /// Aucune mesure de comportement ne peut l'attraper : passé la frontière, plus rien ne rend
    /// d'erreur, donc un pointeur écrit en dernier produirait exactement le même compte rendu. Et
    /// l'ordre n'est pas un détail de forme — il porte trois propriétés mesurées, écrites dans la
    /// documentation de la fonction : les quatre vues s'éteignent d'un geste indivisible, l'index
    /// de recherche se répare, et un arrêt brutal se rattrape par `migrer_les_actives`. C'est donc
    /// un contrôle de **structure**, et il le dit.
    #[test]
    fn le_pointeur_s_ecrit_avant_le_premier_effacement() {
        let corps = sans_les_commentaires(&corps_du_retrait(&source_du_depot()));
        let frontiere = corps.find(FRONTIERE).expect("la première écriture doit être là");
        let premier_effacement = corps
            .find("fs::remove_")
            .expect("le retrait doit bien effacer quelque chose");
        assert!(
            frontiere < premier_effacement,
            "le pointeur doit partir AVANT le premier effacement : sans quoi un document resterait \
             visible, et trouvable par la recherche, en désignant des données déjà effacées",
        );
    }

    /// **Passé la frontière, plus rien ne rend d'erreur.**
    ///
    /// Ce n'est pas dire que plus rien n'échoue : les trois effacements, l'écriture des
    /// classements et le déplacement vers la corbeille restent faillibles, et c'est tout le sujet
    /// des restes. C'est dire qu'un échec ne se rend plus comme un refus — « Retrait impossible »
    /// d'un document qui a déjà quitté le catalogue était faux, et c'est ce que l'écran affichait.
    ///
    /// Le contrôle est structurel parce que la propriété l'est : il n'y a pas d'échec de disque
    /// qu'on puisse provoquer sur chacun des six `?` de l'ancienne forme.
    #[test]
    fn aucun_point_d_interrogation_ne_subsiste_apres_la_frontiere() {
        let corps = sans_les_commentaires(&corps_du_retrait(&source_du_depot()));
        let frontiere = corps.find(FRONTIERE).expect("la première écriture doit être là");
        let apres = &corps[frontiere + FRONTIERE.len()..];
        let fautifs: Vec<&str> = apres
            .lines()
            .filter(|ligne| ligne.contains('?'))
            .map(str::trim)
            .collect();
        assert!(
            fautifs.is_empty(),
            "ces lignes rendent une erreur après la frontière, là où il faut collecter : {fautifs:?}",
        );
    }

    /// Et **aucun effacement avalé** ne subsiste dans la fonction.
    ///
    /// Les contrôles de comportement ci-dessus tombent déjà si l'un revient — un reste manquant se
    /// voit. Celui-ci dit la règle plutôt que ses conséquences, et il la dit sur le texte : les
    /// trois `let _ = fs::remove_…` étaient la dette D32, et un quatrième se poserait un jour sans
    /// que personne pense à écrire son contrôle de comportement.
    #[test]
    fn aucun_effacement_n_est_avale_dans_le_retrait() {
        let corps = sans_les_commentaires(&corps_du_retrait(&source_du_depot()));
        let avales: Vec<&str> = corps
            .lines()
            .map(str::trim)
            .filter(|ligne| ligne.starts_with("let _ =") && ligne.contains("fs::remove"))
            .collect();
        assert!(avales.is_empty(), "un effacement avalé est revenu : {avales:?}");
    }

    /// Une plage de code atteint-elle la corbeille de la personne ?
    ///
    /// Deux formes, et elles disent un **usage** : composer le chemin de la corbeille du système,
    /// ou demander le dossier personnel. Le simple mot « .Trash » n'en est pas une — un message
    /// d'erreur le nomme, et un garde-fou qui accuse à tort finit désarmé.
    fn jette_chez_la_personne(plage: &str) -> bool {
        // Les aiguilles sont **assemblées**. Écrites en clair, elles se trouveraient elles-mêmes :
        // ce module serait accusé par son propre relevé, et il l'a été avant cette correction.
        plage.contains(concat!(".join(\"", ".Trash", "\")")) || plage.contains(concat!("dossier_", "personnel("))
    }

    /// **Aucun contrôle n'écrit dans la corbeille de la personne**, et le code le garantit.
    ///
    /// Le 25 novembre 2026, les contrôles du retrait jetaient dans la vraie `~/.Trash` et l'en
    /// retiraient ensuite. Deux courses s'y sont croisées, un fichier d'une course précédente y
    /// est resté, et il a été effacé **sans l'accord de Christophe** — contrairement à la règle du
    /// 18 novembre 2026. La mesure empirique — compter la corbeille avant et après une course —
    /// dit l'état d'un jour ; celui-ci dit la règle, et il tombe si l'un des réglages disparaît.
    ///
    /// Les trois choses qu'il tient :
    ///
    /// 1. **chaque fabrique de dépôt d'épreuve pose une corbeille** — un réglage qu'on peut
    ///    oublier se perd, donc aucun contrôle n'a le choix ;
    /// 2. aucun module de contrôle ne nomme `.Trash` ni n'appelle `dossier_personnel` ;
    /// 3. le produit ne nomme `.Trash` **qu'une fois**, dans `corbeille()` : deux endroits, et
    ///    l'un des deux finirait par échapper au réglage.
    #[test]
    fn aucun_controle_n_ecrit_dans_la_corbeille_de_la_personne() {
        let source = source_du_depot();

        // 1. Toutes les fabriques, et chacune avec son réglage.
        let fabriques = source.matches("fn depot_neuf(nom: &str) -> (Depot, PathBuf)").count();
        assert!(fabriques >= 5, "seulement {fabriques} fabriques trouvées : le relevé ne mesure rien");
        assert_eq!(
            source.matches("avec_corbeille(corbeille)").count(),
            fabriques,
            "une fabrique de dépôt d'épreuve ne pose pas de corbeille : ses contrôles jetteraient chez la personne",
        );

        // 2. Les plages de contrôles, lues une par une.
        let mut reste = source.as_str();
        let mut plages = 0;
        while let Some(place) = reste.find("#[cfg(test)]\nmod ") {
            let depuis = &reste[place..];
            let fin = depuis[1..].find("\n#[cfg(test)]\nmod ").map_or(depuis.len(), |d| d + 1);
            let plage = &depuis[..fin];
            plages += 1;
            // On juge l'**usage**, pas le mot : ce contrôle-ci nomme forcément `.Trash` dans ses
            // messages, et s'accuserait lui-même. C'est la leçon du garde-fou des effacements, qui
            // lit à travers un masque pour la même raison. Les deux formes cherchées ici ne
            // paraissent pas dans sa propre source, où elles sont échappées ou citées.
            let nom = plage.lines().nth(1).unwrap_or("?").trim();
            assert!(
                !jette_chez_la_personne(plage),
                "« {nom} » atteint la corbeille de la personne : il y écrirait",
            );
            reste = &depuis[fin..];
        }
        assert!(plages >= 5, "seulement {plages} plages de contrôles lues : le relevé ne mesure rien");

        // 3. Le produit, une seule porte.
        assert_eq!(
            source.matches(".join(\".Trash\")").count(),
            1,
            "`.Trash` doit être nommé une seule fois, dans `corbeille()`",
        );

        // Et la sonde : un relevé qui ne sait pas accuser ne vaut rien. Les deux formes qu'un
        // contrôle emploierait s'il jetait chez la personne sont bien reconnues, et une phrase
        // qui ne fait que les nommer ne l'est pas.
        // Les aiguilles sont **assemblées**, jamais écrites en clair : une sonde qui les écrit
        // telles quelles se fait accuser par le relevé qu'elle éprouve. C'est arrivé ici même.
        let corbeille_du_systeme = concat!(".join(\"", ".Trash", "\")");
        let demande_du_foyer = concat!("dossier_", "personnel(");
        assert!(jette_chez_la_personne(&format!("let c = foyer()?{corbeille_du_systeme};")));
        assert!(jette_chez_la_personne(&format!("let c = {demande_du_foyer})?;")));
        assert!(
            !jette_chez_la_personne("// un contrôle n'écrit pas dans la corbeille du compte"),
            "nommer la règle n'est pas l'enfreindre",
        );
    }

    /// Un effacement qui ne trouve **rien** a obtenu ce qu'on voulait.
    ///
    /// Un document composé en texte n'a aucune image de page : son `derives/<version>/` n'a jamais
    /// existé. Compter cette absence comme un échec nommerait un reste qui n'existe pas — et un
    /// compte rendu qui accuse à tort ne se lit plus.
    #[test]
    fn une_version_sans_derives_compte_comme_retiree() {
        let (depot, racine) = depot_neuf("sans-derives");
        depot.ecrire_description(r#"{"nom":"Essai"}"#).expect("description");
        depot.ecrire_version(VERSION, r#"{"vue":{"pages":[]},"passages":[]}"#).expect("version");
        depot.activer(EMPREINTE, VERSION, 1).expect("activée");

        let retrait = depot.retirer_document(EMPREINTE).expect("retiré");

        assert_eq!(retrait.versions, 1, "une version sans dérivés est retirée entière");
        assert_eq!(retrait.restes.len(), 0, "l'absence de dérivés n'est pas un reste : {:?}", retrait.restes);
        assert!(retrait.source.is_none(), "ce document n'avait pas de source déposée");

        fs::remove_dir_all(&racine).ok();
    }
}
