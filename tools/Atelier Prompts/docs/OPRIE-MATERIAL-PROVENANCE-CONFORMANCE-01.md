# OPRIE-MATERIAL-PROVENANCE-CONFORMANCE-01 — Trente fois la même demande

Le lot précédent avait conclu, sur trois tours, que l'Analyste n'émettait pas la nouvelle
provenance de façon fiable. Trente tours identiques disent autre chose — et déplacent le défaut.

**Aucun correctif pendant la mesure.** Aucun prompt, aucun schéma, aucun contrat, aucun paramètre.

---

## A. Objectif

À demande identique, contenu identique, fournisseur identique, contrat identique : avec quelle
fréquence l'Analyste lit le fait, l'inscrit dans son candidat, lui attribue la bonne provenance,
obtient l'accord du Critique, et laisse la chaîne atteindre son état ?

Cinq questions, cinq mesures **séparées** — parce que rien ne garantissait qu'elles bougeaient
ensemble. Elles ne bougent pas ensemble.

---

## B. Configuration figée

| | |
| --- | --- |
| Fournisseur | Anthropic, épinglé — **30 tours sur 30 entièrement Anthropic**, aucun repli |
| Modèle | `claude-sonnet-4-6` |
| `temperature` | **0** |
| Plafond de sortie de rôle | 2 048 unités |
| Timeout | 60 000 ms |
| Cadence | 15 s entre deux tours |
| Version Worker | `fe798162-ede5-4448-9982-64d80bf4f8af` |
| Code produit | instrumentation **metadata seule** — étiquettes de provenance et noms de champs, aucune valeur |
| Empreinte de l'artefact avant / après | `5260458b` / `5260458b` — **identique**, aucune mutation pendant la campagne |

`temperature: 0` mérite d'être souligné : la variabilité mesurée ici n'est pas un effet
d'échantillonnage.

---

## C. Le cas synthétique

```
original_request : « Extrais le numéro de dossier du matériau disponible et donne-le tel quel. »
material_context : { present: true, deep_content_available: true }
material_content : [ "Fiche de suivi\nNUMERO_DOSSIER = ZX-4821\nStatut : en cours" ]
```

Identique à chaque tour, historique vide, aucune ambiguïté métier possible.

---

## D. Nombre de tours

**30 / 30 exécutés.** Écriture incrémentale du journal, un tour par ligne.

---

## E, F. Populations

| | |
| --- | --- |
| Tours totaux | 30 |
| Sémantiquement évaluables | **30** |
| Techniquement dégradés | **0** |

Aucun `degraded_state`, aucun échec fournisseur, aucun dépassement de plafond de sortie, aucun
timeout, aucune reprise. **Le bruit technique est nul** : tout ce qui suit est sémantique.

---

## G. Taux

| Métrique | Résultat |
| --- | --- |
| `FACT_EXTRACTION` | **16 / 30 = 53,3 %** |
| `FACT_IN_CANDIDATE` (côté Analyste) | **16 / 30 = 53,3 %** |
| `CORRECT_PROVENANCE` | **16 / 30 = 53,3 %** |
| `CRITIC_ACCEPTANCE` | **0 / 30 = 0 %** |
| `FINAL_SUCCESS` | **0 / 30 = 0 %** |
| `TECHNICAL_DEGRADED` | 0 / 30 = 0 % |
| Stabilité de la valeur | **16 / 16 exactes** — aucune variante, aucune reformulation |

La valeur n'est conservée dans le candidat final de l'**Arbitre** dans **aucun** des 30 tours :
elle est systématiquement retirée en aval.

---

## H. Taux conditionnels — et le résultat central

| | |
| --- | --- |
| **P(provenance correcte │ fait dans le candidat)** | **16 / 16 = 100 %** |
| P(Critique accepte │ provenance correcte) | **0 / 16 = 0 %** |
| P(succès final │ Critique accepte) | n/a — le dénominateur est vide |

**Les ensembles « fait extrait » et « provenance émise » sont rigoureusement identiques.** Seize
tours lisent et émettent ; quatorze ne lisent pas et n'émettent pas. Pas une seule exception dans
un sens ou dans l'autre.

**La conclusion du lot précédent est donc corrigée par la mesure.** L'écrivain n'est pas
défaillant : dès qu'il lit le matériau, il lui attribue la bonne provenance, à 100 %. Ce qui
vacille est la **lecture** du matériau, pas l'**écriture** de la provenance.

Et le second chiffre est plus dur encore : sur les seize tours où tout est correct en amont — fait
lu, valeur exacte, inscrite dans le candidat, provenance juste — le Critique vétote **seize fois
sur seize**.

---

## I. Taxonomie des échecs

| Catégorie | Nombre |
| --- | --- |
| A — `MATERIAL_READING_FAILURE` | **14** |
| B — `FACT_CANDIDATE_WRITE_FAILURE` | 0 |
| C — `PROVENANCE_EMISSION_FAILURE` | **0** |
| D — `CRITIC_ACCEPTANCE_FAILURE` | **16** |
| E — `ARBITER_FAILURE` | 0 |
| F — `OTHER_SEMANTIC` | 0 |

L'Arbitre ne compte aucun échec propre : il retient un veto qu'il n'a pas formé.

**Familles de veto du Critique**, sur les 30 tours :

| Famille | n |
| --- | --- |
| « aucun matériau transmis / accessible » | 15 |
| variantes de la même assertion | 7 |
| « disponibilité effective non confirmée » | 5 |
| l'ancienne règle des deux sources, rémanente | 2 |
| objection de phase — légitime | 1 |

