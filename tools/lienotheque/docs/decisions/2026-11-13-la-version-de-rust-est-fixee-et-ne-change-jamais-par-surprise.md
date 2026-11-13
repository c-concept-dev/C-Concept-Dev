# La version de Rust est fixée, et elle ne change jamais par surprise

**Décision de Christophe le 13 novembre 2026**, mot pour mot :

> « La version de Rust est fixée par un `rust-toolchain.toml`, identique sur ma machine et sur la
> CI ; on en change volontairement, jamais par surprise. »

## Ce qui l'a provoquée

Deux courses du même workflow, séparées de dix-huit heures, sur deux commits qui ne diffèrent que
par **une ligne d'un exemple Rust et un document** :

| | course 43252972457 | course 43422731892 |
|---|---|---|
| commit | `5652daee` | `c56ac171` |
| **rustc** | **1.99.1** | **1.100.0** *(publié le 9 novembre)* |
| « Éprouver les quatre critères » | **success** | **failure** |

Trois contrôles de `tests/dialogue.rs` sont devenus rouges. **Rien dans le commit ne l'expliquait**,
et c'est tout le problème : on cherche dans son propre travail une cause qui vient de la
plateforme. Le workflow installait `dtolnay/rust-toolchain@stable`, c'est-à-dire le stable **du
jour** — une dépendance qui change toute seule, sans apparaître dans aucun diff.

## La cause technique, mesurée des deux côtés

`reciteur_binaire()` trouvait l'exemple par `current_exe().parent().parent()` + `examples/reciteur`,
en supposant que le binaire de contrôle vit dans `target/<profil>/deps/` — **deux niveaux
exactement** sous le profil. Rust 1.100.0 les range ailleurs :

```
1.99  : target/release/deps/dialogue-<empreinte>
1.100 : target/release/build/lienotheque-bureau/<empreinte>/out/dialogue-<empreinte>
```

Deux niveaux y mènent à `…/<empreinte>`, et le chemin composé ne désigne aucun fichier. L'exemple,
lui, n'a pas bougé : `target/<profil>/examples/reciteur` existe dans les deux dispositions.

**Ce n'est pas resté une hypothèse.** `rustc 1.100.0` a été installé sur la machine de Christophe
et la panne s'y est reproduite à l'identique — mêmes trois contrôles, même chemin, même message.

## Ce qui a été fait, et dans cet ordre

1. **Rouge d'abord, reproduit ici** sous `cargo +1.100.0`.
2. **Le correctif ne compte plus les niveaux** : il remonte les ancêtres du binaire de contrôle
   jusqu'à trouver un dossier qui contient `examples/reciteur`. Aucune profondeur supposée, donc
   aucune disposition de cargo supposée. Une version qui déplacerait encore les binaires ne
   casserait plus ce fichier.
3. **Vert sous les deux versions** : 3 contrôles sur 3 avec 1.100.0, et 3 sur 3 avec 1.99.0. Le
   correctif n'échange pas une panne contre une autre.
4. **`tools/lienotheque/rust-toolchain.toml`** fixe `channel = "1.100.0"` — la version sur laquelle
   le projet vient d'être éprouvé. Il est dans `tools/lienotheque/` et non à la racine : rustup le
   cherche dans le dossier courant **et ses parents**, ce qui couvre `pnpm check` lancé d'ici comme
   `cargo` lancé depuis `apps/app/src-tauri/`, et le dépôt est partagé avec d'autres projets qui
   n'ont pas à subir ce choix. Vérifié : `cargo --version` rend **1.100.0** depuis les deux
   dossiers, sans `+toolchain`.
5. **Le workflow dit désormais à voix haute quelle version tourne** (`rustup show active-toolchain`,
   `cargo --version`, `rustc --version`). Une dépendance invisible rend un rouge indéchiffrable ;
   celle-ci se lit maintenant dans le journal, à côté du verdict.

## Le prix, assumé

L'action `dtolnay/rust-toolchain@stable` reste en place : elle pose rustup et un stable. Le jour où
le stable du moment s'éloignera de la version fixée, rustup téléchargera celle-ci — quelques
dizaines de secondes par course. C'est le prix d'un outil qui ne change jamais par surprise, et il
est moins cher qu'une demi-journée passée à chercher dans un commit une cause qui n'y est pas.

## Ce que cette journée a montré trois fois

Ce rouge est le **troisième** de la série, et les trois ont la même forme : un contrôle accepté
ici ne couvre pas ce que la CI couvre. Tesseract absent d'Ubuntu, une décision absente d'un
sommaire, et maintenant une version d'outil qui n'est la même nulle part. Les deux premiers ont
reçu leur garde-fou ; celui-ci reçoit son fichier.
