# RAPPORT LOT 10G.3B.3B — ExecutionContract v1

## Verdict

**PASS.** Le contrat canonique v1 est implémenté en shadow mode, sans branchement produit, modification de moteur, changement de route, appel réseau ou déploiement.

## Résultat livré

- Schéma JSON fermé, versionné `1.0`.
- Builder pur `buildExecutionContractShadow(...)` dans la zone d'évaluation isolée.
- Validations d'invariants au-delà du schéma.
- Sérialisation, parsing, canonicalisation et hash SHA-256.
- Mapping des cinq propriétés, neuf techniques et treize verrous.
- Chaîne de traçabilité `REQ → OBL → quantité → verrou → contrôle`.
- Représentabilité de 50/50 cas sur les trois corpus décisionnels versionnés.
- Preuve explicite ADN **27/27** : cinq propriétés, neuf techniques et treize verrous.
- Six suites de tests dédiées, sans dépendance ni réseau.

## Freeze

- Branche : `main`
- HEAD initial : `96373bd18e56ac9c33ab802e37d2c7e8008c4cfa`
- État initial : propre, synchronisé avec `origin/main`
- Tests initiaux : 25/25 PASS
- Garde initiale : PASS
- Diff-check initial : PASS

Les changements de cette passe restent confinés à `evaluation/lot10g3b3b`, `audit/lot10g3b3b` et aux tests dédiés ; aucun fichier produit historique n'est concerné.

## Décisions de conception

### Un contrat plus strict que le minimum

Le schéma minimal a été enrichi seulement pour rendre les exigences auditables :

1. IDs de contraintes `REQ-*`, obligations `OBL-*` distinctes et références aval.
2. Statuts incompatibles pour fait, déduction, hypothèse et manque.
3. Types de contrôle explicites.
4. Politique d'exécution avec blocage des échappatoires et injonction finale.
5. Neuf invariants éthiques non désactivables.
6. Vue `adn_summary` des cinq propriétés, calculée uniquement depuis le contrat.
7. Verrous auditables avec raison, priorité, source, contrôles associés et état actif/inactif.
8. Vue d'observabilité minimale excluant demande originale, preuves, hypothèses et texte des obligations.

Aucun champ ajouté n'est métier.

### Shadow strict

Le builder reçoit une photographie d'états existants. Il ne lit aucun champ UI, ne charge aucun moteur, ne détecte aucun format, ne classe aucune demande et ne lance aucun LLM. Aucun fichier produit ne l'importe.

### Préservation des autorités actuelles

- Decision Provider reste l'autorité de l'exécutabilité et du routing.
- Rapide/Atelier restent l'autorité de leurs formats, verrous et contrôles actuels.
- Architecte reste l'autorité de son analyse, ses preuves, hypothèses et critères.
- Le contrat ne tranche pas leurs divergences ; il les représente.

## Invariants démontrés

- `original_request` obligatoire et conservé.
- Toute contrainte explicite reste une obligation utilisateur traçable.
- Hypothèse et déduction ne deviennent jamais des faits.
- Manque critique ne devient jamais `known`.
- Quantité avec borne et unité/cible.
- Verrou connu, unique et justifié.
- Verrou sourcé, associé à des contrôles existants et explicitement actif ou inactif.
- Obligation sourcée.
- Traçabilité explicite `REQ → OBL → quantité → verrou → contrôle`.
- Exploitable ⇔ `execute_now=true` ⇔ technique 9 active.
- Clarification ⇒ exécution fausse et route nulle.
- Autonomie, sécurité et sept autres valeurs éthiques toujours vraies.

## Représentabilité

Les 30 cas 10G.2A et les 20 cas des corpus 10G.3B/3B.1 sont tous sérialisables dans la langue v1 en conservant demande, état et route autorisée. Les tests mutationnels changent noms, destinataires et contexte sans modifier la topologie du contrat.

La matrice `12-ADN-NON-REGRESSION-PROOF.md` démontre séparément les 27 éléments attendus : **27 représentés, 0 perte, 0 comportement produit modifié**.

## Limites volontaires

- Pas d'extraction sémantique nouvelle depuis la prose.
- Pas de sélection nouvelle des verrous.
- Pas de correction des routes historiques.
- Pas de projection vers les prompts ou les moteurs.
- Pas de migration autre que la politique documentée.
- `adn_summary=represented` signifie représentable, non conforme par preuve d'exécution.

## Passage futur aux adapters

Le prochain branchement devra rester en shadow comparatif : produire le contrat à côté des états historiques, mesurer les écarts, puis seulement créer des projections en lecture seule. Aucun moteur ne doit consommer v1 avant validation explicite d'un lot ultérieur.

## Validation finale

- Tests complets : **44/44 PASS**.
- Garde anti-régression : **PASS**.
- `git diff --check` : **PASS**.
- Hashes gelés : **inchangés**.
- Fichiers historiques : **aucun modifié**.
- Réseau/déploiement : **aucun**.