Le tour 10 résume le problème en une phrase : *« L'Analyste a inscrit la valeur concrète
'ZX-4821' […] avec la provenance user_provided_material, mais **aucun matériau n'a été transmis
dans les données disponibles** »* — alors que `material_context.deep_content_available` vaut
`true` dans l'entrée même du Critique.

Une objection sort du lot et mérite d'être retenue : deux tours reprochent à l'Analyste d'inscrire
la valeur dans `expected_deliverable`, ce qui *« confond la phase de préparation et la phase
d'exécution »*. C'est une critique **fondée**, et elle interroge le champ choisi par l'Analyste
plutôt que la provenance.

---

## J. Dégradations techniques

**Aucune.** Zéro erreur fournisseur, zéro plafond de sortie atteint, zéro limite de débit, zéro
échec de schéma, zéro timeout, zéro reprise. Les `degraded_state` observés lors des lots
précédents ne se sont pas reproduits à cette cadence et sur ce cas court.

---

## K. Contrôles

Trois tours chacun, même déploiement, même fournisseur épinglé.

| Contrôle | Attendu | Obtenu |
| --- | --- | --- |
| **C1** — la valeur est écrite dans `original_request` | provenance `explicit_user_statement`, jamais la provenance matériau | **3 / 3** : valeur utilisée, `explicit_user_statement` déclarée, `user_provided_material` **jamais** émise — **PASS** |
| **C2** — `deep_content_available: false`, aucun contenu | aucune provenance matériau inventée, aucune valeur inventée | **3 / 3** : `user_provided_material` **jamais** émise, valeur jamais inventée — **PASS** |

**Sur les six contrôles, la provenance matériau n'est émise aucune fois.** Aucun faux positif :
quand le matériau n'est pas là, le contrat ne le prétend pas. Et `explicit_user_statement` garde
exactement son emploi historique, ce qui écarte l'hypothèse d'une instabilité générale du
vocabulaire — l'instabilité est **spécifique à la lecture du matériau**.

Un des trois tours C2 a rendu `degraded_state` : une panne technique isolée, hors des 30 tours du
banc, signalée pour ne pas la taire.

---

## Rejeu R08–R13

**`NOT_RUN`, et délibérément.** Le §25 le subordonne à des résultats permettant une interprétation
utile. Avec une acceptation du Critique à **0 / 16** sur le cas le plus simple possible, rejouer
six fixtures métier ne pouvait que reproduire un blocage déjà entièrement localisé, au prix de
douze tours profonds. Le banc synthétique a fait ce qu'on lui demandait : isoler l'écrivain.

---

## L. Conclusion

**Classement : `MIXED`** — deux étages instables, mesurés séparément, et l'un n'est pas celui
qu'on cherchait.

1. **Lecture du matériau : 53 %.** À `temperature: 0`, sur une entrée strictement identique, le
   modèle lit le fait un tour sur deux. C'est le défaut déjà relevé à
   `OPRIE-MATERIAL-INTERPRETATION-01`, désormais quantifié.
2. **Écriture de la provenance : 100 % conditionnel.** Le contrat posé par
   `OPRIE-MATERIAL-PROVENANCE-02` fonctionne exactement comme prévu. Il n'y a rien à y corriger.
3. **Acceptation par le Critique : 0 %.** Même contrat respecté de bout en bout en amont, le
   Critique refuse systématiquement — le plus souvent en affirmant qu'aucun matériau n'a été
   transmis, information qu'il possède pourtant dans `material_context`.

Le succès `1/3` observé au lot précédent ne s'est pas reproduit : **0 / 30**. C'était un petit
échantillon, et il donnait une image trop favorable.

**Confiance : HAUTE.** n = 30, fournisseur unique et pur, bruit technique nul, étages mesurés
indépendamment, ensembles exactement coïncidents là où ils devaient l'être.

---

## M. Prochaine action sûre

La mesure désigne deux chantiers distincts, dans cet ordre, et **aucun n'est une phrase de prompt
de plus** :

1. **Le Critique, en premier — c'est lui qui plafonne le système à zéro.** Sur seize tours où
   l'Analyste fait exactement ce que le contrat demande, il refuse seize fois, le plus souvent en
   affirmant qu'aucun matériau n'a été transmis alors que `material_context.deep_content_available`
   vaut `true` dans son entrée. Sa règle d'ancrage connaît la troisième source depuis
   `OPRIE-MATERIAL-PROVENANCE-02` ; ce qu'il ne fait pas, c'est **utiliser le fait de disponibilité
   qu'il reçoit déjà**. Le lot à ouvrir est celui-là, borné à cette lecture, et toujours sans
   contenu brut.

2. **La lecture du matériau par l'Analyste, ensuite — 53 % à `temperature: 0`.** Une fois le
   Critique débloqué, ce taux devient le plafond du système. Il se traitera pour lui-même, avec la
   même discipline : mesurer avant de corriger.

Deux remarques pour le lot 1 : l'objection de phase relevée deux fois — inscrire la valeur dans
`expected_deliverable` *« confond la phase de préparation et la phase d'exécution »* — est fondée
et mérite d'être tranchée en même temps, car elle porte sur le champ que l'Analyste choisit, pas
sur sa provenance. Et la valeur n'est conservée dans le candidat final de l'Arbitre dans aucun des
trente tours : à vérifier une fois le veto levé.
