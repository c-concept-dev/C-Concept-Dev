# EvidenceForge — Charte d'Identité, ADN et Gouvernance du Projet — **v2**
## Successeur explicite de la Charte v1 — un seul point révisé : la porte du panel

**Statut :** document directeur permanent, version 2
**Remplace :** Charte v1 (`EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md`, SHA-256 `b4c160d008c33dd338979afd247945fee8dab862c96e0d1f2841c9ad87596a85`), conservée intacte et HISTORIQUE (copie : `EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE-v1-HISTORIQUE.md`). La v1 n'est ni modifiée ni réécrite : elle reste la Charte de référence de MONO-10 v0.19 gelé.
**Fondement :** `EVIDENCEFORGE-AUTONOMOUS-PANEL-GAP-ANALYSIS.md` (SHA-256 `ce9407a334287ca4d2392497f34f208ce50714580687afc48e376197670809b0`) et décision du propriétaire produit (prompt « MONO-11 v0.1 — Autonomous Panel Successor + Charte v2 + reprise P0.1 »).
**Autorité :** identique à la v1 (§40). **Portée :** tous lots à partir de MONO-11 ; MONO-10 v0.19 reste régi par la v1.

---

## 0. Ce qui change, et rien d'autre

**Tous les articles de la v1 sont conservés mot pour mot**, à l'exception des passages ci-dessous, révisés parce que le besoin produit l'exige (« le propriétaire ne veut pas sélectionner manuellement les professionnels à chaque run ») et parce que l'audit d'impact a établi que la valeur de sécurité de la porte tenait à l'**authentification de l'acte par la frontière opérateur**, non à la nature humaine de l'acteur (MONO-10 `THREAT-MODEL.md §6`).

| Article v1 | Révision v2 |
|---|---|
| §4 pipeline : `VALIDATION HUMAINE DU PANEL DOCUMENTAIRE` | `ÉVALUATION SÉMANTIQUE RÉELLE CANDIDAT ↔ MISSION` → `ÉVALUATION DE SUFFISANCE DU CORPUS` → `MACHINE EVIDENCE GATE` → `[OVERRIDE HUMAIN OPTIONNEL]` |
| §8 statuts | ajout de `AUTO_APPROVED_FOR_DOCUMENTARY_PANEL`, `AUTO_REJECTED`, `AUTO_DEFERRED`, `AMBIGUOUS`, `INSUFFICIENT_DOCUMENTARY_BASIS` ; `APPROVED_FOR_DOCUMENTARY_PANEL` reste l'état d'un override humain |
| §9 human-in-the-loop | l'humain **peut** auditer, renverser (override authentifié), résoudre un cas exceptionnel, décider l'usage aval ; il **n'est plus requis** pour chaque panel |
| §17 fail-closed | `validation humaine absente → continuation automatique` devient `gate de preuves absent, invalide ou vide → continuation automatique` (interdit) ; ajout `acte machine présenté comme acte humain` (interdit) |
| §28 anti-circularité | « gate humain » devient « gate de preuves (G-8 : soutien par la seule source-graine ⇒ jamais admis) + override humain » |
| §37 STOP | « human gate requis mais absent » devient « gate de preuves requis mais absent ou invalide ; acte humain simulé ; acte machine déguisé » |

---

## 4. PIPELINE CANONIQUE (v2)

