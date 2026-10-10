# Porte 2 : construction du portefeuille proposé

## Autopsie avant modification

- `lib/screening-evidence.js:28–35, 74–85` : le LLM évalue chaque source, produit inclus/exclu, justification, preuves littérales et confiance. Aucun score numérique de pertinence ou qualité n’existe. La confiance dans une exclusion ne mesure pas la qualité scientifique de la source.
- `lib/pipeline.js:137–145` : les propositions individuelles sont enregistrées puis la revue est appelée. Celle-ci n’altère pas les propositions.
- `lib/corpus-portfolio-review.js:46–58, 101–103, 127–140` : couverture et concentration calculées après sélection, par seule discipline de requête ; seuil de diagnostic historique 0/1 incluse. Les évaluations domaine/méthode des exclues et groupes lexicaux ne deviennent que des avertissements.
- `lib/pipeline.js:254–261` : la Porte 2 lit toujours screening-evidence.json, indépendamment des suggestions de la revue.
- `index.html:281–294` : affichage post-hoc ; les boutons suivent la proposition individuelle, puis les choix locaux humains.
- `lib/pipeline.js:147–154, 239–245` : la ratification est conservée, ses overrides priment ; audit-decisions.json existant est réutilisé à la reprise.

L’incident est confirmé en lecture seule : run efm-20260917-65c805ef, 100 sources, 21 incluses, distribution 0/6/1/2/4/1/7. La revue contient 58 évaluations domaine/méthode, aucun groupe redondant lexical. L’hypothèse post-hoc est donc confirmée, sans conclure qu’un swap est scientifiquement justifié dans ce run.

## Politique générique

La phase déterministe utilise les évaluations déjà calculées, sans appel LLM supplémentaire. Les décisions individuelles restent dans screening-primary.json ; screening-evidence.json devient la proposition équilibrée pour les seuls nouveaux passages retrieval. Les anciens runs ne sont ni migrés ni recalculés. L’acte de ratification et la reprise restent inchangés.

Admissibilité : évaluation de domaine HAUTE, ou méthode HAUTE avec intérêt concret, angles connus et extraits littéraux vérifiés dans les métadonnées. Une méthode moyenne ne suffit pas. Absence de preuve ou classification = exclusion conservatrice. La confiance du screening inclus sert uniquement d’indice ordinal de prudence, pas de score scientifique. Une exclusion très confiante n’est pas interprétée comme une source de haute qualité.

Couverture : chaque source contribue à tous ses angles évalués, mais répartit une masse totale de 1 entre eux. Les sources primaires sans évaluation multi-angle gardent leur angle de requête, marqué comme provenance et non preuve sémantique. Un signal satisfaisant exige aussi deux sources distinctes par identifiant (paramètre explicite ; ne prouve pas l’indépendance des études), jamais une source unique multipliée. La cible souple est la moitié de la taille du portefeuille primaire divisée par le nombre d’angles, avec plancher de masse 1. Elle ne force aucune inclusion. Concentration : part pondérée supérieure à deux fois la part uniforme. Ces seuils sont configurables et ne proviennent pas du cas réel.

Les candidates admissibles sont classées par niveau ordinal de pertinence, gain de couverture, diversité de type et identifiant stable. Un swap exige un donneur dans un angle surreprésenté, de niveau ordinal inférieur ou égal, une paire lexicale directe de similarité ≥ 0,85 de même type, un témoin conservé couvrant ses angles, aucune perte de couverture sous la cible ni de diversité des types. La similarité reste un indice de redondance, jamais une preuve d’équivalence scientifique : la trace le dit. Sinon, la candidate peut être ajoutée. Aucun retrait isolé pour atteindre un quota.

Après chaque ajustement les métriques sont recalculées. Les angles non résolus distinguent absence de candidate admissible et gain insuffisant des candidates disponibles. Le diagnostic est celui de la proposition machine ; les choix humains peuvent ensuite être différents.

La Porte 2 reste souveraine : aucune ratification, identité ou décision humaine n’est fabriquée.
