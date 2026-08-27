# LOT 10G.2A — qualification du Decision Provider

Date : 27 août 2026  
Statut : qualification terminée pour Workers AI ; comparaison Groq préparée mais non exécutable dans l'environnement disponible. Aucun déploiement de production n'a été effectué.

## Recommandation

- Provider primaire recommandé : `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via Workers AI.
- Fallback officiel actuel : décision locale prudente vers Architecte.
- Candidat fallback ultérieur : Groq `llama-3.1-8b-instant`, uniquement après passage du même corpus avec le même protocole.

Le 70B est retenu selon l'ordre de priorité demandé : cohérence, stabilité, précision, faible sur-questionnement, latence, puis coût. Il atteint 93,3 % d'exactitude, 100 % de sorties valides et 100 % de stabilité sur 90 appels. Le 8B est plus rapide mais ne respecte pas assez sûrement les invariants.

Le coût n'a pas été simulé : il dépend du volume réel de jetons. Le 70B est plus cher que le 8B, mais le coût arrive après les critères de fiabilité demandés et ne justifie pas une sortie invalide dans 74,4 % des appels. Références officielles : [modèle Llama 3.3 70B](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/), [tarification Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) et [limites du JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/).

## Audit du prompt initial

Le prompt initial exposait de bons principes, mais laissait au modèle trop de décisions implicites :

1. Il ne séparait pas assez nettement objectif, intention, livrable et matériau.
2. Les seuils « assez précis » ou « ambigu » étaient subjectifs pour un petit modèle.
3. Il ne disait pas dans quel ordre appliquer les opérations de substitution.
4. Il permettait au modèle de confondre une préférence utile avec une information indispensable.
5. La raison était libre, donc pouvait contredire la route sans être détectée.
6. Le schéma JSON contrôlait la forme, pas la cohérence logique.

Le prompt retenu impose désormais une procédure ordonnée et conserve les principes universels `DECIDER`, `ESTIMER`, `RECHERCHER`, `SCENARISER`, `CONDITIONNER`, `QUESTIONNER`, `IGNORER`. `QUESTIONNER` n'est autorisé que lorsqu'un livrable est connu et qu'un intrant précis, explicitement requis et non substituable manque. L'absence générale de livrable relève d'Architecte sans question préalable.

## Invariants ajoutés

Les contrôles sont génériques, sans règle propre à un domaine :

- `rapide` implique `question_indispensable=null` ;
- une question implique `architecte` et `confiance=haute` ;
- une raison déclarant l'intention ou le livrable indéterminé contredit `rapide` ;
- une raison déclarant qu'aucune clarification n'est nécessaire contredit une question non nulle ;
- une raison déclarant intention et livrable suffisamment déterminés contredit `architecte` ;
- une raison canonique incompatible avec la branche est refusée ;
- une raison libre compatible est normalisée vers l'une des trois raisons canoniques.

Ces contrôles sont appliqués dans le Worker et reproduits dans le middleware 10G pour ne jamais accepter silencieusement une décision incohérente.

## Corpus et protocole

- 30 cas indépendants du provider : 14 `rapide`, 8 `architecte`, 8 `architecte + question indispensable`.
- Domaines : voyage, rédaction, enseignement, code, organisation, création, comparaison, analyse, science, données, traduction, décision, communication, RH, visualisation et adaptation.
- Matériaux présents et absents couverts explicitement.
- Trois répétitions par cas et par modèle complet, soit 90 appels par modèle.
- Mesures : exactitude de l'oracle complet, validité, stabilité, confiance faible, questionnement excessif, question manquée et latence.
- Empreinte du corpus : `bd1329970dc5ed2b50cf1cf839ba2b3ad662d1a9b1cad80ac56b35b7e4e85894`.
- Empreinte du prompt retenu : `9eac0c81a38c73643331852907b8a1611889f748d89dd8462ad19da7f88b5b41`.

Les deux cas imposés sont conformes sur le 70B, trois fois sur trois :

- « Fais-moi une checklist de 20 points pour préparer un voyage en Italie » → Rapide.
- « Je veux préparer mon voyage en Italie » → Architecte sans question indispensable.

## Scores avec le prompt retenu

| Provider / modèle | Appels | Exactitude | Sorties valides | Stabilité route | Couverture stabilité | Confiance faible | Questions excessives | Questions requises manquées | Latence moy. | p95 | Décision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Workers AI — Llama 3.3 70B FP8 fast | 90 | 93,3 % | 100 % | 100 % | 100 % | 0 % | 4,5 % | 12,5 % | 1 923 ms | 2 908 ms | Primaire recommandé |
| Workers AI — Llama 3.1 8B fast | 90 | 20,0 % | 25,6 % | 100 %* | 26,7 % | 0 %* | 10,0 %* | 100 %* | 736 ms | 1 226 ms | Écarté |
| Workers AI — DeepSeek R1 Distill Qwen 32B | 1 sonde | 0 % | 0 % | N/E | N/E | N/E | N/E | N/E | 68 309 ms | N/E | Écarté après sonde |
| Groq — Llama 3.1 8B Instant | 0 | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | Bloqué |

\* Mesure calculée seulement sur la faible part de réponses 8B ayant franchi la validation ; elle n'est donc pas directement comparable au 70B. Le taux de sorties invalides du 8B est de 74,4 %.

## Effet du prompt renforcé

Sur une première version du prompt, le 70B obtenait 70,0 % d'exactitude et ne produisait aucune des questions indispensables attendues. Avec le prompt retenu, il atteint 93,3 % et pose 7 des 8 questions attendues. Le 8B, lui, échoue davantage aux invariants renforcés : ce résultat confirme que sa rapidité ne compense pas son incapacité à suivre de façon fiable la procédure et le contrat logique.

## Échecs résiduels du 70B

Deux cas seulement échouent de façon stable, trois fois chacun :

- `R07` : comparaison train/voiture déjà cadrée, sur-questionnée au lieu d'être scénarisée ;
- `Q07` : adaptation à un « public visé » non fourni, traitée à tort en Rapide.

Ces erreurs sont conservées dans les résultats, sans ajout de hardcoding au provider. Elles constituent les deux premiers cas de suivi pour une qualification ultérieure.

## Comparaison Groq

Le harnais Groq est prêt et utilise exactement le même corpus, les mêmes oracles et les mêmes métriques. L'exécution réelle n'a pas pu être menée : le Worker `atelier-decision-groq` n'existe pas sur le compte Cloudflare connecté et aucun `GROQ_API_KEY` n'est disponible localement. Aucun score Groq n'est inventé et Groq a été retiré de la chaîne de fallback officielle du middleware en attendant sa qualification.

## Changements réalisés

- prompt système renforcé et raisons canoniques ;
- validation et normalisation d'invariants génériques ;
- modèle primaire Workers AI réglé sur le 70B retenu ;
- Worker local d'évaluation avec allowlist de modèles ;
- corpus de 30 cas, harnais reproductible et résultats bruts ;
- tests des invariants, du corpus, des deux oracles Italie et du middleware ;
- Groq maintenu comme candidat comparatif, pas comme fallback officiel.

Les moteurs Rapide, Architecte et Atelier ainsi que `FORMATS`, `VERROUS`, `ARCH_SYSTEM` et `ARCH_SCHEMA` n'ont pas été modifiés. Le contrôle final `npm run guard` fait foi pour leurs empreintes.

## Validation finale

- `npm test` : PASS, 17 tests sur 17.
- `npm run guard` : PASS (`status: OK`) ; les sept empreintes gelées sont inchangées.
- dry-run Workers AI : PASS ; liaison AI présente et `ALLOWED_ORIGINS=https://c-concept-dev.github.io`.
- dry-run Groq : PASS ; `ALLOWED_ORIGINS=https://c-concept-dev.github.io` (avertissement non bloquant sur le champ expérimental `secrets`).
- dry-run Worker d'évaluation : PASS.
- vérification syntaxique et `git diff --check` : PASS.
- déploiements réels : aucun.
