# H1 — Scan brut du credential Worker réel (`EVIDENCEFORGE_WORKER_API_KEY`)

Statut : **OPERATOR-REPORTED (PASS, matches=0) — non re-dérivable indépendamment par
Claude dans cette session, pour la portion « run réel ».**

## Ce que le CDC exige pour H1

> Après tout run utilisant `EVIDENCEFORGE_WORKER_API_KEY` réelle (mode delegated) :
> secret scan brut = `0` occurrence de `EVIDENCEFORGE_WORKER_API_KEY` sur
> RunState, NodeState, ArtifactRecord, traces, reports, logs, stdout/stderr,
> OperatorApi, DOM, localStorage, sessionStorage.

## Pourquoi Claude ne peut pas re-dériver ce résultat ici

`EVIDENCEFORGE_WORKER_API_KEY` réelle n'a jamais été présente dans cet environnement
Claude distant (confirmé — absente de l'environnement du process de cette session).
Le run réel rapporté par l'opérateur (`request-id preflight-2786c9915e24759a`, HTTP
200) a donc nécessairement eu lieu ailleurs (machine de l'opérateur), et ses artefacts
réels (stdout, logs, RunState éventuel) ne sont pas présents dans ce dépôt ni dans
cette session — une recherche du request-id sur l'ensemble du dépôt git ne retourne
aucun résultat :

```text
$ grep -rl "preflight-2786c9915e24759a" .
(aucun résultat)
```

Claude ne peut donc ni confirmer ni infirmer H1 sur le run réel lui-même — seulement
rapporter la déclaration de l'opérateur (`H1=PASS matches=0 H1_EXIT_CODE=0`) comme
telle, sans la présenter comme une vérification indépendante.

## Ce que Claude a effectivement scanné et peut affirmer

- Le dossier de preuve produit par ce lot (`REAL-G-DELEGATED-LLM-EVIDENCE-2026-08-31/`)
  et le diff git de ce tour : **0 occurrence** d'un motif de secret réel
  (`sk-ant-*`, ou toute chaîne présentée comme `EVIDENCEFORGE_WORKER_API_KEY=<valeur>`)
  — voir la commande de vérification ci-dessous, ré-exécutable.
- Aucune valeur de secret n'a été demandée, affichée, ni manipulée par Claude à aucun
  moment de ce lot.

```bash
grep -rlE "sk-ant-[A-Za-z0-9_-]{20,}" EvidenceForge/MONO-08/REAL-G-DELEGATED-LLM-EVIDENCE-2026-08-31/
# -> aucun résultat
```

## Recommandation pour clore H1 sur le run réel lui-même

Si l'opérateur souhaite fournir un artefact vérifiable (plutôt qu'une déclaration), la
sortie brute de son scan H1 (sans la valeur du secret elle-même, seulement le compte
`matches=0` et la liste des sources scannées) peut être ajoutée à ce dossier de preuve
par un commit ultérieur, pour référence indépendante.

## Verdict H1 (tel que rapporté)

```text
H1 (rapporté par l'opérateur) = PASS, matches = 0
H1 (re-dérivé indépendamment par Claude sur le run réel)  = NON DISPONIBLE (artefacts absents de cette session)
H1 (scan du dossier de preuve produit ici)                = PASS, 0 occurrence
```
