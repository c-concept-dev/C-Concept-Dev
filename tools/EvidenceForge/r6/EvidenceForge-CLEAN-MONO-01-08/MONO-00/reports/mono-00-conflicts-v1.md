# MONO-00 — Conflits de baseline

## Conflit apparent examiné : EF-PR-GEN-01.zip vs EF-PR-GEN-01-FINAL.zip

**Symptôme initial** : deux ZIP distincts, hashes externes différents (`48833bd5...` vs `1c9a0b6c...`), comptes de fichiers différents (30 vs 26).

**Investigation** :
```
diff -rq <extraction EF-PR-GEN-01.zip> <extraction EF-PR-GEN-01-FINAL.zip>
-> aucune différence
```

**Cause identifiée** : `EF-PR-GEN-01.zip` contient 4 entrées de répertoire vides supplémentaires (`EF-PR-GEN-01/`, `EF-PR-GEN-01/fixtures/`, `EF-PR-GEN-01/test/`, `EF-PR-GEN-01/tools/`) — un artefact de la méthode de construction du ZIP (probablement `zip -r`), absentes de l'autre construction (`find -type f | zip -@`). Le contenu FICHIER, lui, est strictement identique, byte pour byte.

**Résolution** : **PAS UN CONFLIT DE BASELINE.** Le hash externe d'un ZIP n'a jamais fait autorité dans ce projet — principe déjà établi dès EF-PR-GEN-01B et reconfirmé à chaque lot ultérieur (« le gel porte sur les fichiers internes, pas sur le hash du ZIP »). Les deux archives sont interchangeables en contenu.

**Choix retenu pour le registre** : `EF-PR-GEN-01-FINAL.zip` référencé comme construction canonique (sans entrées de répertoire superflues), sans que cela implique une supériorité de contenu — les deux sont équivalents.

## Aucun autre conflit détecté

Aucune autre paire d'artefacts prétendant tous deux être canoniques avec des hashes incompatibles n'a été trouvée durant cet inventaire. La mécanique de détection de conflit elle-même a été testée positivement (T00-14, voir rapport de tests) pour confirmer qu'elle produirait bien `CONFLICT` si un tel cas survenait.
