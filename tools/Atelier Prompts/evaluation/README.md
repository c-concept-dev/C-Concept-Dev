# Évaluation LOT 10G.2A

Le corpus contient 30 demandes et trois oracles : `rapide`, `architecte`, et `architecte + question indispensable`. Il ne fait pas partie du prompt du provider.

## Workers AI

Lancer le Worker d'évaluation local, qui utilise la liaison Workers AI distante sans déployer de Worker :

```sh
npx wrangler dev --config workers/evaluation/wrangler.jsonc --ip 127.0.0.1 --port 8791
```

Dans un autre terminal :

```sh
npm run evaluate:workers-ai -- \
  --endpoint=http://127.0.0.1:8791/evaluate \
  --models=@cf/meta/llama-3.3-70b-instruct-fp8-fast \
  --repetitions=3 \
  --output=evaluation/results/result.json
```

Les modèles sont limités par une allowlist dans le Worker d'évaluation. Le Worker de production n'expose pas le choix du modèle au client.

## Groq

Quand un endpoint Groq de qualification existe et possède son secret :

```sh
npm run evaluate:groq -- \
  --endpoint=https://ENDPOINT-GROQ/decision \
  --repetitions=3 \
  --output=evaluation/results/groq-llama31-8b-instant.json
```

L'endpoint Groq n'est pas un fallback officiel tant que cette exécution comparative n'a pas été réalisée.
