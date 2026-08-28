# Matrice des cinq propriétés ADN

Légende : **C** = complète, **P** = partielle, **A** = absente, **D** = divergente selon le parcours.

| Propriété | Decision Provider | Rapide / Atelier | Architecte | Contrôle aval | Statut | Preuve / écart |
|---|---|---|---|---|---|---|
| Intentionalité | Distingue thème général, intention, objet, action et matériau | La demande brute reste autorité ; détection de format surtout lexicale | `comprehension.intention_principale`, déclarations, contraintes et citations | Pas de comparaison finale avec l'intention | **P/D** | `decision-core.js:17-36`; HTML `3988-4033`, `8083`, `8425-8440` |
| Exécutabilité | État explicite, confiance, question unique, traitements substituables | Suppose exploitable après route ; source manquante peut bloquer l'envoi | manques bloquants, complet/partiel, action recommandée | Pas d'état commun persistant | **C localement / D globalement** | `decision-core.js:10-45,171-196`; HTML `6035`, `8477` |
| Discipline | Interdit la production et route seulement | Interdits, amorce, préambule et clôture selon profil/format | Instructions d'exécution et vérification, mais clause finale constitutionnelle non littérale | Détecte certains pré/postambules | **P** | HTML `3643-3843`, `4186-4328`, `8471-8492`, `8607` |
| Complétude | Hors périmètre | Volume, format, verrous et contrôles ; contrat étroit | Obligations et critères générés sémantiquement | Seuil/structure partiels, pas de couverture 100 % des obligations | **P/D** | HTML `3595-3639`, `4060-4077`, `4330-4393`, `8482-8492` |
| Conformité | Valide seulement la décision JSON | Contrat et contrôles automatiques sur Envoi direct | Valide l'analyse JSON, pas le livrable final | Correction manuelle, aucun cycle automatique | **P/D** | `decision-core.js:171-203`; HTML `6035-6043`, `8186-8232`, `8425-8440`, `8607-8611` |

## Verdict détaillé

- **Intentionalité** — la demande est préservée, mais interprétée trois fois : routeur sémantique, détecteur lexical, puis Architecte. Aucune représentation canonique n'empêche une divergence.
- **Exécutabilité** — propriété la plus aboutie : états fermés, question unique, invariant de route, maximum de trois clarifications et fallback technique. Elle n'est toutefois pas projetée dans un état partagé avec les moteurs.
- **Discipline** — mécanismes fragmentés. La technique 9 n'est pas une clause commune activée par l'état `exploitable`.
- **Complétude** — Rapide/Atelier savent compter certaines quantités ; Architecte produit des critères riches. Aucun chemin ne prouve de manière unifiée que toutes les obligations ont été extraites, couvertes et vérifiées.
- **Conformité** — le chemin Envoi direct possède un contrôle utile mais limité. Architecte contrôle strictement son analyse intermédiaire, puis livre sans vérifier automatiquement le livrable contre ses propres critères.

