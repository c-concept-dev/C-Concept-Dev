#!/usr/bin/env python3
"""MONO-00 — construction de la matrice de contrats.

CORRECTION 3 (post-audit) : EF-ORCH était déclaré llm=false, ce qui est
inexact. Vérification directe dans le code gelé (grep) :
- AUCUN appel LLM direct n'existe nulle part dans l'exécuteur gelé
  (recherche de fetch/api.anthropic/workerCallFn/clone-proxy.workers :
  0 résultat hors tests).
- EF-01B et EF-01C1 consomment des artefacts (EF01BResolverTrace,
  SearchProtocol) PRODUITS par une planification LLM EXTÉRIEURE au stage
  orchestré — décision architecturale EXPLICITEMENT documentée dans le
  code lui-même ("N'appelle JAMAIS le Worker/Anthropic pendant
  l'exécution — la résolution LLM appartient à la pré-analyse antérieure").
- EF-01C2 a une dépendance réseau RÉELLE ET DIRECTE : trois runners dédiés
  (OpenAlex, Crossref, PubMed).

Représentation retenue : llmDependency="INDIRECT_UPSTREAM" pour EF-ORCH
(jamais un simple true qui surstatuerait ce que le code exécuteur fait
réellement), avec externalDependencies listant précisément la nature de
chaque dépendance externe.
"""
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "registry"))
DEFAULT_REPORT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "reports"))