```text
PHRASE D'AUDIT
      ↓
COMPRÉHENSION DE LA MISSION
      ↓
DÉCOMPOSITION DYNAMIQUE DES DIMENSIONS À EXAMINER
      ↓
DÉTERMINATION DES EXPERTISES NÉCESSAIRES
      ↓
STRATÉGIE DE RECHERCHE
      ↓
DÉCOUVERTE DOCUMENTAIRE
      ↓
SCREENING / QUALIFICATION DES SOURCES
      ↓
DÉCOUVERTE DE PROFESSIONNELS RÉELS
      ↓
VÉRIFICATION D'IDENTITÉ
      ↓
CORPUS PROFESSIONNEL ATTRIBUABLE
      ↓
ÉVALUATION SÉMANTIQUE RÉELLE CANDIDAT ↔ MISSION   (preuve enregistrée, oracle réel)
      ↓
ÉVALUATION DE SUFFISANCE DU CORPUS                  (sonde réelle, politique contractuelle)
      ↓
MACHINE EVIDENCE GATE                                (décision machine, acteur machine, G-1…G-11)
      ↓
[OVERRIDE HUMAIN OPTIONNEL — acte humain authentifié, jamais requis]
      ↓
PANEL DOCUMENTAIRE AUTONOME
      ↓
CONSTRUCTION DES CORPUS PROFESSIONNELS
      ↓
ÉLIGIBILITÉ DES JUMEAUX
      ↓
CONSTRUCTION DES JUMEAUX PROFESSIONNELS
      ↓
MÊME MISSION SOUMISE À CHAQUE JUMEAU
      ↓
REVUES INDÉPENDANTES
      ↓
AGRÉGATION
      ↓
CONVERGENCES / DIVERGENCES / RÉSERVES / INCONNUS
      ↓
ANALYSE DE STABILITÉ ET CONTRADICTIONS
      ↓
QUALIFICATION SCIENTIFIQUE DU PROCESSUS
      ↓
RAPPORT UNIFIÉ ET VERDICT
      ↓
ACCEPTATION HUMAINE POUR USAGE EN AVAL  (conservée : décision normative, seulement si l'usage aval l'exige)
```

Chaque étage conserve les exigences de la v1 : entrées et sorties explicites, provenance, validation, état d'échec clair, lineage, aucune promotion silencieuse.

---

## 8. STATUTS PROFESSIONNELS À NE PAS CONFONDRE (v2)

```text
SEED_AUTHOR
DISCOVERED_CANDIDATE
IDENTITY_RESOLVED
CORPUS_ATTRIBUTED
RELEVANCE_SUPPORTED | RELEVANCE_PARTIAL | RELEVANCE_NOT_DETERMINABLE | RELEVANCE_OUT_OF_SCOPE | RELEVANCE_UNKNOWN
CORPUS_SUFFICIENT | CORPUS_INSUFFICIENT | CORPUS_UNKNOWN
AUTO_APPROVED_FOR_DOCUMENTARY_PANEL | AUTO_REJECTED | AUTO_DEFERRED | AMBIGUOUS | INSUFFICIENT_DOCUMENTARY_BASIS
APPROVED_FOR_DOCUMENTARY_PANEL   (override humain authentifié, optionnel)
ELIGIBLE_FOR_TWIN
TWIN_CREATED
```

Aucun statut n'entraîne automatiquement le suivant sans le gate prévu. Les règles fixes restent interdites :

```text
ORCID_PRESENT ≠ AUTO_APPROVED
recouvrement lexical ≠ RELEVANCE_SUPPORTED
libellé de requête ≠ expertise
citations ≠ pertinence
AMBIGUOUS → jamais admis, par personne
INSUFFICIENT_DOCUMENTARY_BASIS → jamais auto-promu
AUTO_DEFERRED → terminal dans le run nominal
```

---

## 9. HUMAIN, MACHINE ET ACTES (v2)

Le **Machine Evidence Gate** décide l'admission au panel documentaire sur des **preuves explicites, liées au run et auditables** (identité résolue, preuves attribuées à la bonne personne, pertinence documentaire réelle, corpus suffisant, ambiguïtés non bloquantes, couverture consignée, indépendance du verdict, anti-circularité, diversité observée, désaccords conservés, provenance complète — critères G-1…G-11 de l'audit). Un critère non évaluable est `UNKNOWN`, jamais `SATISFIED`.

