# Cascade de tokens Architecte

## Anatomie

```text
Analyse Architecte
  ARCH_SYSTEM volumineux
  + contexte utilisateur sérialisé
  + ARCH_SCHEMA complet
  → JSON d'analyse riche

Compilation locale
  rôle + objectif + demande originale
  + matériau / réglages / format
  + décisions / estimations / inconnues
  + composants générés
  + longue vérification standard
  → prompt final

Exécution
  système court
  + prompt compilé
  → livrable
```

## Mesures conservées

Mesure reproductible du code gelé : `ARCH_SYSTEM` = 10 807 caractères / 11 118 octets (~2 702 tokens à 4 caractères/token) ; `ARCH_SCHEMA` sérialisé comme réellement par `archRequete()` = 23 839 caractères / 23 868 octets (~5 960 tokens). Avant même le contexte et les délimiteurs, leur somme atteint 34 646 caractères (~8 662 tokens). Les usages API ci-dessous sont les mesures fournisseur exactes.

| Cas | Analyse entrée | Analyse sortie | Exécution entrée | Exécution sortie | Total | Latence totale |
|---|---:|---:|---:|---:|---:|---:|
| S07 | 9 637 | 5 023 | 1 300 | 103 | 16 063 | 58,5 s |
| S08 | 9 648 | 5 577 | 1 314 | 185 | 16 724 | 70,7 s |
| S09 | 9 637 | 6 144 | 1 556 | 1 307 | 18 644 | 89,2 s |
| C01 | 9 690 | 7 390 | 2 477 | 2 500 | 22 057 | 125,8 s |
| C02 | 9 674 | 7 858 | 2 721 | 2 500 | 22 753 | 132,1 s |
| C04 | 9 669 | 7 938 | 2 390 | 2 500 | 22 497 | 132,9 s |
| C06 | 9 673 | 7 869 | 2 645 | 2 500 | 22 687 | 128,8 s |
| C07 | 9 668 | 7 263 | 2 745 | 2 500 | 22 176 | 121,3 s |
| C08 | 9 671 | 7 990 | 2 847 | 2 500 | 23 008 | 137,4 s |

Les cas C03/C05/C09/C10 s'arrêtent à l'analyse : 8 000 tokens de sortie, 17 665–17 676 tokens au total, puis refus de 5 ou 8 objets JSON détectés.

## Agrégats du benchmark 30 cas

- Complexes : 20 586 tokens Atelier en moyenne contre 2 570,3 en LLM pur, soit **+18 015,7**.
- Complexes : 118,6 s contre 36,7 s, soit **+81,9 s**.
- Cas simples mal routés S07–S09 : 16 063 à 18 644 tokens contre 188 à 670.
- Les entrées d'analyse sont quasi constantes autour de 9 670 tokens : le coût fixe du système + schéma domine la demande.

## Causes de surconsommation

1. `ARCH_SCHEMA` est complet et injecté avec `ARCH_SYSTEM` dans chaque analyse (`8136`, `8549`).
2. L'analyse demande provenance, stratégie, rôle, composants, vérification et apprentissage même lorsque le niveau est minimal.
3. La sortie d'analyse devient ensuite un prompt final contenant de nouveau objectif, contraintes, hypothèses et contrôles.
4. Neuf règles de vérification supplémentaires sont ajoutées à chaque prompt dès la compilation (`8482-8492`).
5. Le fallback prudent envoie des tâches simples dans cette cascade.
6. Le plafond de 8 000 tokens permet une sortie d'analyse très longue sans garantir un objet JSON unique.

## Verdict

Le principal levier n'est pas une micro-réduction de texte : c'est d'éviter Architecte lorsque Rapide suffit, puis de construire un contrat compact commun dont l'analyse Architecte serait une projection incrémentale plutôt qu'un second état exhaustif.
