# MONO-08 v0.6 — Rapport de scan de secrets

Périmètre : arborescence complète `EvidenceForge/MONO-08/v0.6/` (code,
tests, Worker, documentation, rapports LOCAL_CONTROLLED).

## Méthode

1. Recherche de motifs de clé Anthropic (`sk-ant-...`) : aucune occurrence.
2. Recherche de tout jeton de 32+ caractères alphanumériques dans `.js`,
   `.json`, `.md`, `.jsonc` : chaque occurrence relevée manuellement
   examinée individuellement (voir liste ci-dessous). Toutes sont soit du
   contenu documentaire public pré-existant de v0.5 (texte base64 des
   certifications d'accessibilité, un hash SHA-256 de contenu), soit des
   identifiants de fonction/constante longs, soit des valeurs de test
   factices explicitement fictives déjà présentes dans les tests v0.5
   pré-existants ou introduites par ce lot.
3. Recherche de fichiers `.env`, `.pem`, ou nommés `*secret*` (hors
   `secret-scan.js`/`secret-provider.js`, qui sont du code, pas des
   secrets) : aucun trouvé.
4. Revue manuelle des 39 occurrences de valeurs de test factices
   (`wk-good`, `good-worker-key`, `ak-secret-value`, etc.) dans
   `test/test_t08_v06_delegated_auth.js` et
   `worker/evidenceforge-llm-proxy/test/worker.test.js` — confirmées
   comme des valeurs fictives introduites par ce lot pour les besoins des
   tests `LOCAL_CONTROLLED`, jamais des credentials réels.

## Résultat

```text
Occurrences brutes de secrets réels : 0
```

## Distinction H1 / H2 (CDC section 8.1)

- **H1 — `EVIDENCEFORGE_WORKER_API_KEY`** : aucun run de ce lot n'a utilisé
  de valeur réelle de ce credential (seulement des valeurs de test
  factices, `wk-good` etc., jamais présentées comme réelles). Le scan de
  valeur brute au sens strict du CDC (« après tout run utilisant
  `EVIDENCEFORGE_WORKER_API_KEY` réelle ») reste donc **NOT_APPLICABLE** à
  ce stade d'implémentation — il n'existe encore aucun run de référence à
  scanner. Preuve partielle disponible : les valeurs factices utilisées
  dans les tests Worker sont vérifiées absentes des corps et headers de
  réponse produits (`worker.test.out`, assertions Worker-16 à Worker-18),
  démontrant que le *mécanisme* de non-fuite fonctionne, sans encore
  constituer la preuve complète exigée avec un credential réel.

- **H2 — `ANTHROPIC_API_KEY` en mode delegated** : preuve structurelle
  complète et positive (voir
  `reports/v0.6-local-controlled/test_t08_v06_delegated_auth.out`,
  assertions « H2-preflight. » et « H2-real-provider-configs. ») —
  extraction automatisée du code des deux fonctions du chemin `delegated`
  (`buildLlmWorkerProviderDelegated()` dans `lib/preflight.js`,
  `buildLlmWorkerConfigDelegated()` dans `lib/real-provider-configs.js`),
  suppression des commentaires, recherche de la chaîne
  `ANTHROPIC_API_KEY` dans le code résiduel : **0 occurrence** dans les
  deux cas. Confirme que le chemin `delegated` ne lit, ne demande à un
  SecretProvider, ni ne transmet jamais cette variable — par construction
  du code, pas seulement par déclaration.

## Aucun secret versionné

Vérifié : aucun fichier `.env`, aucun fichier contenant un token Cloudflare,
aucune valeur de `WORKER_API_KEY` ni `ANTHROPIC_API_KEY` dans le dépôt.
`worker/evidenceforge-llm-proxy/wrangler.jsonc` documente explicitement que
ces deux secrets doivent être fournis via `wrangler secret put` au moment
d'un déploiement réel, jamais commit.
