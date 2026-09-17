# MONO-10 v0.2 — Ordre d'exécution

Aucun nom de phase métier. L'étape finale est une **autorisation d'usage aval**
générique ; un cas d'application la traduit dans son vocabulaire hors du noyau.

| # | Étape | Nature | Arrêt |
|---|---|---|---|
| 1 | Découverte des candidats | runtime | — |
| 2 | Vérification documentaire d'identité | runtime | — |
| 3 | `ProfessionalCandidateAssessment` | hors ligne | — |
| 4 | **ARRÊT — porte humaine** | **acte humain** | **bloquant** |
| 5 | Décisions exhaustives : `APPROVE` / `REJECT` / `DEFER` | acte humain | bloquant |
| 6 | **Sonde active de capacité LLM** | réseau, appel minimal | bloquant si ≠ `AVAILABLE` |
| 7 | `ScientificReadiness` phase `PRE` | hors ligne | bloquant si `NOT_READY` |
| 8 | Corpus professionnel, **via l'adaptateur à porte** | runtime | — |
| 9 | Éligibilité, panel, jumeaux | runtime, LLM | — |
| 10 | Revues, agrégation, stabilité | runtime, LLM | — |
| 11 | Rapport antérieur du pipeline existant | runtime | drapeaux inchangés |
| 12 | `ScientificReadiness` phase `FULL` | hors ligne | — |
| 13 | `ScientificQualification` | hors ligne | `NOT_QUALIFIED` interdit l'usage |
| 14 | `ScientificUnifiedReport` | hors ligne | — |
| 15 | **Acceptation humaine du rapport** | **acte humain** | selon politique |
| 16 | `DownstreamUseAuthorization` | hors ligne | `AUTHORIZED` / `NOT_AUTHORIZED` / `DEFERRED` |
| 17 | *(optionnel, hors noyau)* traduction vers une phase de cas | adaptateur | — |

## Points d'arrêt durs

- **Étape 4** — aucun corpus avant décisions humaines exhaustives.
- **Étape 6** — aucun nœud LLM avant capacité constatée par sonde.
- **Étape 13** — aucun usage aval si `NOT_QUALIFIED`. **Le verdict antérieur
  reste enregistré** : seul son usage est bloqué.
- **Étape 16** — l'autorisation ne réécrit jamais le verdict.

## Charge pour le propriétaire

L'étape 3 réduit le vivier brut aux seuls candidats à base documentaire
suffisante. Le propriétaire statue sur une fiche d'identité adossée à des œuvres
déjà auditées — il ne lit pas le corpus professionnel.
