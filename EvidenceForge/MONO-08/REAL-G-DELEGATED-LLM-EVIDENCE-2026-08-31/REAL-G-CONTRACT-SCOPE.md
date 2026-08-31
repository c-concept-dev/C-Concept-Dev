# Périmètre contractuel exact du cas G — vérifié dans ce lot

Ce document fixe la définition du cas G réellement citée par les documents qui
gouvernent MONO-08 v0.6, pour éviter toute réouverture du périmètre élargi
(EF-ORCH-SUBSYSTEM, DocumentaryTwins, lineage/persistance/UI du Real Smoke) écarté par
la correction de frontière contractuelle reçue pour ce lot.

## Source — `MONO-08-v0.6-DELEGATED-LLM-AUTH-CDC.md`, tableau §10

> G — REAL — delegated — Worker Cloudflare dédié réellement déployé,
> `EVIDENCEFORGE_WORKER_API_KEY` réelle acceptée, `ANTHROPIC_API_KEY` effectivement
> absente du process client (§4.3.1.B), vrai appel upstream Anthropic, preuve NIVEAU 2
> corrélée (§5.3) → `READY`, aucun accès client à `ANTHROPIC_API_KEY` à aucun moment.

## Source — « Règle sur le cas G »

> G — REAL delegated — doit prouver cumulativement, avec preuve archivée pour chaque
> point : Worker Cloudflare dédié réellement déployé ; endpoint réel ; credential
> Worker réel accepté ; `ANTHROPIC_API_KEY` effectivement absente du process client ;
> aucun accès client à `ANTHROPIC_API_KEY` ; appel Anthropic upstream réel ; réponse
> Anthropic réelle ; request-id corrélé (§5.3 NIVEAU 2) ; trace/log Worker corrélé à ce
> request-id ; provider reality log (provider, opération, REAL, timestamp, latency,
> attempts, HTTP status, classification) ; classification `READY` ; aucun faux
> `READY` ; secret handling conforme (§7.10, §8.1).

## Confirmation explicite

- G ne mentionne, dans aucune de ses deux définitions sources, ni EF-ORCH-SUBSYSTEM, ni
  EF-02A→EF-04A, ni DocumentaryTwins, ni DocumentaryReviews, ni lineage, ni persistance
  process A/B, ni UI MONO-05-R3.
- Ces éléments appartiennent au Real Smoke complet (`bin/run-real-smoke.js`,
  `EVIDENCEFORGE_KIT_ROOT`), explicitement hors périmètre de ce lot.
- Ce lot ne rouvre pas ces sujets, n'invoque pas `bin/run-real-smoke.js`, ne référence
  pas `EVIDENCEFORGE_KIT_ROOT`, ne demande aucune dépendance MONO-01/02/03/05.
