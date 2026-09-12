# Matrice des treize verrous

| Verrou canonique | ID runtime | Rapide/Atelier | Architecte | Activation / preuve | Statut |
|---|---|---|---|---|---|
| Rôle | `role` | profils sauf éclair selon format | `role_adaptatif` toujours requis | HTML `3254-3310`, `8452` | Divergent |
| Destinataire | `destinataire` | profil + champ | réglage manuel et analyse | `3643`, `8455` | Partiel |
| Données | `donnees` | actif selon profil, matériau isolé | matériau marqué comme donnée | `3859-3887`, `8454` | Présent |
| Provenance | `provenance` | section heuristique | déclarations/fondements typés et citations | `3643-3843`, `8083`, `8440` | Fort Architecte, faible ailleurs |
| Périmètre | `perimetre` | règles spécifiques au format/usage | composant ou réglage sémantique | mêmes zones | Divergent |
| Plan/gabarit | `gabarit` | profil/format/champ | réglage + composants | `3254-3302`, `8455`, `8481` | Présent, non canonique |
| Format | `format` | toujours selon profil | `livrable.format_technique` | `3018-3252`, `8459-8462` | Présent |
| Volume | `volume` | ajout dynamique si quantité explicite | quantités + volume + proportion | `3298`, `3595`, `8459` | Présent, double logique |
| Amorce/clôture | `amorce` | début/fin et contrôles | pas un verrou explicite | `3018-3252`, `4186-4328` | Absent Architecte |
| Interdits | `interdits` | profil + section | hypothèses interdites + composants | `3254-3843`, `8479` | Divergent |
| Hypothèses | `hypotheses` | section selon profil | autorisées/interdites + pilotage | `3643-3843`, `8469-8480` | Fort Architecte |
| Longueur | `longueur` | protocole selon profil | longueur indicative et plafond | `3643-3843`, `8458`, `8579-8580` | Divergent |
| Contrôle final | `controle` | section + contrôle post-exécution | liste de vérifications dans le prompt seulement | `4186-4408`, `8482-8493` | Non garanti Architecte |

## Verdict

Le catalogue `VERROUS` et son ordre sont complets (`3310`, `3844`), mais la règle ADN « activer par risque concret et expliquer chaque activation » ne l'est pas. Les profils choisissent des paquets par classe de format ; `actifsAdaptes()` n'ajoute dynamiquement que `volume`. Architecte ne consomme pas ce catalogue. Il n'existe ni `locks_selected`, ni raison, ni priorité auditable.

