# LOT 10G.2A — qualification finale du Decision Provider

Date : 27 août 2026  
Statut : **PASS CONDITIONNEL**

## Décision

- Provider primaire recommandé : Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- Fallback recommandé : Groq `openai/gpt-oss-20b`, sous réserve de disposer d'un quota adapté aux rafales réelles ou d'appliquer une régulation opérationnelle.

Le 70B reste premier selon l'ordre de priorité fixé : il est plus cohérent, parfaitement stable sur ce corpus et plus exact, notamment quand une question indispensable est requise. Groq constitue un bon fallback grâce à 100 % de sorties valides, une latence médiane de 578 ms et un coût unitaire inférieur, mais son sous-questionnement est deux fois plus élevé et le compte testé a atteint sa limite de jetons par minute lors d'un envoi en rafale.

## État initial de reprise

- Worker Groq fonctionnel en production : `https://atelier-decision-groq.11drumboy11.workers.dev/decision`.
- Modèle : `openai/gpt-oss-20b`.
- Protections déjà validées : origine autorisée 200, origine absente 403, origine interdite 403, JSON invalide 400.
- Une précédente campagne régulée avait été interrompue après 15 appels. Son ancien banc ne persistait pas les payloads complets ; ces observations n'étaient donc pas un checkpoint métrique fiable.
- La campagne finale a été relancée intégralement depuis `R01`, sans compter deux fois une évaluation.
- Trois échecs locaux `fetch failed` ont précédé la campagne, dus à l'absence initiale d'autorisation réseau dans l'environnement Codex. Ils n'ont produit aucune réponse HTTP et sont documentés comme incidents de préflight, hors score fournisseur.

## Protocole figé

- 30 cas : 14 `rapide`, 8 `architecte`, 8 `architecte + question indispensable`.
- 3 répétitions par cas, soit 90 évaluations par modèle.
- Même corpus, mêmes oracles, même prompt et mêmes invariants pour les deux providers.
- Délai Groq : 12,5 secondes entre appels afin de respecter le quota ; ce délai est exclu de la latence HTTP.
- Empreinte corpus : `bd1329970dc5ed2b50cf1cf839ba2b3ad662d1a9b1cad80ac56b35b7e4e85894`.
- Empreinte prompt : `9eac0c81a38c73643331852907b8a1611889f748d89dd8462ad19da7f88b5b41`.
- Checkpoint : écriture automatique après chaque appel, avec refus de reprise si l'empreinte du corpus ou du prompt diffère.

## Résultats comparatifs

| Mesure | Workers AI 70B | Groq GPT-OSS 20B |
|---|---:|---:|
| Évaluations | 90 | 90 |
| Exactitude globale | **93,3 %** | 91,1 % |
| Exactitude `rapide` | 92,9 % | **95,2 %** |
| Exactitude `architecte` | 100 % | 100 % |
| Exactitude `architecte + question` | **87,5 %** | 75,0 % |
| Sorties valides | 100 % | 100 % |
| Réponses invalides | 0 % | 0 % |
| Stabilité de route | **100 %** | 98,9 % |
| Cas totalement stables | **100 %** | 96,7 % |
| Confiance faible | 0 % | 0 % |
| Sur-questionnement | 4,5 % | **3,0 %** |
| Sous-questionnement | **12,5 %** | 25,0 % |
| Latence moyenne | 1 923 ms | **648 ms** |
| Latence médiane | 1 839 ms | **578 ms** |
| Latence p90 | 2 365 ms | **885 ms** |
| Latence p95 | 2 908 ms | **1 022 ms** |
| Latence maximale | 3 450 ms | **3 263 ms** |
| HTTP 429, campagne finale | 0 | 0 |
| Autres erreurs fournisseur, campagne finale | 0 | 0 |

Temps réel de la campagne Groq : **1 183 559 ms**, soit environ **19 min 44 s**. Somme des latences HTTP : **58 329 ms**. Le reste correspond principalement aux délais volontaires de régulation.

## Analyse des erreurs Groq

Huit évaluations sur 90 diffèrent de l'oracle, réparties sur trois cas :

