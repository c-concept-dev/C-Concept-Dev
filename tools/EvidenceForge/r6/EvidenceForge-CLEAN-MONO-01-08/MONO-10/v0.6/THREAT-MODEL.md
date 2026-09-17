# MONO-10 v0.6 — modèle de menace

## 1. Adversaire considéré

Un appelant qui contrôle entièrement le code appelant : il choisit les
artefacts, les arguments, les callbacks, le `runContext`, les politiques, et
peut rejouer ou dupliquer des objets. Il **ne** contrôle pas l'environnement du
processus ni le système de fichiers de l'exploitant.

## 2. Hors périmètre, déclaré

- **Écriture de `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` ou du fichier désigné.**
  Qui peut le faire obtient une frontière de PRODUCTION. Cette limite est
  énoncée, pas résolue (voir `TRUST-MODEL.md` §7).
- Compromission du secret d'attestation d'acte de l'exploitant.
- Compromission du système d'exploitation, du binaire Node ou de `require`.
- Vérité du contenu du verdict : EvidenceForge qualifie un **processus**, pas une
  conclusion. Qualité du processus ≠ contenu du verdict.

## 3. Attaques dans le périmètre, et leur issue

| Attaque | Issue |
|---|---|
| artefact entièrement fabriqué | refusé — aucune attestation authentifiée |
| manifeste cohérent mais non authentique | aucun registre n'est ouvert |
| l'appelant frappe sa propre paire de clés et injecte son ancre | impossible — l'ancre vient de l'environnement |
| callback `acceptanceValidator` fourni par l'appelant | ignoré et consigné |
| `REJECT` humain converti en autorisation | refusé — décision bloquante en dur |
| acceptation vide `{}` | refusée |
| `humanAcceptanceRequired: false` dans la politique | clé retirée et consignée |
| éligibilité `ELIGIBLE...` écrite sur l'objet remis au consumer | ignorée — recalcul au sink |
| `recomputed: true` fabriqué | sans effet — la marque est un `WeakSet` module-privé |
| vérification professionnelle entièrement fabriquée | ne fait entrer personne pour `DEFER`/`REJECT` |
| artefact inséré dans le registre après attestation | reste `BOUND_TO_RUN` |
| mutation d'un artefact enregistré | contenu gelé ; réempreinte à la lecture |
| suppression, réordonnancement, réécriture d'un événement de registre | chaîne invalide |
| nom d'acteur connu présenté comme preuve d'acte | refusé |
| `HumanActProof` forgée, rejouée d'un autre run, d'une autre mission, d'un autre acte | refusée |
| `consumeNonce: false` sous PRODUCTION | ignoré et consigné |
| second vérificateur, même réserve de nonces | rejeu refusé |
| seconde frontière, même autorité et même namespace | rejeu refusé |
| réserve anti-rejeu sans périmètre d'autorité | `REPLAY_STORE_SCOPE_MISSING` |
| même clé physique en TEST et en PRODUCTION | `TRUST_ANCHOR_KEY_CROSS_NAMESPACE` |
| clé révoquée après provisionnement du vérificateur | refus immédiat (`LIVE_CONFIG_LOOKUP`) |
| deux preuves réétiquetées portant le même contenu | jamais indépendantes |
| provenance inconnue présentée comme corroboration | `UNKNOWN` ne corrobore rien |
| racine de source déclarée en ligne par l'appelant | non crue |
| `dimensionsHash` copié d'une autre phase | `READINESS_DIGEST_MISMATCH` |
| dimensions `NOT_ASSESSED` sans provenance | `READINESS_DIMENSIONS_UNSOURCED` |
| référence de lignée réétiquetée | `LINEAGE_TYPE_RELATION_MISMATCH` |
| `crossRunAllowedRelations` fourni par l'appelant | ignoré et consigné |
| contrat historique sans authentification de l'exploitant | ne résout rien |
| rejeu sémantique d'une transition d'inconnu | `UNKNOWN_SEMANTIC_REPLAY` |
| statut d'inconnu forcé sur une copie | `UNKNOWN_STATUS_FORGED` |
| transport LLM fourni par l'appelant | ignoré ; `transportOrigin: ENVIRONMENT` |
| fournisseur, modèle ou worker hors liste blanche | `UNAVAILABLE` |
| absence de frontière de capacité LLM | *fail closed* |
| capacité prouvée dans un autre run | non utilisable |
| rapport lié à une autre mission, une autre qualification, une autre racine | refusé |
| politique de contournement (`force*`, `skip*`, `bypass*`, `allow*`…) | clés retirées et consignées |
| contrefaçon de marque d'origine (9 vecteurs) | aucune n'est reconnue |

## 4. Ce que le lot ne prétend pas

- Il ne prouve pas qu'un LLM réel a répondu : aucun appel réseau n'a lieu.
- Il ne prouve pas qu'un humain a réellement décidé : il prouve qu'une preuve
  d'acte liée à cet acte précis a été émise par le mécanisme de l'exploitant.
- Il ne prouve pas qu'une étape aval a réussi : `AUTHORIZED` est une permission,
  pas un résultat.
- Succès technique ≠ succès scientifique.
