# Dettes ouvertes — Atelier Prompts

Ce fichier existe pour une raison précise : CLEAN-05 a montré que deux des trois
dettes officielles ne vivaient que dans l'historique des lots. Une dette qui
n'existe que dans une conversation finit par disparaître avec elle.

Ce registre **n'est pas une autorité**. Il ne décide rien, aucun code ne le lit,
et il ne remplace aucun contrat. Il énumère, et il est vérifié par
`tests/format-structural-verifiability-formatstruct01.test.mjs` — de sorte qu'une
dette ne puisse ni s'ajouter ni disparaître en silence.

## Ouvertes

### PERF-REAL-01
Les mesures de performance du produit sont **structurelles**, pas réelles :
PERF-03A et PERF-04 prouvent que le plan rapide ne retarde pas le plan profond et
que les gardes de tour tiennent, mais aucune mesure n'est prise sur un parcours
réel, avec un fournisseur réel, sur un échantillon suffisant. Tant que cette
mesure n'existe pas, aucune affirmation de latence utilisateur n'est opposable.

### EXEC-PHASE-INSTRUMENT-01
Les phases internes du moteur Architecte ne sont pas observables. Le moteur est
une **plage gelée** : l'instrumenter reviendrait à la modifier, donc à changer
son hash. MODE-03, CLEAN-03 et FORMAT-STRUCT-01 vérifient chacun qu'aucune marque
d'instrumentation n'y a été injectée. Fermer cette dette suppose une décision
explicite de dégel, qui n'a pas été prise.

## Fermées

| Dette | Fermée par | Ce qui a été établi |
| --- | --- | --- |
| ORCH-LEGACY-CLEAN-01 | CLEAN-01 | Le décideur conversationnel hérité, son appariement flou au seuil 0,6 et son repli « local proportionné » sont retirés du produit et du bundle. |
| FORMAT-STRUCT-01 | FORMAT-STRUCT-01 | Les trente-deux formats du registre gelé sont classés ; un seul est structurellement vérifiable (`json`) ; aucune règle non vérifiable ne peut produire un succès. |

### Ce que FORMAT-STRUCT-01 laisse mesuré, et non résolu

Deux phrases de validité du registre gelé sont **entièrement décidables** sans
lire le sens :

- `tableau_comparatif` — « En-tête et séparateur présents, même nombre de
  colonnes sur chaque ligne. »
- `list` — « Un élément par ligne, aucune ligne d'introduction. »

Elles ne sont pas implémentées, et la raison se mesure : le point où un format
reçoit sa forme structurelle pour le **seul chemin qui produit un livrable final**
— Architecte Pro — est `archVocabulaireStructurel`, situé **à l'intérieur de la
plage gelée du moteur Architecte**. L'étendre change le hash gelé.

Ce lot l'a vérifié de la seule façon honnête : en tentant la modification, en
constatant la rupture du hash, et en revenant à l'octet près. `T-FORMATSTRUCT-25`
localise ce blocage au caractère près.

Étendre la couverture du seul côté Rapide était techniquement possible et aurait
été pire : deux vocabulaires divergents pour un même registre, c'est-à-dire deux
réponses différentes à la même question.

**Le jour où le moteur Architecte est dégelé, ces deux formats sont les premiers
à traiter** — leur prédicat est déjà écrit, mot pour mot, dans le registre.
