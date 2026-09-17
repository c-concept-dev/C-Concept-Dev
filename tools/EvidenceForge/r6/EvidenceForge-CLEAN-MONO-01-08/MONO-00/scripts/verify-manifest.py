#!/usr/bin/env python3
"""T00-13/T00-14 — logique de classement utilisée par build-registry.
Injecte un module sans preuve suffisante -> doit produire UNVERIFIED, jamais une supposition.
Injecte deux artefacts concurrents avec hashes incompatibles -> doit produire CONFLICT.
"""
def classify(module):
    has_package = module.get("package_found", False)
    has_manifest = module.get("manifest_found", False)
    manifest_complete = module.get("manifest_complete", None)
    hashes_match = module.get("hashes_match", None)
    tests_found = module.get("tests_found", False)
    tests_rerun_pass = module.get("tests_rerun_pass", None)
    competing_hashes = module.get("competing_canonical_hashes", None)

    if competing_hashes and len(set(competing_hashes)) > 1:
        return "CONFLICT"
    if not has_package and not module.get("canonical_sources_identified", False):
        return "UNVERIFIED"
    if has_package and has_manifest and manifest_complete and hashes_match and tests_found and tests_rerun_pass:
        return "VERIFIED_FROM_CANONICAL_PACKAGE"
    if module.get("canonical_sources_identified") and module.get("reference_hashes_available") and hashes_match and tests_found and tests_rerun_pass:
        return "VERIFIED_FROM_CANONICAL_ARTIFACTS"
    if module.get("documented_frozen", False):
        return "HISTORICAL_FREEZE_CONFIRMED"
    return "UNVERIFIED"

if __name__ == "__main__":
    injected_unverified = {"package_found": False, "canonical_sources_identified": False}
    result13 = classify(injected_unverified)
    print("T00-13 (module sans preuve) ->", result13, "(attendu UNVERIFIED)", "PASS" if result13 == "UNVERIFIED" else "FAIL")

    injected_conflict = {"competing_canonical_hashes": ["aaa111", "bbb222"], "package_found": True, "manifest_found": True}
    result14 = classify(injected_conflict)
    print("T00-14 (hashes concurrents incompatibles) ->", result14, "(attendu CONFLICT)", "PASS" if result14 == "CONFLICT" else "FAIL")
