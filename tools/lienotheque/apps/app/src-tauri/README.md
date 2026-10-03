# Prototype bureau (lot 0)

Hôte Rust + Tauri 2. **Ce n'est pas l'application** : c'est le prototype qui doit répondre aux
quatre critères du CDC avant qu'on décide du socle local. Les chiffres obtenus sont consignés dans
[`docs/decisions.md`](../../../docs/decisions.md) ; la décision reste à prendre.

## Reproduire les mesures

Il faut Rust (`rustup`), Tesseract et ses modèles (`brew install tesseract tesseract-lang`),
`lame` pour la piste audio (`brew install lame`) et Python 3 avec Pillow.

```sh
python3 fixtures/generer-locales.py                          # PDF, image, MP3 — jamais commités
python3 apps/app/src-tauri/outils/preparer-moteurs.py        # embarque Tesseract et ses bibliothèques
cargo test --release --manifest-path apps/app/src-tauri/Cargo.toml -- --nocapture
```

Les tests d'intégration de `tests/prototype.rs` impriment leurs mesures. Ils ne font pas partie de
`pnpm check` : `lienotheque-ci.yml` tourne sur trois systèmes sans Rust ni Tesseract, et son rôle
est de vérifier le code partagé. Ces tests tournent dans
[`lienotheque-tauri.yml`](../../../../../.github/workflows/lienotheque-tauri.yml), sur macOS et
Windows, où ils sont suivis de la construction du paquet et de sa pesée.

Pour l'application elle-même :

```sh
pnpm --filter @lienotheque/app tauri dev      # fenêtre de développement
pnpm --filter @lienotheque/app tauri build    # paquet mesurable
```

Le panneau « Prototype bureau » n'apparaît que dans la fenêtre de bureau, jamais sur la page web.

## Ce que fait chaque module

| Fichier | Rôle | Exigences |
|---|---|---|
| `src/pdf.rs` | Ouvre un PDF et atteint une page précise | ANC-01 |
| `src/ocr.rs` | Lance le moteur embarqué sur une image | OUT-05 |
| `src/travail.rs` | Travail persisté, verrou à expiration, point de reprise | JOB-01, JOB-02, JOB-03 |
| `src/bin/travail-long.rs` | Travail volontairement tuable, pour éprouver la reprise | JOB-02 |
| `src/media.rs` | Serveur local de médias par plages d'octets | lecture par plages |
| `src/mesures.rs` | Pesée d'une installation | taille d'installation |
| `outils/preparer-moteurs.py` | Embarque Tesseract et ses bibliothèques (macOS et Windows) | — |
| `outils/resumer-mesures.py` | Écrit les mesures dans le résumé d'exécution de l'intégration continue | — |

## Limites connues

- **Linux.** `outils/preparer-moteurs.py` couvre macOS (`otool`, `install_name_tool`, `codesign`)
  et Windows (DLL posées à côté du binaire, rien à réécrire). L'équivalent Linux (`patchelf`)
  reste à écrire.
- **Paquet Windows.** Les DLL des moteurs sont posées à côté du binaire pour le développement et
  les tests. Leur emplacement dans un paquet Windows **installé** reste à trancher : Tauri range
  le binaire annexe à côté de l'exécutable et les ressources ailleurs.
- `travail-long` est un binaire de test ; il ne doit pas partir dans un paquet livré.
- Aucune signature ni notarisation : le paquet mesuré est ad hoc.
