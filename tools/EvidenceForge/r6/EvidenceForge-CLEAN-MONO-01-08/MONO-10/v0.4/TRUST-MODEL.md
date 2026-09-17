# MONO-10 v0.4 — Modèle de confiance

## 1. La question que v0.3 n'avait pas tranchée

v0.3 affichait le principe « aucune valeur auto-déclarée ne constitue à elle
seule une preuve », puis fondait toute sa provenance sur un `RunEvidenceManifest`
que l'appelant fabriquait lui-même. L'auto-déclaration avait été **déplacée d'un
cran**, pas supprimée : une chaîne entièrement synthétique atteignait
`AUTHORIZED` sans qu'aucun runtime n'ait jamais existé.

v0.4 tranche : **la racine de confiance est extérieure à la chaîne.**

## 2. Deux notions, jamais confondues

| Notion | Ce qu'elle établit | Ce qu'elle n'établit pas |
|---|---|---|
| `INTERNAL_CHAIN_CONSISTENCY` | les artefacts sont cohérents entre eux, les empreintes concordent, la lignée résout | que quoi que ce soit ait réellement été exécuté |
| `AUTHENTICATED_PRODUCTION_EXECUTION` | un runtime extérieur atteste un run, signé par une autorité ancrée | que les conclusions soient vraies |

`ScientificQualification` expose les deux séparément (`internalChainConsistency`,
`authenticatedProductionExecution`, `evidenceClass`). En mode `PRODUCTION`,
`QUALIFIED` exige **les deux** ; une chaîne seulement cohérente est
`NOT_QUALIFIED` — pas un `QUALIFIED` assorti d'une réserve qu'un lecteur
pourrait ignorer.

## 3. La racine : l'autorité runtime de confiance

```
TrustedRuntimeAttestation {
  attestationId, authorityId, executionMode, runId, nonce,
  missionHash, producerId, producerVersion, issuedAt, expiresAt
  signature            Ed25519 sur la forme canonique des champs ci-dessus
}
```

Vérification (`core/trusted-runtime-authority.js`) :

1. l'`authorityId` **et** le mode d'exécution doivent correspondre à un **ancrage
   configuré** — la clé de recherche est `executionMode|authorityId` ;
2. la signature doit vérifier contre la clé publique de cet ancrage ;
3. `issuedAt` doit être réel, `expiresAt` obligatoire en `PRODUCTION` ;
4. le `nonce` n'est consommable qu'une fois (anti-rejeu) ;
5. `runId` et `missionHash` doivent correspondre à ce qui est attendu.

## 4. Où vivent les clés

| Matière | Emplacement | Dans le paquet ? |
|---|---|---|
| Clé **privée** de production | système de l'autorité runtime, hors EvidenceForge | **jamais** |
| Clé **publique** ancrée | configuration de l'exploitant | **non** — aucun ancrage de production n'est livré |
| Vérificateur | `core/trusted-runtime-authority.js` | oui |
| Autorité éphémère de test | `tools/ephemeral-authority.js` | oui, **sans aucune clé** : elle en génère en mémoire à chaque appel |

`createTrustAnchorSet` **refuse** tout ancrage contenant `PRIVATE KEY`,
`privateKeyPem` ou `secret` (`TRUST_ANCHOR_CONTAINS_SECRET`). Le test `HYG-03`
scanne le paquet entier ; `HYG-03b` prouve par témoin positif que le détecteur
discrimine une vraie clé d'un simple marqueur.

**Aucun ancrage de production n'étant livré, un déploiement sans configuration
échoue fermé.** L'absence n'est jamais permissive.

## 5. Pourquoi `tools/ephemeral-authority.js` n'est pas une faille

N'importe qui peut s'en servir pour fabriquer une autorité et signer une
attestation. Cela ne donne rien : une attestation ne vaut que si sa clé publique
a été **ancrée par l'exploitant pour le mode visé**. Le test `T03` le démontre —
une autorité portant exactement le même `authorityId`, mais une autre clé, est
rejetée.

## 6. L'authenticité de l'acte humain (§11)

Une déclaration `actorType: "human"`, `actorIdentity: "Alice"` n'est **pas** une
authentification. `core/human-act.js` sépare :

| Mode | Ce qui est accepté |
|---|---|
| `TEST` | une fixture, **si** elle se déclare `authenticationMode: "TEST_FIXTURE_DECLARED"`, et seulement sous un manifeste `TEST` |
| `PRODUCTION` | un mécanisme d'authentification **injecté** qui s'identifie lui-même |

**Aucune signature humaine n'est inventée.** Si aucun mécanisme n'est configuré
en production, le résultat est `NOT_AUTHENTICATED` et la chaîne échoue fermée
(test `HA-01`). Une fixture présentée sous un run de production est refusée
(`HA-02`).

## 7. Le registre d'autorités d'identité (§8)

Même logique, autre objet. `sourceAuthorityId` est un **libellé fourni par
l'appelant** : il ne prouve rien seul. Deux preuves ne comptent comme
indépendantes que si leurs libellés **résolvent** dans un registre d'autorités
extérieur, vers des autorités canoniques distinctes, des familles distinctes,
des identifiants distincts et des enregistrements source distincts.

Ce registre est une **configuration de l'exploitant**, de la même classe de
confiance que les ancrages : sa justesse n'est pas vérifiable par le moteur.
Voir `THREAT-MODEL.md` §3.

## 8. Ce que la confiance ne couvre pas

La confiance établie ici porte sur **l'exécution**, pas sur le **contenu**.
Un run authentifié dit qu'un runtime identifié a produit ces artefacts à ce
moment-là. Il ne dit rien de la justesse des conclusions, de la pertinence du
panel, ni de la vérité des sources. *Succès technique ≠ succès scientifique.*