L'humain reste :
- **auditeur** : chaque décision machine est lisible, motivée (`reasonCodes`, `criteria`, `unresolvedFacts`) et rejouable ;
- **override explicite** : un acte humain **authentifié par la frontière opérateur** (`ProfessionalPanelValidation` de MONO-10) peut retirer un admis ou admettre un `AUTO_DEFERRED` / `INSUFFICIENT` / `AUTO_REJECTED` — jamais un `AMBIGUOUS` ;
- **résolution exceptionnelle** et **mode expert** : au choix de l'exploitant ;
- **décideur aval / normatif** : l'acceptation finale du rapport reste humaine lorsque l'usage aval l'exige (§31 inchangé).

Invariant absolu ajouté : **un acte machine porte `actorType: "machine"` et une identité réelle de mécanisme (module, hash, frontière, run). Il n'est jamais présenté, signé ou consigné comme un acte humain.** Le validateur d'acte humain de MONO-10 (`human-act.js`) refuse à raison un acte machine ; ce refus est un test, pas un défaut.

Toute admission par gate machine est **une réserve consignée** dans la qualification du processus : `PANEL_ADMITTED_BY_MACHINE_EVIDENCE_GATE_WITHOUT_HUMAN_ACT`. `QUALIFIED` sans réserve est inatteignable par construction ; `QUALIFIED_WITH_RESERVATIONS` est le meilleur état possible.

---

## 17. FAIL-CLOSED (v2)

```text
0 professionnels → SUCCESS scientifique                  interdit
0 jumeaux → SUCCESS scientifique                         interdit
0 revues → SUCCESS scientifique                          interdit
LLM absent ou non prouvé → SUCCESS                       interdit
identité ambiguë → panel (machine ou humain)             interdit
gate de preuves absent, invalide ou vide → continuation  interdit
acte machine présenté comme acte humain                  interdit
acte humain simulé                                       interdit
```

---

## 28. PROTECTION CONTRE LA CIRCULARITÉ (v2)

Éviter `source retenue → auteur retenu → expert validé → jumeau → conclusion confirmant la source` sans contrôle indépendant.

Protections : seed ≠ panel ; identité ≠ expertise ; expertise ≠ vérité ; source citée ≠ sélection automatique ; découverte secondaire ; pertinence évaluée sur le **corpus attribué du candidat**, jamais sur le seul libellé de requête ; **G-8 : un soutien de pertinence reposant uniquement sur la source-graine ne permet jamais l'admission** ; le gate ne voit aucun artefact aval (G-7) ; divergences conservées ; override humain possible ; sélection indépendante du résultat attendu.

---

## 37. RÈGLE DE STOP (v2)

Le système s'arrête si : contrat contradictoire ; identité non résolue critique ; artefact obligatoire absent ; **gate de preuves requis mais absent ou invalide** ; **acte humain simulé ou acte machine déguisé en acte humain** ; LLM requis mais non réellement disponible ; lineage cassé ; source ou professionnel fabriqué ; dépendance déclarative non prouvée ; modification d'un lot gelé non autorisée ; hardcoding métier introduit ; résultat scientifique produit à partir d'un pipeline vide ; tentative de transformer un inconnu en certitude.

**Fail closed. Toujours.**

---

## Articles inchangés

§1, §2, §3, §5, §6, §7, §10, §11, §12, §13, §14, §15, §16, §18, §19, §20, §21, §22, §23, §24, §25, §26, §27, §29, §30, §31, §32, §33, §34, §35, §36, §38, §39, §40 de la v1 s'appliquent **tels quels** (voir la copie historique). En particulier : universalité et anti-hardcoding (§2, §18, §33), unknown reste unknown (§10), non-fabrication (§15), lineage (§16), LLM = capacité réelle prouvée (§14), qualification du processus ≠ verdict (§12), artefacts gelés jamais réécrits (§13, §21), préambule et checklists (§34–§36), serment (§38).

Ajout au préambule §34 (ligne à insérer après « aucune décision humaine simulée ; ») :

```text
- aucun acte machine présenté comme acte humain ;
- la sélection du panel est autonome et fondée sur preuves ; l'humain audite ou renverse, il n'est pas requis ;
```

---

**FIN — CHARTE v2 — le seul point révisé est la porte du panel ; tout le reste est la v1.**
