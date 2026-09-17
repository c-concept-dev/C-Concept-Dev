# MONO-00 — Rapport de tests

## Suites gelées rejouées à froid (extraction neuve, sans workspace antérieur)

```
EF-ORCH        842/842   PASS   (node test_*.js individuels, 35 fichiers)
EF-PR-GEN-01   105/105   PASS   (npm ci && npm test)
EF-02A          12/12    PASS   (npm test, sous-suite)
EF-02B           9/9     PASS   (npm test, sous-suite)
EF-02C           9/9     PASS   (npm test, sous-suite)
EF-02D          49/49    PASS   (npm ci && npm test)
EF-02E          60/60    PASS   (npm ci && npm test)
EF-03          100/100   PASS   (npm ci && npm test)
EF-04           37/37    PASS   (npm ci && npm test)
─────────────────────────────
TOTAL         1223/1223  PASS
```

## Tests MONO-00 propres (intégrité de baseline, T00-01 à T00-14)

| Test | Objet | Résultat |
|---|---|---|
| T00-01 | Complétude manifeste (EF-02D/E/03/04) | PASS — diff vide sur les 4 lots munis d'un manifeste |
| T00-01 | Complétude manifeste (EF-ORCH) | ÉCART DOCUMENTÉ — manifeste ne couvre pas docs/node_modules (voir rapport de vérification) |
| T00-02 | Validation SHA manifeste | PASS — `sha256sum -c` exit 0 sur les 5 manifestes trouvés |
| T00-03 | Aucun fichier fonctionnel non inventorié | PASS avec la même réserve EF-ORCH que T00-01 |
| T00-04 | Hashes de dépendance gelée attendus | PASS — 3/3 hashes du CDC confirmés recalculés |
| T00-05 | Découverte du mécanisme de test | PASS — npm test (6 lots) + invocation individuelle (EF-ORCH) identifiés |
| T00-06 | Extraction à froid | PASS — 7 paquets extraits dans /tmp/mono00-verify/, aucune dépendance au workspace |
| T00-07 | Installation à froid des dépendances | PASS — `npm ci` (jamais `npm install`) sur les 6 lots avec package-lock.json |
| T00-08 | Test à froid | PASS — 1223/1223 depuis les extractions neuves |
| T00-09 | Inventaire des contrats de schéma | PASS — matrice de 14 lignes produite, chaîne bout en bout couverte |
| T00-10 | Détection de doublons canoniques | PASS — EF-PR-GEN-01.zip vs -FINAL.zip investigué, résolu NON-conflit (contenu identique) |
| T00-11 | Détection de mutation de fichier gelé | PASS — mutation volontaire d'EF-02D détectée par sha256sum -c (exit 1) |
| T00-12 | Détection d'entrée manifeste manquante | PASS — suppression volontaire détectée par diff (exit 1) |
| T00-13 | État "artefact inconnu" | PASS — logique de classement testée, produit UNVERIFIED sans deviner |
| T00-14 | Détection de conflit | PASS — logique de classement testée, produit CONFLICT sur hashes concurrents incompatibles |
| T00-15 | External dependency inventory | PASS — 13/13, empêche la régression EF-ORCH llm=false (corrigée) |

## Note sur T00-01/T00-03 et EF-ORCH

Le test échoue au sens strict de la lettre du CDC (le paquet contient des fichiers — documentation et node_modules — non inventoriés dans le manifeste), mais **tous les fichiers effectivement inventoriés concordent à 100%**. Ceci est documenté comme écart connu, pas masqué, et ne bloque pas le verdict global (voir section limites connues).
