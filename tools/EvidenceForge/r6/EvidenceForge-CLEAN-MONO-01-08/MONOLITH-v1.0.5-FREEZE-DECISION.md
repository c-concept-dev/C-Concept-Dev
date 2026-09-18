# DÉCISION DE GEL — MONOLITH-v1.0.5 (2026-09-18T00:04:32Z)

**MONOLITH-v1.0.5 = GELÉ.** Décision du propriétaire produit (Christophe Bonnet), prise après l'audit global de préparation au gel
(verdict GELABLE, `~/evidenceforge-work/reports/AUDIT-GLOBAL-GEL-MONOLITH-v1.0.5.md`). Le présent gel est administratif et cryptographique :
aucun comportement n'a été modifié.

| Élément | Valeur |
|---|---|
| Candidat fonctionnel exact | `tools/EvidenceForge/` au commit `3add607fdfcb5d4864dd3ed4cc541217c95e854d` |
| HEAD du dépôt au gel | `ebc2d072615e57f0d358185fa5899908ebf66174` (commits Atelier Prompts / Studio postérieurs au candidat ; sous-arbre EvidenceForge byte-identique) |
| Tree hash git `tools/EvidenceForge/` (fonctionnel) | `974fcfd656bd3892e264377cd0ea8700649b7abd` |
| Tree hash git `MONOLITH-v1.0.5/` (fonctionnel) | `ab8554a6e3b9d456524157ed5feaa6e3993f98f4` |
| Hash de contenu interne (`MANIFEST.json`, 94 fichiers) | `151937a1d3e1b1fff6691274f1d9b7dda52e6285df80bdaaf7c961931459facc` |
| ZIP canonique | `tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.5/EvidenceForge-MONOLITH-v1.0.5.zip` (racine `MONOLITH-v1.0.5/`, 96 entrées, 460 673 octets) |
| SHA-256 du ZIP | `c6eae8afb03c66963194427bb30bb49b2697b9ca236dcdd8b83bf7f1bb39b7a1` (`EvidenceForge-MONOLITH-v1.0.5.zip.sha256`) |
| Reproductibilité | BUILD A = BUILD B (deux répertoires indépendants, `cmp` identique) ; BUILD C après promotion et push : voir le rapport de gel |
| Suites | monolith 198/198 · navigateur 33/33 · lanceur 14/14 · secrets 0 · anti-hardcoding 0 · lots gelés 0 divergence |
| Prédécesseur gelé | MONOLITH-v1.0.4, zip `97b999adcff395ab49f7cd33e8e70bab767c7df22ffdda0967771db5595dd961` |
| Validations réelles | Screening Cost Optimizer PASS (`edb27b86`) · Panel Sufficiency v2 PASS avec `PANEL_EXHAUSTED_WITH_GAPS` réel (`f78528fe`) · Run Safety PASS (`a4df0747`) |

Limitations non bloquantes connues : voir `knownLimitations` dans `MONOLITH-v1.0.5-FREEZE-MANIFEST.json` (fichiers d'arrêt = dernier cycle ; kits EF-01
couverts aux transitions d'étape ; bouton d'arrêt masqué aux portes ; équilibrage de portefeuille = proposition ; `PANEL_SUFFICIENT` non observé en réel ;
budget par étape absent ; Pages publie le dépôt).

**Règle post-gel : toute évolution part dans MONOLITH-v1.0.6 ou ultérieure. MONOLITH-v1.0.5 n'est plus modifié.**
