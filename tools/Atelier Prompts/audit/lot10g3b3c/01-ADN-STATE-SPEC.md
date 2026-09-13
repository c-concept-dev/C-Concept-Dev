# ADN State v1 — Spécification

## Rôle

ADN State est la représentation runtime des cinq propriétés fondamentales. Il se situe entre les états existants et ExecutionContract v1.

## Flux

```text
demande originale + décision + signaux runtime
→ buildAdnState()
→ validateAdnState()
→ propriétés + techniques dérivées
→ adnStateToExecutionContractSnapshot()
→ ExecutionContract v1
```

## Invariants

1. demande originale obligatoire et immuable ;
2. intention jamais inventée : sans donnée sémantique, objectif = demande originale et état `preserved_raw` ;
3. clarification ⇒ route nulle et exécution inactive ;
4. exploitable ⇒ route Rapide/Architecte et exécution immédiate ;
5. technique 9 exactement synchronisée sur exploitabilité ;
6. faits, déductions, hypothèses et manques restent disjoints ;
7. toute quantité a borne + unité/cible ;
8. neuf invariants éthiques non désactivables ;
9. propriétés et techniques dérivées, jamais saisies comme autorité.
