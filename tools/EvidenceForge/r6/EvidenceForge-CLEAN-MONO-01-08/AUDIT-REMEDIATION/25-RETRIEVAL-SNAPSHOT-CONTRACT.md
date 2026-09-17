# 25 — Retrieval Snapshot Contract (R5)

Contrat de l'artefact `RetrievalSnapshot`, introduit par R5 pour fermer
R4-A01 (dépendance cyclique temporelle mission-gate ↔ auditDecisions ↔
retrieval, BLOQUANT — audit indépendant round 4). Implémenté par
`MONO-08/v0.6/lib/real-screening-workflow.js::buildRetrievalSnapshot()`
/ `verifySnapshotIntegrity()`. Voir `24-REAL-SCREENING-TWO-PHASE-
WORKFLOW.md` pour le rôle de cet artefact dans le workflow complet.

## Pourquoi cet artefact existe

`buildScreeningArtifactForMission()` (MONO-01, contrat gelé) exige une
décision humaine par `sourceId`, et ces `sourceId` ne sont générés que
par le connecteur, au moment réel de l'exécution EF-01C2 — jamais
avant. Il faut donc un point d'arrêt matérialisé, durable, entre « le
retrieval vient d'avoir lieu » et « l'opérateur a fourni ses décisions
sur les sources qu'il vient de découvrir », potentiellement dans un
AUTRE processus (l'opérateur peut mettre des heures/jours à décider).
`RetrievalSnapshot` EST ce point d'arrêt : un enregistrement figé, hashé,
persisté sur disque, de tout ce que `PREPARE_REAL_SCREENING` a
réellement produit.

## Schéma (champs minimums du mandat R5, section 10 — tous présents)

```
{
  schemaVersion:        "MONO08.RetrievalSnapshot-v1",
  snapshotId:            string,   // "snapshot-<runContractHash[0:12]>-<horodatage36>-<aléatoire>"
  missionId:              string,   // = runContract.runContractHash (convention MONO-08 existante, inchangée)
  missionQuestion:        string,
  runContractHash:        string,   // hash SHA-256 canonique du RunContract confirmé
  searchProtocolHash:     string,   // = searchProtocol.protocolHash
  plannerOutputHash:      string | null,  // depuis searchProtocol.causalLineage (R3, M-02)
  retrievalTimestamp:     string,   // ISO-8601, horodatage réel de l'exécution EF-01C2
  providerIdentity:       object,   // identité NON SECRÈTE du provider utilisé (jamais une clé/un token)
  sourceCount:            number,
  sources:                Array<SnapshotSource>,   // voir ci-dessous
  retrievalResultHash:    string,   // hash SHA-256 canonique du résultat brut EF-01C2
  retrievalRaw:            object,   // résultat BRUT complet (byConnector inclus) — nécessaire au rejeu sans second retrieval
  upstreamArtifacts: {
    runContract:    object,   // RunContract confirmé complet
    resolverTrace:  object,
    searchProtocol: object,
    ef01aInjected:  { metadata, documentBytesBase64 },  // Uint8Array->base64, voir "Sérialisation" plus bas
    ef01fInjected:  object,
  },
  snapshotHash: string,   // hash SHA-256 canonique de TOUT CE QUI PRÉCÈDE (couvre aussi upstreamArtifacts)
}
```

`SnapshotSource` (un par source réellement retrouvée) :

```
{
  sourceId:            string,   // id réel généré par le connecteur au retrieval — jamais prédit à l'avance
  connectorId:          string | null,
  connectorType:        string | null,
  providerNativeId:     string | null,   // référence native du provider si disponible (ex. DOI/URL OpenAlex)
  titre:                 string | null,
  auteurOuOrganisme:    string | null,
  date:                  string | null,
  reference:             string | null,
  discipline:            string | null,
  fieldProvenance: {
    titre: "RETRIEVAL_DERIVED" | "NOT_AVAILABLE",
    auteurOuOrganisme: "RETRIEVAL_DERIVED" | "NOT_AVAILABLE",
    date: "RETRIEVAL_DERIVED" | "NOT_AVAILABLE",
    reference: "RETRIEVAL_DERIVED" | "NOT_AVAILABLE",
    discipline: "RETRIEVAL_DERIVED" | "NOT_AVAILABLE",
  },
}
```

Aucun champ secret n'est jamais présent dans ce schéma — `providerIdentity`
est explicitement documenté comme non-secret (mandat section 10) ;
`upstreamArtifacts.runContract`/`searchProtocol`/etc. sont des artefacts
MONO-08 déjà validés hors-secret par le secret-scan existant (R2, B-02).

## Hashage et immuabilité (mandat section 12)

`snapshotHash` couvre la totalité du reste du contenu (même algorithme
canonique que `causalLineage`, R3 — `sha256CanonicalJson`, tri des clés,
JSON-safe strict). `verifySnapshotIntegrity(deps, snapshot)` recalcule ce
hash sur tous les champs sauf `snapshotHash` lui-même et compare :
toute divergence lève `SNAPSHOT_INTEGRITY_ERROR` (fail-closed réel, pas
seulement documenté). Prouvé par altération délibérée de CHAQUE champ
mandaté individuellement (titre d'une source, `sourceId`, les quatre
hashes amont, et `snapshotHash` lui-même) dans
`test/test_t08_r5_closure.js::INTEGRITY-01` — sept altérations
distinctes, sept détections.

Le snapshot n'est jamais modifié après sa construction par
`buildRetrievalSnapshot()` : aucune fonction du lot ne réécrit un
snapshot déjà persisté. `resumeRealScreening()` le lit, le vérifie, ne
l'altère jamais.

## Sérialisation (`Uint8Array` → base64)

`ef01aInjected.documentBytes` est une map `hash -> Uint8Array` (octets
bruts des documents cibles) — non hashable par `sha256CanonicalJson`
(rejet explicite et volontaire des types non-JSON-safe par le contrat
gelé MONO-01, `ef-orch-hash-v0.1.js`) et non persistable tel quel par un
backend qui écrit du JSON. `serializeEf01aInjected()` /
`deserializeEf01aInjected()` (`lib/real-screening-workflow.js`)
effectuent un aller-retour exact via base64 (`Buffer.from(...).toString
("base64")` / `new Uint8Array(Buffer.from(...,"base64"))`) — jamais une
perte de fidélité documentaire, jamais une transformation du contenu
lui-même.

## Stockage et durabilité (mandat section 11)

Persisté via le backend durable FICHIER déjà validé (R2, B-01 —
`lib/file-durable-backend.js::createFileDurableBackend`), namespace
`"retrieval-snapshots"`, clé = `snapshotId`. Aucun second mécanisme de
persistance parallèle introduit (règle constante du projet). Le
snapshot ne vit jamais uniquement dans une variable JS en mémoire :
`prepareRealScreening()` appelle `snapshotBackend.put(...)` avant de
retourner, et `resumeRealScreening()` ne connaît le snapshot que via
`snapshotBackend.get(...)`. Preuve à deux processus Node RÉELLEMENT
distincts (PID différents, aucun objet JS partagé, aucun backend
mémoire commun) : `test/cross-process/worker-prepare-screening.js`
(processus A, persiste puis `process.exit()`) suivi de
`test/cross-process/worker-resume-screening.js` (processus B, lancé
après la sortie complète de A, relit UNIQUEMENT le disque) — voir
`test_t08_r5_closure.js::CROSS-PROCESS-*`.

## Versioning

`schemaVersion: "MONO08.RetrievalSnapshot-v1"` — toute évolution future
du schéma introduira une valeur distincte, jamais une réinterprétation
silencieuse d'un schéma existant.

## Liaison à la reprise (`resume binding`)

`resumeRealScreening()`/`validatePostRetrievalAuditDecisions()` exigent
que les décisions soumises portent EXACTEMENT `snapshotId` ET
`snapshotHash` ET `missionId` du snapshot chargé — toute incohérence
sur l'un de ces trois champs est un rejet explicite (voir
`test_t08_r5_closure.js::AUDIT-DEC-02/03/04`). Ceci empêche
structurellement qu'une décision préparée pour un snapshot soit
appliquée à un autre (même mission, run différent, ou snapshot
altéré/obsolète).