- `R14`, répétitions 1 et 2 : sur-questionnement. Le modèle exige des caractéristiques du service alors que la demande autorise des scénarios conditionnels. La troisième répétition est correcte, ce qui explique l'unique instabilité inter-répétitions.
- `Q07`, trois répétitions : sous-questionnement. « Adapte ce contenu pour le public visé » est envoyé vers Rapide alors que le public est un intrant non substituable absent.
- `Q08`, trois répétitions : sous-questionnement. « Prépare ça pour demain » est envoyé vers Architecte sans demander quel contenu doit être préparé.

Les erreurs sont conservées intégralement dans le score. Aucun oracle, prompt ou invariant n'a été modifié après observation.

Le 70B conserve six erreurs sur 90, concentrées sur `R07` (sur-questionnement) et `Q07` (sous-questionnement), tout en restant stable sur ses répétitions.

## Fiabilité, quota et coût

Une première rafale Groq non régulée avait produit 85 erreurs sur 90, toutes liées à des HTTP 429 amont. Le compte testé exposait alors une limite effective de 8 000 jetons par minute. La campagne finale régulée n'a produit aucun 429 ni aucune autre erreur fournisseur. Cela qualifie le modèle, mais pas une exploitation en rafale sur ce quota.

Tarifs officiels consultés le 27 août 2026 :

- Groq GPT-OSS 20B : **0,075 USD/M jetons d'entrée** et **0,30 USD/M jetons de sortie** ; entrée en cache 0,037 USD/M. Source : [Groq — GPT-OSS 20B](https://console.groq.com/docs/model/openai/gpt-oss-20b).
- Workers AI Llama 3.3 70B FP8 fast : **0,293 USD/M jetons d'entrée** et **2,253 USD/M jetons de sortie**. Source : [Cloudflare — tarification Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/).

À volume de jetons identique, Groq est environ 3,9 fois moins cher en entrée et 7,5 fois moins cher en sortie. Le coût exact de cette campagne n'est pas calculable depuis les réponses du Worker, car elles n'exposent pas les compteurs de jetons.

## Changements techniques de benchmark

- ajout d'une origine autorisée aux appels Groq du banc ;
- ajout d'un délai paramétrable, exclu de la latence HTTP ;
- ajout d'un checkpoint/reprise après chaque évaluation ;
- ajout des métriques par classe, p90, maximum, statuts HTTP, erreurs fournisseur et durée totale ;
- mise à jour du libellé par défaut vers `groq/openai-gpt-oss-20b`.

Ces changements ne modifient aucune logique sémantique d'évaluation.

## Validation finale

- `npm test` : **PASS — 18/18**.
- `npm run guard` : **PASS — status OK**.
- `git diff --check` : **PASS**.
- Les empreintes de Rapide, Architecte, Atelier, FORMATS, VERROUS, ARCH_SYSTEM et ARCH_SCHEMA sont inchangées.
- Aucun secret n'a été exposé.
- Aucun changement n'a été appliqué au prompt, au corpus, aux oracles ou aux moteurs pendant la reprise.

## Conclusion

**LOT 10G.2A = PASS CONDITIONNEL**

La qualification comparative est complète et Workers AI 70B est validé comme provider primaire. Groq GPT-OSS 20B est techniquement fonctionnel et qualifié comme fallback recommandé, mais son activation comme fallback officiel doit être conditionnée à un quota capable d'absorber la charge attendue ou à une stratégie de régulation qui ne bloque pas le middleware interactif.

## Git final

`git status --short` :

```text
 M RAPPORT-LOT10G.2A.md
 M evaluation/model-scores.csv
 D evaluation/results/groq-gpt-oss-20b-final-regulated.json.checkpoint.json
?? evaluation/results/groq-gpt-oss-20b-final-regulated.json
```

Le diff final remplace le rapport provisoire et le tableau de scores, supprime le checkpoint devenu inutile après achèvement, et ajoute le résultat brut complet de 90 évaluations. Aucun fichier moteur, prompt, corpus ou oracle ne figure dans le diff.
