# MONO-10 v0.5 — Modèle de menace

Ce document dit ce que le lot protège **et ce qu'il ne protège pas**. Une
protection annoncée sans mise en œuvre exécutable serait exactement le défaut
qui a rendu v0.2, v0.3 et v0.4 `NON_GELABLE`.

## 1. Menaces couvertes

| Menace | Mécanisme | Test |
|---|---|---|
| L'appelant crée sa propre paire de clés | l'espace `PRODUCTION` n'est atteignable que par provisionnement environnement | T01, T02, M01 |
| L'appelant injecte son propre ancrage | aucune API de production n'accepte d'ancrage ; marque d'origine sur la frontière | T01, M36, HYG-04 |
| L'artefact porte sa propre clé | la clé n'est jamais lue depuis l'attestation | T03, M25 |
| Le manifeste désigne sa propre racine | `assertManifestAuthentic` compare frontière et descripteur | T04, M06, M26 |
| Autorité de TEST présentée comme PRODUCTION | ancrage indexé par mode ; mode couvert par la signature | T05, M02 |
| Même clé pour TEST et PRODUCTION | empreinte unique par frontière | T06, M30 |
| Clé révoquée / expirée / retirée | cycle de vie évalué **à la date de signature** | T07, T08, T09, M27–M29 |
| Rejeu d'attestation | nonce à consommation unique, store **persistant** | T10, M05 |
| Anti-rejeu absent en production | `REPLAY_PROTECTION_MISSING` — fail closed | T11, M31 |
| Store anti-rejeu imité par l'appelant | marque d'origine | M32 |
| Mutation d'un champ signé | 12 champs couverts | T12, T13, T14, M03, M04, M37 |
| Intention de run divergente de la racine attestée | `runManifestRootHash` comparé | M38 |
| Chaîne synthétique complète | classe de preuve `INTERNAL_CHAIN_CONSISTENCY_ONLY` | T15, T16, M07 |
| Faux callback humain fourni par l'appelant | mécanisme provisionné par la frontière ; origine du callback tracée | T17, M08, M46 |
| Aucun mécanisme humain | `NOT_AUTHENTICATED` — fail closed | T18 |
| **Preuve humaine inventée** | les `evidenceRefs` **résolvent** contre le registre authentifié | T19, M39 |
| Preuve humaine d'un autre run / mission | run, mission et attestation comparés | T20, M40 |
| Mutation de `decision.evidenceRefs` | hachage des deux côtés + résolution | T21, M11 |
| `DEFER` / `REJECT` au corpus | éligibilité **recalculée**, jamais acceptée | T22, T23, M09, M42 |
| Éligibilité fournie en entrée | ignorée et consignée ; `isEligible` exige la marque de recalcul | T24, M41 |
| Registre d'artefacts imité par l'appelant | marque d'origine + liaison au run | M33, M34, M47 |
| Identifiant dupliqué / source réétiquetée | provenance **résolue** contre le registre authentifié | T25–T28, M10 |
| Lignée inter-run / inter-mission / arête erronée | 7 contrôles + graphe typé ; *default deny* | T29–T32, M12, M13 |
| Métadonnée de lignée absente | échec fermé, jamais « non vérifiable donc accepté » | T33, M44 |
| Preuve d'inconnu inexistante ou d'un autre run | résolution obligatoire | T34, T35, M14 |
| Rejeu / état périmé d'un inconnu | séquence monotone, chaînage, statut dérivé | T36, T37, M15, M16 |
| Dimensions de préparation fabriquées | source résolvable exigée | T38, M17 |
| `status = READY` déclaré | recalculé | T39 |
| Sonde LLM fabriquée / d'un autre run | liée au run attesté | T40, T41, M18 |
| Cohérence sans authenticité, et l'inverse | les deux sont exigées | T15, M19, M20 |
| Revalidation désactivée par politique | 5 contrôles non négociables | T47, M21 |
| Artefact affirmant une vérification non faite | motifs dérivés + garde-fou | M22 |
| Rapport / acceptation désappariés | mission, run, attestation, empreintes | T43–T46, M23, M45 |
| Qualification `UNKNOWN` autorisant l'aval | revalidation obligatoire | T48, M24 |

## 2. Menaces explicitement NON couvertes

Les nommer est une exigence de la Charte §24. Ce n'est pas une échappatoire.

| Hors périmètre | Pourquoi | Ce qui protégerait |
|---|---|---|
| **Vol de la clé privée de production** | la signature est la racine | gestion de clés de l'exploitant, HSM/KMS |
| **Signataire compromis** | un signataire corrompu atteste ce qu'il veut | séparation des rôles, quorum, journal indépendant |
| **Hôte de confiance entièrement compromis** | qui contrôle le processus contrôle ce qu'il lit | attestation matérielle, tiers indépendant |
| **Exploitant malveillant provisionnant sciemment une racine malveillante** | l'exploitant EST la racine | gouvernance humaine, audit externe des clés ancrées |
| **Contrôle de l'environnement et du système de fichiers de l'exploitant** | `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG` et le fichier pointé | durcissement système, secrets managés, montage en lecture seule |
| **Registre d'acteurs humains inexact** | le lot vérifie qu'un mécanisme existe et s'identifie, pas sa justesse | choix du mécanisme par l'exploitant |
| **Véracité du contenu** | l'authentification porte sur l'exécution, pas sur les conclusions | *succès technique ≠ succès scientifique* |

## 3. Ce que le déplacement de la racine signifie exactement

v0.5 ne supprime pas le besoin de faire confiance. Elle déplace cette confiance
d'un **argument que le code de mission fournit** vers une **configuration que
seul l'exploitant peut écrire**, et le dit explicitement. C'est une frontière
vérifiable, pas une garantie absolue.

## 4. Classement des dettes (Charte §24)

| Élément | Classe |
|---|---|
| Absence d'attestation matérielle ou de tiers indépendant | `SCIENTIFIC_LIMITATION` |
| La justesse du registre d'acteurs humains n'est pas vérifiable par le moteur | `SCIENTIFIC_LIMITATION` |
| Le durcissement de l'environnement de l'exploitant est hors lot | `CONTRACT_GAP` assumé |
| Aucun run réel n'a validé ce lot | `TEST_GAP` déclaré : toutes les preuves sont des fixtures assumées |
