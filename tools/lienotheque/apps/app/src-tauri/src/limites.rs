//! Les limites d'exécution, lues là où elles sont écrites (PLT-02, JOB-02).
//!
//! Elles vivent dans `packages/contrats/limites.json`, que le TypeScript lit par import et que
//! l'hôte lit ici. Personne ne les recopie : un contrôle de `pnpm check` refuse toute constante
//! qui porterait un de ces nombres en dur, des deux côtés.
//!
//! Le fichier est inclus à la compilation : le paquet livré ne dépend pas de la présence du dépôt,
//! et une limite changée oblige à recompiler l'hôte — ce qui est exactement ce qu'on veut, un hôte
//! et un moteur d'accord sur les mêmes règles.

use serde::Deserialize;
use std::sync::LazyLock;

const SOURCE: &str = include_str!("../../../../packages/contrats/limites.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Limites {
    #[allow(dead_code)]
    #[serde(rename = "_lisez_moi")]
    pub lisez_moi: String,
    /// Version du protocole d'échange avec le moteur. Un désaccord est refusé, jamais toléré.
    pub protocole: u32,
    /// Combien de travaux lourds tournent à la fois. Au-delà, ils attendent leur tour.
    pub travaux_lourds_simultanes: usize,
    /// Plafond de mémoire d'un processus de traitement, en mégaoctets.
    pub memoire_max_mo: u32,
    /// Délai laissé au moteur pour s'arrêter de lui-même avant qu'on le tue.
    pub delai_arret_propre_s: u64,
    /// Cadence du battement : le travail renouvelle son bail à ce rythme tant qu'il vit.
    pub battement_verrou_s: u64,
    /// Durée du bail à partir du dernier battement (JOB-02).
    pub expiration_verrou_s: u64,
}

pub static LIMITES: LazyLock<Limites> = LazyLock::new(|| {
    serde_json::from_str(SOURCE).expect("limites.json est une donnée du dépôt : sa forme est tenue par pnpm check")
});

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_limites_se_lisent_sans_etre_recopiees() {
        // Rien n'est comparé à un nombre écrit ici : ce serait recopier. On éprouve les relations
        // que les valeurs doivent tenir entre elles, et c'est tout ce qu'on peut vérifier d'ici.
        assert!(LIMITES.protocole >= 1);
        assert!(LIMITES.travaux_lourds_simultanes >= 1);
        assert!(LIMITES.delai_arret_propre_s >= 1);
    }

    #[test]
    fn un_battement_manque_ne_fait_pas_perdre_son_bail(/* JOB-02 */) {
        assert!(
            LIMITES.expiration_verrou_s > LIMITES.battement_verrou_s * 2,
            "un travail bien vivant garde son bail malgré un battement manqué"
        );
    }

    #[test]
    fn le_plafond_memoire_laisse_de_l_air_au_dessus_du_constate() {
        // 1,1 Go relevé sur F3 : le plafond est un garde-fou contre une boucle qui s'emballe.
        assert!(LIMITES.memoire_max_mo > 1100);
    }
}
