# MONO-10 v0.4 — Modèle de menace

Ce document dit ce que le lot protège **et ce qu'il ne protège pas**. Il ne
surdéclare pas : une protection annoncée sans mise en œuvre exécutable serait
exactement le défaut que les audits A de v0.2 et v0.3 ont sanctionné.

## 1. Menaces couvertes

| Menace | Mécanisme | Test |
|---|---|---|
| Réétiquetage d'artefact (`TEST_FIXTURE` → `REAL_RUNTIME`) | le champ auto-déclaré n'est lu nulle part ; la provenance vient de l'attestation et de l'empreinte croisée | T01, I-15 |
| Construction d'une chaîne synthétique complète | sans attestation signée par une autorité **ancrée**, la classe de preuve reste `INTERNAL_CHAIN_CONSISTENCY_ONLY` | T06, T07 |
| Blanchiment de fixture par régénération | régénérer tous les hachages ne produit aucune signature valide | T01, T06 |
| Auto-certification du manifeste | le manifeste **reprend** son mode de l'attestation vérifiée ; il ne le déclare pas | T01, I-02 |
| Attestation de TEST présentée comme PRODUCTION | l'ancrage est indexé par `executionMode|authorityId`, et le mode est couvert par la signature | T02 |
| Autorité inconnue ou usurpée | signature vérifiée contre la clé publique ancrée | T03 |
| Altération de la charge signée | 7 champs testés individuellement | T04 |
| Rejeu d'attestation | `nonce` à consommation unique | T05 |
| Contournement par politique d'appelant | 5 contrôles non négociables ; toute tentative est refusée **et consignée** | T08, T24 |
| Artefact affirmant une vérification non faite | motifs dérivés de l'exécution réelle + garde-fou `FALSE_REVALIDATION_CLAIM` | T09 |
| `DEFER`/`REJECT` atteignant le corpus | l'éligibilité est dérivée, jamais un statut réécrit | T10 |
| Source d'identité dupliquée ou réétiquetée | identifiant, autorité canonique, famille et enregistrement source comparés | T11, T12 |
| Réécriture des preuves vues par l'humain | `evidenceRefs` hachées **des deux côtés** | T13 |
| Substitution de lignée inter-run | `runId` et attestation comparés ; interdit par défaut | T14 |
| Substitution de relation dans la lignée | graphe d'arêtes typées | T15 |
| Inconnu fermé par une preuve inexistante | les `evidenceRefs` doivent **résoudre** contre le registre | T16 |
| Rejeu / fork / désordre d'événements d'inconnu | séquence monotone + chaînage par empreinte | T17 |
| État résolu ancien masquant un état bloquant | fusion par historique validé, sévérité maximale conservée | T18 |
| Dimensions de préparation fabriquées | chaque dimension doit être tirée d'une source résolvable | T19 |
| Sonde LLM de test présentée comme preuve de production | la sonde est liée au run attesté | T20 |
| Rapport / acceptation désappariés | mission, run, attestation et empreintes comparés | T21, T22 |
| Qualification `UNKNOWN` autorisant l'aval | revalidation obligatoire | T23 |

## 2. Menaces explicitement NON couvertes

Ces cas sortent du périmètre de ce lot. Les nommer est une exigence de la
Charte §24 (aucune dette silencieuse) — pas une échappatoire.

| Hors périmètre | Pourquoi | Conséquence |
|---|---|---|
| **Compromission de la clé privée de l'autorité de production** | la signature est la racine ; qui la détient peut attester n'importe quoi | protection = gestion des clés de l'exploitant, hors EvidenceForge |
| **Hôte entièrement compromis exécutant le runtime de confiance** | un runtime corrompu peut attester un run qu'il n'a pas fait honnêtement | exigerait une attestation matérielle ou un tiers indépendant |
| **Jeu d'ancrages de confiance falsifié** | si un attaquant contrôle la configuration, il ancre sa propre autorité | la configuration doit être protégée au même niveau que les clés |
| **Registre d'autorités d'identité inexact** | le moteur ne peut pas vérifier que deux libellés désignent réellement deux organismes distincts | l'indépendance n'est jamais meilleure que ce registre |
| **Mécanisme d'authentification humaine injecté défaillant** | le lot vérifie qu'un mécanisme existe et s'identifie, pas sa robustesse | le choix du mécanisme relève de l'exploitant |
| **Véracité du contenu** | l'authentification porte sur l'exécution, pas sur les conclusions | *succès technique ≠ succès scientifique* |
| **Collusion de l'exploitant avec lui-même** | un exploitant qui signe de fausses attestations trompe ses propres auditeurs | seule une autorité tierce indépendante y répondrait |

## 3. Le déplacement assumé de la racine

v0.4 ne supprime pas le besoin de faire confiance à quelqu'un : elle déplace
cette confiance d'un **artefact que n'importe qui peut écrire** vers une **clé
que seul l'exploitant détient**, et l'expose explicitement. C'est une
amélioration vérifiable, pas une garantie absolue.

La question honnête que l'auditeur doit poser n'est plus « la chaîne est-elle
cohérente ? » — elle l'est toujours par construction — mais : **qui détient la
clé de l'autorité de production, et comment est-elle protégée ?**

## 4. Classement des dettes (Charte §24)

| Élément | Classe |
|---|---|
| Absence d'attestation matérielle / tiers indépendant | `SCIENTIFIC_LIMITATION` |
| Registre d'autorités fourni par configuration, non vérifiable par le moteur | `SCIENTIFIC_LIMITATION` |
| Mécanisme d'authentification humaine laissé à l'injection | `CONTRACT_GAP` assumé — ne rien inventer était la conduite correcte |
| Aucun run réel n'a validé ce lot | `TEST_GAP` déclaré : toutes les preuves sont des fixtures assumées |
