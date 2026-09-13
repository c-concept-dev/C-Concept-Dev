# CRITIC-POSTPROVIDER-TYPEERROR-01 — preuves

| Fichier | Contenu |
| --- | --- |
| `root-cause-and-campaign.json` | localisation par exécution, classification, portée du correctif, campagne |
| `campaign-runs.jsonl` | les 27 tours effectués — dont **15 invalidés** par l'épuisement du crédit Anthropic |

**La preuve du correctif est déterministe**, pas statistique : l'origine a été localisée par
exécution (empreinte de message identique à celle du 502 de production), et
`tests/critic-postprovider-typeerror-cpt01.test.mjs` rejoue la cause exacte avant/après.

**La campagne réelle est incomplète** : 12 tours exploitables sur 30 requis. À partir du tour 13,
l'API Anthropic répond « credit balance is too low » — ces tours mesurent un solde épuisé, pas le
correctif, et ne sont pas comptés.

Métadonnées uniquement. Aucun matériau brut. Aucune valeur de secret.