rows = [
  {"module": "EF-ORCH", "consumes": ["RunContract"], "produces": ["CorpusSnapshot (via EF-01A..F)"], "schemaVersion": "EF-01A-v1..EF-01F-v1", "dependency": "aucune (racine du pipeline)", "syncAsync": "async (stages externes non déterministes en C1/C2)",
   "llm": "INDIRECT_UPSTREAM", "workerApi": "OpenAlex/Crossref/PubMed (connecteurs DIRECTS EF-01C2, runners dédiés)", "persistence": "IndexedDB (resume_checkpoint contractuel)", "resume": True,
   "externalDependencies": ["LLM (INDIRECT/AMONT — EF-01B et EF-01C1 consomment des artefacts produits par une planification LLM EXTÉRIEURE au stage orchestré ; AUCUN appel LLM direct trouvé dans le code exécuteur gelé, confirmé par grep ; décision architecturale explicite documentée dans le code)", "OpenAlex (DIRECT — EF-01C2, ef-orch-ef01c2-runner-openalex-v0.1.js)", "Crossref (DIRECT — EF-01C2, ef-orch-ef01c2-runner-crossref-v0.1.js)", "PubMed (DIRECT — EF-01C2, ef-orch-ef01c2-runner-pubmed-v0.1.js)"],
   "dependencyNote": "CORRIGÉ (audit indépendant, correction 3) : llm=false était inexact. Vérifié par grep direct dans le code gelé — voir externalDependencies pour la distinction directe/indirecte, jamais un simple true qui surstatuerait ce que l'exécuteur fait réellement au runtime."},
  {"module": "EF-PR-GEN-01", "consumes": [], "produces": ["MissionDimensionSet/EF-PR-GEN-v1", "MissionDocumentMapping", "HeuristicPolicy/EF-PR-GEN-v1"], "schemaVersion": "EF-PR-GEN-v1", "dependency": "ef-orch-hash-v0.1.js", "syncAsync": "async (hash canonique)", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A", "externalDependencies": [], "dependencyNote": None},
  {"module": "EF-02A", "consumes": ["CorpusSnapshot (issu d'EF-ORCH/EF-01F)", "MissionDimensionSet/EF-PR-GEN-v1"], "produces": ["ProfessionalDiscovery/EF-02A-v2"], "schemaVersion": "EF-02A-v2", "dependency": "EF-ORCH (CorpusSnapshot), EF-PR-GEN-01 (MissionDimensionSet)", "syncAsync": "async",
   "llm": True, "workerApi": "clone-proxy + openalex-proxy (Cloudflare Worker)", "persistence": "aucune", "resume": False,
   "externalDependencies": ["LLM (DIRECT — via clone-proxy Worker)", "OpenAlex (DIRECT — via openalex-proxy Worker)"],
   "dependencyNote": "CORRIGÉ après audit indépendant (v1 omettait le raccord CorpusSnapshot->EF-02A pourtant explicite dans la chaîne minimale auditée, CDC MONO-00 section 9)."},
  {"module": "EF-02B", "consumes": ["ProfessionalDiscovery/EF-02A-v2"], "produces": ["ProfessionalVerification/EF-02B-v2"], "schemaVersion": "EF-02B-v2", "dependency": "EF-02A", "syncAsync": "async", "llm": False, "workerApi": "openalex-proxy", "persistence": "aucune", "resume": False, "externalDependencies": ["OpenAlex (DIRECT — via openalex-proxy Worker)"], "dependencyNote": None},
  {"module": "EF-02C", "consumes": ["ProfessionalVerification/EF-02B-v2"], "produces": ["ProfessionalCorpusSet/EF-02C-v2"], "schemaVersion": "EF-02C-v2", "dependency": "EF-02B", "syncAsync": "async", "llm": False, "workerApi": "openalex-proxy (apiKeyExposedToBrowser=false)", "persistence": "aucune", "resume": True, "externalDependencies": ["OpenAlex (DIRECT — via openalex-proxy Worker, apiKeyExposedToBrowser=false)"], "dependencyNote": None},
  {"module": "EF-02D", "consumes": ["ProfessionalCorpusSet/EF-02C-v2", "MissionDimensionSet/EF-PR-GEN-v1", "HeuristicPolicy/EF-PR-GEN-v1"], "produces": ["DocumentaryEligibilityRelevanceSet/EF-02D-v2", "CoverageMatrix/EF-02D3-v4", "PanelSelection/EF-02D3-PANEL-v4"], "schemaVersion": "EF-02D-v2 / EF-02D3-v4 / EF-02D3-PANEL-v4", "dependency": "EF-02C, EF-PR-GEN-01", "syncAsync": "async (D2/D3 LLM injecté)", "llm": True, "workerApi": None, "persistence": "aucune", "resume": True, "externalDependencies": ["LLM (DIRECT — workerCallFn injecté, D2/D3)"], "dependencyNote": None},
  {"module": "EF-02E", "consumes": ["ProfessionalCorpusSet/EF-02C-v2", "DocumentaryEligibilityRelevanceSet/EF-02D-v2", "CoverageMatrix/EF-02D3-v4", "PanelSelection/EF-02D3-PANEL-v4", "MissionDimensionSet/EF-PR-GEN-v1", "ExclusionRegistrySet/EF-GOV-REG-v1"], "produces": ["DocumentaryTwinSet/EF-02E-v2", "ExclusionRegistrySet/EF-GOV-REG-v1"], "schemaVersion": "EF-02E-v2 / EF-GOV-REG-v1", "dependency": "EF-02D, EF-PR-GEN-01", "syncAsync": "async (hash uniquement, pas de LLM)", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A (déterministe, pas de reprise partielle)", "externalDependencies": [], "dependencyNote": None},
  {"module": "EF-03A", "consumes": ["DocumentaryTwinSet/EF-02E-v2", "MissionDimensionSet/EF-PR-GEN-v1"], "produces": ["ReviewSchema/EF-03A-v1"], "schemaVersion": "EF-03A-v1", "dependency": "EF-02E, EF-PR-GEN-01", "syncAsync": "async (hash)", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A", "externalDependencies": [], "dependencyNote": None},
  {"module": "EF-03-TargetDocumentSet", "consumes": ["MissionDocumentMapping (résolution reviewTarget->document réel, en amont de la construction)"], "produces": ["TargetDocumentSet/EF-03-DOC-v1"], "schemaVersion": "EF-03-DOC-v1", "dependency": "ef-orch-hash-v0.1.js, MissionDocumentMapping (EF-PR-GEN-01)", "syncAsync": "async (hash)", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A", "externalDependencies": [],
   "dependencyNote": "CORRIGÉ après audit indépendant. C'est ICI, à la construction du TargetDocumentSet, que MissionDocumentMapping intervient réellement — jamais comme paramètre direct de EF-03B lui-même (voir note EF-03B ci-dessous)."},
  {"module": "EF-03B", "consumes": ["ReviewSchema/EF-03A-v1", "DocumentaryTwinSet/EF-02E-v2", "MissionDocumentMapping (indirectement, via la construction du TargetDocumentSet — voir note)", "TargetDocumentSet/EF-03-DOC-v1"], "produces": ["DocumentaryReviewSet/EF-03B-v1"], "schemaVersion": "EF-03B-v1", "dependency": "EF-03A, EF-03-TargetDocumentSet (elle-même dépendante de MissionDocumentMapping), EF-02E", "syncAsync": "async", "llm": True, "workerApi": None, "persistence": "aucune", "resume": True, "externalDependencies": ["LLM (DIRECT — workerCallFn obligatoire, un appel par twin×target)"],
   "dependencyNote": "CORRIGÉ après audit indépendant : v1 omettait MissionDocumentMapping. PRÉCISION IMPORTANTE, jamais glissée sous le tapis : dans le code GELÉ d'EF-03B (EF-03-v1), la fonction buildDocumentaryReviewSet() prend targetDocumentSet DÉJÀ RÉSOLU comme paramètre direct — elle n'appelle jamais elle-même resolveDocumentSlots(). La dépendance à MissionDocumentMapping est donc ARCHITECTURALE (elle intervient dans la construction du TargetDocumentSet, en amont, avant l'appel à EF-03B), jamais un paramètre direct de la fonction gelée elle-même. Aucun lot gelé n'a été modifié pour produire cette correction — seule la représentation de la chaîne dans le registre MONO-00 est corrigée."},
  {"module": "EF-03C", "consumes": ["DocumentaryReviewSet/EF-03B-v1"], "produces": ["AggregatedDocumentaryReview/EF-03C-v1"], "schemaVersion": "EF-03C-v1", "dependency": "EF-03B", "syncAsync": "async", "llm": "optionnel (classification convergence/divergence uniquement)", "workerApi": None, "persistence": "aucune", "resume": "N/A (recalcul complet, pur)", "externalDependencies": ["LLM (OPTIONNEL — classification convergence/divergence seulement, jamais requis pour le dénombrement/provenance)"], "dependencyNote": None},
  {"module": "EF-03D", "consumes": ["DocumentaryReviewSet/EF-03B-v1", "AggregatedDocumentaryReview/EF-03C-v1"], "produces": ["StabilityContradictionAnalysis/EF-03D-v1"], "schemaVersion": "EF-03D-v1", "dependency": "EF-03B, EF-03C", "syncAsync": "sync (entièrement déterministe)", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A", "externalDependencies": [], "dependencyNote": None},
  {"module": "EF-04 (Lineage Guard)", "consumes": ["ReviewSchema/EF-03A-v1", "TargetDocumentSet/EF-03-DOC-v1", "DocumentaryTwinSet/EF-02E-v2", "DocumentaryReviewSet/EF-03B-v1", "AggregatedDocumentaryReview/EF-03C-v1", "StabilityContradictionAnalysis/EF-03D-v1"], "produces": ["lineage assertion result + lineageFingerprint (interne, pas un schéma de sortie public)"], "schemaVersion": "N/A (fonction de garde)", "dependency": "EF-03A/B/C/D, EF-02E", "syncAsync": "async (hash)", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A (FAIL-CLOSED)", "externalDependencies": [], "dependencyNote": None},
  {"module": "EF-04A (UnifiedReportSummary)", "consumes": ["tous les objets ci-dessus, via Lineage Guard PASS"], "produces": ["UnifiedReportSummary/EF-04A-v1"], "schemaVersion": "EF-04A-v1", "dependency": "EF-04 Lineage Guard, EF-03A/B/C/D, EF-02E", "syncAsync": "async", "llm": False, "workerApi": None, "persistence": "aucune", "resume": "N/A", "externalDependencies": [], "dependencyNote": None},
]

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=DEFAULT_OUTPUT_DIR)
    p.add_argument("--report-output", default=DEFAULT_REPORT_DIR)
    args = p.parse_args()

    os.makedirs(args.output, exist_ok=True)
    os.makedirs(args.report_output, exist_ok=True)

    json.dump({"schema": "EvidenceForge.ContractMatrix", "schemaVersion": "MONO-00-v1", "correctedAfterIndependentAudit": True, "correctionsApplied": ["EF-02A<-CorpusSnapshot", "EF-03B<-MissionDocumentMapping", "EF-ORCH llm/network dependency accuracy"], "rows": rows},
               open(os.path.join(args.output, "mono-00-contract-matrix-v1.json"), "w"), indent=2, ensure_ascii=False)

    md = ["# EF — Matrice de contrats (MONO-00)\n",
          "**Corrigée après audit indépendant (corrections 1, 2 et 3)** — voir `dependencyNote`/`externalDependencies` sur EF-ORCH, EF-02A, EF-03-TargetDocumentSet et EF-03B.\n",
          "| module | consumes | produces | schema version | dependency | sync/async | LLM | Worker/API | persistence | resume |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append("| {module} | {consumes} | {produces} | {schemaVersion} | {dependency} | {syncAsync} | {llm} | {workerApi} | {persistence} | {resume} |".format(
            module=r["module"], consumes="<br>".join(r["consumes"]) if r["consumes"] else "—", produces="<br>".join(r["produces"]),
            schemaVersion=r["schemaVersion"], dependency=r["dependency"], syncAsync=r["syncAsync"],
            llm=r["llm"], workerApi=r["workerApi"] or "—", persistence=r["persistence"], resume=r["resume"]
        ))
    md.append("\n## Dépendances externes détaillées (externalDependencies)\n")
    for r in rows:
        if r.get("externalDependencies"):
            md.append("**" + r["module"] + "** :")
            for ed in r["externalDependencies"]:
                md.append("- " + ed)
            md.append("")
    md.append("\n## Notes de correction (audit indépendant)\n")
    for r in rows:
        if r.get("dependencyNote"):
            md.append("**" + r["module"] + "** : " + r["dependencyNote"] + "\n")
    md.append("\n## Chaîne minimale (bout en bout) — désormais réellement complète dans la matrice ci-dessus\n")
    md.append("```\nCorpusSnapshot -> ProfessionalDiscovery -> ProfessionalVerification -> ProfessionalCorpusSet\n-> DocumentaryEligibilityRelevanceSet -> CoverageMatrix + PanelSelection -> DocumentaryTwinSet\n-> ReviewSchema -> (MissionDocumentMapping -> TargetDocumentSet) -> DocumentaryReviewSet\n-> AggregatedDocumentaryReview -> StabilityContradictionAnalysis -> UnifiedReportSummary\n```\n")
    md.append("Chaque frontière de schéma/version est vérifiée fail-fast par le module consommateur.")
    open(os.path.join(args.report_output, "mono-00-contract-matrix-v1.md"), "w").write("\n".join(md))
    print("Matrice de contrats reconstruite —", len(rows), "lignes, avec corrections 1+2+3.")

if __name__ == "__main__":
    main()
