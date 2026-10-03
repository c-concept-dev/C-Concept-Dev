//! Serveur local de médias par plages d'octets : condition de la lecture d'un MP3 par
//! segments sans charger le fichier entier (optimisations de lecture du CDC).

use serde::Serialize;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    net::{Ipv4Addr, SocketAddrV4, TcpListener},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    thread,
};
use tiny_http::{Header, Response, Server, StatusCode};

#[derive(Serialize, Clone, Debug)]
pub struct Servi {
    pub port: u16,
    pub url: String,
    pub octets: u64,
}

pub struct Serveur {
    pub infos: Servi,
    /// Nombre de requêtes servies en 206 : preuve que la lecture se fait bien par plages.
    pub plages_servies: Arc<AtomicU64>,
}

fn entete(nom: &str, valeur: &str) -> Header {
    Header::from_bytes(nom.as_bytes(), valeur.as_bytes()).expect("en-tête valide")
}

/// `bytes=100-199`, `bytes=100-` ou `bytes=-500` → (debut, fin) inclusifs, bornés à la taille.
pub fn analyser_plage(brut: &str, taille: u64) -> Option<(u64, u64)> {
    let intervalle = brut.strip_prefix("bytes=")?.split(',').next()?.trim();
    let (gauche, droite) = intervalle.split_once('-')?;
    let (debut, fin) = match (gauche.trim(), droite.trim()) {
        ("", "") => return None,
        ("", derniers) => {
            let n: u64 = derniers.parse().ok()?;
            (taille.saturating_sub(n.min(taille)), taille.saturating_sub(1))
        }
        (depuis, "") => (depuis.parse().ok()?, taille.saturating_sub(1)),
        (depuis, jusqua) => (depuis.parse().ok()?, jusqua.parse::<u64>().ok()?.min(taille.saturating_sub(1))),
    };
    if taille == 0 || debut > fin || debut >= taille {
        return None;
    }
    Some((debut, fin))
}

/// Démarre le serveur sur un port libre de la boucle locale. Il s'arrête avec le processus.
pub fn servir(chemin: PathBuf, type_mime: &str) -> Result<Serveur, String> {
    let octets = std::fs::metadata(&chemin).map_err(|e| e.to_string())?.len();
    let ecoute = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
    let port = ecoute.local_addr().map_err(|e| e.to_string())?.port();
    let serveur = Server::from_listener(ecoute, None).map_err(|e| e.to_string())?;

    let plages_servies = Arc::new(AtomicU64::new(0));
    let compteur = Arc::clone(&plages_servies);
    let mime = type_mime.to_owned();

    thread::spawn(move || {
        for requete in serveur.incoming_requests() {
            let plage = requete
                .headers()
                .iter()
                .find(|h| h.field.equiv("Range"))
                .and_then(|h| analyser_plage(h.value.as_str(), octets));

            let Ok(mut fichier) = File::open(&chemin) else {
                let _ = requete.respond(Response::empty(StatusCode(500)));
                continue;
            };

            let commun = [entete("Accept-Ranges", "bytes"), entete("Content-Type", &mime)];

            let reponse = match plage {
                Some((debut, fin)) => {
                    compteur.fetch_add(1, Ordering::Relaxed);
                    let longueur = fin - debut + 1;
                    if fichier.seek(SeekFrom::Start(debut)).is_err() {
                        let _ = requete.respond(Response::empty(StatusCode(500)));
                        continue;
                    }
                    let mut morceau = vec![0_u8; longueur as usize];
                    if fichier.read_exact(&mut morceau).is_err() {
                        let _ = requete.respond(Response::empty(StatusCode(500)));
                        continue;
                    }
                    Response::from_data(morceau)
                        .with_status_code(StatusCode(206))
                        .with_header(entete("Content-Range", &format!("bytes {debut}-{fin}/{octets}")))
                }
                None => {
                    let mut tout = Vec::with_capacity(octets as usize);
                    if fichier.read_to_end(&mut tout).is_err() {
                        let _ = requete.respond(Response::empty(StatusCode(500)));
                        continue;
                    }
                    Response::from_data(tout)
                }
            };

            // tiny_http bascule en transfert fractionné au-delà de 32 Kio, ce qui supprime
            // le Content-Length : un lecteur média en a besoin pour se déplacer dans la piste.
            let reponse = reponse.with_chunked_threshold(usize::MAX);
            let reponse = commun.into_iter().fold(reponse, |r, h| r.with_header(h));
            let _ = requete.respond(reponse);
        }
    });

    Ok(Serveur {
        infos: Servi {
            port,
            url: format!("http://127.0.0.1:{port}/media"),
            octets,
        },
        plages_servies,
    })
}

#[cfg(test)]
mod tests {
    use super::analyser_plage;

    #[test]
    fn lit_les_trois_formes_d_une_plage() {
        assert_eq!(analyser_plage("bytes=0-99", 1_000), Some((0, 99)));
        assert_eq!(analyser_plage("bytes=900-", 1_000), Some((900, 999)));
        assert_eq!(analyser_plage("bytes=-100", 1_000), Some((900, 999)));
    }

    #[test]
    fn borne_une_plage_qui_depasse_le_fichier() {
        assert_eq!(analyser_plage("bytes=0-10000", 1_000), Some((0, 999)));
        assert_eq!(analyser_plage("bytes=2000-3000", 1_000), None);
        assert_eq!(analyser_plage("octets=0-10", 1_000), None);
        assert_eq!(analyser_plage("bytes=-", 1_000), None);
    }
}
