# Flux de correction

## Atelier / Rapide via Envoi direct

1. La réponse est comparée au `contratDuPrompt` (`6035-6043`).
2. Tout échec ou avertissement révèle le bouton de correction.
3. `construirePromptCorrection()` inclut le livrable, les seuls écarts et avertissements, et demande de préserver le reste (`4395-4408`).
4. Le prompt est affiché ; l'utilisateur le vérifie puis le charge manuellement (`7424-7436`).
5. Un nouvel envoi est une action explicite de l'utilisateur.

**Qualité :** ciblage correct et réversible. **Lacune :** aucune version de contrat, aucune trace de correction, aucune boucle bornée, aucune revalidation automatique attachée à la correction.

## Architecte — correction de l'analyse

1. L'extracteur refuse zéro ou plusieurs objets JSON de premier niveau (`8143-8175`, `8197-8219`).
2. `archValider()` accumule les écarts structurels et de provenance (`8425-8440`).
3. `archPromptCorrection()` demande de corriger uniquement ces erreurs et de renvoyer un JSON unique (`8186-8195`).
4. L'utilisateur renvoie manuellement, puis réimporte.

**Qualité :** refus sûr, erreurs précises, conservation de l'analyse brute. **Lacune :** le prompt de correction n'inclut pas le schéma complet et n'est pas automatiquement réexécuté ; les sorties plafonnées contenant plusieurs JSON nécessitent une intervention.

## Architecte — livrable final

Il n'existe pas de flux de correction automatique ou assisté basé sur `verification.criteres_*`. L'exécution affiche le livrable et déclare « obtenu » sur succès fournisseur (`8607-8611`). En cas d'erreur, seul le prompt compilé est conservé.

## Cible logique pour le lot suivant

```text
ExecutionContract vN immuable
→ checks typés
→ écarts localisés
→ correction ciblée vN+1 (delta documenté)
→ revalidation des seuls contrôles impactés + contrôles bloquants
→ trace corrections[]
```

Cette cible est une cartographie, pas une modification proposée du runtime pendant l'audit.

