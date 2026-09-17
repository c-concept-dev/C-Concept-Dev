# MONO-10 v0.6 — modèle de confiance

## 1. Ce qui a été cru, version par version

| Version | Racine de confiance effective | Rompu par |
|---|---|---|
| v0.1–v0.2 | l'artefact lui-même | un artefact fabriqué suffisait |
| v0.3 | le manifeste de run | un manifeste cohérent entièrement synthétique → `AUTHORIZED` |
| v0.4 | un argument de fonction (`anchorSet`) | l'appelant forge sa paire de clés et injecte sa propre ancre |
| v0.5 | l'environnement d'exploitation | racine externe **à l'ouverture** ; les **consommateurs** croyaient encore des champs reçus |
| **v0.6** | l'environnement d'exploitation **et** le recalcul au point d'effet | hypothèse §7 ci-dessous |

La récursion n'a pas été dissimulée à chaque étape : elle a été nommée.

## 2. Ce qui n'est jamais une racine de confiance

- un artefact, même signé par lui-même ;
- un manifeste de run ;
- une attestation de runtime **produite par l'appelant** ;
- un argument de fonction libre ;
- un callback fourni par l'appelant, même nommé `operatorVerifier` ;
- un `runContext` contrôlé par l'appelant ;
- le composant qui construit la preuve ;
- **une valeur calculée précédemment dans le même processus**, si elle peut
  être remplacée avant consommation (fermeture v0.6).

## 3. Ce qui est une racine de confiance

Un fichier JSON désigné par `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`, lu par
`provisionProductionTrustBoundary()`. Le noyau ne reçoit **jamais** ce chemin en
argument : il le lit dans l'environnement du processus.

`provisionTestTrustBoundary(cfg)` accepte une configuration en mémoire mais
**refuse structurellement** `namespace: "PRODUCTION"` — la séparation n'est pas
une convention de nommage.

## 4. Aucun secret n'est stocké dans le lot

- aucune clé privée n'est lue par `core/` ;
- `credentialPresenceAttested` est un **booléen ou une preuve de présence**,
  jamais une clé ;
- l'attestation d'acte humain est un HMAC calculé par l'exploitant
  (`tools/operator-provisioning.js`) à partir d'un secret détenu par
  l'exploitant, jamais embarqué ;
- le scan d'hygiène du paquet vérifie l'absence de matière privée (PEM, jetons)
  avec un témoin positif pour prouver que le détecteur discrimine.

## 5. Révocation

Le vérificateur relit la configuration de l'exploitant à chaque vérification :
`revocationModel = "LIVE_CONFIG_LOOKUP"`. Une clé révoquée **après**
provisionnement du vérificateur cesse d'authentifier immédiatement. C'est
vérifié par un test qui accepte l'attestation, révoque la clé, puis constate le
refus motivé.

## 6. Deux affirmations, jamais confondues

`INTERNAL_CHAIN_CONSISTENCY` ≠ `AUTHENTICATED_PRODUCTION_EXECUTION`. Un run
TEST peut être parfaitement cohérent : sa classe de preuve reste
`AUTHENTICATED_TEST_EXECUTION` et `authenticatedProductionExecution` vaut
`false`. Aucune politique ne convertit l'une en l'autre.

## 7. LIMITE DÉCLARÉE — l'hypothèse d'environnement d'exploitation

**Tout processus capable d'écrire `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`, ou le
fichier qu'il désigne, obtient une frontière de PRODUCTION.**

Cette hypothèse n'est pas résolue par v0.6. Elle est déplacée vers la couche qui
peut réellement la porter : le contrôle d'accès du système d'exploitation, la
séparation des comptes, l'intégrité du système de fichiers. Ce qui **est** acquis
est que la racine n'est plus reconstructible *depuis le code appelant* :
fabriquer un artefact, un manifeste, une attestation, un callback ou un
`runContext` ne suffit plus.

Un audit qui conclurait « l'auto-certification a simplement été déplacée vers la
variable d'environnement » décrirait exactement ce que ce paragraphe énonce. La
question ouverte est de savoir si ce déplacement est suffisant pour un usage
professionnel réel — et cette question n'appartient pas à ce lot.
