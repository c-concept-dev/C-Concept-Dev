# Traces runtime représentatives

Sources : code gelé et résultats conservés dans `evaluation/lot10g3b2/raw/benchmark-30cases/`. Aucun appel réseau n'a été relancé pour cet audit.

## Trace A — route Rapide nominale

```text
demande + materiau_present
→ askDecisionProvider()
→ Workers AI
→ décision valide {exploitable, rapide, question:null}
→ arrêt immédiat de la chaîne provider
→ assemblerRapideAdaptatif()
→ detecterFormat() → profilDuFormat() → actifsAdaptes()
→ contexte() → assembler()
→ prompt
```

La décision primaire `architecte` ou `clarification_necessaire` est également terminale : Groq n'est pas interrogé. Preuve : HTML `9885-9898` et tests `html-integration.test.mjs:46-76`.

## Trace B — clarification

```text
décision {clarification_necessaire, route:null, question}
→ validation question unique / jargon / répétition
→ affichage modal
→ réponse ajoutée à state.answers
→ compositeDemand()
→ réappel du même pipeline
→ arrêt dès exploitabilité, sinon question suivante
→ maximum 3 clarifications, puis Architecte
```

Preuve : HTML `9856-9880`, `9924-9971`; tests `html-integration.test.mjs:87-109`.

## Trace C — fallback technique puis prudent

```text
Workers AI → timeout / HTTP non-2xx / JSON invalide
→ Groq
→ si décision valide : terminale
→ sinon local-prudent
→ {exploitable, architecte, confiance:moyenne, question:null}
```

Le fallback est sûr fonctionnellement mais non proportionné : panne de classification équivaut toujours à sur-architecture.

## Trace D — S07 observé

Demande : fonction JavaScript unique + trois exemples. Oracle : Rapide.

| Étape | Résultat | Latence | Tokens GPT |
|---|---|---:|---:|
| Workers AI | HTTP 502 | 499 ms | — |
| Groq | HTTP 502 | 189 ms | — |
| local-prudent | Architecte | immédiat | — |
| analyse Architecte | HTTP 200 | 55 079 ms | 9 637 entrée + 5 023 sortie |
| exécution finale | HTTP 200 | 1 950 ms | 1 300 entrée + 103 sortie |
| total Atelier | succès | 58 453 ms | 16 063 |
| LLM pur | succès | 3 335 ms | 188 |

Conséquence : +55,1 s et +15 875 tokens pour une tâche simple, exclusivement parce que les deux providers ont échoué.

## Trace E — C03 observé

```text
deux tentatives provider → local-prudent → Architecte
→ analyse plafonnée à 8 000 tokens
→ texte contenant 5 objets JSON valides
→ refus par l'extracteur (aucun choix silencieux)
→ pas d'exécution finale
```

Le refus est cohérent avec la sécurité du parseur, mais montre que le schéma/prompt d'analyse et le plafond ne convergent pas sur les cas complexes.

## Trace F — Envoi direct Atelier

```text
prompt + amorce/schéma éventuels
→ appel fournisseur
→ réponse
→ verifierConformite(texte, contrat, stop_reason)
→ affichage résultats
→ si échec/avertissement : bouton « corriger »
→ construirePromptCorrection()
→ utilisateur vérifie et renvoie manuellement
```

Le cycle n'est ni automatique ni borné dans un état de trace. Preuve : HTML `6013-6043`, `7424-7436`.

## Limites d'observabilité runtime

- Pas de `request_id`, `adn_state`, `contract_version`, `locks_selected`, `checks` ou `corrections` canonique.
- Le benchmark externe apporte ces mesures après coup ; le produit n'expose pas une trace d'autorité équivalente.
- Les erreurs provider sont réduites côté navigateur à indisponibilité ; les détails expurgés restent côté Worker.

