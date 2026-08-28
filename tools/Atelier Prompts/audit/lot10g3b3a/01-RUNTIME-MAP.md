# LOT 10G.3B.3A — carte du runtime

## Périmètre et gel

- Audit statique du dépôt au commit `9482c65224f411424b10758424f6ad64bc9c0816` (`main`).
- Référence distribuée contrôlée : `Atelier Prompts.zip`, SHA-256 `2c8be1597327cc2405cd4f9253c5c801e64d148bb298fc66550709653f504d41`. Les quatre fichiers cœur du ZIP et du dépôt sont identiques octet pour octet.
- HTML audité : `atelier-prompts-v11.5-lot10g-decision-provider.html`, SHA-256 `757ad74d70ffeaff8c3c9e2a09d8c3aa9bbbcbcc52d0cae9923f54e7a28f2a06`.
- État initial : dépôt propre, `npm test` 25/25 PASS, garde PASS, `git diff --check` PASS.

## Flux effectivement exécutés

```text
Accueil
 ├─ Rapide
 │   demande + documents
 │   → Decision Provider Workers AI (6,5 s)
 │   → Groq seulement si échec technique / réponse invalide
 │   → local-prudent = Architecte si les deux échouent
 │   ├─ clarification (une question, maximum 3 tours)
 │   ├─ rapide → detecterFormat → profil → verrous → assembler
 │   └─ architecte → analyse LLM JSON → validation → composants → compilation
 ├─ Architecte (choix explicite)
 │   → analyse LLM JSON → validation → composants → compilation
 └─ Atelier (choix explicite)
     → formulaire avancé → format/profil/verrous → assembler

Prompt compilé
 ├─ copie manuelle vers un LLM, ou
 └─ Envoi direct API → réponse → contrôles heuristiques/déterministes
                                 → prompt de correction manuel
```

## Composants et autorités

| Couche | Entrée | Décision / transformation | Sortie | Autorité réelle |
|---|---|---|---|---|
| Middleware 10G | `demande`, `materiau_present`, `mode_demande` | exploitabilité, clarification, route | décision JSON à 5 champs | `workers/shared/decision-core.js:7-211`, miroir navigateur HTML `9856-9880` |
| Orchestration navigateur | demande, documents, réponses | primary → fallback technique → prudent | Rapide ou Architecte | HTML `9823-10013` |
| Rapide adaptatif | demande, texte | format lexical, profil et verrous | prompt | HTML `3018-3904`, `4761`, `7652-7669` |
| Atelier avancé | champs utilisateur | mêmes formats/verrous, sélection UI | prompt + contrat partiel | HTML `3018-4408` |
| Architecte | contexte + préférences + réglages | analyse sémantique structurée | composants puis prompt compilé | HTML `8083-8650` |
| Exécution directe | prompt + modèle | appel fournisseur | livrable | HTML `5940-6129`, `8544-8619` |
| Contrôle | livrable + contrat Rapide/Atelier | contrôles déterministes/heuristiques | PASS/écarts | HTML `4060-4408` |
| Correction | livrable + écarts | fabrique un nouveau prompt | correction à envoyer manuellement | HTML `4395-4408`, `7424-7436`, Architecte `8186-8232` |

## Frontières critiques

1. Il n'existe pas d'`ADNState` ni d'`ExecutionContract` commun et versionné.
2. `contratDuPrompt()` ne couvre que le chemin FORMATS/VERROUS ; Architecte termine avec `etat.contrat=null` (`8493`).
3. Le Decision Provider ne transmet à l'aval ni intention, ni obligations, ni raison de sélection des verrous.
4. Le fallback local est volontairement prudent mais n'est pas proportionné : toute panne double devient Architecte (`9882`).
5. Le contrôle post-exécution est automatique pour l'Envoi direct Atelier, absent du chemin d'exécution Architecte (`8607-8611`).

## Données conservées

- La demande originale est conservée dans le contexte et dans le prompt.
- Les documents sont conservés dans `state.docs`; leur présence, pas leur contenu, est transmise au Decision Provider.
- Les réponses de clarification sont concaténées à la demande composite avant réévaluation.
- Les traces du benchmark conservent routes, tentatives provider, latence, usage et erreurs, mais le runtime produit n'offre pas encore cette trace canonique à l'utilisateur.

## Infrastructure, limites et quotas

- Workers AI est lié par `env.AI`; Groq utilise exclusivement le secret serveur `GROQ_API_KEY`.
- Origine autorisée unique : `https://c-concept-dev.github.io`; CORS, chemin `/decision`, méthode POST, taille du body (8 192 octets) et demande (4 000 caractères) sont bornés dans le core partagé.
- Timeout navigateur par provider : 6,5 s ; timeout amont Groq : 8 s. Workers AI n'ajoute pas de timeout amont distinct dans son Worker.
- Réponses provider bornées à 65 536 octets ; sortie Workers AI 160 tokens ; sortie Groq 512 tokens.
- Observabilité Cloudflare activée avec échantillonnage 100 %.
- **Aucun rate limiter applicatif ni quota métier n'est implémenté dans ces Workers.** Les quotas du compte/fournisseur sont donc externes au code audité et les 502 observés ne sont pas requalifiés en état de quota.
