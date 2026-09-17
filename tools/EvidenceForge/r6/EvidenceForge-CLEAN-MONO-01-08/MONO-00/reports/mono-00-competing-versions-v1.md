# MONO-00 — Recherche de versions concurrentes

Aucune ancienne version n'a été supprimée pendant cet inventaire. Ce rapport identifie uniquement quelle version est autorisée dans le futur graphe d'intégration.

## EF-02D3 (Coverage / Panel Selection)

| Version historique | Statut |
|---|---|
| EF-02D1-D2 v0.2 | HISTORICAL — prototype HTML pré-généralisation, jamais porté |
| EF-02D3 Resume v0.3 | HISTORICAL — mécanisme de réparation spécifique à un run JMJS incomplet |
| EF-02D3 Adjudication D4/D5 v0.2 | REJECTED_FOR_CORE — rattrapage explicitement spécifique aux dimensions d4/d5 du pilote JMJS, jamais généralisé ; fixture/preuve historique uniquement |
| EF-02D3 Fusion v0.4.2 | HISTORICAL — même statut que Resume v0.3 |
| **EF-02D-v1 (ce lot, module JS pur)** | **CURRENT_CANONICAL** — resumeCoverageMatrix() générique intègre nativement la capacité de reprise, sans dépendre d'un identifiant de dimension particulier |

## EF-02E (Documentary Twin Builder)

| Version historique | Statut |
|---|---|
| Prototypes EF-02E antérieurs (non retrouvés comme paquet distinct dans cet inventaire) | HISTORICAL |
| **EF-02E-v1 (ce lot)** | **CURRENT_CANONICAL** |

## EF-03A/B/C/D

| Version historique | Statut |
|---|---|
| EF-03A Review Schema v0.1 (HTML, labels JMJS par défaut D103/S01/S02/P0.0) | HISTORICAL — retrouvé dans EF-PR-GEN-01/tools/ |
| EF-03B Review Runner v0.3 (HTML, mapping target-02<->S01 codé en dur) | HISTORICAL — retrouvé dans EF-PR-GEN-01/tools/ |
| EF-03B Coverage Repair v0.1 (HTML, sibling séparé) | REJECTED_FOR_CORE — jamais recréé comme outil séparé, capacité intégrée nativement dans resumeDocumentaryReviewSet() |
| EF-03C Aggregation v0.2 (HTML) | HISTORICAL — retrouvé dans EF-PR-GEN-01/tools/ |
| EF-03D Stability/Contradiction v0.1 (HTML) | HISTORICAL — jamais retrouvé comme paquet exécutable indépendant, seulement audité historiquement |
| **EF-03-v1 (ce lot, 5 modules JS purs : EF-03A/TargetDocumentSet/EF-03B/EF-03C/EF-03D)** | **CURRENT_CANONICAL** |

## EF-04

| Version historique | Statut |
|---|---|
| EF-04A Unified Report v0.1 | REJECTED — garde de lignée insuffisante (pouvait recharger un EF-03B antérieur sans s'en apercevoir) |
| EF-04A Unified Report v0.2 (LINEAGE-GUARD) | REJECTED_FOR_CORE — correction réelle mais codée en dur au pilote (version exacte "EF-03B-v0.4-coverage-repair-test", comptes exacts 61 findings/10 dimensions) ; jamais généralisable tel quel |
| EF-04B Rapport final v0.1 | HISTORICAL — instantané figé du pilote de référence, jamais une brique à durcir, hors moteur générique par décision explicite répétée à chaque lot |
| **EF-04-v1 (ce lot)** | **CURRENT_CANONICAL** — Lineage Guard générique par hash + revalidation de référence, aucune version ni comptage codés en dur |

## Vérification de l'invariant T00-10

Aucune paire de versions n'est marquée `CURRENT_CANONICAL` simultanément pour un même module dans ce registre — un seul candidat canonique par module, conformément à T00-10.
