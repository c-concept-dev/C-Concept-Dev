# MONO-10 v0.6 — architecture

## 1. Deux affirmations séparées

EvidenceForge distingue en permanence deux propriétés qui se ressemblent :

| Propriété | Ce qu'elle dit | Ce qu'elle ne dit pas |
|---|---|---|
| `INTERNAL_CHAIN_CONSISTENCY` | les artefacts concordent entre eux | que la chaîne a réellement été exécutée |
| `AUTHENTICATED_PRODUCTION_EXECUTION` | une frontière provisionnée par l'exploitant a authentifié l'exécution | que le contenu du verdict est vrai |

Une chaîne cohérente avec elle-même n'est pas nécessairement authentique. Les
deux sont requises pour `QUALIFIED` en PRODUCTION.

## 2. Les quatre frontières d'exploitation

`OperatorTrustBoundary` est obtenue **hors du processus appelant**, par lecture
de `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` (chemin vers un fichier JSON). Elle
provisionne quatre capacités, chacune marquée par un `WeakSet` module-privé :

```
OperatorTrustBoundary
├── anchorSet + keyLifecycle        → authentifie l'attestation de runtime
├── replayStore                     → consomme les nonces (périmètre d'autorité obligatoire)
├── humanAuthMechanism              → vérifie les actes humains (HumanActProof)
├── llmCapabilityBoundary           → charge son propre transport ; liste blanche
└── acceptanceBoundary              → valide l'acceptation du rapport final
```

Aucune de ces capacités ne peut être passée en argument, ni imitée : les
fonctions `isProvisioned*` n'acceptent que des objets marqués à la construction
par le module lui-même. Neuf attaques de contrefaçon ont été testées (forme
imitée, `Object.create`, copie superficielle, prototype forcé, aller-retour
JSON, `Proxy`, `structuredClone`, `vm.Context`, rechargement de module) : toutes
échouent, la dernière en *fail-closed*.

## 3. Chaîne d'exécution

```
Mission
  → DocumentaryEvidenceRecord*                  (registre authentifié)
  → ProfessionalDiscovery            [amont]
  → ProfessionalDiscovery liée       [adapters/upstream-evidence-binder.js]
  → ProfessionalVerification         [amont]
  → ProfessionalCandidateAssessment  (identité, provenance résolue, pertinence)
  → ProfessionalPanelValidation      (décision humaine + HumanActProof)
  → RECALCUL DE L'ÉLIGIBILITÉ AU SINK
  → ProfessionalCorpusSet            [consumer amont réel]
  → DocumentaryTwinSet → ReviewSet → Aggregation
  → ScientificReadiness (PRE puis FULL)
  → LlmCapability
  → ScientificQualification
  → ScientificUnifiedReport
  → FinalReportAcceptance            (validée par la frontière, pas par l'appelant)
  → DownstreamUseAuthorization
```

## 4. Le point d'effet

Un point d'effet est l'endroit où une valeur **produit une conséquence** :
entrée au corpus, promotion de phase, qualification, autorisation aval. v0.6
impose, à chacun, l'une des deux règles suivantes :

1. **recalcul** depuis des preuves authentifiées (`panel-gated-adapter`
   recalcule l'éligibilité juste avant l'entrée au corpus, sans lire aucun champ
   reçu comme décision) ;
2. **capacité provisionnée** (l'acceptation est validée par
   `acceptanceBoundary()`, pas par un callback de l'appelant).

Une valeur calculée plus tôt dans le processus n'est pas fiable au point d'effet
si elle peut être remplacée avant consommation. C'est pourquoi
`deriveEffectiveEligibility` marque sa décision dans un `WeakSet` module-privé :
une copie JSON de la décision n'est plus une décision.

## 5. Niveaux de confiance d'artefact

`core/artifact-trust-levels.js` ordonne strictement :

```
REGISTERED  <  BOUND_TO_RUN  <  AUTHENTICATED_PROVENANCE
            <  HUMAN_AUTHENTICATED  <  PRODUCTION_CAPABILITY_PROVED
```

`assertAtLeast` refuse toute consommation sous le niveau requis. Un artefact
inséré dans le registre après coup reste `BOUND_TO_RUN` : il est lié au run,
mais il n'est pas une preuve authentifiée.

## 6. Le noyau ne connaît aucun métier

Aucun métier, aucune discipline, aucun expert, aucun panel, aucun cas d'usage,
aucune taxonomie ne figure dans `core/`. Les adaptateurs de cas nomment leurs
phases dans `adapters/`. Le scan anti-câblage vérifie 0 occurrence de terme de
cas ou de fournisseur dans le code actif ; l'universalité est éprouvée sur six
domaines sans rapport entre eux.
