# EVIDENCEFORGE MONOLITH v1.0.12 — FREEZE RECORD

**Statut : FROZEN_WITH_RESERVATIONS** · gelé par OWNER (D1, 2026-09-22) · enregistré 2026-09-22T14:26:21+00:00

**Le gel signifie** : checkpoint d'intégration gelé (v1.0.11 + lot gelé MONO-11 v0.4 + conditions R5 / R6 fermées). **Il ne signifie pas `READY_FOR_ACTIVATION`.**

> **`ACTIVATION_BLOCKED_BY_RA2 = true`** — l'activation est bloquée jusqu'à : correctif R-A2 implémenté, audité et gelé (v1.0.13) ; smoke réel borné mesurant R12 ; décision propriétaire d'activation.

## Identité

- version : MONOLITH-v1.0.12 — GLOBAL LINEAGE INTEGRATION CHECKPOINT · parent : MONOLITH-v1.0.11 (gelé)
- manifeste runtime : **158 fichiers**, contentHash `9552b45e484cf2e3cdc4f7ef08e275cd1de117055e2643ac854e7a196178f3e2` · MANIFEST `d8bb0d3e7c28a6cc…` · SHA256SUMS `3c1c736fd19bb1a7…`
- `lib/ef03b-resilience.js` : `564a0e3d7a507f1f981a73f6799675236efe9655bcb13154ea9c9b00ae077798`
- lot gelé MONO-11 **v0.4** : sceau `110db4de24709926…`, runCodeHash `27610c84502104b3…`, zip `79c16d08a0a52bc1…`, contrat **MONO-11-v3**
- _runtimeSealSha256 et runCodeHash appartiennent au LOT MONO-11 ; le monolithe porte un MANIFEST / SHA256SUMS et un contentHash (correction de vocabulaire de l'audit independant)_

## Zip / manifeste (D4)
D4 — perimetre runtime AUDITE ; package.sh NON execute (il regenererait le manifeste en y incluant les rapports d'audit et changerait le contentHash audite) ; aucun zip canonique v1.0.12

Rapports hors manifeste runtime ; intégrité par `EVIDENCEFORGE-v1.0.12-GOVERNANCE.SHA256SUMS.txt`.

## Audits

- intégration : `EVIDENCEFORGE-v1.0.12-INTEGRATION-REPORT.md` `9eb2e4955cfb9db7…`
- indépendant : `EVIDENCEFORGE-v1.0.12-INDEPENDENT-FREEZE-AUDIT.md` `f21a3e1dcfa5a647…` (json `94ddfe98e7c2d98d…`) — **V1_0_12_FREEZE_AUDIT_PASS_WITH_RESERVATIONS**, recommandation GELER, 0 bloqueur
- **R5 : ADAPTER_MONO11_PARITY_PASS** · **R6 : PASS** · **GLOBAL_LINEAGE_PRESERVATION : KNOWN_GAP_REMAINS**

## Mesures

- monolith : 292/292
- chunking : 21/21
- secretScan : 0
- antiHardcoding : 0
- manifestVerify : ok 158
- frozenLots : MONO-10 79 / MONO-09 9 / MONO-01 106 / MONO-11 55, 0 divergence
- shadowA10 : 70 constats / 12 citations restaurees / 3 constats vides restaures
- aggregation : 13 / 9 / 7 / 0 / 67 / 10 ; QUALIFIED_WITH_RESERVATIONS ; SCIENTIFICALLY_USABLE = NO
- revertCheck : R5 -> 290/292 (T-EF03B-34, V12-02) ; R6a -> 285/292 ; R6b -> 288/292 ; R6c -> 291/292

## Réserves

| id | sévérité | nouvelle | préexistante | résumé |
|---|---|---|---|---|
| R-A1 | medium | oui | — | Parite octet du candidat TRACE non tenue sur les passes ou parseRepair echoue cote lot (18/48) : l adaptateur ignore rp.ok et passe toutes les dimensions au lieu des seules fautives ; la trace EF-03B peut afficher CANDIDATE_VALID pour une passe rejetee par le lot (cas 25). Aucune ecriture au registre, aucune fausse acceptation. |
| R-A2 | medium_high | oui | oui | Le miroir lit le document dans st.ctx.content (re-analyse du prompt) et non doc.content ; si le corps du document contient le marqueur BASE DOCUMENTAIRE DU PROFESSIONNEL, parseReviewPromptContext rend un contenu silencieusement tronque (contextUnparsed reste 0) => le registre recoit un candidat AMPUTE marque VALID, reutilisable a 0 appel. Chaine causale prouvee de bout en bout. NON introduit par v1.0.12 (v1.0.11 amputait sans condition). |
| R-A3 | low | oui | — | tools/build-manifest.js l.15 annonce le contrat de validation comme MESURE en chargeant le module ; il est en realite deduit par expression reguliere sur la source de lib/llm.js puis relu dans la config. Ecart provenance annoncee / provenance reelle. |
| R-A4 | low | oui | — | 17 des 18 tests V12-* ne detectent pas un retour arriere de R5 : parity() compare deux sorties produites toutes deux par le lot gele. Seul V12-02 est decisif (avec T-EF03B-34, partiellement textuel). Prouve par revert. |
| R-A5 | info | oui | oui | report-restored.json ne se verifie pas sous le module de rapport gele (ec0ef55a... vs 88145afc...) uniquement a cause d une cle d annotation restoration ajoutee apres hachage ; en la retirant, 88145afc... est reproduit exactement. Artefact A10, hors perimetre v1.0.12 (stage-report.js identique en v1.0.10/11/12). |
| R-A6 | low | oui | — | tools/package.sh appelle build-manifest.js : l executer au gel regenerera MANIFEST.json / SHA256SUMS.txt et y inclura les rapports d audit. Decision explicite requise (cf. decision D2 du lot MONO-11 v0.4). |
| R3 | medium | — | — | Libelle de passe 3 du lot gele (review-enforcer.js l.245) : accuse le modele d avoir REPRODUIT A L IDENTIQUE alors qu en CAS B c est v0.4 qui re-presente (applied=raw). Attenuation : une citation inventee est non litterale donc refusee ; fail-closed borne a 3 passes. Pire cas = une passe perdue, jamais une fausse acceptation. Correctif = futur lot MONO-11. |
| R4 | low | — | — | Un parseRepair illisible laisse repairUnresolvedDimensions=[] ; l echec reste EXPLICITE (repair.parsed=false + REPAIR_JSON_INVALID dans errorCodes + reviewStatus error) aux deux niveaux de trace. Aucun risque de fausse reussite ; tracabilite indirecte mais reelle. |
| R12 | info | — | — | Durcissement voulu (Q6) : CAS B avec reparation [] echoue desormais en fail-closed au lieu de livrer un [] faussement reussi. Davantage de reviewStatus error attendus en run reel. A mesurer en smoke reel AVANT activation. |
| R13 | low | — | — | Aucun zip canonique v1.0.12. NON BLOQUANT : v1.0.11 a ete gelee sans zip (FREEZE-RECORD sans canonicalZipSha256) ; le zip releve de l acte de gel et tools/package.sh existe a la bonne version. Caveat : zip -X sans neutralisation des horodatages => reconstruction bit-a-bit non garantie (identique a R13 du lot). |

## R-A2 — bloquante pour l'activation (D2)

le miroir de l'adaptateur evalue la litteralite sur st.ctx.content (reconstruit depuis le prompt) au lieu de doc.content ; un document contenant le marqueur BASE DOCUMENTAIRE DU PROFESSIONNEL peut etre silencieusement tronque => candidat ampute inscrit VALID au registre => reutilise a 0 appel => perte silencieuse de lignee

Préexistante : oui (non introduite par v1.0.12). Correctif : **MONOLITH-v1.0.13 (RA2_DOCUMENT_CONTENT_AUTHORITY_FIX)**.

## Autres dispositions

- **R-A1** : D3 — corrigee dans le meme chantier SI strictement locale au miroir (parite de trace uniquement)
- **R-A3** : observation non bloquante (documentation)
- **R-A5** : observation non bloquante (artefact shadow/audit)
- **R12** : EXPECTED_STRICTNESS — smoke reel requis avant activation, pas maintenant
- **R13** : non bloquant (D4 : aucun zip canonique)

## ACTIVE_VERSION et run historique

- `activeVersionChanged = false` — ACTIVE_VERSION = **MONOLITH-v1.0.10** (D5) ; aucun run réel avec v1.0.12.
- run `efm-20260918-a64167c0` : lié à MONOLITH-v1.0.10 / MONO-11 v0.3-r1 ; reportHash `a962d5eefeb033ac…` ; shadow `88145afc76b05abf…` (artefact parallèle) ; AUCUNE ; D103 inchange
