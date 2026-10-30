//! Ce que la machine peut encore donner à un moteur (PLT-02, JOB-09).
//!
//! ## Le défaut que cela corrige, mesuré le 30 octobre 2026
//!
//! Deux travaux lourds partaient ensemble, chacun autorisé à toucher 2 048 Mo, sans que personne
//! ne regarde ce que la machine avait encore. Quand elle n'avait plus de quoi, V8 n'arrivait pas
//! à réserver son tas au démarrage : `Heap::SetUp` → `FatalProcessOutOfMemory` → `OS::Abort()`,
//! qui se compile en `brk` sur arm64 — signal 5, vingt millisecondes après le lancement, sans un
//! mot. Dix-sept documents sains sont ainsi passés en échec définitif en soixante secondes.
//!
//! On ne lance donc un moteur que si la machine peut tenir la promesse qu'on lui fait. Le seuil
//! n'est pas choisi pour l'occasion : c'est `memoireMaxMo` de `limites.json`, ce qu'un moteur a
//! déjà le droit de toucher. Mesure de contrôle du même jour, vraie chaîne sur un document de
//! douze pages et neuf pistes : **1 235 Mio de pointe réelle** — le plafond de 2 048 Mo est
//! réaliste, ni serré ni fantaisiste.
//!
//! ## Portabilité
//!
//! macOS seul pour l'instant, ce qui est la phase 1 du projet. L'équivalent Windows est
//! `GlobalMemoryStatusEx` (champ `ullAvailPhys`) ; il s'écrira quand Windows redeviendra un
//! contrôle bloquant. Partout ailleurs, la réponse est **inconnue**, et une mémoire inconnue ne
//! restreint rien : mieux vaut la file d'avant que la file arrêtée.

/// Mémoire que la machine peut encore donner, en mégaoctets. `None` si on ne sait pas la lire.
#[cfg(target_os = "macos")]
pub fn disponible_mo() -> Option<u64> {
    // Les pages libres, plus celles que le système reprendra sans rien perdre : c'est ce dont un
    // processus neuf peut disposer. Les pages actives, elles, appartiennent à quelqu'un.
    let mut etat: libc::vm_statistics64 = unsafe { std::mem::zeroed() };
    let mut combien = (std::mem::size_of::<libc::vm_statistics64>() / std::mem::size_of::<libc::integer_t>())
        as libc::mach_msg_type_number_t;
    // `mach_host_self` est marqué obsolète dans `libc`, qui renvoie vers la caisse `mach2`. On
    // garde `libc` : c'est la seule fonction de mach dont l'hôte a besoin, et ajouter une caisse
    // entière pour un symbole coûterait plus que cette ligne. À rouvrir si `libc` la retire.
    #[allow(deprecated)]
    let rendu = unsafe {
        libc::host_statistics64(
            libc::mach_host_self(),
            libc::HOST_VM_INFO64,
            std::ptr::addr_of_mut!(etat).cast::<libc::integer_t>(),
            std::ptr::addr_of_mut!(combien),
        )
    };
    if rendu != 0 {
        return None;
    }
    let taille_de_page = u64::try_from(unsafe { libc::sysconf(libc::_SC_PAGESIZE) }).ok()?;
    let pages = u64::from(etat.free_count) + u64::from(etat.inactive_count) + u64::from(etat.purgeable_count);
    Some(pages.saturating_mul(taille_de_page) / (1024 * 1024))
}

#[cfg(not(target_os = "macos"))]
pub fn disponible_mo() -> Option<u64> {
    None
}

/// Combien de moteurs **de plus** la mémoire peut porter, sachant combien tournent déjà.
///
/// Le seuil est `memoireMaxMo` : ce qu'un moteur a déjà le droit de toucher, et donc ce que la
/// machine doit pouvoir lui promettre avant qu'on le lance. Aucun nombre n'est inventé ici.
///
/// La mémoire déjà prise par les moteurs en vol est, par construction, hors du disponible : le
/// compte ne dépend donc pas de `deja_en_cours` — sauf pour son plancher.
///
/// **Plancher à un.** Si aucun moteur ne tourne et que la mémoire manque quand même, on en lance
/// un tout de même. Refuser ici arrêterait la file pour toujours sans que rien ne dise pourquoi,
/// alors qu'un moteur qui échoue faute de mémoire met désormais son travail en pause —
/// reprenable — au lieu de le condamner.
pub fn moteurs_de_plus(disponible_mo: Option<u64>, deja_en_cours: usize) -> usize {
    let Some(disponible) = disponible_mo else { return usize::MAX };
    let porte = usize::try_from(disponible / u64::from(crate::limites::LIMITES.memoire_max_mo)).unwrap_or(usize::MAX);
    if deja_en_cours == 0 { porte.max(1) } else { porte }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un moteur ne part pas sans la mémoire qu'on lui promet (PLT-02, JOB-09).
    #[test]
    fn plt_02_la_memoire_borne_le_nombre_de_moteurs() {
        let plafond = u64::from(crate::limites::LIMITES.memoire_max_mo);

        // De quoi tenir la promesse deux fois : les deux places du contrat restent ouvertes.
        assert_eq!(moteurs_de_plus(Some(plafond * 2), 1), 2);
        // De quoi la tenir une fois : une seule.
        assert_eq!(moteurs_de_plus(Some(plafond), 1), 1);
        // Plus de quoi la tenir, et un moteur tourne déjà : on n'en lance pas un second.
        assert_eq!(moteurs_de_plus(Some(plafond - 1), 1), 0, "lancer ici, c'est le signal 5 du 30 octobre");
        // Mais si rien ne tourne, on en lance un : une file arrêtée sans un mot vaut moins.
        assert_eq!(moteurs_de_plus(Some(0), 0), 1, "une file qui ne repart jamais ne dit pas pourquoi");
        // Mémoire inconnue : on ne restreint rien, c'est la file d'avant.
        assert_eq!(moteurs_de_plus(None, 1), usize::MAX);
    }

    /// La lecture rend un chiffre plausible, ou honnêtement rien (PLT-02).
    ///
    /// On n'éprouve pas une valeur — elle change à chaque seconde — mais son ordre de grandeur :
    /// une machine qui fait tourner cette épreuve a forcément plus de 64 Mo disponibles, et pas
    /// un pétaoctet. Un zéro ou un nombre absurde dirait que la lecture s'est trompée d'unité,
    /// et c'est exactement la faute qui bloquerait la file pour toujours.
    #[test]
    fn plt_02_la_memoire_disponible_se_lit_ou_se_dit_inconnue() {
        match disponible_mo() {
            None => {
                assert!(!cfg!(target_os = "macos"), "sur macOS, la mémoire doit se lire");
            }
            Some(mo) => {
                assert!(mo > 64, "seulement {mo} Mo disponibles : la lecture s'est trompée d'unité");
                assert!(mo < 64 * 1024 * 1024, "{mo} Mo disponibles : la lecture s'est trompée d'unité");
            }
        }
    }
}
