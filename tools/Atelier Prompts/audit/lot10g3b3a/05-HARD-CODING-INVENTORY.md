# Inventaire du hardcoding

| Zone | Exemples | Type | Verdict | Destination recommandée |
|---|---|---|---|---|
| `FORMATS` | début/fin, syntaxe, unités, format énumérable | intrinsèque au format | Acceptable | registre de formats versionné |
| `FORMATS.indices` / `detecterFormat` | mots métier et noms de livrables | domaine → format probable | À extraire | classifieur/configuration externe, jamais route définitive |
| `PROFILS` | paquets fixes de verrous par classe | format → verrous | Risque structurel | sélecteur fondé sur propriétés/risques |
| `MARQUEURS` | lexique de reproduction/transformation | heuristique de droit/périmètre | À isoler | analyse universelle de transformation + politique de droits |
| `VERBES_ACTION`, `TERMES_VAGUES` | listes lexicales françaises | score de demande | À isoler | extracteur sémantique ou configuration linguistique |
| `SECTIONS.provenance` | cas professionnels et formulations par défaut | cas métier/personne | À extraire | preuves et statut de provenance dans le contrat |
| `SECTIONS.perimetre` | code, interface, œuvre protégée | domaine/format → politique | Mixte | règles intrinsèques séparées des politiques métier |
| `archTitreReserve` | titres français fermés | déduplication par libellé | Fragile | IDs structurels, pas titres affichés |
| Question filter | liste de jargon interne | protection UX | Acceptable, mais linguistique | configuration de présentation |
| CORS, limites, schémas | origins, 4 000 caractères, JSON schema | sécurité/transport | Acceptable | configuration serveur versionnée |

## Conclusion

Le test `tests/html-integration.test.mjs:125` garantit seulement que la couche adaptative n'embarque pas les domaines de recette. Il ne couvre pas le moteur historique. Priorités d'extraction : `FORMATS.indices`/`detecterFormat`, `PROFILS`, `SECTIONS.provenance/perimetre`, lexiques de mesure, puis `archTitreReserve` vers des identifiants stables.

