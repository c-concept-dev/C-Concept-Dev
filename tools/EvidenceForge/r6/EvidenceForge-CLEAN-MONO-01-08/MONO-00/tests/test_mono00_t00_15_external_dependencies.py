#!/usr/bin/env python3
"""MONO-00 — T00-15 : External dependency inventory.
CORRECTION 3 (post-audit) : EF-ORCH était déclaré llm=false, ce qui était
inexact (dépendance LLM indirecte/amont réelle sur EF-01B/EF-01C1, jamais
représentée). Ce test empêche toute régression future de ce type en
vérifiant la cohérence des dépendances externes déclarées dans la matrice
de contrats, module par module.
Entièrement auto-suffisant : lit uniquement les fichiers de CE paquet.
"""
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MATRIX_PATH = os.path.join(SCRIPT_DIR, "..", "registry", "mono-00-contract-matrix-v1.json")

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

matrix = json.load(open(MATRIX_PATH))
rows_by_module = {r["module"]: r for r in matrix["rows"]}

def has_dep(module, substrings):
    row = rows_by_module.get(module)
    if not row:
        return False
    text = json.dumps(row, ensure_ascii=False).lower()
    return any(s.lower() in text for s in substrings)

# === EF-ORCH doit contenir une dépendance LLM (même indirecte) et les trois connecteurs ===
check("T00-15a: EF-ORCH contient une dépendance LLM (directe ou indirecte)", has_dep("EF-ORCH", ["llm"]))
check("T00-15b: EF-ORCH contient OpenAlex", has_dep("EF-ORCH", ["openalex"]))
check("T00-15c: EF-ORCH contient Crossref", has_dep("EF-ORCH", ["crossref"]))
check("T00-15d: EF-ORCH contient PubMed", has_dep("EF-ORCH", ["pubmed"]))

# === EF-02A doit contenir LLM + Worker ===
check("T00-15e: EF-02A contient LLM", has_dep("EF-02A", ["llm"]))
check("T00-15f: EF-02A contient Worker", has_dep("EF-02A", ["worker"]))

# === EF-02C doit contenir Worker/OpenAlex ===
check("T00-15g: EF-02C contient Worker ou OpenAlex", has_dep("EF-02C", ["worker", "openalex"]))

# === EF-02D doit contenir LLM ===
check("T00-15h: EF-02D contient LLM", has_dep("EF-02D", ["llm"]))

# === EF-03B doit contenir LLM ===
check("T00-15i: EF-03B contient LLM", has_dep("EF-03B", ["llm"]))

# === EF-03D ne doit PAS contenir LLM (entièrement déterministe) ===
row_03d = rows_by_module.get("EF-03D", {})
llm_field_03d = row_03d.get("llm")
check("T00-15j: EF-03D a llm=False explicitement (aucune dépendance LLM)", llm_field_03d is False)

# === EF-04 (Lineage Guard) ne doit PAS contenir LLM ===
row_04 = rows_by_module.get("EF-04 (Lineage Guard)", {})
llm_field_04 = row_04.get("llm")
check("T00-15k: EF-04 (Lineage Guard) a llm=False explicitement (aucune dépendance LLM)", llm_field_04 is False)

# === Vérification structurelle : EF-ORCH.llm ne doit plus être littéralement False (régression corrigée) ===
row_orch = rows_by_module.get("EF-ORCH", {})
check("T00-15l: EF-ORCH.llm n'est PLUS littéralement False (régression du bug corrigé)", row_orch.get("llm") is not False)
check("T00-15m: EF-ORCH possède un champ externalDependencies non vide", len(row_orch.get("externalDependencies", [])) >= 3)

all_pass = True
for name, ok, detail in results:
    if not ok: all_pass = False
    print(("PASS" if ok else "FAIL") + " — " + name + ((" [" + detail + "]") if detail and not ok else ""))
print("\n" + ("TOUS LES TESTS PASSENT (%d)" % len(results) if all_pass else "ECHECS DETECTES"))
sys.exit(0 if all_pass else 1)
