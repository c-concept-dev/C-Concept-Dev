# MONO-10 v0.5 — Ordre d'exécution

Ordre **normatif**. Toutes les barrières sont *fail-closed*.

| # | Étape | Qui | Exige | S'arrête si |
|---|---|---|---|---|
| 0 | **Provisionner la frontière opérateur** | *exploitant, hors processus* | ancrages, store anti-rejeu, mécanisme humain | variable d'environnement absente, config illisible, matière privée présente, anti-rejeu manquant |
| 1 | **Figer l'intention d'ouverture du run** | exploitant | `runId`, `missionHash`, producteur, mode, `openedAt` | champ manquant |
| 2 | **Signer l'attestation** | *autorité, hors EvidenceForge* | engage `runManifestRootHash` | clé révoquée, expirée, hors fenêtre |
| 3 | Vérifier et ouvrir le manifeste | `core/run-evidence-manifest.js` | verificateur de la frontière | signature invalide, nonce rejoué, racine divergente |
| 4 | Enregistrer les preuves documentaires | `core/evidence-source-provenance.js` | liaison au run | — |
| 5 | Construire le registre authentifié | `core/authenticated-artifact-registry.js` | chaque artefact lié au run | liaison absente ou incohérente |
| 6 | Découverte et vérification professionnelles | adaptateur **injecté** (MONO-09) | — | — |
| 7 | Évaluation des candidats | `core/candidate-assessment.js` | registre authentifié | provenance non résolue ⇒ indépendance inconnue |
| 8 | Gabarit de porte humaine | `core/panel-gate.js` | évaluation liée au run | aucun candidat présentable |
| 9 | **Décision humaine** | *hors moteur* | un humain remplit chaque décision | ⚠️ **jamais simulée** |
| 10 | Validation de la porte | `core/panel-gate.js` | preuves **résolues**, acte **authentifié** | référence inventée, preuve d'un autre run, acte non authentifié |
| 11 | Dérivation de l'éligibilité | `core/effective-eligibility.js` | décision + authenticité + porte valide | `DEFER`/`REJECT`/porte invalide ⇒ jamais éligible |
| 12 | Fermeture de la porte | **`core/panel-gated-adapter.js`** | porte validée | `PANEL_GATE_MISSING`, `ELIGIBILITY_NOT_DERIVED` |
| 13 | Corpus, jumeaux, revues, agrégats | adaptateurs **injectés** | corpus fermé par la porte | — |
| 14 | Constat de capacité LLM | `core/llm-capability.js` | transport injecté + run attesté | sonde d'un autre run ou d'un autre mode |
| 15 | Préparation PRE puis FULL | `core/scientific-readiness.js` | registre authentifié | dimension sans source, inconnu bloquant |
| 16 | Qualification du processus | `core/scientific-qualification.js` | artefacts **sources** | frontière absente en production, divergence au recalcul |
| 17 | Rapport unifié additif | `core/scientific-unified-report.js` | rapport antérieur + qualification | missions, runs ou attestations différents |
| 18 | **Acceptation humaine** | *hors moteur* | un humain décide | ⚠️ **jamais simulée** |
| 19 | Validation de l'acceptation | `core/final-report-acceptance.js` | rapport **concret** + acte authentifié | contenu présenté différent, acte non authentifié |
| 20 | Autorisation d'usage aval | `core/downstream-authorization.js` | tout revalidé | confiance non vérifiée, revalidation impossible |
| 21 | Traduction vers un cas | `adapters/case-phase-adapter.js` | nom de phase fourni **par le cas** | nom absent |

## Les deux points où un humain — et seulement un humain — décide

**Étape 9** (approuver / rejeter / différer chaque candidat) et **étape 18**
(accepter le rapport). Le moteur produit des gabarits dont tous les champs de
décision valent `null`, et l'authenticité de l'acte est établie par la frontière
opérateur, jamais par une déclaration d'identité.

## Ce que cet ordre n'autorise pas

- Sauter l'étape 0 : sans frontière provisionnée, rien n'est authentifiable.
- Fournir soi-même les ancrages, le mécanisme humain, le store anti-rejeu ou le registre.
- Sauter l'étape 12 : l'étape 13 refuse une vérification qui n'a pas traversé la porte.
- Approuver sur des preuves qui n'existent pas.
- Désactiver par politique l'un des cinq contrôles non négociables.
