# MONO-10 v0.7 — garde documentation / code

## 1. Le défaut que ce mécanisme ferme

En v0.6, `KEY-MANAGEMENT.md` annonçait quatre statuts de clé
(`ACTIVE`/`REVOKED`/`EXPIRED`/`SUSPENDED`) alors que le code n'en connaissait que
trois. La correction de v0.6 a ajouté un test, `KL-01`, présenté comme gardant
« la liste exacte à chaque passage ».

L'audit indépendant a injecté `SUSPENDED` et `QUARANTINE` dans le document et
rejoué la suite : **170 PASS, 0 FAIL, `KL-01` inclus.** Le test comparait la
constante du *code* à elle-même. Aucun test ne lisait un document. Le correctif
ne couvrait pas ce qui avait cassé.

## 2. Le mécanisme v0.7

Une **source canonique machine-lisible** :

```
contracts/canonical-contracts.json
```

- le **code l'importe** (`core/canonical-contracts.js`) : les énumérations
  critiques ne sont plus écrites dans les modules. `key-lifecycle.js` ne déclare
  plus ses statuts, il les reçoit ;
- la **documentation est validée contre elle** par un test qui lit réellement
  les fichiers `.md`.

## 3. Comment un document déclare un contrat

```markdown
<!-- contract:keyStatuses -->
| `ACTIVE` | ... |
| `RETIRED` | ... |
| `REVOKED` | ... |
<!-- /contract -->
```

`verifyDocumentedContract` extrait les jetons en capitales entre accents graves
du bloc et exige l'**égalité d'ensemble** avec la source. Trois échecs
possibles, tous testés :

| Dérive | Détection |
|---|---|
| valeur documentée inexistante dans le code | `extra` non vide |
| valeur du code absente du document | `missing` non vide |
| bloc de contrat absent du document | `valid: false`, jamais un succès par défaut |

## 4. Contrats gardés

| Contrat | Document |
|---|---|
| `keyStatuses` | `KEY-MANAGEMENT.md` |
| `artifactCapabilities` | `ARTIFACT-REGISTRY-TRUST.md` |
| `eligibilityStates` | `ARCHITECTURE.md` |
| `provenanceStatuses` | `TRUST-MODEL.md` |
| `upstreamAssertionStates` | `UPSTREAM-EVIDENCE-BINDING.md` |

## 5. Preuve que la garde mord

`T44` vérifie l'absence de dérive sur les cinq contrats. `T45` à `T48` injectent
la dérive et exigent l'échec : `SUSPENDED`, `QUARANTINE`, retrait d'`ACTIVE`,
classe de capacité inventée. `M46` à `M50` refont la même chose comme mutations,
y compris la suppression du bloc entier.

Pendant la construction de ce lot, cette garde a détecté une dérive réelle dans
`UPSTREAM-EVIDENCE-BINDING.md` : deux valeurs du lot amont y figuraient en
capitales dans le bloc de contrat alors qu'elles n'appartiennent pas à
l'énumération. Le document a été corrigé. C'est exactement l'usage prévu.

## 6. Ce que la garde ne couvre pas

Elle garde des **énumérations**, pas des affirmations en prose. Une phrase de
documentation qui surestime une propriété reste détectable seulement par une
relecture — ou par un audit indépendant. C'est dit ici plutôt que sous-entendu.
