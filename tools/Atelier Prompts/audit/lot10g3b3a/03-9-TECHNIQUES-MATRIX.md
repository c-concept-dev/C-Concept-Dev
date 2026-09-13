# Matrice des neuf techniques historiques

| # | Technique | Implémentation observée | Parcours | Statut | Écart principal |
|---:|---|---|---|---|---|
| 1 | Contrat préalable | `contratDuPrompt()` ; analyse + compilation Architecte | Rapide/Atelier, Architecte séparément | **Partiel** | Aucun contrat canonique partagé ; Architecte met `etat.contrat=null`. |
| 2 | Blocage des échappatoires | interdits, contrôle pré/postambule, instructions Architecte | Tous par fragments | **Partiel** | Pas d'invariant transversal ni de test du remplacement du livrable par un plan/promesse. |
| 3 | Questions inutiles interdites | Decision Provider, question unique, substituabilité, dédoublonnage, 3 tours max | Entrée Rapide | **Fort** | Le choix explicite Architecte utilise ensuite sa propre logique de questionnement. |
| 4 | Format strict / bordures | `FORMATS`, schéma JSON, amorce/clôture, contrôles syntaxiques | Rapide/Atelier | **Fort mais local** | Non projeté systématiquement vers Architecte. |
| 5 | Démarrage forcé | `amorce`, contrôle de préambule, instruction système d'exécution | Rapide/Atelier, exécution Architecte | **Partiel** | Activation par format/profil, non par état exploitable commun. |
| 6 | Interdictions explicites | verrou `interdits`, hypothèses interdites, règles de compilation | Rapide/Atelier, Architecte | **Partiel** | Contenu et activation différents ; absence de registre canonique. |
| 7 | Obligations absolues | contraintes de la demande, composants et critères Architecte | Architecte surtout | **Partiel** | Pas de liste d'obligations traçable jusqu'aux contrôles. |
| 8 | Règles quantifiées | `detecterQuantite`, verrou volume, `livrable.quantites` | Tous, implémentations distinctes | **Partiel** | Détection lexicale d'un côté, sémantique de l'autre ; validation d'unité incomplète. |
| 9 | Injonction finale | formulations indirectes dans contrôle et système d'exécution | Aucun contrat commun | **Absente comme invariant** | Clause constitutionnelle non représentée ni activée après exploitabilité. |

## Réponse d'audit sur la technique 9

**Non : elle n'est pas garantie sur tous les chemins.** Le code sait demander une réponse directe (`8607`), supprimer certains préambules et vérifier silencieusement (`8492`), mais ne matérialise pas l'invariant « clarification terminée → produire maintenant, sans proposer ni redemander ». Rapide et Atelier dépendent de verrous sélectionnés ; Architecte dépend d'un système distinct ; la copie manuelle ne transporte aucune preuve runtime de l'activation.

